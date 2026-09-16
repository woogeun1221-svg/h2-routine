# 하루 만족도와 메인컨트롤 알림 — 2026-09-17

## 요청과 구현

- 오늘 화면 최상단에 사용자 문구 그대로 O/X 질문 추가. X 이유는 즉시 로컬 저장.
- `days[date].self` (`o` / `x` / `null`), `selfReason` 선택 필드만 추가.
  기존 `h2-routine-v1` 키, 운동·독서·송은·투자 원칙 기록과 달성 판정은 보존.
- 추이 화면에서 월별 O/X와 이유 열람. 백업 내보내기/가져오기에도 포함.
- 날짜는 Asia/Seoul. 매일 23:00, 서버에 당일 응답이 없으면 메인컨트롤 DM에 한 번 발송.
- 브라우저는 일회용 연결 링크로 인증하며 날짜와 응답 여부만 전송한다.
  O/X 선택값·이유·다른 루틴 기록은 서버에 보내지 않는다.
- 여러 기기 중 하나에서 응답하면 재촉하지 않는다. 인터넷 연결 실패는 화면에 표시하고
  앱 재개·연결 복구·활성 화면의 1분 주기로 재시도한다.

## 운영 구성

- API: `scripts/reminder_service.py serve`, localhost:8815.
- 공개 경로: `https://macmini.taile484c7.ts.net/routine-api`.
- 새 launchd: `com.woogeun.routine.api`, `com.woogeun.routine.reminder`.
- 예약: 한국 시간 23:00. Mac mini 시스템 시간대도 KST인지 설치 시 확인.
- DB: git에서 제외한 `data/reminders.sqlite3`, 권한 0600. 인증정보는 해시만 저장.
- 발송: 기존 `../_core/tg-notify` 재사용. 토큰·채팅 ID·연결 링크는 로그에 출력하지 않는다.
- `python3 scripts/reminder_service.py pair`: 7일 유효 일회용 연결 링크를 메인컨트롤 DM으로 실제 발송.
- `python3 scripts/reminder_service.py status`: 기기 수, 오늘 응답 여부, 알림 상태만 출력.
- `python3 scripts/reminder_service.py remind --dry-run`: 발송 없이 현재 시각 기준 판정.
- 사용자는 평소 기록하는 브라우저에서 연결 링크를 한 번 열어야 한다.
  iOS 홈 화면 앱이면 그 앱의 설정에 링크를 붙여넣는다. 연결 전에는 알림을 보내지 않는다.
- 미확인 발송 상태(`sending`)는 자동 재발송하지 않아 중복 발송을 피한다.

## 검증

- `npm test`: 10 files / 96 tests 통과.
- `PYTHONDONTWRITEBYTECODE=1 /usr/bin/python3 -m unittest discover -s scripts -p 'test_*.py' -v`:
  8개 통과. 외부 Telegram 발송은 mock, HTTP 검사는 임시 DB/localhost만 사용.
  최초 sandbox 실행의 HTTP bind 2개는 권한 오류였고 승인된 재실행에서 통과.
- `npm run build`: Vite/PWA 빌드 통과.
- `node scripts/browser_qa.cjs`: 실제 Chrome 320/390/1200px, 가로 넘침/브라우저 오류 없음.
  과거 기록 보존, O/X 수정·취소, 이유 입력·재로드·과거 열람, 알림 연결/전달 확인.
  외부 API는 모의 처리. 화면: `/private/tmp/h2-routine-qa/`.
- 두 plist `plutil -lint` 통과. `git diff --check` 통과.

## 배포와 확인

- 사용자가 사이트 배포·알림 가동·연결 메시지 발송을 승인함.
- 기능 소스 `693aaaa`를 `origin/main`에 반영하고, 기존 배포 스크립트로
  `gh-pages` `0a7359e`에 배포 완료. 배포 스크립트의 필수 테스트/빌드도 통과.
- 공개 사이트에서 `index-DVLj0EiE.js`와 최상단 O/X 질문 확인.
  `node scripts/browser_qa.cjs --live-smoke`: HTTP 200, 질문/버튼 2개 표시,
  390px 가로 넘침과 브라우저 오류 없음.
- 두 새 plist를 `~/Library/LaunchAgents/`에 설치하고 등록 완료.
  API는 `running`, 예약 작업은 Hour=23 / Minute=0으로 대기 중.
  실제 야간 발송 시각은 아직 도래하지 않았으며 발송 분기는 mock으로 검증했다.
- 기존 Funnel 경로를 보존하며 `/routine-api`만 추가. 공개 HTTPS health 200,
  사이트 Origin의 CORS preflight 200, 무인증 응답 변경 요청 401 확인.
- 메인컨트롤 DM으로 연결 링크 발송 성공(`pairing_message_sent=true`).
  사용자가 평소 기록하는 브라우저/홈 화면 앱을 한 번 연결하면 미응답 알림이 활성화된다.
- 기존 README의 `main push → Actions` 설명과 실제 `scripts/deploy.sh`의
  `npm run deploy → gh-pages` 배포 방식이 다름. 기존 운영 문서 교정은 이번 범위에 포함하지 않음.
