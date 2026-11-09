from datetime import datetime, timedelta, timezone
from http.server import ThreadingHTTPServer
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest
from unittest.mock import Mock
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from reminder_service import (KST, NODE_CANDIDATES, ORIGIN, Store, ensure_vapid, handler_for, now_kst,
                              parse_subscription, remind)

P256DH = 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'
AUTH = 'BTBZMqHH6r4Tts7J_aSIgg'
FAKE_VAPID = {'publicKey': 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
              'privateKey': 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', 'subject': 'https://woogeun1221-svg.github.io/h2-routine/'}


def subscription(endpoint='https://web.push.apple.com/abc'):
    return {'endpoint': endpoint, 'keys': {'p256dh': P256DH, 'auth': AUTH}}


class ReminderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Store(Path(self.temp.name) / 'test.sqlite3')
        self.now = datetime(2026, 9, 17, 23, 0, tzinfo=KST)   # 수요일
        self.evening = self.now.replace(hour=21)
        self.token = self.store.pair(self.store.issue_pairing(self.now), self.now)
        self.sender = Mock(return_value=True)
        self.pusher = Mock(return_value=[])

    def run_reminder(self, now=None, **kwargs):
        return remind(self.store, now=now or self.now, sender=self.sender, pusher=self.pusher, **kwargs)['action']

    def test_only_unanswered_at_23_kst_once_per_day(self):
        self.assertEqual(self.run_reminder(self.now - timedelta(minutes=1)), 'outside_schedule')
        # UTC 입력도 한국 시간 23시로 판정한다.
        self.assertEqual(self.run_reminder(self.now.astimezone(timezone.utc), dry_run=True), 'would_send')
        self.sender.assert_not_called()
        self.assertEqual(self.run_reminder(), 'sent')
        self.assertEqual(self.run_reminder(self.now + timedelta(minutes=5)), 'already_attempted')
        self.assertEqual(self.run_reminder(self.now + timedelta(hours=1)), 'outside_schedule')
        self.sender.assert_called_once()
        self.assertIn('스스로에게 만족할만한 하루를 보냈는가?', self.sender.call_args[0][0])
        self.assertNotIn('·', self.sender.call_args[0][0])
        self.assertEqual(self.run_reminder(self.now + timedelta(days=1)), 'sent')

    def test_answered_o_or_x_suppresses_nudge_and_cancel_restores_it(self):
        self.store.answer(self.token, '2026-09-17', True, self.now)
        self.assertEqual(self.run_reminder(), 'answered')
        self.sender.assert_not_called()
        self.store.answer(self.token, '2026-09-17', False, self.now)
        self.assertEqual(self.run_reminder(), 'sent')

    def test_blank_second_device_does_not_erase_answer(self):
        second = self.store.pair(self.store.issue_pairing(self.now), self.now)
        self.store.answer(self.token, '2026-09-17', True, self.now)
        self.store.answer(second, '2026-09-17', False, self.now)
        self.assertEqual(self.run_reminder(), 'answered')
        self.sender.assert_not_called()

    def test_old_answer_does_not_suppress_today(self):
        self.store.answer(self.token, '2026-09-16', True, self.now)
        self.assertEqual(self.run_reminder(), 'sent')

    def test_failure_is_not_marked_sent(self):
        self.sender.return_value = False
        self.assertEqual(self.run_reminder(), 'failed')
        self.assertEqual(self.store.state('2026-09-17')['reminder'], 'failed')
        self.sender.return_value = True
        self.assertEqual(self.run_reminder(), 'sent')

    def test_pairing_single_use_expiry_and_hashes_only(self):
        code = self.store.issue_pairing(self.now)
        self.assertIsNotNone(self.store.pair(code, self.now))
        self.assertIsNone(self.store.pair(code, self.now))
        expired = self.store.issue_pairing(self.now)
        self.assertIsNone(self.store.pair(expired, self.now + timedelta(days=8)))
        with self.store.connect() as db:
            self.assertTrue(all(len(row[0]) == 64 for row in db.execute('SELECT token_hash FROM devices')))
        self.assertNotIn(self.token.encode(), self.store.path.read_bytes())
        self.assertNotIn(expired.encode(), self.store.path.read_bytes())

    def test_routine_reminder_at_21_only_when_no_device_reports_minimum(self):
        self.assertEqual(self.run_reminder(self.evening), 'sent')
        self.assertEqual(remind(self.store, now=self.evening, sender=self.sender, pusher=self.pusher)['kind'], 'routine')
        self.assertIn('밤 9시', self.sender.call_args[0][0])
        self.assertNotIn('금요일', self.sender.call_args[0][0])
        self.assertEqual(self.run_reminder(self.evening + timedelta(minutes=10)), 'already_attempted')
        # 어느 기기든 최소 포지션 이상이라고 보고하면 보내지 않고, 다른 기기의 미달 보고가 이를 지우지 않는다.
        tomorrow = self.evening + timedelta(days=1)
        second = self.store.pair(self.store.issue_pairing(self.now), self.now)
        self.store.answer(self.token, '2026-09-18', False, tomorrow, routine=True)
        self.store.answer(second, '2026-09-18', False, tomorrow, routine=False)
        self.assertEqual(self.run_reminder(tomorrow), 'routine_done')
        # routine 을 생략한(옛 클라이언트) 보고는 기존 값을 유지한다.
        self.store.answer(self.token, '2026-09-18', True, tomorrow)
        self.assertEqual(self.run_reminder(tomorrow), 'routine_done')
        self.assertEqual(self.run_reminder(tomorrow.replace(hour=23)), 'answered')
        # 미달로 돌아가면 다시 보낸다. 금요일에는 주간 항목 문구가 붙는다.
        friday = datetime(2026, 9, 18, 21, 0, tzinfo=KST)
        self.store.answer(self.token, '2026-09-18', True, friday, routine=False)
        self.assertEqual(self.run_reminder(friday), 'sent')
        self.assertIn('금요일이라 투자 원칙 검토도 오늘까지', self.sender.call_args[0][0])

    def test_routine_and_reflection_are_independent_per_day(self):
        self.assertEqual(self.run_reminder(self.evening), 'sent')
        self.assertEqual(self.run_reminder(self.now), 'sent')
        self.assertEqual(self.sender.call_count, 2)
        self.assertEqual(self.store.state('2026-09-17')['reminders'], {'routine': 'sent', 'reflection': 'sent'})
        self.assertEqual(self.store.state('2026-09-17')['reminder'], 'sent')

    def test_push_is_preferred_and_dead_subscriptions_are_dropped(self):
        self.store.add_subscription(self.token, parse_subscription(subscription()), self.now)
        self.store.add_subscription(self.token, parse_subscription(subscription('https://web.push.apple.com/second')), self.now)
        self.assertEqual(self.store.state('2026-09-17')['subscriptions'], 2)
        self.pusher.return_value = [{'endpoint': 'https://web.push.apple.com/abc', 'status': 201},
                                    {'endpoint': 'https://web.push.apple.com/second', 'status': 410}]
        result = remind(self.store, now=self.now, sender=self.sender, pusher=self.pusher)
        self.assertEqual((result['action'], result['channel']), ('sent', 'push'))
        self.sender.assert_not_called()
        sent_subscriptions, payload = self.pusher.call_args[0]
        self.assertEqual([s['endpoint'] for s in sent_subscriptions],
                         ['https://web.push.apple.com/abc', 'https://web.push.apple.com/second'])
        self.assertEqual(sent_subscriptions[0]['p256dh'], P256DH)
        self.assertEqual(set(payload), {'title', 'body', 'tag', 'url'})
        self.assertNotIn('·', payload['body'])
        self.assertEqual([s['endpoint'] for s in self.store.subscriptions()], ['https://web.push.apple.com/abc'])
        # 429 는 구독을 지우지 않고, 전부 실패하면 메인컨트롤 봇으로 넘어간다.
        self.pusher.return_value = [{'endpoint': 'https://web.push.apple.com/abc', 'status': 429}]
        result = remind(self.store, now=self.evening, sender=self.sender, pusher=self.pusher)
        self.assertEqual((result['action'], result['channel']), ('sent', 'telegram'))
        self.assertEqual(len(self.store.subscriptions()), 1)
        # 발송기 예외도 폴백이다.
        self.pusher.side_effect = RuntimeError('node missing')
        result = remind(self.store, now=self.now + timedelta(days=1), sender=self.sender, pusher=self.pusher)
        self.assertEqual((result['action'], result['channel']), ('sent', 'telegram'))

    def test_without_subscriptions_telegram_is_used_and_unpaired_sends_nothing(self):
        result = remind(self.store, now=self.now, sender=self.sender, pusher=self.pusher)
        self.assertEqual((result['action'], result['channel']), ('sent', 'telegram'))
        self.pusher.assert_not_called()
        empty = Store(Path(self.temp.name) / 'empty.sqlite3')
        self.assertEqual(remind(empty, now=self.now, sender=self.sender, pusher=self.pusher)['action'], 'not_paired')
        self.assertEqual(remind(empty, now=self.evening, sender=self.sender, pusher=self.pusher)['action'], 'not_paired')
        self.assertEqual(self.sender.call_count, 1)

    def test_migrates_2026_09_schema_without_losing_rows(self):
        path = Path(self.temp.name) / 'old.sqlite3'
        db = sqlite3.connect(path)
        db.executescript('''
            CREATE TABLE pairings (code_hash TEXT PRIMARY KEY, expires TEXT NOT NULL);
            CREATE TABLE devices (token_hash TEXT PRIMARY KEY, created TEXT NOT NULL);
            CREATE TABLE answers (device TEXT NOT NULL, day TEXT NOT NULL, answered INTEGER NOT NULL,
                updated TEXT NOT NULL, PRIMARY KEY(device, day));
            CREATE TABLE reminders (day TEXT PRIMARY KEY, status TEXT NOT NULL, updated TEXT NOT NULL);
            INSERT INTO devices VALUES ('d', '2026-09-17');
            INSERT INTO answers VALUES ('d', '2026-09-17', 1, '2026-09-17');
            INSERT INTO reminders VALUES ('2026-09-16', 'sent', '2026-09-16');
        ''')
        db.commit(); db.close()
        store = Store(path)
        store = Store(path)  # 두 번 열어도 같다
        self.assertEqual(store.state('2026-09-16')['reminders'], {'reflection': 'sent'})
        with store.connect() as db:
            self.assertEqual(db.execute('SELECT kind, slot FROM reminders').fetchall(), [('reflection', 23)])
        self.assertEqual(store.state('2026-09-17')['answered'], True)
        self.assertEqual(store.state('2026-09-17')['routine_done'], False)
        self.assertEqual(store.state('2026-09-17')['subscriptions'], 0)

    def test_migrates_2026_10_schema_to_two_hour_slots(self):
        path = Path(self.temp.name) / 'v2.sqlite3'
        db = sqlite3.connect(path)
        db.executescript('''
            CREATE TABLE pairings (code_hash TEXT PRIMARY KEY, expires TEXT NOT NULL);
            CREATE TABLE devices (token_hash TEXT PRIMARY KEY, created TEXT NOT NULL);
            CREATE TABLE answers (device TEXT NOT NULL, day TEXT NOT NULL, answered INTEGER NOT NULL,
                updated TEXT NOT NULL, routine INTEGER, PRIMARY KEY(device, day));
            CREATE TABLE reminders (day TEXT NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL, updated TEXT NOT NULL,
                PRIMARY KEY(day, kind));
            CREATE TABLE subscriptions (endpoint TEXT PRIMARY KEY, device TEXT NOT NULL, p256dh TEXT NOT NULL,
                auth TEXT NOT NULL, created TEXT NOT NULL);
            INSERT INTO devices VALUES ('d', '2026-10-30');
            INSERT INTO reminders VALUES ('2026-11-02', 'routine', 'sent', '2026-11-02T21:00');
            INSERT INTO reminders VALUES ('2026-11-02', 'reflection', 'failed', '2026-11-02T23:00');
        ''')
        db.commit(); db.close()
        store = Store(path)
        store = Store(path)
        with store.connect() as db:
            rows = db.execute('SELECT kind, slot, status FROM reminders WHERE day = ? ORDER BY slot', ('2026-11-02',)).fetchall()
        self.assertEqual(rows, [('routine', 21, 'sent'), ('reflection', 23, 'failed')])
        self.assertEqual(store.state('2026-11-02')['reminders'], {'routine': 'sent', 'reflection': 'failed'})

    def test_routine_nudges_every_two_hours_until_a_device_reports_minimum(self):
        self.store.add_subscription(self.token, parse_subscription(subscription()), self.now)
        self.pusher.return_value = [{'endpoint': subscription()['endpoint'], 'status': 201}]
        day = datetime(2026, 9, 18, 9, 0, tzinfo=KST)  # 금요일
        self.assertEqual(self.run_reminder(day.replace(hour=7)), 'outside_schedule')
        self.assertEqual(self.run_reminder(day.replace(hour=8)), 'outside_schedule')
        for hour in (9, 11, 13):
            self.assertEqual(self.run_reminder(day.replace(hour=hour)), 'sent')
            self.assertEqual(self.run_reminder(day.replace(hour=hour, minute=5)), 'already_attempted')
        self.assertEqual(self.pusher.call_count, 3)
        payload = self.pusher.call_args[0][1]
        self.assertEqual(payload['tag'], 'h2-routine-routine')
        self.assertTrue(payload['body'].startswith('오후 1시.'))
        self.assertIn('가슴을 당당히 펴고 있는가?', payload['body'])
        self.assertIn('금요일이라 투자 원칙 검토도 오늘까지', payload['body'])
        self.assertNotIn('밤 9시', payload['body'])
        self.assertNotIn('·', payload['body'])
        self.sender.assert_not_called()
        # 사이에 최소 포지션 이상 보고가 오면 다음 슬롯부터 멈추고, 미달로 돌아가면 다시 보낸다.
        self.store.answer(self.token, '2026-09-18', False, day.replace(hour=14), routine=True)
        self.assertEqual(self.run_reminder(day.replace(hour=15)), 'routine_done')
        self.store.answer(self.token, '2026-09-18', False, day.replace(hour=16), routine=False)
        self.assertEqual(self.run_reminder(day.replace(hour=17)), 'sent')
        self.assertEqual(self.run_reminder(day.replace(hour=19)), 'sent')
        self.assertTrue(self.pusher.call_args[0][1]['body'].startswith('저녁 7시.'))
        self.assertEqual(self.run_reminder(day.replace(hour=21)), 'sent')
        self.assertTrue(self.pusher.call_args[0][1]['body'].startswith('밤 9시.'))
        self.assertEqual(self.run_reminder(day.replace(hour=22)), 'outside_schedule')
        result = remind(self.store, now=day.replace(hour=23), sender=self.sender, pusher=self.pusher)
        self.assertEqual((result['kind'], result['slot'], result['channel']), ('reflection', 23, 'push'))
        self.assertEqual(self.store.state('2026-09-18')['reminders'], {'routine': 'sent', 'reflection': 'sent'})
        self.assertEqual(self.pusher.call_count, 7)
        self.sender.assert_not_called()

    def test_daytime_slots_never_fall_back_to_the_bot(self):
        noon = self.now.replace(hour=13)
        self.assertEqual(self.run_reminder(noon), 'skipped')  # 구독 없음: 낮에는 봇으로 넘기지 않는다
        self.assertEqual(self.run_reminder(noon.replace(minute=30)), 'skipped')  # skipped 는 재시도되지만 여전히 봇은 아니다
        self.sender.assert_not_called()
        self.store.add_subscription(self.token, parse_subscription(subscription()), self.now)
        self.pusher.return_value = [{'endpoint': subscription()['endpoint'], 'status': 500}]
        self.assertEqual(self.run_reminder(noon.replace(hour=15)), 'failed')
        self.sender.assert_not_called()
        self.assertEqual(self.store.state('2026-09-17')['subscriptions'], 1)
        # 21시와 23시는 지금처럼 봇으로 넘어간다.
        self.assertEqual(self.run_reminder(self.evening), 'sent')
        self.assertEqual(self.run_reminder(self.now), 'sent')
        self.assertEqual(self.sender.call_count, 2)
        self.assertIn('밤 9시', self.sender.call_args_list[0][0][0])

    def test_subscription_validation(self):
        self.assertEqual(parse_subscription(subscription())['auth'], AUTH)
        self.assertEqual(parse_subscription({'endpoint': 'https://x/y', 'keys': {'p256dh': P256DH + '=', 'auth': AUTH + '=='}})['auth'], AUTH)
        for bad in ({'endpoint': 'http://x', 'keys': {'p256dh': P256DH, 'auth': AUTH}},
                    {'endpoint': 'https://x', 'keys': {'p256dh': P256DH[:-1], 'auth': AUTH}},
                    {'endpoint': 'https://x', 'keys': {'p256dh': P256DH, 'auth': 'short'}},
                    {'endpoint': 'https://x', 'keys': {'p256dh': 'A' + P256DH[1:], 'auth': AUTH}},
                    {'endpoint': 'https://x'}, 'text', None):
            with self.assertRaises(ValueError):
                parse_subscription(bad)
        with self.assertRaises(PermissionError):
            self.store.add_subscription('not-a-device', parse_subscription(subscription()))

    @unittest.skipUnless(any(os.access(p, os.X_OK) for p in NODE_CANDIDATES), 'node runtime not installed')
    def test_vapid_keys_are_generated_once_with_private_permissions(self):
        path = Path(self.temp.name) / 'vapid.json'
        first = ensure_vapid(path)
        self.assertEqual(oct(path.stat().st_mode & 0o777), '0o600')
        self.assertEqual(len(first['publicKey']), 87)
        self.assertTrue(first['publicKey'].startswith('B'))
        self.assertEqual(first['subject'], 'https://woogeun1221-svg.github.io/h2-routine/')
        self.assertEqual(ensure_vapid(path), first)


class APITests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name) / 'api.sqlite3')
        self.vapid = Path(self.temp.name) / 'vapid.json'
        self.vapid.write_text(json.dumps(FAKE_VAPID))
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), handler_for(self.store, self.vapid))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = 'http://127.0.0.1:' + str(self.server.server_port) + '/routine-api'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def call(self, method, path, body=None, token=None, origin=ORIGIN):
        headers = {'Content-Type': 'application/json', 'Origin': origin}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        data = json.dumps(body).encode() if body is not None else None
        request = Request(self.base + path, data=data, headers=headers, method=method)
        try:
            response = urlopen(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.loads(response.read()), response.headers

    def post(self, path, body, token=None, origin=ORIGIN):
        return self.call('POST', path, body, token, origin)

    def test_pair_authenticate_cors_and_private_payload(self):
        code = self.store.issue_pairing()
        status, body, headers = self.post('/pair', {'code': code})
        self.assertEqual(status, 200)
        self.assertEqual(headers['Access-Control-Allow-Origin'], ORIGIN)
        token = body['token']
        answer = {'day': now_kst().date().isoformat(), 'answered': True}
        self.assertEqual(self.post('/answer', answer)[0], 401)
        self.assertEqual(self.post('/answer', answer, token, 'https://example.com')[0], 403)
        self.assertEqual(self.post('/answer', {**answer, 'reason': 'private'}, token)[0], 400)
        self.assertEqual(self.post('/answer', answer, token)[0], 200)
        self.assertTrue(self.store.state(answer['day'])['answered'])
        self.assertEqual(self.post('/pair', {'code': code})[0], 401)

    def test_reject_future_old_or_non_boolean_answers(self):
        token = self.store.pair(self.store.issue_pairing())
        today = now_kst().date()
        for day in (today + timedelta(days=1), today - timedelta(days=8)):
            self.assertEqual(self.post('/answer', {'day': day.isoformat(), 'answered': True}, token)[0], 422)
        self.assertEqual(self.post('/answer', {'day': today.isoformat(), 'answered': 'true'}, token)[0], 400)
        self.assertEqual(self.post('/answer', {'day': today.isoformat(), 'answered': True, 'routine': 'yes'}, token)[0], 400)

    def test_answer_reports_routine_minimum(self):
        token = self.store.pair(self.store.issue_pairing())
        today = now_kst().date().isoformat()
        self.assertEqual(self.post('/answer', {'day': today, 'answered': False, 'routine': True}, token)[0], 200)
        self.assertEqual(self.store.state(today)['routine_done'], True)
        self.assertEqual(self.post('/answer', {'day': today, 'answered': False, 'routine': False}, token)[0], 200)
        self.assertEqual(self.store.state(today)['routine_done'], False)

    def test_public_key_and_subscription_lifecycle(self):
        status, body, headers = self.call('GET', '/push/key')
        self.assertEqual((status, body['key']), (200, FAKE_VAPID['publicKey']))
        self.assertEqual(headers['Access-Control-Allow-Origin'], ORIGIN)
        self.assertEqual(self.call('GET', '/push/key', origin='https://example.com')[2].get('Access-Control-Allow-Origin'), None)
        # 연결과 동시에 구독 등록. 구독이 잘못되면 연결 코드를 소비하지 않는다.
        code = self.store.issue_pairing()
        self.assertEqual(self.post('/pair', {'code': code, 'subscription': {'endpoint': 'https://x', 'keys': {}}})[0], 400)
        status, body, _ = self.post('/pair', {'code': code, 'subscription': subscription()})
        self.assertEqual(status, 200)
        token = body['token']
        self.assertEqual([s['endpoint'] for s in self.store.subscriptions()], ['https://web.push.apple.com/abc'])
        # 연결된 기기의 구독 추가, 해제. 인증 없이는 거부.
        second = subscription('https://web.push.apple.com/second')
        self.assertEqual(self.post('/push/subscribe', {'subscription': second})[0], 401)
        self.assertEqual(self.post('/push/subscribe', {'subscription': second, 'extra': 1}, token)[0], 400)
        self.assertEqual(self.post('/push/subscribe', {'subscription': second}, token)[0], 200)
        self.assertEqual(self.post('/push/subscribe', {'subscription': second}, token)[0], 200)  # 같은 구독은 한 번만
        self.assertEqual(len(self.store.subscriptions()), 2)
        other = self.store.pair(self.store.issue_pairing())
        self.assertEqual(self.post('/push/unsubscribe', {'endpoint': 'https://web.push.apple.com/second'}, other)[0], 200)
        self.assertEqual(len(self.store.subscriptions()), 2)  # 다른 기기의 구독은 못 지운다
        self.assertEqual(self.post('/push/unsubscribe', {'endpoint': 'https://web.push.apple.com/second'}, token)[0], 200)
        self.assertEqual([s['endpoint'] for s in self.store.subscriptions()], ['https://web.push.apple.com/abc'])

    def test_missing_vapid_file_degrades_without_breaking_answers(self):
        self.vapid.unlink()
        broken = ThreadingHTTPServer(('127.0.0.1', 0), handler_for(self.store, Path(self.temp.name) / 'missing' / 'x' / 'vapid.json'))
        thread = threading.Thread(target=broken.serve_forever, daemon=True)
        thread.start()
        try:
            request = Request('http://127.0.0.1:%d/routine-api/push/key' % broken.server_port, headers={'Origin': ORIGIN})
            try:
                response = urlopen(request, timeout=5)
            except HTTPError as error:
                response = error
            with response:
                self.assertIn(response.status, (200, 503))  # node 가 있으면 새 키를 만들고, 없으면 503
        finally:
            broken.shutdown(); broken.server_close(); thread.join()


if __name__ == '__main__':
    unittest.main()
