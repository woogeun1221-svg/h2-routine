from datetime import datetime, timedelta, timezone
from http.server import ThreadingHTTPServer
import json
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import Mock
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from reminder_service import KST, ORIGIN, Store, handler_for, now_kst, remind


class ReminderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Store(Path(self.temp.name) / 'test.sqlite3')
        self.now = datetime(2026, 9, 17, 23, 0, tzinfo=KST)
        self.token = self.store.pair(self.store.issue_pairing(self.now), self.now)
        self.sender = Mock(return_value=True)

    def run_reminder(self, now=None, **kwargs):
        return remind(self.store, now=now or self.now, sender=self.sender, **kwargs)['action']

    def test_only_unanswered_at_23_kst_once_per_day(self):
        self.assertEqual(self.run_reminder(self.now - timedelta(minutes=1)), 'outside_23h')
        # UTC 입력도 한국 시간 23시로 판정한다.
        self.assertEqual(self.run_reminder(self.now.astimezone(timezone.utc), dry_run=True), 'would_send')
        self.sender.assert_not_called()
        self.assertEqual(self.run_reminder(), 'sent')
        self.assertEqual(self.run_reminder(self.now + timedelta(minutes=5)), 'already_attempted')
        self.assertEqual(self.run_reminder(self.now + timedelta(hours=1)), 'outside_23h')
        self.sender.assert_called_once()
        self.assertIn('가슴에 손을 얹고', self.sender.call_args[0][0])
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


class APITests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name) / 'api.sqlite3')
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), handler_for(self.store))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = 'http://127.0.0.1:' + str(self.server.server_port) + '/routine-api'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def post(self, path, body, token=None, origin=ORIGIN):
        headers = {'Content-Type': 'application/json', 'Origin': origin}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        request = Request(self.base + path, data=json.dumps(body).encode(), headers=headers, method='POST')
        try:
            response = urlopen(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.loads(response.read()), response.headers

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


if __name__ == '__main__':
    unittest.main()
