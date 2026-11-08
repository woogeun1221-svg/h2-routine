"""메인컨트롤 봇과 루틴 앱 시간표를 주고받는 문구와 명령(2026-11-08). 표준 라이브러리만 쓴다(/usr/bin/python3 3.9).

앱이 POST /state 로 보낸 요약(오늘과 어제 포지션, 남은 항목, 실제 슬롯)과 주간 계획 슬롯을 Store 에서 읽어
/오늘, /시간표, /슬롯 명령의 답과 일요일 저녁 다음 주 시간표 메시지를 만든다. /슬롯 은 그 주 계획을 서버에 쓰고
(u=지금), 앱은 다음 동기화(앱을 열 때, 화면이 켜진 동안 1분마다) 때 받아 간다.
서버에는 메모(송은 일정), 하루 만족도 O/X와 사유, 수치 원본이 없다. 그래서 봇 문구에도 없다.
이 모듈은 reminder_service 를 import 하지 않는다(서로 순환하지 않게 store 를 인자로 받는다).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
import re
from zoneinfo import ZoneInfo

KST = ZoneInfo('Asia/Seoul')
SLOTS = {'am': '아침', 'noon': '점심', 'run': '저녁런닝'}
SLOT_ORDER = ('am', 'noon', 'run')
SLOT_CUTOFF = {'am': 10, 'noon': 14, 'run': 21}
WD = ('월', '화', '수', '목', '금', '토', '일')
POSITION = {'full': '정상', 'min': '최소', 'miss': '미달'}
SLOT_WORDS = {'아침': 'am', '점심': 'noon', '저녁': 'run', '런닝': 'run', '저녁런닝': 'run', '퇴근런닝': 'run',
              'am': 'am', 'noon': 'noon', 'run': 'run'}
TODAY_COMMANDS = ('/오늘', '/루틴', '/routine')
WEEK_COMMANDS = ('/시간표', '/plan')
SLOT_COMMANDS = ('/슬롯', '/slot')
COMMANDS = TODAY_COMMANDS + WEEK_COMMANDS + SLOT_COMMANDS
USAGE = ('루틴 명령\n'
         '/오늘 — 오늘 포지션, 운동 슬롯, 남은 항목\n'
         '/시간표 — 이번 주 운동 시간표(주말엔 다음 주), /시간표 다음 — 다음 주\n'
         '/슬롯 화 점심 — 계획 바꾸기(여러 개는 /슬롯 월 아침 수 저녁), 다음 주는 /슬롯 다음 화 점심\n'
         '슬롯: 아침(10시까지), 점심(14시까지), 저녁(런닝, 21시까지). 바꾼 계획은 앱을 열면 들어간다.')


def monday_of(day: date) -> date:
    return day - timedelta(days=day.weekday())


def md(day: date) -> str:
    return f'{day.month}.{day.day}'


def week_label(monday: date) -> str:
    return f'W{monday.isocalendar()[1]} {md(monday)}–{md(monday + timedelta(days=6))}'


def default_offset(today: date) -> int:
    """앱과 같다: 토일엔 다음 주, 평일엔 이번 주"""
    return 1 if today.weekday() >= 5 else 0


def slot_active(store, day: date) -> bool:
    start = store.meta('slotStart')
    return bool(start) and day.isoformat() >= start and day.weekday() < 5


def slot_line(planned, actual, hour, live):
    """그날 운동 슬롯 한 줄. live=오늘(시각으로 컷오프를 본다)."""
    if planned is None:
        return (SLOTS[actual] + ' 기록됨. 주말은 송은 시간이라 상태에 영향 없음.') if actual else '주말, 송은 시간. 슬롯 조건 없음.'
    if actual:
        return f'{SLOTS[planned]} 완료.' if actual == planned else f'계획 {SLOTS[planned]} → 실제 {SLOTS[actual]}, 완료.'
    if not live:
        return f'계획 {SLOTS[planned]}, 비었음.'
    if hour < SLOT_CUTOFF[planned]:
        return f'계획 {SLOTS[planned]}, {SLOT_CUTOFF[planned]}시까지.'
    backups = [s for s in SLOT_ORDER[SLOT_ORDER.index(planned) + 1:] if hour < SLOT_CUTOFF[s]]
    if not backups:
        return '오늘 슬롯 비었음. 최소 포지션으로 마감.'
    names = ['퇴근 런닝' if s == 'run' else SLOTS[s] for s in backups]
    return f'{SLOTS[planned]} 슬롯 지남. ' + ('백업 순서: ' if len(names) > 1 else '백업: ') + ' → '.join(names) + '.'


def _hm(iso: str | None) -> str:
    if not iso:
        return ''
    try:
        return datetime.fromisoformat(iso).astimezone(KST).strftime('%H:%M')
    except ValueError:
        return ''


def today_text(store, now: datetime) -> str:
    today = now.date()
    weekend = today.weekday() >= 5
    lines = [f'{md(today)} {WD[today.weekday()]}요일, W{today.isocalendar()[1]}']
    summary, updated = store.summary(today.isoformat())
    if summary:
        lines.append(f'포지션: {POSITION[summary["status"]]} (앱 기준 {_hm(updated)})')
    else:
        lines.append('포지션: 오늘 앱 기록이 아직 안 들어왔다. 앱을 열면 동기화된다.')
    actual = summary.get('actual') if summary else None
    if weekend:
        lines.append('운동 슬롯: ' + slot_line(None, actual, now.hour, True))
    elif slot_active(store, today):
        slots, _own = store.effective_plan(monday_of(today).isoformat())
        lines.append('운동 슬롯: ' + slot_line(slots[str(today.weekday() + 1)], actual, now.hour, True))
    if summary:
        if summary['status'] == 'full':
            lines.append('오늘 정상 마감.')
        elif summary.get('wifeX'):
            lines.append('송은 X는 그 자체로 그날 미달.')
        else:
            if summary['status'] == 'miss' and summary.get('min'):
                lines.append('최소까지: ' + ', '.join(summary['min']))
            if summary.get('full'):
                lines.append('정상까지: ' + ', '.join(summary['full']))
    yesterday = today - timedelta(days=1)
    ysum, _ = store.summary(yesterday.isoformat())
    if ysum:
        lines.append(f'어제 {md(yesterday)}: {POSITION[ysum["status"]]}')
    return '\n'.join(lines)


def week_lines(store, monday: date, today: date) -> list:
    slots, own = store.effective_plan(monday.isoformat())
    count = {'am': 0, 'noon': 0, 'run': 0}
    lines = []
    for i in range(5):
        day = monday + timedelta(days=i)
        planned = slots[str(i + 1)]
        count[planned] += 1
        note = ''
        summary, _ = store.summary(day.isoformat())
        actual = summary.get('actual') if summary else None
        if day == today:
            note = ', 오늘' + (', 완료' if actual == planned else (f', 실제 {SLOTS[actual]}' if actual else ''))
        elif day < today and summary:
            if actual == planned:
                note = ', 완료'
            elif actual:
                note = f', 실제 {SLOTS[actual]}'
            elif summary.get('slotRequired'):
                note = ', 비었음'
        lines.append(f'{WD[i]} {md(day)}  {SLOTS[planned]}{note}')
    lines.append('토, 일  송은 시간')
    lines.append(f'아침 {count["am"]}, 점심 {count["noon"]}, 저녁런닝 {count["run"]}')
    if not own:
        lines.append('이 주 계획이 아직 없어 직전 계획을 물려받았다.' if store.has_plan_before(monday.isoformat())
                     else '계획이 아직 없어 전부 아침으로 둔다. 앱을 열면 앱 시간표가 들어온다.')
    return lines


def week_text(store, today: date, offset: int) -> str:
    monday = monday_of(today) + timedelta(days=7 * offset)
    head = f'{"다음 주" if offset else "이번 주"} 시간표, {week_label(monday)}'
    tail = '바꾸기: /슬롯 ' + ('다음 ' if offset and default_offset(today) == 0 else '') + '화 점심'
    return '\n'.join([head] + week_lines(store, monday, today) + [tail])


def parse_slot_args(args, today: date):
    """'/슬롯' 뒤 인자 → (offset, {요일번호: 슬롯}). 형식이 틀리면 ValueError(사용자에게 보여 줄 문구)."""
    offset = default_offset(today)
    changes = {}
    pending = None
    tokens = [t for t in re.split(r'[\s,]+', ' '.join(args).strip()) if t]
    for raw in tokens:
        token = raw.replace('요일', '').lower()
        if token in ('이번', '이번주'):
            offset = 0
            continue
        if token in ('다음', '다음주'):
            offset = 1
            continue
        if token and token[0] in WD and token[1:] in SLOT_WORDS:  # '화점심'
            pending, token = token[0], token[1:]
        elif token in WD:
            if pending is not None:
                raise ValueError(f'{pending}요일 뒤에 슬롯(아침, 점심, 저녁)을 적어줘.')
            pending = token
            continue
        if token in SLOT_WORDS:
            if pending is None:
                raise ValueError('슬롯 앞에 요일(월~금)을 적어줘. 예: /슬롯 화 점심')
            index = WD.index(pending)
            if index >= 5:
                raise ValueError('주말은 시간표가 없다. 토일은 송은 시간.')
            changes[index + 1] = SLOT_WORDS[token]
            pending = None
            continue
        raise ValueError(f'"{raw}"를 모르겠다. 예: /슬롯 화 점심')
    if pending is not None:
        raise ValueError(f'{pending}요일 뒤에 슬롯(아침, 점심, 저녁)을 적어줘.')
    if not changes:
        raise ValueError('바꿀 요일과 슬롯을 적어줘. 예: /슬롯 화 점심')
    return offset, changes


def bot_reply(store, text: str, now: datetime | None = None) -> str:
    now = (now or datetime.now(KST)).astimezone(KST)
    today = now.date()
    tokens = (text or '').strip().split()
    command = tokens[0].lower() if tokens else ''
    command = command.split('@', 1)[0]  # '/시간표@WOOGEUN_BOT'
    args = tokens[1:]
    if command in TODAY_COMMANDS:
        return today_text(store, now)
    if command in WEEK_COMMANDS:
        offset = default_offset(today)
        if args and args[0] in ('다음', '다음주'):
            offset = 1
        elif args and args[0] in ('이번', '이번주'):
            offset = 0
        return week_text(store, today, offset)
    if command in SLOT_COMMANDS:
        try:
            offset, changes = parse_slot_args(args, today)
        except ValueError as error:
            return str(error) + '\n\n' + USAGE
        monday = monday_of(today) + timedelta(days=7 * offset)
        store.set_plan_slots(monday.isoformat(), changes, now)
        done = ', '.join(f'{WD[wd - 1]} {SLOTS[slot]}' for wd, slot in sorted(changes.items()))
        return (f'{"다음 주" if offset else "이번 주"} {done}(으)로 바꿨다. 앱을 열면 반영된다.\n\n'
                + '\n'.join([f'{"다음 주" if offset else "이번 주"} 시간표, {week_label(monday)}'] + week_lines(store, monday, today)))
    return USAGE


def weekly_text(store, now: datetime) -> str:
    """일요일 저녁 다음 주 시간표 — 앱을 열지 않아도 이 DM에서 /슬롯 으로 바꿀 수 있다."""
    today = now.date()
    monday = monday_of(today) + timedelta(days=7)
    return '\n'.join([f'다음 주 시간표, {week_label(monday)}'] + week_lines(store, monday, today) +
                     ['바꾸려면 이 DM에서 /슬롯 화 점심 (일요일엔 다음 주가 기본). 앱 시간표 탭에서 바꿔도 된다.',
                      '아침 슬롯의 전제는 전날 23시 취침.'])


def reminder_hint(store, now: datetime) -> str:
    """루틴 알림 끝에 붙이는 한 줄 — 오늘 계획 슬롯이 아직 남아 있으면 그 컷오프. 없으면 빈 문자열."""
    today = now.date()
    if not slot_active(store, today):
        return ''
    summary, _ = store.summary(today.isoformat())
    if summary and summary.get('actual'):
        return ''
    slots, _own = store.effective_plan(monday_of(today).isoformat())
    planned = slots[str(today.weekday() + 1)]
    if now.hour < SLOT_CUTOFF[planned]:
        return f' 운동 슬롯은 {SLOTS[planned]}, {SLOT_CUTOFF[planned]}시까지.'
    return ''
