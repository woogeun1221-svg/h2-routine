#!/usr/bin/env python3
"""루틴 미달, 하루 만족도 미응답 알림. 표준 라이브러리, 기존 tg-notify, Node 내장 crypto(web_push.cjs)만 사용한다.

DB에는 기기 인증정보의 해시, 날짜별 응답 여부와 루틴 충족 여부(불리언), 푸시 구독,
메인컨트롤 봇 동기화(2026-11-08)용 시간표 슬롯과 날짜별 요약(포지션, 남은 항목 문구, 계획과 실제 슬롯)을 저장한다.
O/X 선택값, X의 이유, 메모(송은 일정), 운동 수치 원본은 수신하지 않는다.

알림 종류(한국 시간, launchd StartCalendarInterval 과 같은 SCHEDULE):
  routine     09:00 부터 21:00 까지 두 시간마다. 어느 기기도 오늘 루틴이 최소 포지션 이상이라고 보고하지 않았으면 슬롯마다 한 번
  reflection  23:00. 어느 기기도 오늘 만족도 응답을 보고하지 않았으면 한 번
전달: 푸시 구독이 있으면 Web Push. 구독이 없거나 모두 실패하면 21:00 과 23:00(BOT_HOURS)만 메인컨트롤 봇 DM, 낮 슬롯은 건너뛴다.

메인컨트롤 봇과 주고받기(routine_bot.py): 앱은 POST /state 로 요약과 계획 슬롯을 보내고 서버의 최근 계획을 받는다.
봇 DM 의 /오늘, /시간표, /슬롯 은 alphasense 웹훅이 `reminder_service.py bot` 으로 넘기고,
일요일 20시엔 `weekly`(launchd com.woogeun.routine.weekly)가 다음 주 시간표를 보낸다.
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
import re
import secrets
import shutil
import sqlite3
import subprocess
import sys
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

import routine_bot

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / 'data' / 'reminders.sqlite3'
VAPID_FILE = ROOT / 'data' / 'vapid.json'
PUSH_SCRIPT = ROOT / 'scripts' / 'web_push.cjs'
NODE_CANDIDATES = ('/opt/homebrew/bin/node', '/usr/local/bin/node')  # launchd 의 PATH 에는 homebrew 가 없다
NOTIFIER = ROOT.parent / '_core' / 'tg-notify'
ORIGIN = 'https://woogeun1221-svg.github.io'
SITE = ORIGIN + '/h2-routine/'
KST = ZoneInfo('Asia/Seoul')
# 발송 시(한국 시간) → 종류. 두 시간 간격(2026-11-03). 설치된 launchd plist 의 StartCalendarInterval 과 같아야 한다.
SCHEDULE = {9: 'routine', 11: 'routine', 13: 'routine', 15: 'routine', 17: 'routine', 19: 'routine', 21: 'routine', 23: 'reflection'}
KINDS = ('routine', 'reflection')
BOT_HOURS = (21, 23)  # 푸시가 없거나 실패했을 때 메인컨트롤 봇으로 대신 보내는 슬롯(봇은 하루 두 번 유지)
B64URL = re.compile(r'^[A-Za-z0-9_-]+$')


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


SUMMARY_KEYS = {'status', 'planned', 'actual', 'slotRequired', 'full', 'min', 'wifeX'}


def _iso_day(value):
    if not isinstance(value, str):
        raise ValueError('day')
    day = date.fromisoformat(value)
    if day.isoformat() != value:
        raise ValueError('day')
    return day


def parse_state(payload, today):
    """앱 POST /state → {'days', 'plans', 'slotStart'?}. 형식이 아니면 ValueError.
    days: 오늘 기준 7일 전부터 내일까지 최대 3일, plans: 월요일 키 최대 8주(오늘 기준 6주 안), u 는 0 이상 밀리초."""
    if not isinstance(payload, dict) or not set(payload) <= {'today', 'days', 'plans', 'slotStart'}:
        raise ValueError('keys')
    if abs((_iso_day(payload.get('today')) - today).days) > 1:
        raise ValueError('today')
    days, plans = payload.get('days', {}), payload.get('plans', {})
    if not isinstance(days, dict) or len(days) > 3 or not isinstance(plans, dict) or len(plans) > 8:
        raise ValueError('size')
    out = {'days': {}, 'plans': {}}
    for key, value in days.items():
        day = _iso_day(key)
        if not today - timedelta(days=7) <= day <= today + timedelta(days=1):
            raise ValueError('day range')
        if not isinstance(value, dict) or not set(value) <= SUMMARY_KEYS or value.get('status') not in routine_bot.POSITION:
            raise ValueError('summary')
        for slot_key in ('planned', 'actual'):
            if value.get(slot_key) is not None and value.get(slot_key) not in routine_bot.SLOTS:
                raise ValueError(slot_key)
        for flag in ('slotRequired', 'wifeX'):
            if flag in value and type(value[flag]) is not bool:
                raise ValueError(flag)
        for gap_key in ('full', 'min'):
            items = value.get(gap_key, [])
            if (not isinstance(items, list) or len(items) > 12
                    or any(not isinstance(item, str) or len(item) > 40 for item in items)):
                raise ValueError(gap_key)
        out['days'][key] = {'status': value['status'], 'planned': value.get('planned'), 'actual': value.get('actual'),
                            'slotRequired': bool(value.get('slotRequired')), 'full': list(value.get('full', [])),
                            'min': list(value.get('min', [])), 'wifeX': bool(value.get('wifeX'))}
    for key, value in plans.items():
        monday = _iso_day(key)
        if monday.weekday() != 0 or abs((monday - today).days) > 42:
            raise ValueError('monday')
        if not isinstance(value, dict) or not set(value) <= {'1', '2', '3', '4', '5', 'u'}:
            raise ValueError('plan')
        u = value.get('u')
        if type(u) not in (int, float) or u != u or u < 0 or u > 2 ** 53:
            raise ValueError('u')
        slots = {str(i): value.get(str(i)) for i in range(1, 6)}
        if any(slot not in routine_bot.SLOTS for slot in slots.values()):
            raise ValueError('slot')
        out['plans'][key] = {'slots': slots, 'u': int(u)}
    if 'slotStart' in payload:
        start = payload['slotStart']
        out['slotStart'] = None if start is None else _iso_day(start).isoformat()
    return out


def parse_subscription(value):
    """브라우저 PushSubscription.toJSON() → {endpoint, p256dh, auth}. 형식이 아니면 ValueError."""
    if not isinstance(value, dict):
        raise ValueError('subscription')
    endpoint, keys = value.get('endpoint'), value.get('keys')
    if not isinstance(endpoint, str) or not endpoint.startswith('https://') or len(endpoint) > 2048:
        raise ValueError('endpoint')
    if not isinstance(keys, dict):
        raise ValueError('keys')
    p256dh, auth = keys.get('p256dh'), keys.get('auth')
    if not isinstance(p256dh, str) or not isinstance(auth, str):
        raise ValueError('keys')
    p256dh, auth = p256dh.rstrip('='), auth.rstrip('=')
    if len(p256dh) != 87 or not B64URL.match(p256dh) or not p256dh.startswith('B'):
        raise ValueError('p256dh')  # 비압축 P-256 포인트 65바이트
    if len(auth) != 22 or not B64URL.match(auth):
        raise ValueError('auth')  # 인증 비밀 16바이트
    return {'endpoint': endpoint, 'p256dh': p256dh, 'auth': auth}


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
                    updated TEXT NOT NULL, routine INTEGER, PRIMARY KEY(device, day)
                );
                CREATE TABLE IF NOT EXISTS reminders (
                    day TEXT NOT NULL, kind TEXT NOT NULL, slot INTEGER NOT NULL, status TEXT NOT NULL, updated TEXT NOT NULL,
                    PRIMARY KEY(day, kind, slot)
                );
                CREATE TABLE IF NOT EXISTS subscriptions (
                    endpoint TEXT PRIMARY KEY, device TEXT NOT NULL, p256dh TEXT NOT NULL,
                    auth TEXT NOT NULL, created TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS plans (
                    monday TEXT PRIMARY KEY, slots TEXT NOT NULL, u INTEGER NOT NULL,
                    source TEXT NOT NULL, updated TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS summaries (
                    day TEXT PRIMARY KEY, data TEXT NOT NULL, updated TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS meta (
                    key TEXT PRIMARY KEY, value TEXT, updated TEXT NOT NULL
                );
            ''')
            self.migrate(db)
        self.path.chmod(0o600)

    @staticmethod
    def migrate(db):
        """2026-09-17 스키마(answers 에 routine 없음, reminders 가 day 단일 키)를 보존하며 확장한다."""
        if 'routine' not in [row[1] for row in db.execute('PRAGMA table_info(answers)')]:
            db.execute('ALTER TABLE answers ADD COLUMN routine INTEGER')
        if 'kind' not in [row[1] for row in db.execute('PRAGMA table_info(reminders)')]:
            db.executescript('''
                ALTER TABLE reminders RENAME TO reminders_v1;
                CREATE TABLE reminders (
                    day TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, updated TEXT NOT NULL,
                    PRIMARY KEY(day, kind)
                );
                INSERT INTO reminders SELECT day, 'reflection', status, updated FROM reminders_v1;
                DROP TABLE reminders_v1;
            ''')
        if 'slot' not in [row[1] for row in db.execute('PRAGMA table_info(reminders)')]:
            # 2026-10-30 스키마(day, kind 한 번)를 두 시간 슬롯(2026-11-03)으로. 옛 행은 그 종류의 원래 시각 슬롯에 둔다.
            db.executescript('''
                ALTER TABLE reminders RENAME TO reminders_v2;
                CREATE TABLE reminders (
                    day TEXT NOT NULL, kind TEXT NOT NULL, slot INTEGER NOT NULL, status TEXT NOT NULL, updated TEXT NOT NULL,
                    PRIMARY KEY(day, kind, slot)
                );
                INSERT INTO reminders
                    SELECT day, kind, CASE kind WHEN 'reflection' THEN 23 ELSE 21 END, status, updated FROM reminders_v2;
                DROP TABLE reminders_v2;
            ''')

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

    def answer(self, token, day, answered, now=None, routine=None):
        """routine: 그 날 루틴이 최소 포지션 이상이면 True. None 이면(옛 클라이언트) 기존 값을 유지한다."""
        now = now or now_kst()
        with self.connect() as db:
            device = digest(token)
            if not db.execute('SELECT 1 FROM devices WHERE token_hash = ?', (device,)).fetchone():
                raise PermissionError('invalid device')
            db.execute('''INSERT INTO answers (device, day, answered, updated, routine) VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(device, day) DO UPDATE SET answered=excluded.answered, updated=excluded.updated,
                routine=COALESCE(excluded.routine, answers.routine)''',
                       (device, day, int(answered), now.isoformat(), None if routine is None else int(routine)))

    def add_subscription(self, token, subscription, now=None):
        now = now or now_kst()
        with self.connect() as db:
            device = digest(token)
            if not db.execute('SELECT 1 FROM devices WHERE token_hash = ?', (device,)).fetchone():
                raise PermissionError('invalid device')
            db.execute('''INSERT INTO subscriptions VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(endpoint) DO UPDATE SET device=excluded.device, p256dh=excluded.p256dh,
                auth=excluded.auth, created=excluded.created''',
                       (subscription['endpoint'], device, subscription['p256dh'], subscription['auth'], now.isoformat()))

    def remove_subscription(self, token, endpoint):
        with self.connect() as db:
            db.execute('DELETE FROM subscriptions WHERE endpoint = ? AND device = ?', (endpoint, digest(token)))

    def drop_subscriptions(self, endpoints):
        with self.connect() as db:
            db.executemany('DELETE FROM subscriptions WHERE endpoint = ?', [(e,) for e in endpoints])

    def subscriptions(self):
        with self.connect() as db:
            rows = db.execute('SELECT endpoint, p256dh, auth FROM subscriptions ORDER BY created').fetchall()
        return [{'endpoint': r[0], 'p256dh': r[1], 'auth': r[2]} for r in rows]

    # ---------- 메인컨트롤 봇 동기화: 시간표 슬롯과 날짜별 요약(2026-11-08) ----------
    def save_state(self, token, data, now=None):
        """앱이 보낸 요약과 계획 저장. 계획은 주 단위로 u(밀리초)가 큰 쪽이 이기고, 같으면 앱 것이 이긴다
        (물려받은 계획 u=0 은 앞 주 계획이 바뀌면 내용이 달라지므로 앱이 다시 보낸 것으로 바꾼다).
        봇이 쓴 계획은 u 가 지금 시각이라 늦게 도착한 앱의 옛 계획에 덮이지 않는다."""
        now = now or now_kst()
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if not db.execute('SELECT 1 FROM devices WHERE token_hash = ?', (digest(token),)).fetchone():
                raise PermissionError('invalid device')
            for day, summary in data['days'].items():
                db.execute('''INSERT INTO summaries VALUES (?, ?, ?)
                    ON CONFLICT(day) DO UPDATE SET data=excluded.data, updated=excluded.updated''',
                           (day, json.dumps(summary, ensure_ascii=False), now.isoformat()))
            for monday, plan in data['plans'].items():
                row = db.execute('SELECT u, source FROM plans WHERE monday = ?', (monday,)).fetchone()
                if row is None or plan['u'] > row[0] or (plan['u'] == row[0] and row[1] == 'app'):
                    db.execute('''INSERT INTO plans VALUES (?, ?, ?, 'app', ?)
                        ON CONFLICT(monday) DO UPDATE SET slots=excluded.slots, u=excluded.u,
                        source=excluded.source, updated=excluded.updated''',
                               (monday, json.dumps(plan['slots']), plan['u'], now.isoformat()))
            if 'slotStart' in data:
                db.execute('''INSERT INTO meta VALUES ('slotStart', ?, ?)
                    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated=excluded.updated''',
                           (data['slotStart'], now.isoformat()))

    def recent_plans(self, today):
        """지난주부터의 계획 — /state 응답. {월요일: {'1'..'5': 슬롯, 'u': 밀리초}}"""
        since = (routine_bot.monday_of(today) - timedelta(days=7)).isoformat()
        with self.connect() as db:
            rows = db.execute('SELECT monday, slots, u FROM plans WHERE monday >= ? ORDER BY monday', (since,)).fetchall()
        return {monday: dict(json.loads(slots), u=u) for monday, slots, u in rows}

    @staticmethod
    def _plan_slots(row):
        slots = json.loads(row[0]) if row else {}
        return {str(i): slots.get(str(i)) if slots.get(str(i)) in routine_bot.SLOTS else 'am' for i in range(1, 6)}

    def effective_plan(self, monday):
        """앱의 planFor 와 같다: 그 주 계획, 없으면 그 전 가장 가까운 주의 슬롯, 그것도 없으면 전부 아침.
        반환 ({'1'..'5': 슬롯}, 그 주 계획이 있는가)"""
        with self.connect() as db:
            row = db.execute('SELECT slots, monday FROM plans WHERE monday <= ? ORDER BY monday DESC LIMIT 1',
                             (monday,)).fetchone()
        return self._plan_slots(row), bool(row and row[1] == monday)

    def set_plan_slots(self, monday, changes, now=None):
        """봇 /슬롯 — 그 주 계획(없으면 물려받은 슬롯을 복사)에서 changes {요일번호: 슬롯} 을 바꾸고 u=지금으로 쓴다."""
        now = now or now_kst()
        now_ms = int(now.timestamp() * 1000)
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT slots FROM plans WHERE monday <= ? ORDER BY monday DESC LIMIT 1', (monday,)).fetchone()
            plan = self._plan_slots(row)
            for wd, slot in changes.items():
                plan[str(wd)] = slot
            own = db.execute('SELECT u FROM plans WHERE monday = ?', (monday,)).fetchone()
            u = max(now_ms, own[0] + 1) if own else now_ms
            db.execute('''INSERT INTO plans VALUES (?, ?, ?, 'bot', ?)
                ON CONFLICT(monday) DO UPDATE SET slots=excluded.slots, u=excluded.u,
                source=excluded.source, updated=excluded.updated''',
                       (monday, json.dumps(plan), u, now.isoformat()))
        return plan, u

    def has_plan_before(self, monday):
        with self.connect() as db:
            return db.execute('SELECT 1 FROM plans WHERE monday < ? LIMIT 1', (monday,)).fetchone() is not None

    def summary(self, day):
        """(요약 dict, 받은 시각 iso) 또는 (None, None)"""
        with self.connect() as db:
            row = db.execute('SELECT data, updated FROM summaries WHERE day = ?', (day,)).fetchone()
        return (json.loads(row[0]), row[1]) if row else (None, None)

    def last_summary_day(self):
        with self.connect() as db:
            row = db.execute('SELECT MAX(day) FROM summaries').fetchone()
        return row[0] if row else None

    def meta(self, key):
        with self.connect() as db:
            row = db.execute('SELECT value FROM meta WHERE key = ?', (key,)).fetchone()
        return row[0] if row else None

    def state(self, day):
        with self.connect() as db:
            paired = db.execute('SELECT COUNT(*) FROM devices').fetchone()[0]
            answered = db.execute('SELECT 1 FROM answers WHERE day = ? AND answered = 1 LIMIT 1', (day,)).fetchone()
            routine = db.execute('SELECT 1 FROM answers WHERE day = ? AND routine = 1 LIMIT 1', (day,)).fetchone()
            # 종류별 마지막 슬롯의 상태(슬롯 순으로 덮어쓴다)
            reminders = dict(db.execute('SELECT kind, status FROM reminders WHERE day = ? ORDER BY slot', (day,)).fetchall())
            subscriptions = db.execute('SELECT COUNT(*) FROM subscriptions').fetchone()[0]
        return {'paired_devices': paired, 'answered': bool(answered), 'routine_done': bool(routine),
                'reminder': reminders.get('reflection'), 'reminders': reminders, 'subscriptions': subscriptions}


# ---------- 발송 ----------

def node_path():
    for candidate in NODE_CANDIDATES:
        if os.access(candidate, os.X_OK):
            return candidate
    found = shutil.which('node')
    if not found:
        raise FileNotFoundError('node runtime not found')
    return found


def ensure_vapid(path=VAPID_FILE):
    """VAPID 키 쌍. 없으면 web_push.cjs keygen 으로 만들어 0600 으로 저장한다."""
    path = Path(path)
    if path.exists():
        return json.loads(path.read_text())
    result = subprocess.run([node_path(), str(PUSH_SCRIPT), 'keygen'],
                            capture_output=True, text=True, timeout=30, check=True)
    keys = json.loads(result.stdout)
    keys['subject'] = SITE
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    path.write_text(json.dumps(keys))
    path.chmod(0o600)
    return keys


def public_key(path=VAPID_FILE):
    return ensure_vapid(path)['publicKey']


def send_push(subscriptions, payload, vapid_file=VAPID_FILE):
    """구독 목록에 Web Push 발송. 반환: [{'endpoint', 'status'}]. 엔드포인트는 로그에 남기지 않는다."""
    keys = ensure_vapid(vapid_file)
    request = {'subscriptions': subscriptions, 'payload': payload, 'ttl': 3600, 'subject': keys.get('subject', SITE)}
    result = subprocess.run([node_path(), str(PUSH_SCRIPT), 'send', '--vapid', str(vapid_file)],
                            input=json.dumps(request), capture_output=True, text=True, timeout=90)
    if result.returncode != 0:
        raise RuntimeError('push sender failed')
    return json.loads(result.stdout)['results']


def friday_note(now):
    return ' 금요일이라 투자 원칙 검토도 오늘까지.' if now.weekday() == 4 else ''


def hour_label(hour):
    if hour < 12:
        return f'오전 {hour}시'
    if hour < 18:
        return f'오후 {hour - 12}시'
    if hour < 21:
        return f'저녁 {hour - 12}시'
    return f'밤 {hour - 12}시'


def routine_body(now, casual=False, hint=''):
    """낮 슬롯은 가슴 펴기 질문으로 시작하고, 21시는 자기 전 마지막 재촉. casual 은 봇 DM 말투.
    hint 는 오늘 계획 운동 슬롯이 아직 남았을 때의 한 줄(routine_bot.reminder_hint)."""
    miss = '미달이야' if casual else '미달이다'
    if now.hour >= 21:
        return f'밤 9시. 오늘 루틴이 아직 {miss}. 최소 포지션이라도 채우고 자자. 두 번 연속 거르지 않는다.' + friday_note(now)
    return (f'{hour_label(now.hour)}. 가슴을 당당히 펴고 있는가? 오늘 루틴은 아직 {miss}. 지금 한 포지션이라도 쌓자.'
            + hint + friday_note(now))


def push_payload(kind, day, now, hint=''):
    if kind == 'routine':
        return {'title': 'H2 루틴', 'tag': 'h2-routine-routine', 'url': SITE, 'body': routine_body(now, hint=hint)}
    return {'title': '하루 만족도', 'tag': 'h2-routine-reflection', 'url': SITE,
            'body': '아직 오늘의 O/X를 안 골랐다. 스스로에게 만족할만한 하루를 보냈는가? O든 X든 직접 고르고, X라면 이유도 남기자.'}


def telegram_text(kind, day, now, hint=''):
    if kind == 'routine':
        return f'{day} ' + routine_body(now, casual=True, hint=hint) + '\n' + SITE
    return (
        f'{day} 아직 오늘의 O/X를 안 골랐네. 왜 미뤄두고 있어?\n\n'
        '스스로에게 만족할만한 하루를 보냈는가? 컨트롤 할 수 있는 건 오로지 나뿐.\n\n'
        'O든 X든 직접 골라줘. X라면 이유도 남겨두자.\n'
        + SITE
    )


def reminder_text(day):
    return telegram_text('reflection', day, now_kst())


def kind_for(now):
    return SCHEDULE.get(now.hour)


def deliver(store, kind, day, now, sender, pusher, bot=True, hint=''):
    """푸시 구독이 있으면 푸시. 없거나 전부 실패하면 bot 슬롯(21시, 23시)만 메인컨트롤 봇, 낮 슬롯은 건너뛴다(skipped, failed).
    끊긴 구독(404, 410)은 지운다."""
    subscriptions = store.subscriptions()
    pushed = False
    if subscriptions:
        try:
            results = pusher(subscriptions, push_payload(kind, day, now, hint))
        except Exception:
            results = []
        gone = [r['endpoint'] for r in results if r.get('status') in (404, 410)]
        if gone:
            store.drop_subscriptions(gone)
        if any(200 <= int(r.get('status') or 0) < 300 for r in results):
            return 'sent', 'push'
        pushed = True
    if not bot:
        return ('failed', 'push') if pushed else ('skipped', None)
    try:
        return ('sent' if sender(telegram_text(kind, day, now, hint)) else 'failed'), 'telegram'
    except Exception:
        return 'failed', 'telegram'


def remind(store, *, now=None, kind=None, sender=send_message, pusher=send_push, dry_run=False):
    now = (now or now_kst()).astimezone(KST)
    day = now.date().isoformat()
    kind = kind or kind_for(now)
    if kind not in KINDS:
        return {'action': 'outside_schedule', 'day': day}
    slot = now.hour  # 같은 날 같은 종류라도 슬롯마다 한 번. --kind 로 수동 실행하면 그 시각이 슬롯이다.
    skip = 'answered' if kind == 'reflection' else 'routine_done'
    # 이 트랜잭션은 중복 실행의 발송 예약을 직렬화한다.
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        if not db.execute('SELECT 1 FROM devices LIMIT 1').fetchone():
            return {'action': 'not_paired', 'day': day, 'kind': kind}
        column = 'answered' if kind == 'reflection' else 'routine'
        if db.execute(f'SELECT 1 FROM answers WHERE day = ? AND {column} = 1 LIMIT 1', (day,)).fetchone():
            return {'action': skip, 'day': day, 'kind': kind}
        old = db.execute('SELECT status FROM reminders WHERE day = ? AND kind = ? AND slot = ?', (day, kind, slot)).fetchone()
        if old and old[0] in ('sending', 'sent'):
            return {'action': 'already_attempted', 'day': day, 'kind': kind, 'slot': slot}
        if dry_run:
            return {'action': 'would_send', 'day': day, 'kind': kind, 'slot': slot, 'bot': slot in BOT_HOURS,
                    'subscriptions': len(store.subscriptions())}
        db.execute('''INSERT INTO reminders VALUES (?, ?, ?, 'sending', ?)
            ON CONFLICT(day, kind, slot) DO UPDATE SET status='sending', updated=excluded.updated''',
                   (day, kind, slot, now.isoformat()))

    # 예약 직후 도착한 보고는 발송 전에 한 번 더 확인한다.
    current = store.state(day)
    channel = None
    if current[skip]:
        status = skip
    else:
        try:
            hint = routine_bot.reminder_hint(store, now) if kind == 'routine' else ''
        except Exception:  # 슬롯 한 줄을 못 만들어도 알림은 간다
            hint = ''
        status, channel = deliver(store, kind, day, now, sender, pusher, bot=slot in BOT_HOURS, hint=hint)
    with store.connect() as db:
        db.execute('UPDATE reminders SET status = ?, updated = ? WHERE day = ? AND kind = ? AND slot = ?',
                   (status, now_kst().isoformat(), day, kind, slot))
    result = {'action': status, 'day': day, 'kind': kind, 'slot': slot}
    if channel:
        result['channel'] = channel
    return result


# ---------- HTTP ----------

def handler_for(store, vapid_file=VAPID_FILE):
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
            if path == '/health':
                self.reply(200, {'ok': True})
            elif path == '/push/key':
                try:
                    self.reply(200, {'key': public_key(vapid_file)})
                except Exception:
                    self.reply(503, {'error': 'push_unavailable'})
            else:
                self.reply(404, {'error': 'not_found'})

        def device_token(self):
            auth = self.headers.get('Authorization', '')
            token = auth[7:] if auth.startswith('Bearer ') else ''
            return token if token and store.device_exists(token) else None

        def do_POST(self):
            if self.headers.get('Origin') != ORIGIN:
                self.reply(403, {'error': 'origin'})
                return
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 8192:
                    raise ValueError()
                payload = json.loads(self.rfile.read(length))
                if not isinstance(payload, dict):
                    raise ValueError()
            except (ValueError, TypeError, UnicodeDecodeError):
                self.reply(400, {'error': 'invalid_json'})
                return
            path = urlsplit(self.path).path.removeprefix('/routine-api')
            if path == '/pair':
                self.handle_pair(payload)
            elif path == '/answer':
                self.handle_answer(payload)
            elif path == '/push/subscribe':
                self.handle_subscribe(payload)
            elif path == '/push/unsubscribe':
                self.handle_unsubscribe(payload)
            elif path == '/state':
                self.handle_state(payload)
            else:
                self.reply(404, {'error': 'not_found'})

        def handle_state(self, payload):
            """메인컨트롤 봇 동기화 — 요약과 계획 슬롯을 받고 서버의 최근 계획(봇에서 바꾼 것 포함)을 돌려준다."""
            token = self.device_token()
            if not token:
                self.reply(401, {'error': 'unauthorized'})
                return
            today = now_kst().date()
            try:
                data = parse_state(payload, today)
            except (ValueError, TypeError, KeyError):
                self.reply(400, {'error': 'invalid_state'})
                return
            store.save_state(token, data)
            self.reply(200, {'ok': True, 'plans': store.recent_plans(today)})

        def handle_pair(self, payload):
            code = payload.get('code')
            if not {'code'} <= set(payload) <= {'code', 'subscription'} or not isinstance(code, str) or not 40 <= len(code) <= 100:
                self.reply(400, {'error': 'invalid_code'})
                return
            subscription = None
            if 'subscription' in payload:
                try:
                    subscription = parse_subscription(payload['subscription'])
                except ValueError:
                    self.reply(400, {'error': 'invalid_subscription'})
                    return
            token = store.pair(code)
            if not token:
                self.reply(401, {'error': 'expired_or_used'})
                return
            if subscription:
                store.add_subscription(token, subscription)
            self.reply(200, {'token': token})

        def handle_answer(self, payload):
            token = self.device_token()
            if not token:
                self.reply(401, {'error': 'unauthorized'})
                return
            if (not {'day', 'answered'} <= set(payload) <= {'day', 'answered', 'routine'}
                    or type(payload.get('answered')) is not bool
                    or ('routine' in payload and type(payload['routine']) is not bool)):
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
            store.answer(token, day.isoformat(), payload['answered'], routine=payload.get('routine'))
            self.reply(200, {'ok': True})

        def handle_subscribe(self, payload):
            token = self.device_token()
            if not token:
                self.reply(401, {'error': 'unauthorized'})
                return
            try:
                if set(payload) != {'subscription'}:
                    raise ValueError()
                subscription = parse_subscription(payload['subscription'])
            except ValueError:
                self.reply(400, {'error': 'invalid_subscription'})
                return
            store.add_subscription(token, subscription)
            self.reply(200, {'ok': True})

        def handle_unsubscribe(self, payload):
            token = self.device_token()
            if not token:
                self.reply(401, {'error': 'unauthorized'})
                return
            endpoint = payload.get('endpoint')
            if set(payload) != {'endpoint'} or not isinstance(endpoint, str) or len(endpoint) > 2048:
                self.reply(400, {'error': 'invalid_endpoint'})
                return
            store.remove_subscription(token, endpoint)
            self.reply(200, {'ok': True})
    return Handler


def pairing_message(code):
    return (
        '루틴 앱 알림을 연결해줘. 홈 화면의 H2 루틴 앱을 열고 설정의 알림 칸에 아래 코드를 붙여넣은 뒤 '
        '"연결하고 알림 켜기"를 누르면 돼. 밤 9시 루틴 미달, 밤 11시 하루 만족도 미응답 때 한 번씩 앱 알림이 와.\n\n'
        + code + '\n\n'
        '코드는 7일 동안 한 번 쓸 수 있어. 홈 화면 앱이 아니라 Safari 탭이면 이 링크를 열어도 돼(그땐 앱 알림 대신 내가 알릴게): '
        + SITE + '#reminder=' + code
    )


def send_weekly(store, *, now=None, sender=send_message, dry_run=False):
    """일요일 20시 다음 주 시간표를 메인컨트롤 봇 DM 으로. 연결된 기기가 있고 최근 14일 안에 앱 요약이 들어왔을 때만,
    같은 날 한 번(reminders 표의 kind='weekly'). 앱을 안 쓰는 동안 옛 계획을 계속 보내지 않는다."""
    now = (now or now_kst()).astimezone(KST)
    day = now.date().isoformat()
    with store.connect() as db:
        db.execute('BEGIN IMMEDIATE')
        if not db.execute('SELECT 1 FROM devices LIMIT 1').fetchone():
            return {'action': 'not_paired', 'day': day}
        last = db.execute('SELECT MAX(day) FROM summaries').fetchone()[0]
        if not last or (now.date() - date.fromisoformat(last)).days > 14:
            return {'action': 'app_idle', 'day': day}
        old = db.execute("SELECT status FROM reminders WHERE day = ? AND kind = 'weekly' AND slot = 0", (day,)).fetchone()
        if old and old[0] in ('sending', 'sent'):
            return {'action': 'already_attempted', 'day': day}
        if not dry_run:
            db.execute('''INSERT INTO reminders VALUES (?, 'weekly', 0, 'sending', ?)
                ON CONFLICT(day, kind, slot) DO UPDATE SET status='sending', updated=excluded.updated''',
                       (day, now.isoformat()))
    text = routine_bot.weekly_text(store, now)
    if dry_run:
        return {'action': 'would_send', 'day': day, 'text': text}
    try:
        ok = sender(text)
    except Exception:
        ok = False
    status = 'sent' if ok else 'failed'
    with store.connect() as db:
        db.execute("UPDATE reminders SET status = ?, updated = ? WHERE day = ? AND kind = 'weekly' AND slot = 0",
                   (status, now_kst().isoformat(), day))
    return {'action': status, 'day': day}


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', type=Path, default=DEFAULT_DB)
    commands = parser.add_subparsers(dest='command', required=True)
    serve = commands.add_parser('serve')
    serve.add_argument('--port', type=int, default=8815)
    reminder = commands.add_parser('remind')
    reminder.add_argument('--kind', choices=sorted(KINDS), default=None,
                          help='생략하면 현재 시각으로 정한다(9시부터 21시까지 두 시간마다 routine, 23시 reflection)')
    reminder.add_argument('--dry-run', action='store_true')
    commands.add_parser('pair')
    commands.add_parser('status')
    commands.add_parser('push-test', help='연결된 모든 푸시 구독에 확인용 알림을 보낸다')
    commands.add_parser('bot', help='메인컨트롤 DM 루틴 명령(표준입력) → {"reply": 문구}. alphasense 웹훅이 부른다')
    weekly = commands.add_parser('weekly', help='다음 주 시간표를 메인컨트롤 봇 DM 으로 보낸다(일요일 20시 launchd)')
    weekly.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    store = Store(args.db)
    if args.command == 'serve':
        try:
            ensure_vapid()
        except Exception as error:  # 푸시 키가 없어도 응답 수집은 계속한다
            print(json.dumps({'warning': 'vapid_unavailable', 'error': type(error).__name__}), file=sys.stderr, flush=True)
        server = ThreadingHTTPServer(('127.0.0.1', args.port), handler_for(store))
        server.daemon_threads = True
        server.serve_forever()
    elif args.command == 'remind':
        result = remind(store, kind=args.kind, dry_run=args.dry_run)
        print(json.dumps(result))
        return 1 if result['action'] == 'failed' else 0
    elif args.command == 'pair':
        success = send_message(pairing_message(store.issue_pairing()))
        print(json.dumps({'pairing_message_sent': success}))
        return 0 if success else 1
    elif args.command == 'push-test':
        subscriptions = store.subscriptions()
        if not subscriptions:
            print(json.dumps({'sent': 0, 'subscriptions': 0}))
            return 1
        results = send_push(subscriptions, {'title': 'H2 루틴', 'tag': 'h2-routine-test', 'url': SITE,
                                            'body': '알림 연결 확인. 이 알림이 보이면 설정이 끝났다.'})
        gone = [r['endpoint'] for r in results if r.get('status') in (404, 410)]
        if gone:
            store.drop_subscriptions(gone)
        statuses = [r.get('status') for r in results]
        print(json.dumps({'sent': sum(1 for s in statuses if 200 <= int(s or 0) < 300), 'statuses': statuses, 'dropped': len(gone)}))
        return 0 if any(200 <= int(s or 0) < 300 for s in statuses) else 1
    elif args.command == 'bot':
        # 입출력은 바이트로 다룬다 — 웹훅이 최소 환경(로캘 없음)으로 불러도 한글이 깨지지 않게, 출력은 ASCII JSON.
        text = sys.stdin.buffer.read(4096).decode('utf-8', 'replace')
        sys.stdout.write(json.dumps({'reply': routine_bot.bot_reply(store, text)}) + '\n')
    elif args.command == 'weekly':
        result = send_weekly(store, dry_run=args.dry_run)
        print(json.dumps(result))
        return 1 if result['action'] == 'failed' else 0
    else:
        print(json.dumps(store.state(now_kst().date().isoformat())))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
