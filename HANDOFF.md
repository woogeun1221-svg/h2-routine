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
