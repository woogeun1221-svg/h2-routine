#!/usr/bin/env python3
"""하루 만족도 미응답 알림. 표준 라이브러리와 기존 tg-notify만 사용한다.

DB에는 기기 인증정보의 해시와 날짜별 응답 여부만 저장한다.
O/X 선택값, X의 이유, 기존 루틴 기록은 수신하지 않는다.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import date, datetime, timedelta
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / 'data' / 'reminders.sqlite3'
NOTIFIER = ROOT.parent / '_core' / 'tg-notify'
ORIGIN = 'https://woogeun1221-svg.github.io'
SITE = ORIGIN + '/h2-routine/'
KST = ZoneInfo('Asia/Seoul')


def now_kst():
    return datetime.now(KST)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def send_message(message):
    result = subprocess.run(
        [str(NOTIFIER)], input=message, text=True, capture_output=True, timeout=100,
    )
    # Telegram 응답·인증정보·연결 링크를 운영 로그에 남기지 않는다.
    return result.returncode == 0


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS pairings (
                    code_hash TEXT PRIMARY KEY, expires TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS devices (
                    token_hash TEXT PRIMARY KEY, created TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS answers (
                    device TEXT NOT NULL, day TEXT NOT NULL, answered INTEGER NOT NULL,
                    updated TEXT NOT NULL, PRIMARY KEY(device, day)
                );
                CREATE TABLE IF NOT EXISTS reminders (
                    day TEXT PRIMARY KEY, status TEXT NOT NULL, updated TEXT NOT NULL
                );
            ''')
        self.path.chmod(0o600)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        try:
            with db:
                yield db
        finally:
            db.close()

    def issue_pairing(self, now=None):
        now = now or now_kst()
        code = secrets.token_urlsafe(32)
        with self.connect() as db:
            db.execute('DELETE FROM pairings WHERE expires < ?', (now.isoformat(),))
            db.execute('INSERT INTO pairings VALUES (?, ?)',
                       (digest(code), (now + timedelta(days=7)).isoformat()))
        return code

    def pair(self, code, now=None):
        now = now or now_kst()
        token = secrets.token_urlsafe(32)
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT expires FROM pairings WHERE code_hash = ?', (digest(code),)).fetchone()
            if not row or datetime.fromisoformat(row[0]) < now:
                return None
            db.execute('DELETE FROM pairings WHERE code_hash = ?', (digest(code),))
            db.execute('INSERT INTO devices VALUES (?, ?)', (digest(token), now.isoformat()))
        return token

    def device_exists(self, token):
        with self.connect() as db:
            return db.execute('SELECT 1 FROM devices WHERE token_hash = ?', (digest(token),)).fetchone() is not None

    def answer(self, token, day, answered, now=None):
        now = now or now_kst()
        with self.connect() as db:
            device = digest(token)
            if not db.execute('SELECT 1 FROM devices WHERE token_hash = ?', (device,)).fetchone():
                raise PermissionError('invalid device')
            db.execute('''INSERT INTO answers VALUES (?, ?, ?, ?)
                ON CONFLICT(device, day) DO UPDATE SET answered=excluded.answered, updated=excluded.updated''',
                       (device, day, int(answered), now.isoformat()))

    def state(self, day):
        with self.connect() as db:
            paired = db.execute('SELECT COUNT(*) FROM devices').fetchone()[0]
            answered = db.execute('SELECT 1 FROM answers WHERE day = ? AND answered = 1 LIMIT 1', (day,)).fetchone()
            reminder = db.execute('SELECT status FROM reminders WHERE day = ?', (day,)).fetchone()
        return {'paired_devices': paired, 'answered': bool(answered), 'reminder': reminder[0] if reminder else None}


def reminder_text(day):
    return (
        f'{day} · 아직 오늘의 O/X를 안 골랐네. 왜 미뤄두고 있어?\n\n'
        '가슴에 손을 얹고 스스로에게 만족할만한 하루를 보냈는가?\n\n'
        'O든 X든 직접 골라줘. X라면 이유도 남겨두자.\n'
        + SITE
    )


def remind(store, *, now=None, sender=send_message, dry_run=False):
    now = (now or now_kst()).astimezone(KST)
    day = now.date().isoformat()
    if now.hour != 23:
        return {'action': 'outside_23h', 'day': day}
    # 이 트랜잭션은 중복 실행의 발송 예약을 직렬화한다.
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        if not db.execute('SELECT 1 FROM devices LIMIT 1').fetchone():
            return {'action': 'not_paired', 'day': day}
        if db.execute('SELECT 1 FROM answers WHERE day = ? AND answered = 1 LIMIT 1', (day,)).fetchone():
            return {'action': 'answered', 'day': day}
        old = db.execute('SELECT status FROM reminders WHERE day = ?', (day,)).fetchone()
        if old and old[0] in ('sending', 'sent'):
            return {'action': 'already_attempted', 'day': day}
        if dry_run:
            return {'action': 'would_send', 'day': day}
        db.execute('''INSERT INTO reminders VALUES (?, 'sending', ?)
            ON CONFLICT(day) DO UPDATE SET status='sending', updated=excluded.updated''', (day, now.isoformat()))

    # 예약 직후 도착한 응답은 발송 전에 한 번 더 확인한다.
    if store.state(day)['answered']:
        status = 'answered'
    else:
        try:
            status = 'sent' if sender(reminder_text(day)) else 'failed'
        except Exception:
            status = 'failed'
    with store.connect() as db:
        db.execute('UPDATE reminders SET status = ?, updated = ? WHERE day = ?',
                   (status, now_kst().isoformat(), day))
    return {'action': status, 'day': day}


def handler_for(store):
    class Handler(BaseHTTPRequestHandler):
        server_version = 'RoutineReminder'

        def log_message(self, *_):
            pass  # URL·헤더·요청 본문을 로그에 출력하지 않는다.

        def reply(self, code, body):
            data = json.dumps(body, ensure_ascii=False).encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Length', str(len(data)))
            if self.headers.get('Origin') == ORIGIN:
                self.send_header('Access-Control-Allow-Origin', ORIGIN)
                self.send_header('Vary', 'Origin')
                self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS, GET')
                self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
            self.end_headers()
            self.wfile.write(data)

        def do_OPTIONS(self):
            self.reply(200 if self.headers.get('Origin') == ORIGIN else 403, {})

        def do_GET(self):
            path = urlsplit(self.path).path.removeprefix('/routine-api')
            self.reply(200 if path == '/health' else 404,
                       {'ok': True} if path == '/health' else {'error': 'not_found'})

        def do_POST(self):
            if self.headers.get('Origin') != ORIGIN:
                self.reply(403, {'error': 'origin'})
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 4096:
                    raise ValueError()
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict):
                    raise ValueError()
            except (ValueError, TypeError, UnicodeDecodeError):
                self.reply(400, {'error': 'invalid_json'})
                return
            path = urlsplit(self.path).path.removeprefix('/routine-api')
            if path == '/pair':
                code = payload.get('code')
                if set(payload) != {'code'} or not isinstance(code, str) or not 40 <= len(code) <= 100:
                    self.reply(400, {'error': 'invalid_code'})
                    return
                token = store.pair(code)
                self.reply(200 if token else 401, {'token': token} if token else {'error': 'expired_or_used'})
                return
            if path != '/answer':
                self.reply(404, {'error': 'not_found'})
                return
            auth = self.headers.get('Authorization', '')
            token = auth[7:] if auth.startswith('Bearer ') else ''
            if not token or not store.device_exists(token):
                self.reply(401, {'error': 'unauthorized'})
                return
            if set(payload) != {'day', 'answered'} or type(payload.get('answered')) is not bool:
                self.reply(400, {'error': 'invalid_answer'})
                return
            try:
                day = date.fromisoformat(payload['day'])
                today = now_kst().date()
                if day.isoformat() != payload['day'] or not today - timedelta(days=7) <= day <= today:
                    raise ValueError()
            except (ValueError, TypeError, KeyError):
                self.reply(422, {'error': 'day_out_of_range'})
                return
            store.answer(token, day.isoformat(), payload['answered'])
            self.reply(200, {'ok': True})
    return Handler


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, default=DEFAULT_DB)
    commands = parser.add_subparsers(dest='command', required=True)
    serve = commands.add_parser('serve')
    serve.add_argument('--port', type=int, default=8815)
    reminder = commands.add_parser('remind')
    reminder.add_argument('--dry-run', action='store_true')
    commands.add_parser('pair')
    commands.add_parser('status')
    args = parser.parse_args()
    store = Store(args.db)
    if args.command == 'serve':
        server = ThreadingHTTPServer(('127.0.0.1', args.port), handler_for(store))
        server.daemon_threads = True
        server.serve_forever()
    elif args.command == 'remind':
        result = remind(store, dry_run=args.dry_run)
        print(json.dumps(result))
        return 1 if result['action'] == 'failed' else 0
    elif args.command == 'pair':
        code = store.issue_pairing()
        message = (
            '하루 만족도 알림을 연결해줘. 평소 루틴을 기록하는 브라우저에서 아래 링크를 한 번 열면 돼.\n'
            '매일 밤 11시(한국 시간), O/X를 선택하지 않았을 때만 이 봇이 재촉할게.\n\n'
            + SITE + '#reminder=' + code + '\n\n'
            '연결 링크는 7일 동안 한 번 사용할 수 있어. '
            '홈 화면 앱을 쓴다면 그 앱의 설정 → 메인컨트롤 알림에 이 링크를 붙여넣어줘.'
        )
        success = send_message(message)
        print(json.dumps({'pairing_message_sent': success}))
        return 0 if success else 1
    else:
        print(json.dumps(store.state(now_kst().date().isoformat())))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
