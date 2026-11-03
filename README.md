# H2 강제 루틴 트래커

매일 지켜야 하는 강제 루틴 5개(푸쉬업, 턱걸이, 독서, 가슴 펴기, 송은)와 주간 항목 2개(투자 원칙 검토, 손익비 스냅샷), 그리고 맨 위의 하루 만족도 질문
"스스로에게 만족할만한 하루를 보냈는가? — 컨트롤 할 수 있는 건 오로지 나뿐"(O/X, X면 사유)을 기록하는 1인용 PWA.
정상 포지션 / 최소 포지션 2단계 + **"두 번 연속 거르지 않는다"** 룰.

- 손익비 스냅샷(2026-10-29 추가)은 포트폴리오 손익비 대시보드에서 주 1회 스냅샷을 찍는 주간 항목이다. 투자 원칙과 같은 주간 규칙(월요일 시작, 어느 날이든 완료,
  금요일까지 미완료면 그 금요일 미달, 주말 완료는 추이에서 최소)을 따르지만 완전히 독립이다. 활성일 `rrSnapshotStart`부터 판정하고 완료일은 `rr: true`.
  카드의 "대시보드 열기"는 https://macmini.taile484c7.ts.net/rr/ 로 간다(토큰 로그인은 그쪽). 주간 항목 정의는 `WEEKLIES`(`src/logic.js`)에 데이터로 추가한다.
- 가슴 펴기(2026-11-03 추가)는 "가슴을 당당히 펴고 있는가"를 하루 한 번 O/X로 답하는 일간 체크 항목이다. O여야 그날 통과이고
  X나 미응답은 그날 미달이다(송은과 달리 해당없음이 없다). 활성일 `postureStart`(업데이트 후 처음 연 날)부터 판정하고 그 전 날짜는 소급하지 않는다.
  기록은 `c: "o" | "x" | null`. 설정 목표치에는 없고, 습관별 추이에는 O 일수가 정상, 나머지가 미달인 행으로 나온다.
  체크 항목 정의는 `CHECKS`(`src/logic.js`)에 데이터로 추가한다. 루틴 알림은 `statusOf`를 따르므로 미응답이면 재촉이 온다.
- 푸쉬업 단계 버튼은 +5, +10, +25 (2026-10-29). 목표(정상 100, 최소 30)는 그대로다.
- 스쿼트는 2026-10-29 은퇴. 업데이트 후 처음 연 날(`squatEnd`)부터 판정에서 빠지고, 그 전 날짜는 스쿼트 포함 기준 그대로다
  (턱걸이 활성일의 거울 규칙, 소급 없음). 정의는 `HABITS`에 남아 있어 옛 기록의 `s`와 `settings.s`가 검증을 통과한다.
  습관별 추이의 스쿼트 행은 종료일 전 표본이 있는 달에만 남는다. 설정 목표치에는 안 나온다. 헬스 탭 하체 프로그램의 스쿼트는 별개(그대로).
- 과거 날짜 수정(2026-10-29): 오늘 화면 날짜 옆 ◀ ▶ 또는 14일 스트립 칸을 누르면 그날 기록으로 이동한다(시작일~오늘).
  카드, 가슴 펴기, 송은, 투자 원칙, 만족도 O/X가 모두 그날에 쓰이고, 카드 목록은 그날 활성이던 습관(은퇴 전 스쿼트 등)이다.
  연속 생존, 이달 정상, 어제 미달 배너는 계속 오늘 기준. 자정이 지나거나 가져오기, 초기화를 하면 오늘로 돌아온다.
  되돌리기(↺) 스택은 날짜를 옮길 때 비운다. 만족도 응답의 알림 서버 전송은 7일 이내 날짜만 받고 그 밖은 조용히 무시한다.

- 투자 원칙은 매주 한 번 정독·검토한다. 어느 요일이든 체크할 수 있고 목요일·금요일을 권장하며, 금요일까지 미완료면 그 금요일이 미달이다. 주말의 늦은 완료는 기록하되 이미 지난 금요일 판정을 소급 변경하지 않는다.
- 주간 루틴은 기능을 처음 연 날부터 적용해 기존 일간 기록을 소급 변경하지 않는다.
- 턱걸이(정상 20회, 최소 5회)는 2026-10-19 추가. 업데이트 후 처음 연 날(`pullupStart`)부터 판정에 들어가고, 그 전 날짜는 세 습관 기준 그대로다. 습관별 추이의 턱걸이 행도 그날부터 센다.
- 습관별 추이의 `투자 원칙(주)` 행은 금요일까지 완료=정상, 주말 완료=최소, 일요일까지 미완료=미달로 집계한다. 주간은 금요일이 속한 달에 귀속한다.

- 색 컨벤션(국장식): 빨강=정상(달성) · 황동=최소 · 파랑=미달
- 데이터는 기기 localStorage에만 저장 — 서버 없음. 백업은 [데이터 내보내기] JSON.
- `h2-routine-tracker.html` = v1 프로토타입 (Claude.ai 아티팩트용, 참조 보존)

## 알림 (앱 푸시 2026-10-30 추가, 메인컨트롤 봇 2026-09-17)

종류는 둘, 한국 시간, 어느 기기도 충족을 보고하지 않았을 때만. 시각은 `SCHEDULE`(`scripts/reminder_service.py`)과 launchd plist 가 같이 정한다.

- 루틴 미달(2026-11-03부터 두 시간마다): 오전 9시부터 밤 9시까지 두 시간마다, 오늘 판정이 미달(`statusOf` = miss, 금요일엔 주간 항목 포함)이면 슬롯마다 한 번.
  낮 슬롯 문구는 "가슴을 당당히 펴고 있는가?"로 시작하고 밤 9시는 자기 전 마지막 재촉. 금요일엔 투자 원칙 검토와 손익비 스냅샷 마감 문구가 붙는다.
  같은 tag 라 폰에는 최신 알림 하나만 남는다. 어느 기기가 최소 포지션 이상을 보고하면 다음 슬롯부터 멈추고, 다시 미달로 돌아가면 다시 온다.
- 밤 11시 만족도 미응답: 하루 만족도 O/X를 안 골랐으면.

전달 경로: 연결된 기기에 푸시 구독이 하나라도 있으면 Web Push(iOS 16.4 이상 홈 화면 앱, 데스크톱 브라우저). 구독이 없거나 전부 실패하면
밤 9시와 11시(`BOT_HOURS`)만 메인컨트롤 봇 DM(기존 `../_core/tg-notify`)으로 넘어가고, 낮 슬롯은 건너뛴다(봇은 하루 두 번 유지).
404, 410으로 끊긴 구독은 지운다. 429나 네트워크 오류는 구독을 남긴다.

연결은 폰에서 한 번: `python3 scripts/reminder_service.py pair`가 7일짜리 일회용 코드를 메인컨트롤 DM으로 보낸다.
홈 화면 H2 루틴 앱 → 설정 → 알림 칸에 붙여넣고 **연결하고 알림 켜기** 한 번(알림 권한 요청, 구독, 연결을 같이 한다).
Safari 탭이나 알림 미지원 브라우저에선 연결만 되고 봇이 알린다. 이미 연결된 기기는 **이 기기 알림 켜기 / 끄기**. 권한을 거부했으면 iOS 설정의 알림에서 허용한 뒤 다시 켠다.

앱이 서버에 보내는 것: 날짜, 만족도 응답 여부, 루틴이 최소 포지션 이상인지(둘 다 불리언), 브라우저가 만든 푸시 구독(엔드포인트, 공개키, 인증 비밀).
O/X 값, 사유, 운동 수치는 보내지 않는다. 수치가 바뀌면 1.5초 뒤, 앱을 숨길 때, 화면이 켜진 동안 1분마다 동기화한다.

- 클라이언트: `src/push.js`(구독, 상태 문구), `src/reminders.js`(연결, 보고 큐), `public/push-sw.js`(푸시 수신과 알림 표시, 앱 배지).
  생성된 `dist/sw.js`가 `importScripts('push-sw.js')`로 불러온다(`vite.config.js` workbox.importScripts). 앱을 열면 배지를 지운다.
- 서버: `scripts/reminder_service.py serve`(localhost:8815, Funnel `/routine-api`). `GET /push/key`, `POST /pair {code, subscription?}`,
  `POST /answer {day, answered, routine?}`, `POST /push/subscribe {subscription}`, `POST /push/unsubscribe {endpoint}`(마지막 셋은 Bearer 기기 인증).
  DB `data/reminders.sqlite3`(git 제외, 0600): `subscriptions`, `answers.routine`, `reminders(day, kind)`. 2026-09 스키마는 열 때 자동 이행.
- 발송기: `scripts/web_push.cjs`. 외부 패키지 없이 Node 내장 crypto로 RFC 8291(aes128gcm)과 RFC 8292(VAPID ES256)를 구현했고
  `test/web-push.test.js`가 RFC 8291 검증 벡터와 바이트 단위로 비교한다. VAPID 키는 `data/vapid.json`(0600), 서비스가 처음 뜰 때 `keygen`으로 만든다.
  Node는 `/opt/homebrew/bin/node` 절대경로(launchd의 PATH에 homebrew가 없다).
  **`data/vapid.json`은 지우거나 다시 만들지 않는다.** 이 키가 바뀌면 기존 구독 전부가 403으로 실패하고(404, 410이 아니라 정리도 안 된다) 매일 봇 폴백으로만 간다.
  잃어버렸다면 폰에서 알림 끄기 뒤 켜기로 새 키에 다시 구독해야 한다.
- launchd `com.woogeun.routine.reminder`: 21:00과 23:00에 `remind`(시각으로 종류를 정한다. `--kind routine|reflection`, `--dry-run`).
  `status`는 기기 수, 오늘 보고, 구독 수. `push-test`는 연결된 구독 전부에 확인 알림을 보낸다.
- iOS 주의: 알림은 홈 화면에 추가한 앱에서만 켤 수 있고, 권한 요청은 탭 핸들러 안에서만 열린다. 모든 푸시는 알림을 띄운다(조용한 푸시가 쌓이면 iOS가 구독을 끊는다).
  앱을 홈 화면에서 지우면 구독도 사라진다(다음 발송 때 410으로 정리).

## 헬스 탭 (Iron Terminal 통합, 2026-10-13)

상체/하체 근력운동 트래커 Iron Terminal(React 19 + TypeScript)을 `헬스` 탭으로 품었다.
소스는 `src/iron/`(domain·storage·ui), 테스트는 `test/iron/`. 탭을 처음 열 때 `src/iron/mount.tsx`를
동적 import 해 `#screen-iron`에 마운트하므로 초기 번들은 루틴 그대로다. 청크는 서비스워커 프리캐시 목록에 들어가지만(`dist/sw.js`), 오프라인 동작은 QA 가 SW 를 차단하므로 실기기에서 확인한다.

- Iron 의 전역 CSS(`:root`/`body`/`button`/`input`…)는 빌드 시 `.iron-root` 아래로만 접두사 처리된다
  (`vite.config.js`의 postcss-prefix-selector). 루틴 화면의 토큰·버튼은 영향을 받지 않는다.
- embedded 모드: Iron 의 하단 네비·설치 안내·SW 갱신 토스트는 끄고, 헤더 아래 보조 메뉴(홈/차트/기록/히스토리/캘린더)로 대체.
- 세트 수 조정(`src/iron/domain/sets.ts`): 기록 화면에서 종목마다 ＋ 세트 추가 / × 삭제(1~12). 다음 기록은 마지막에 실제로 한 세트 수로
  시작하고, 설정 → 기본 세트 수에서 종목별 출발값을 바꾼다. 증량 신호는 그날 기록한 세트 전부가 목표 횟수를 넘겼는지로 본다.
- 저장 키는 Iron 그대로 `ironterminal:v1`. 루틴 기록 `h2-routine-v1`과 섞이지 않으며 백업도 각자 화면에서 한다.
- **기존 기록 이사(한 번만)**: 예전 주소 `/iron/` 맨 위 배너의 **이사 코드 복사** → 홈 화면 `H2 루틴` → 헬스 → 설정 → **이사 코드 붙여넣기** → 가져오기.
  코드는 `IRONMOVE1.gz.…`(gzip+base64url, `src/iron/storage/transfer.ts`)이고 기기 밖으로 나가지 않는다. 현재 기록이 있으면 교체 전에 확인하고 자동 백업한다.
  Safari 탭·데스크톱에서는 배너의 **새 앱으로 이동**이 `#iron-import=<코드>` 해시로 한 번에 넘긴다(iOS 홈 화면 PWA 는 Safari 와 저장소가 분리돼 이 경로가 닿지 않는다).
  예전 방식(JSON 파일 내보내기/가져오기)도 그대로 된다.
- 원본 `~/projects/iron-terminal/`과 launchd `com.woogeun.ironterminal.serve`는 이사 확인 전까지 유지한다.

## 개발

```bash
npm install
npm run dev        # 로컬 개발 서버
npm test           # 로직 단위 테스트 (vitest, 루틴 + 헬스)
npm run typecheck  # 헬스(TypeScript) 타입 검사
npm run icons      # public/icons/ PNG 재생성 (sharp)
npm run build      # dist/ 빌드 (PWA 포함)
```

## 배포

`main` push → GitHub Actions → GitHub Pages.
URL: https://woogeun1221-svg.github.io/h2-routine/

## 데이터 스키마 (v1 호환)

```json
{ "startDate": "YYYY-MM-DD",
  "investmentReviewStart": "YYYY-MM-DD",
  "rrSnapshotStart": "YYYY-MM-DD",
  "pullupStart": "YYYY-MM-DD",
  "squatEnd": "YYYY-MM-DD",
  "postureStart": "YYYY-MM-DD",
  "days": { "YYYY-MM-DD": { "p": 0, "s": 0, "t": 0, "r": 0, "w": null, "c": "o", "i": true, "rr": true, "self": "o", "selfReason": "" } } }
```

`p` 푸쉬업(회), `s` 스쿼트(회, `squatEnd` 전 날짜만 판정), `t` 턱걸이(회, 없으면 0), `r` 독서(분), `w` 송은(`"o"` | `"x"` | `null`=해당없음), `c` 가슴 펴기(`"o"` | `"x"` | `null`=미응답, `postureStart`부터 O여야 통과), `i` 투자 원칙 검토 완료(`true`, 완료한 요일에 사용), `rr` 손익비 스냅샷 완료(`true`, 같은 방식), `self` 하루 만족도(`"o"` | `"x"` | 없음=미응답), `selfReason` X 사유. 활성일, 종료일 필드가 없으면 처음 연 날로 채운다.

## 로드맵

- [x] 1단계: v1 포팅 + PWA + 배포 (+ JSON 가져오기)
- [x] 2단계: 추이 화면 — 캘린더 히트맵, 월별 장부 이동, 최장 스트릭, 습관별 추이
- [x] 3단계: 설정 — 목표치 수정(`settings` 키, days 스키마 불변), 백업 파일 내보내기/가져오기
- v2 후보: Supabase 동기화, 주간 리포트
