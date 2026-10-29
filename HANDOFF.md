# 스쿼트 은퇴, 푸쉬업 단계, 만족도 문구, 과거 날짜 수정, 손익비 스냅샷 — 2026-10-29

## 현재 작업

사용자 요청: 스쿼트 항목 삭제, "스스로에게 만족할만한 하루를 보냈는가? (컨트롤 할 수 있는 건 오로지 나뿐)" 추가,
과거 날짜 수치 수정, 푸쉬업 단계 +5 +10 +25. 보고 후 추가 요청: 주 1회 손익비 스냅샷을 투자 원칙과 별도 항목으로, 그리고 끝까지(커밋, 배포) 진행.

- 손익비 스냅샷: 주간 항목을 `WEEKLIES = [INVESTMENT_REVIEW, RR_SNAPSHOT]` 데이터로 일반화. `weeklyStatus(state, ds, item)`가 공통 판정이고
  `investmentReviewStatus`는 호환 래퍼. `statusOf`, `completion`은 금요일에 활성 주간 항목마다 각각 건다(둘 다 활성이면 분모 +2).
  `habitMonthStats`가 `weeklies` 배열(투자 원칙, 손익비 순)을 돌려주고 `investment`는 호환용으로 남김. 추이 표는 `habits.concat(weeklies)`.
  `storage.js`가 주간 키(i, rr)를 boolean으로 검증하고 `rrSnapshotStart`를 START_KEYS로 채움. `main.js` `toggleWeekly(key)`가 `toggleInvestmentReview`를 대체.
  오늘 카드는 `renderWeeklyCard(item)`로 두 장, `data-weekly` 속성, 손익비 카드엔 대시보드 링크(`RR_SNAPSHOT.link`, /rr/ 슬래시 포함, 새 탭).
  문구는 item 필드(action, upcoming, open, statName) — 투자 원칙 문구는 기존 그대로, 새 항목 문구엔 가운뎃점 없음.
  결정(사용자 미확인): 마감은 투자 원칙과 같은 금요일. 폰에서 처음 여는 날이 `rrSnapshotStart`라 그 주 금요일부터 스냅샷 없으면 미달.

- 스쿼트: `HABITS`에서 지우지 않고 `endKey: 'squatEnd'`로 은퇴. `goalsOf(state, ds)`가 `ds >= squatEnd`면 제외, 날짜 없이(설정) 부르면 은퇴 습관 제외.
  지우면 `settings.s`가 `validateSettings`에서 거부돼 기록 전체가 fresh로 떨어지고(10-19 `settings.t` 때 거의 밟은 함정), 과거 날의 판정이 소급해 바뀐다.
  `squatEnd`는 `storage.js` START_KEYS에 합류 — load/import 때 없으면 오늘, `freshState`도 포함. 처음 연 날이 종료일(배포일 아님).
  `habitSpans(state)`(신규)가 은퇴 포함 전부를 돌려주고 `habitMonthStats`가 이걸 써서 종료일 전 표본만 세고 표본 0인 은퇴 행은 지운다.
  `resetGoals` 확인문은 활성 습관만. `ensureDay`의 `s: 0` 기본값은 그대로 두었다(무해, 스키마 호환).
- 만족도: 기존 맨 위 카드(`REFLECTION_QUESTION`) 문구를 "가슴에 손을 얹고 …" → "스스로에게 만족할만한 하루를 보냈는가?"로 바꾸고
  `REFLECTION_MOTTO` "컨트롤 할 수 있는 건 오로지 나뿐"을 질문 밑 한 줄로 추가. 추이의 만족도 섹션 제목, 부제도 같은 상수.
  **판정(`statusOf`)에는 넣지 않았다** — 같은 질문이 이미 있어 문구 교체로 해석했고, X를 그날 미달로 치는 건 사용자가 원하면 활성일 규칙으로 추가.
- 과거 날짜 수정: `main.js`에 `viewDate`(null=오늘) + `targetDay()` + `selectDay(ds)`(시작일~오늘로 클램프, undoStack 비움).
  addVal, undoVal, setDirect, toggleW, toggleInvestmentReview가 `targetDay()`에 쓴다. `renderToday(state, t, h, day)`:
  날짜, D+, 카드, 송은, 투자 원칙, 만족도는 `day` 기준, 연속 생존, 이달 정상, 배너는 `t` 기준. `index.html`에 `.date-row`(h1 + ◀ ▶ `#dayPrev` `#dayNext`),
  `#editNotice`(+ `#todayBtn`). 14일 스트립 칸은 `<button class="day">`(시작일 전 disabled), 선택 중이면 `.selected`.
  `renderReflection(…, isToday)`가 false면 `#reminderStatus` 대신 그날 날짜 표시(그 줄은 오늘 이야기라서). 롤오버 두 경로, 가져오기, 초기화에서 `viewDate = null`.
- 푸쉬업 `steps: [5, 10, 25]`.
- 글쓰기 규칙: 새로 넣은 한국어 문구에는 가운뎃점을 쓰지 않았다. 기존 `join('·')` 숫자 구분자와 테스트 단언은 그대로.

## 검증

- `npm test`: 27 files / 282 tests 통과(기존 249 + `test/squat-retire.test.js` 14 + `test/rr-snapshot.test.js` 11 + today.dom 4 + settings.dom 1 + trends.dom 2 + reflection.dom 1,
  기존 테스트는 픽스처만 갱신). 픽스처 갱신: storage, pullup, reflection.dom이 load/import/freshState의 `squatEnd`, `rrSnapshotStart` 채움에 맞춤.
  today.dom 골격에 새 id 추가, 핸들러 `toggleInvestmentReview` → `toggleWeekly`, 카드 수 +1(손익비).
  squatEnd 없는 옛 픽스처(logic, trends-logic, settings-logic)는 무수정 통과 = 소급 없음의 증거.
- `npm run typecheck`, `npm run build` 통과.
- `node scripts/browser_qa.cjs`: 390/320/1200 가로 넘침 0, 브라우저 오류 0. 오늘 카드 6개(푸쉬업, 턱걸이, 독서, 송은, 투자 원칙, 손익비 스냅샷), 푸쉬업 버튼 +5 +10 +25.
  손익비 카드: 완료 → `rr: true` 저장, 투자 원칙 aria-pressed 불변, 취소 → 삭제, 링크 target _blank.
  ◀ 로 어제: 안내 표시, 어제 카드에 스쿼트(은퇴 전) 있고 턱걸이 없음, +5/+50이 어제 기록에만 쓰임(오늘 p 30 유지), 스트립 칸 왕복, '오늘로' 복귀.
  시드에 `squatEnd: 오늘`, `rrSnapshotStart: 오늘`. 라이브 스모크 단언은 새 질문 문구, 모토, 카드 6개로 갱신(배포 후 실행).
  화면: `/private/tmp/h2-routine-qa/today-390.png`, `today-past-390.png`, `today-320.png`. 320에서 ◀ ▶ 는 날짜 아래 줄로 내려간다.
- 폰에서 업데이트된 앱을 처음 여는 날이 `squatEnd`가 된다. 그날부터 스쿼트 없이 정상/최소 판정. 그 전 날짜로 돌아가 수정하면 스쿼트 카드가 다시 보인다(그날 기준이라 정상).

## 배포

- 미실행. 승인 후 `git add -A && git commit` → `npm run deploy`(테스트, 빌드 후 gh-pages 강제 푸시) → `node scripts/browser_qa.cjs --live-smoke`.
- 헬스 탭 하체 프로그램의 스쿼트(`ironterminal:v1`)는 손대지 않았다.

---

# 턱걸이 20회 추가 — 2026-10-19

## 현재 작업

사용자 요청: 루틴에 턱걸이 20회를 추가한다. 코드 수정과 로컬 검증까지 진행, 커밋과 배포는 승인 대기.

- `src/logic.js` HABITS에 `t` 턱걸이(정상 20회, 최소 5회, +5/+10/+20). 푸쉬업, 스쿼트 다음, 독서 앞. `startKey: 'pullupStart'`.
- 소급 금지: 투자 원칙(`investmentReviewStart`)과 같은 활성일 규칙. `goalsOf(state, ds)`가 활성일 전 날짜에선 턱걸이를 빼므로
  기존 스트릭, 정상률, 장부, 히트맵, 어제 미달 배너가 바뀌지 않는다. 활성일 필드가 없는 상태(옛 테스트 픽스처)에선 없는 습관으로 본다.
  설정 화면은 `goalsOf(state)`(날짜 없음)로 활성화된 습관 전부를 보여 준다.
- `src/storage.js`: `START_KEYS`(investmentReviewStart, pullupStart)를 load/import 때 없으면 오늘로 채운다(`activateFeatures`). `freshState`도 포함.
  검증은 날짜 형식, `t` 0 이상 숫자, settings 허용 키를 HABITS에서 파생(이전엔 p/s/r 하드코딩이라 `settings.t` 저장 후 다음 로드에서 fresh로 떨어질 뻔했다).
- `src/main.js`: undoStack을 HABITS에서 생성(`emptyUndo`, 5곳), 새 날 기본 기록 `t: 0`, 목표 되돌리기 확인문도 HABITS에서 생성.
- `src/views/today.js`: 오늘 기준 `goalsOf(state, t)`, undoStack에 키가 없어도 렌더.
- `habitMonthStats`: 습관별 `days`(자기 표본 일수)로 비율. 활성일 전 달의 턱걸이 행은 0, 비율 —. 옛 습관 수치는 그대로.
- `index.html` 룰 노트 기본 숫자 4개, '세 습관 모두' → '일간 습관 모두'. README 습관 목록, 스키마(`pullupStart`, `t`).
- 결정(사용자 미확인): 최소 5회와 +5/+10/+20은 독서(20분, 최소 5분) 패턴. 설정에서 바꿀 수 있다. 헬스 탭 pullup 프리셋은 별개 저장소라 손대지 않음.

## 검증

- `npm test`: 25 files / 249 tests 통과(기존 230 + `test/pullup.test.js` 17 + settings.dom, today.dom 각 1).
  storage, reflection.dom 픽스처는 load/import가 `pullupStart`를 채우는 변화에 맞춰 갱신. 기존 logic, trends 테스트는 무수정 통과(소급 없음의 증거).
- `npm run typecheck`, `npm run build` 통과.
- `node scripts/browser_qa.cjs`: 390/320/1200 가로 넘침 0, 브라우저 오류 0, 오늘 카드 6개(세 번째 턱걸이). 시드에 `pullupStart: 오늘`, 오늘 기록 `t: 5`.
- dist 수동 스크린샷(390px, 활성일=오늘, 17~18일 세 습관 정상): 턱걸이 카드 5/20회 '최소', 연속 생존 3일, 17~18일 캔들 정상 유지, 설정 4행.

## 배포

- 사용자 승인(2026-10-19 "OK") 후 기능 소스 `8c0827b` 커밋, `npm run deploy`로 `gh-pages` `b8da299` 강제 푸시(테스트 249건, 빌드 통과).
- 사용자 요청으로 `origin/main` push 완료(`b4bb545..dac274b`).
- 배포 15초 뒤 공개 URL이 새 번들(`index-20dEB1Gg.js`)을 서빙. `node scripts/browser_qa.cjs --live-smoke`: HTTP 200, 질문과 추이, 헬스 탭 마운트, 브라우저 오류 0. 공개 HTML에 바뀐 룰 노트 문구 확인.
- 폰에서 업데이트된 앱을 처음 여는 날이 `pullupStart`가 된다(배포일이 아님). 그날부터 턱걸이 없이는 미달. 밤늦게 처음 열면 그날 바로 5회가 필요하다.

---

# 헬스 탭 — Iron Terminal 통합 — 2026-10-13

## 현재 작업

사용자 요청: 기존 헬스 루틴(Iron Terminal, 맥미니 /iron/)을 루틴 앱의 하단 탭으로 합친다.
승인 후 진행. 공개 저장소에 Iron 화면 코드가 올라가는 점은 사용자가 수락했다.

- `src/iron/`(domain·storage·ui) 이식, `test/iron/` 116건. `test/iron-mount.dom.test.jsx` 2건 추가.
- 하단 탭 `오늘 · 추이 · 헬스 · 설정`. 헬스 탭은 처음 열 때 `src/iron/mount.tsx` 동적 import → `#screen-iron`.
- embedded 모드(`App embedded`): Iron 하단 네비·InstallPrompt·UpdateToast 대신 헤더 아래 `SubNav`.
  `src/iron/ui/embedded.css` 에 셸 보정(sticky 묶음, 보조 메뉴, 좁은 폭 헤더 줄바꿈).
- Iron CSS 는 `vite.config.js` 의 postcss-prefix-selector 로 `.iron-root` 아래로만 적용. `:root/html/body` → `.iron-root`.
- `@vitejs/plugin-react` 6 은 babel 8 을 요구해 vite-plugin-pwa(babel 7)와 충돌 → 미사용. Vite 내장 JSX 변환으로 빌드·테스트 모두 정상(Fast Refresh 만 없음).
- 저장 키 분리 유지. 기록 이사(2026-10-14 추가): `src/iron/storage/transfer.ts`(IRONMOVE1.gz/b64 코드, 양쪽 앱 동일 파일) + `src/iron/transfer-apply.ts`(스토어 적용·교체 전 preimport 백업).
  새 앱: 설정 '예전 기록 이사' 카드(붙여넣기), 대시보드 빈 상태 '예전 기록 이사' 버튼, `main.js` 의 `#iron-import=` 해시 처리.
  예전 앱(`~/projects/iron-terminal`, 루트 repo): `MigrateBanner`(이사 코드 복사 / 새 앱으로 이동) — `npm run build` 로 dist 갱신, launchd 정적 서버가 즉시 서빙(재시작 불필요). 테스트 120건.
  iOS 홈 화면 PWA 는 Safari 와 저장소가 분리돼 URL 경로가 닿지 않는다 → 클립보드 경로가 기본.

- 세트 수 조정(2026-10-14): `src/iron/domain/sets.ts`(initialSetCount·appendSet·removeSetAt·clamp 1~12). 기록 화면 종목 카드에 ＋ 세트 추가 / × 삭제, 카드 머리 세트 수 실시간. 다음 기록은 마지막에 한 세트 수로 시작(기존은 max(기본, 지난)로 늘어나기만 했음). 설정 '기본 세트 수' 카드 + `App.updateSetCount`. 대시보드 '예전 기록 이사' 버튼 제거(사용자가 이사 불필요 확정). 예전 /iron/ launchd 서비스 bootout+disable, 컨트롤타워 iron_terminal 항목 제거.

## 검증

- `npm test`: 24 files / 230 tests 통과(루틴 102 + Iron 120 + 세트 4 + 마운트·이사 4). `npm run typecheck` 통과.
- `npm run build`: mount 청크 265KB(gz 83KB) 분리, Iron CSS 19KB 전부 `.iron-root` 접두사(bare :root/body/button 0건). 청크는 `dist/sw.js` 프리캐시 목록에 포함되나 오프라인 동작은 미검증(QA 는 SW 차단).
- `node scripts/browser_qa.cjs`: 390/320/1200px 가로 넘침 0, 브라우저 오류 0, 헬스 탭 마운트·보조 메뉴 5개·하단 네비 없음·루틴 탭 폰트 비오염 확인.
  시드의 9월 고정 날짜가 달이 바뀌며 O 비율 50% 기대를 깨뜨려 이번 달 1일 기준으로 보정.
  화면: `/private/tmp/h2-routine-qa/iron-390.png`, `iron-320.png`, `iron-1200.png`.

## 배포

- 기능 소스 `b1092e8` 커밋, `npm run deploy` 로 `gh-pages` `142c00a` 배포(테스트·빌드 통과 후 push). 공개 URL 라이브 스모크(헬스 탭 포함)는 `node scripts/browser_qa.cjs --live-smoke` 로 확인.
- 원본 `~/projects/iron-terminal/`·launchd `com.woogeun.ironterminal.serve`·컨트롤타워 `iron_terminal` 항목은 사용자가 폰에서 이사 확인한 뒤 정리.

---

# 하루 만족도 추이와 X 사유 아카이브 — 2026-09-17

## 현재 작업

사용자가 추이에 하루 만족도를 명확히 표시하고 X 사유를 계속 아카이브하도록 요청했다.
질문 없이 수정·검증·배포까지 진행하며, 기존 배포 승인도 이어진다.

- 추이 상단에 선택 월의 O/X 일수·O 비율과 월별 비교표.
- 기본 달력은 하루 만족도 O/X/미응답. 날짜를 누르면 그날 사유 표시.
  기존 루틴 달성 달력·스트릭은 `루틴 달성` 탭으로 전환해 확인.
- X 사유 아카이브는 달력의 선택 월과 독립적으로 모든 날짜를 최근 순으로 표시.
  기간 필터, 날짜/사유 검색, 20건 단위 더 보기, 전체 Markdown 내보내기 제공.
- 나중에 O 또는 미응답으로 변경해도 기존 `selfReason`은 보관하며 현재 상태를 함께 표시.
- O 비율은 `O / (O + X)`, 오늘 포함. 미응답과 미래 날짜는 분모에서 제외.
- 기존 `h2-routine-v1` 및 일별 기록은 변경·이관하지 않는다. 전체 JSON 백업에도 기존처럼 포함.
- 사유는 현재 브라우저에 누적 저장하며 서버로 전송하지 않는다. 알림 서버·예약·plist 변경 없음.

## 변경 경로

- `src/reflection.js`: 월별 집계, 전체 사유 조회, Markdown 생성.
- `src/views/reflection.js`, `src/views/trends.js`, `src/main.js`, `src/styles.css`, `index.html`.
- `test/reflection-logic.test.js`, `test/reflection.dom.test.js`, `test/trends.dom.test.js`, `scripts/browser_qa.cjs`.

## 검증

- `npm test`: 11 files / 102 tests 통과.
- `npm run build`: Vite/PWA 빌드 통과.
- `node scripts/browser_qa.cjs`: Chrome 320/390/1200px 통과, 가로 넘침/브라우저 오류 0.
  월간 O 비율, O/X 달력과 사유 열람, 여러 달 아카이브, 검색/기간 필터 유지,
  전체 사유 Markdown 및 기존 JSON 백업 다운로드, 기존 기록 보존 검증.
  외부 알림 API는 mock. 화면: `/private/tmp/h2-routine-qa/trends-390.png` 등.
- `git diff --check` 통과.

## 배포 완료

- 기능 소스 `99b353e`를 `origin/main`에 반영, `npm run deploy`로 `gh-pages` `e692c1e` 배포.
- GitHub Pages run `35122465988` 완료·성공 확인.
- `node scripts/browser_qa.cjs --live-smoke`: 공개 URL HTTP 200, 최상단 질문,
  기본 만족도 달력·집계 및 X 사유 아카이브 표시 확인. 390px 가로 넘침/브라우저 오류 없음.
- 공개 화면: `/private/tmp/h2-routine-qa/production-trends-390.png`.

초기 O/X·알림 구현과 기존 운영 설정: [이전 인수인계](docs/agent-history/2026-09-17-reflection-reminder-initial.md).
