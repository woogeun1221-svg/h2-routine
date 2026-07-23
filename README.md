# H2 강제 루틴 트래커

매일 지켜야 하는 강제 루틴 4개(푸쉬업·스쿼트·독서·송은)를 기록하는 1인용 PWA.
정상 포지션 / 최소 포지션 2단계 + **"두 번 연속 거르지 않는다"** 룰.

- 색 컨벤션(국장식): 빨강=정상(달성) · 황동=최소 · 파랑=미달
- 데이터는 기기 localStorage에만 저장 — 서버 없음. 백업은 [데이터 내보내기] JSON.
- `h2-routine-tracker.html` = v1 프로토타입 (Claude.ai 아티팩트용, 참조 보존)

## 개발

```bash
npm install
npm run dev        # 로컬 개발 서버
npm test           # 로직 단위 테스트 (vitest)
npm run icons      # public/icons/ PNG 재생성 (sharp)
npm run build      # dist/ 빌드 (PWA 포함)
```

## 배포

`main` push → GitHub Actions → GitHub Pages.
URL: https://woogeun1221-svg.github.io/h2-routine/

## 데이터 스키마 (v1 호환)

```json
{ "startDate": "YYYY-MM-DD",
  "days": { "YYYY-MM-DD": { "p": 0, "s": 0, "r": 0, "w": null } } }
```

`p` 푸쉬업(회) · `s` 스쿼트(회) · `r` 독서(분) · `w` 송은(`"o"` | `"x"` | `null`=해당없음)

## 로드맵

- [x] 1단계: v1 포팅 + PWA + 배포 (+ JSON 가져오기)
- [ ] 2단계: 추이 화면 — 캘린더 히트맵, 월별 장부 이동, 최장 스트릭, 습관별 추이
- [ ] 3단계: 설정 — 목표치 수정, 내보내기/가져오기 정식 UI
- v2 후보: Supabase 동기화, 주간 리포트
