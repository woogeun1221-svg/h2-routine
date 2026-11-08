"""메인컨트롤 봇 동기화(2026-11-08): /state 검증과 저장, 계획 충돌 규칙, 봇 명령 문구, 일요일 시간표, 알림 한 줄."""
from datetime import date, datetime, timedelta
from http.server import ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
from unittest.mock import Mock
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import routine_bot
from reminder_service import KST, ORIGIN, Store, handler_for, now_kst, parse_state, remind, send_weekly

SCRIPT = Path(__file__).resolve().parent / 'reminder_service.py'
SUN = datetime(2026, 11, 8, 21, 0, tzinfo=KST)      # 일요일, W45
MON = datetime(2026, 11, 9, 15, 0, tzinfo=KST)      # 월요일, W46
FULL_GAPS = ['운동 슬롯', '푸쉬업 40', '턱걸이 12', '독서 10분']


def summary(status='min', planned='noon', actual=None, slot=True, full=None, minimum=None, wife=False):
    return {'status': status, 'planned': planned, 'actual': actual, 'slotRequired': slot,
            'full': FULL_GAPS if full is None else full, 'min': minimum or [], 'wifeX': wife}


def plan(slots='am am am am am', u=0):
    out = {str(i + 1): s for i, s in enumerate(slots.split())}
    out['u'] = u
    return out


class StateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Store(Path(self.temp.name) / 'bot.sqlite3')
        self.token = self.store.pair(self.store.issue_pairing(SUN), SUN)

    def save(self, payload, today=date(2026, 11, 9), now=MON):
        self.store.save_state(self.token, parse_state(payload, today), now)

    def test_parse_state_accepts_app_payload_and_rejects_private_or_malformed_fields(self):
        good = {'today': '2026-11-09', 'days': {'2026-11-09': summary(), '2026-11-08': summary('full', None, None, False, [])},
                'plans': {'2026-11-09': plan('noon am am run am', 5), '2026-11-16': plan()}, 'slotStart': '2026-11-09'}
        data = parse_state(good, date(2026, 11, 9))
        self.assertEqual(data['plans']['2026-11-09'], {'slots': {'1': 'noon', '2': 'am', '3': 'am', '4': 'run', '5': 'am'}, 'u': 5})
        self.assertEqual(data['days']['2026-11-09']['full'], FULL_GAPS)
        self.assertEqual(data['slotStart'], '2026-11-09')
        bad = [
            {**good, 'memo': '송은 생일'},                                             # 모르는 최상위 키(메모 같은 것)
            {**good, 'today': '2026-11-20'},                                          # 서버 날짜와 어긋남
            {**good, 'days': {'2026-11-09': {**summary(), 'reason': '사유'}}},         # 요약에 사유 같은 키
            {**good, 'days': {'2026-11-09': summary(status='great')}},
            {**good, 'days': {'2026-11-09': summary(actual='night')}},
            {**good, 'days': {'2026-11-09': summary(full=['x' * 41])}},
            {**good, 'days': {'2026-10-01': summary()}},                              # 7일보다 오래된 날
            {**good, 'plans': {'2026-11-10': plan()}},                                # 월요일이 아님
            {**good, 'plans': {'2026-11-09': {**plan(), 'm1': '메모'}}},              # 메모는 받지 않는다
            {**good, 'plans': {'2026-11-09': plan(u=-1)}},
            {**good, 'plans': {'2026-11-09': {**plan(), 'u': '5'}}},
            {**good, 'plans': {'2026-11-09': plan('am am am am sleep')}},
            {**good, 'plans': {f'2026-{m:02d}-{d:02d}': plan() for m, d in [(10, 5), (10, 12), (10, 19), (10, 26), (11, 2), (11, 9), (11, 16), (11, 23), (11, 30)]}},
            {**good, 'slotStart': '11/09'},
        ]
        for payload in bad:
            with self.assertRaises((ValueError, TypeError, KeyError)):
                parse_state(payload, date(2026, 11, 9))

    def test_plan_last_write_wins_and_bot_edit_survives_stale_app_sync(self):
        self.save({'today': '2026-11-09', 'plans': {'2026-11-16': plan('am am am am am', 0)}})
        # 물려받은 계획(u=0)은 앞 주가 바뀌면 내용이 달라진다 — 같은 u 면 앱이 보낸 것으로 바꾼다
        self.save({'today': '2026-11-09', 'plans': {'2026-11-16': plan('run run run run run', 0)}})
        self.assertEqual(self.store.effective_plan('2026-11-16')[0]['1'], 'run')
        slots, u = self.store.set_plan_slots('2026-11-16', {2: 'noon'}, MON)
        self.assertEqual(slots, {'1': 'run', '2': 'noon', '3': 'run', '4': 'run', '5': 'run'})
        self.assertEqual(u, int(MON.timestamp() * 1000))
        # 봇에서 바꾼 뒤 늦게 도착한 앱의 옛 계획(u 가 더 작다)은 무시하고, 응답으로 봇 계획을 돌려준다
        self.save({'today': '2026-11-09', 'plans': {'2026-11-16': plan('run run run run run', 0)}})
        self.assertEqual(self.store.recent_plans(date(2026, 11, 9))['2026-11-16'], {**plan('run noon run run run'), 'u': u})
        # 앱에서 그 뒤에 바꾸면(u 가 더 크다) 앱이 이긴다
        self.save({'today': '2026-11-09', 'plans': {'2026-11-16': plan('am am am am am', u + 10)}})
        self.assertEqual(self.store.effective_plan('2026-11-16'), ({str(i): 'am' for i in range(1, 6)}, True))

    def test_effective_plan_inherits_like_the_app(self):
        self.assertEqual(self.store.effective_plan('2026-11-09'), ({str(i): 'am' for i in range(1, 6)}, False))
        self.save({'today': '2026-11-09', 'plans': {'2026-11-02': plan('noon noon run run am', 3)}})
        self.assertEqual(self.store.effective_plan('2026-11-16'),
                         ({'1': 'noon', '2': 'noon', '3': 'run', '4': 'run', '5': 'am'}, False))
        # 봇이 물려받던 주를 바꾸면 그 주 계획이 생긴다(물려받은 슬롯을 복사한 뒤 바꾼다)
        self.store.set_plan_slots('2026-11-16', {5: 'run'}, MON)
        self.assertEqual(self.store.effective_plan('2026-11-16'),
                         ({'1': 'noon', '2': 'noon', '3': 'run', '4': 'run', '5': 'run'}, True))

    def test_unknown_device_cannot_save(self):
        with self.assertRaises(PermissionError):
            self.store.save_state('not-a-token', parse_state({'today': '2026-11-09'}, date(2026, 11, 9)), MON)


class BotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Store(Path(self.temp.name) / 'bot.sqlite3')
        self.token = self.store.pair(self.store.issue_pairing(SUN), SUN)

    def sync(self, payload, today, now):
        self.store.save_state(self.token, parse_state(payload, today), now)

    def reply(self, text, now):
        out = routine_bot.bot_reply(self.store, text, now)
        self.assertNotIn('·', out)
        return out

    def test_week_without_any_plan_says_all_morning(self):
        text = self.reply('/시간표', MON)
        self.assertIn('계획이 아직 없어 전부 아침으로 둔다. 앱을 열면 앱 시간표가 들어온다.', text)
        self.assertNotIn('물려받았다', text)

    def test_week_on_sunday_defaults_to_next_week(self):
        self.sync({'today': '2026-11-08', 'slotStart': '2026-11-08',
                   'plans': {'2026-11-09': plan('am noon am run noon', 7)}}, date(2026, 11, 8), SUN)
        text = self.reply('/시간표', SUN)
        self.assertTrue(text.startswith('다음 주 시간표, W46 11.9–11.15\n'), text)
        self.assertIn('월 11.9  아침\n화 11.10  점심\n', text)
        self.assertIn('토, 일  송은 시간\n아침 2, 점심 2, 저녁런닝 1', text)
        self.assertIn('바꾸기: /슬롯 화 점심', text)
        self.assertTrue(self.reply('/시간표 이번', SUN).startswith('이번 주 시간표, W45 11.2–11.8'))
        self.assertTrue(self.reply('/plan@WOOGEUN_BOT', SUN).startswith('다음 주 시간표'))

    def test_slot_command_writes_plan_for_default_week_and_reports_it(self):
        text = self.reply('/슬롯 화 점심', SUN)
        self.assertTrue(text.startswith('다음 주 화 점심(으)로 바꿨다. 앱을 열면 반영된다.'), text)
        self.assertIn('화 11.10  점심', text)
        plans = self.store.recent_plans(date(2026, 11, 8))
        self.assertEqual(plans['2026-11-09']['2'], 'noon')
        self.assertEqual(plans['2026-11-09']['u'], int(SUN.timestamp() * 1000))
        # 여러 요일, 붙여 쓴 형태, 요일 접미사, 다음 주 지정(평일)
        self.reply('/슬롯 다음 월요일 저녁 수점심 금 런닝', MON)
        self.assertEqual(self.store.effective_plan('2026-11-16')[0], {'1': 'run', '2': 'noon', '3': 'noon', '4': 'am', '5': 'run'})
        self.reply('/slot 이번 목 아침', MON)
        self.assertEqual(self.store.effective_plan('2026-11-09')[0]['4'], 'am')

    def test_slot_command_errors_keep_plans_untouched(self):
        for text, expected in [('/슬롯 토 점심', '주말은 시간표가 없다'), ('/슬롯 화', '화요일 뒤에 슬롯'),
                               ('/슬롯 점심', '슬롯 앞에 요일'), ('/슬롯 화 새벽', '"새벽"를 모르겠다'), ('/슬롯', '바꿀 요일과 슬롯')]:
            out = self.reply(text, MON)
            self.assertIn(expected, out)
            self.assertIn('/슬롯 화 점심', out)  # 사용법
        self.assertEqual(self.store.recent_plans(date(2026, 11, 9)), {})

    def test_today_with_and_without_app_summary(self):
        self.sync({'today': '2026-11-09', 'slotStart': '2026-11-09',
                   'days': {'2026-11-09': summary(), '2026-11-08': summary('full', None, None, False, [])},
                   'plans': {'2026-11-09': plan('noon am am am am', 9)}}, date(2026, 11, 9), MON)
        text = self.reply('/오늘', MON)
        self.assertEqual(text.splitlines()[0], '11.9 월요일, W46')
        self.assertIn('포지션: 최소 (앱 기준 15:00)', text)
        self.assertIn('운동 슬롯: 점심 슬롯 지남. 백업: 퇴근 런닝.', text)
        self.assertIn('정상까지: 운동 슬롯, 푸쉬업 40, 턱걸이 12, 독서 10분', text)
        self.assertIn('어제 11.8: 정상', text)
        before = self.reply('/오늘', MON.replace(hour=11))
        self.assertIn('운동 슬롯: 계획 점심, 14시까지.', before)
        # 앱이 오늘 아직 안 열렸으면 그렇게 말하고, 계획 슬롯은 서버 시간표로 보여 준다
        tue = MON + timedelta(days=1)
        text = self.reply('/루틴', tue.replace(hour=8))
        self.assertIn('오늘 앱 기록이 아직 안 들어왔다', text)
        self.assertIn('운동 슬롯: 계획 아침, 10시까지.', text)
        self.assertIn('어제 11.9: 최소', text)

    def test_today_on_weekend_and_miss_lines(self):
        sat = datetime(2026, 11, 14, 12, 0, tzinfo=KST)
        self.sync({'today': '2026-11-14', 'slotStart': '2026-11-09',
                   'days': {'2026-11-14': summary('miss', None, 'noon', False, ['푸쉬업 70'], ['푸쉬업 30'])}},
                  date(2026, 11, 14), sat)
        text = self.reply('/오늘', sat)
        self.assertIn('운동 슬롯: 점심 기록됨. 주말은 송은 시간이라 상태에 영향 없음.', text)
        self.assertIn('최소까지: 푸쉬업 30\n정상까지: 푸쉬업 70', text)

    def test_unknown_routine_text_returns_usage(self):
        self.assertIn('/오늘', self.reply('/루틴들', MON))

    def test_reminder_hint_only_while_planned_slot_is_open(self):
        self.assertEqual(routine_bot.reminder_hint(self.store, MON.replace(hour=11)), '')  # 슬롯 조건 시작일 모름
        self.sync({'today': '2026-11-09', 'slotStart': '2026-11-09', 'plans': {'2026-11-09': plan('noon am am am am', 1)}},
                  date(2026, 11, 9), MON)
        self.assertEqual(routine_bot.reminder_hint(self.store, MON.replace(hour=11)), ' 운동 슬롯은 점심, 14시까지.')
        self.assertEqual(routine_bot.reminder_hint(self.store, MON.replace(hour=15)), '')
        self.assertEqual(routine_bot.reminder_hint(self.store, SUN.replace(hour=11)), '')  # 주말
        self.sync({'today': '2026-11-09', 'days': {'2026-11-09': summary(actual='noon')}}, date(2026, 11, 9), MON)
        self.assertEqual(routine_bot.reminder_hint(self.store, MON.replace(hour=11)), '')  # 이미 함

    def test_routine_push_carries_the_slot_hint(self):
        self.sync({'today': '2026-11-09', 'slotStart': '2026-11-09', 'plans': {'2026-11-09': plan('noon am am am am', 1)}},
                  date(2026, 11, 9), MON)
        self.store.add_subscription(self.token, {'endpoint': 'https://web.push.apple.com/x', 'p256dh': 'B' + 'A' * 86, 'auth': 'A' * 22})
        pusher = Mock(return_value=[{'endpoint': 'https://web.push.apple.com/x', 'status': 201}])
        result = remind(self.store, now=MON.replace(hour=11), sender=Mock(), pusher=pusher)
        self.assertEqual(result['action'], 'sent')
        body = pusher.call_args[0][1]['body']
        self.assertTrue(body.endswith('지금 한 포지션이라도 쌓자. 운동 슬롯은 점심, 14시까지.'), body)

    def test_weekly_message_needs_recent_app_sync_and_sends_once(self):
        sender = Mock(return_value=True)
        self.assertEqual(send_weekly(self.store, now=SUN.replace(hour=20), sender=sender)['action'], 'app_idle')
        self.sync({'today': '2026-11-08', 'days': {'2026-11-08': summary('full', None, None, False, [])},
                   'plans': {'2026-11-09': plan('am noon am run noon', 4)}}, date(2026, 11, 8), SUN)
        dry = send_weekly(self.store, now=SUN.replace(hour=20), sender=sender, dry_run=True)
        self.assertEqual(dry['action'], 'would_send')
        sender.assert_not_called()
        self.assertEqual(send_weekly(self.store, now=SUN.replace(hour=20), sender=sender)['action'], 'sent')
        text = sender.call_args[0][0]
        self.assertTrue(text.startswith('다음 주 시간표, W46 11.9–11.15\n월 11.9  아침\n화 11.10  점심'), text)
        self.assertIn('/슬롯 화 점심', text)
        self.assertNotIn('·', text)
        self.assertEqual(send_weekly(self.store, now=SUN.replace(hour=20, minute=5), sender=sender)['action'], 'already_attempted')
        sender.assert_called_once()
        # 2주 넘게 앱 요약이 없으면 보내지 않는다
        later = SUN + timedelta(days=21)
        self.assertEqual(send_weekly(self.store, now=later, sender=sender)['action'], 'app_idle')

    def test_weekly_failure_can_retry(self):
        self.sync({'today': '2026-11-08', 'days': {'2026-11-08': summary('full', None, None, False, [])}}, date(2026, 11, 8), SUN)
        self.assertEqual(send_weekly(self.store, now=SUN, sender=Mock(return_value=False))['action'], 'failed')
        self.assertEqual(send_weekly(self.store, now=SUN, sender=Mock(return_value=True))['action'], 'sent')

    def test_bot_subcommand_works_without_locale(self):
        """웹훅은 최소 환경(LANG 없음)으로 부른다 — 한글 입력과 출력이 깨지지 않아야 한다."""
        db = Path(self.temp.name) / 'bot.sqlite3'
        env = {'PATH': '/usr/bin:/bin', 'HOME': self.temp.name, 'TZ': 'Asia/Seoul', 'PYTHONDONTWRITEBYTECODE': '1'}
        result = subprocess.run(['/usr/bin/python3', str(SCRIPT), '--db', str(db), 'bot'],
                                input='/시간표 다음'.encode('utf-8'), capture_output=True, env=env, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr.decode('utf-8', 'replace'))
        reply = json.loads(result.stdout.decode('ascii'))['reply']
        self.assertTrue(reply.startswith('다음 주 시간표, W'), reply)


class StateAPITests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name) / 'api.sqlite3')
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), handler_for(self.store, Path(self.temp.name) / 'vapid.json'))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = 'http://127.0.0.1:' + str(self.server.server_port) + '/routine-api'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def post(self, body, token=None, origin=ORIGIN):
        headers = {'Content-Type': 'application/json', 'Origin': origin}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        request = Request(self.base + '/state', data=json.dumps(body).encode(), headers=headers, method='POST')
        try:
            response = urlopen(request, timeout=5)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.loads(response.read())

    def test_state_round_trip_returns_bot_plans(self):
        token = self.store.pair(self.store.issue_pairing())
        today = now_kst().date()
        monday = routine_bot.monday_of(today)
        body = {'today': today.isoformat(), 'days': {today.isoformat(): summary()},
                'plans': {monday.isoformat(): plan('am am noon am am', 3)}, 'slotStart': today.isoformat()}
        self.assertEqual(self.post(body)[0], 401)
        self.assertEqual(self.post(body, token, 'https://example.com')[0], 403)
        self.assertEqual(self.post({**body, 'memo': 'x'}, token)[0], 400)
        status, reply = self.post(body, token)
        self.assertEqual(status, 200)
        self.assertEqual(reply['plans'][monday.isoformat()], plan('am am noon am am', 3))
        self.store.set_plan_slots(monday.isoformat(), {1: 'run'})
        status, reply = self.post(body, token)
        self.assertEqual(reply['plans'][monday.isoformat()]['1'], 'run')        # 봇 계획이 이긴다(앱 u=3 이 더 작다)
        self.assertGreater(reply['plans'][monday.isoformat()]['u'], 3)
        self.assertEqual(self.store.summary(today.isoformat())[0]['status'], 'min')
        self.assertEqual(self.store.meta('slotStart'), today.isoformat())


if __name__ == '__main__':
    unittest.main()
