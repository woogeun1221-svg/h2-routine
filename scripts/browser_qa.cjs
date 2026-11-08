/* 기존 workspace Playwright/Chrome 재사용. 알림 API와 외부 발송은 모의 처리한다. */
const { chromium } = require('/Users/ourteam/projects/holdem-tutor/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const dist = path.resolve(__dirname, '../dist');
const report = '/private/tmp/h2-routine-qa';
const api = 'https://macmini.taile484c7.ts.net/routine-api';
const vapidKey = 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const oldRecord = { p: 100, s: 30, r: 20, w: 'o', i: true, self: 'x', selfReason: '오래된 사유도 아카이브에 남는다.' };
// 선택 월 O 비율 50% 기대: 이번 달 1일 O + 오늘 X. 9월 고정 날짜는 달이 바뀌면 0%가 돼 깨졌다(2026-10-13).
const firstOfMonth = date.slice(0, 8) + '01';
// pullupStart=오늘: 턱걸이(2026-10-19 추가)는 활성일부터만 판정 — 옛 기록은 세 습관 기준 그대로.
// squatEnd=오늘: 스쿼트(2026-10-29 은퇴)는 오늘부터 판정 제외 — 어제까지의 카드와 판정에는 그대로 남는다.
const yesterday = new Date(date + 'T12:00:00+09:00'); yesterday.setDate(yesterday.getDate() - 1);
const yesterdayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(yesterday);
// rrSnapshotStart=오늘: 손익비 스냅샷(2026-10-29 추가) 주간 카드는 활성일부터.
// postureStart=오늘: 가슴 펴기(2026-11-03 추가) O/X 카드는 활성일부터, 어제 카드엔 없다.
const seed = { startDate: '2026-08-19', investmentReviewStart: '2026-08-19', rrSnapshotStart: date, pullupStart: date, squatEnd: date, postureStart: date,
  days: { '2026-08-19': oldRecord,
    '2026-08-20': { self: 'o', selfReason: 'O로 바꾼 뒤에도 남겨둔 사유' },
    ...(firstOfMonth === date ? {} : { [firstOfMonth]: { self: 'o' } }),
    [date]: { p: 30, t: 5, r: 5, w: null } } };
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/h2-routine\//, '');
  const file = path.resolve(dist, relative || 'index.html');
  if (!file.startsWith(dist + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404).end(); return;
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

/* v2 주간 운동 시간표 — 시계를 한국 시간으로 고정해 1단계 완료 조건 다섯 개를 실제 화면에서 확인한다.
   기기 시간대는 일부러 뉴욕(판정과 시간 안내는 한국 시간이어야 한다). 시드는 v2 이전(활성일 없음)의 운영 기록 모양. */
const V2_FULL = { p: 100, t: 20, r: 20, w: null, c: 'o' };
const v2Seed = {
  startDate: '2026-07-23', investmentReviewStart: '2026-08-19', rrSnapshotStart: '2026-10-29',
  pullupStart: '2026-10-19', squatEnd: '2026-10-29', postureStart: '2026-11-03',
  days: {
    '2026-11-06': { ...V2_FULL, i: true, rr: true },          // 금, 주간 항목까지 정상(시간표 전이라 슬롯 없이 정상)
    '2026-11-07': { ...V2_FULL, self: 'o' }                    // 토 정상, 일요일(11-08)은 비워 둔다 → 월요일에 어제 미달 배너
  }
};
const v1Sample = { startDate: '2026-06-01', days: {
  '2026-06-01': { p: 100, s: 100, r: 20, w: 'o' }, '2026-06-02': { p: 30, s: 30, r: 5, w: null }, '2026-06-03': { p: 0, s: 0, r: 0, w: 'x' }
} };
const kst = iso => new Date(iso + '+09:00');
function isoWeekOf(ds) { // ISO 8601: 그 주 목요일이 속한 해의 몇 번째 주
  const d = new Date(ds + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}
const isWeekendDs = ds => [0, 6].includes(new Date(ds + 'T00:00:00Z').getUTCDay());

async function v2Scenario(browser, origin) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'America/New_York', serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [], dialogs = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { dialogs.push(dialog.message()); dialog.accept(); });
  await page.route(api + '/**', route => route.fulfill({ json: { ok: true, key: vapidKey } }));
  await page.addInitScript(data => {
    if (!localStorage.getItem('h2-routine-v1')) localStorage.setItem('h2-routine-v1', JSON.stringify(data));
  }, v2Seed);
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('h2-routine-v1')));
  const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const noDot = async selector => assert.equal((await page.locator(selector).innerText()).includes('·'), false, selector + ' 가운뎃점');
  const card = name => page.locator('#cards .card', { hasText: name }).first();

  // A. 일요일 21시: 업데이트 후 처음 연 날 → v2 이행, 시간표는 다음 주(W46)로 열린다 (완료 조건 1)
  await page.clock.setFixedTime(kst('2026-11-08T21:00:00'));
  await page.goto(origin + '/h2-routine/', { waitUntil: 'networkidle' });
  let saved = await stored();
  assert.equal(saved.v, 2);
  assert.equal(saved.exerciseSlotStart, '2026-11-08');
  assert.deepEqual(saved.days['2026-11-06'], v2Seed.days['2026-11-06']);
  assert.equal(await page.locator('#weekNo').innerText(), 'W45');
  assert.equal(await page.locator('#slotBlock').isVisible(), true);
  assert.equal(await page.locator('#slotBlock .card-sub').innerText(), '주말, 송은 시간');
  assert.equal(await page.locator('#cards .card').count(), 7);
  await page.locator('[data-tab="plan"]').click();
  assert.equal(await page.locator('#planWeeks [aria-pressed="true"]').innerText(), '다음 주\nW46 11.9–11.15');
  assert.equal(await page.locator('#planRows .plan-row').first().getAttribute('data-day'), '2026-11-09');
  assert((await page.locator('#planInherit').innerText()).includes('전부 아침'));
  await page.locator('#planRows .plan-row').nth(0).locator('[data-slot="noon"]').click();
  await page.locator('#planRows .plan-row').nth(1).locator('[data-slot="run"]').click();
  await page.locator('#planRows .plan-row').nth(0).locator('input').fill('송은 회식');
  saved = await stored();
  assert.deepEqual(saved.plans['2026-11-09'], { 1: 'noon', 2: 'run', 3: 'am', 4: 'am', 5: 'am', m1: '송은 회식' });
  assert.equal(await page.locator('#planCount').innerText(), '아침 3, 점심 1, 저녁런닝 1');
  assert.equal(await page.locator('#planInherit').isVisible(), false);
  await noDot('#screen-plan');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await noOverflow();
    await page.screenshot({ path: path.join(report, 'v2-plan-sunday-' + width + '.png'), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#planWeeks [data-offset="0"]').click();
  assert.equal(await page.locator('#planWeeks [aria-pressed="true"]').innerText(), '이번 주\nW45 11.2–11.8');

  // B. 월요일 15시: W46, 점심 계획 지남 → 백업 안내. 습관 정상 + 슬롯 미완료 → 최소, 슬롯 완료 → 정상 (완료 조건 2, 3, 5)
  await page.clock.setFixedTime(kst('2026-11-09T15:00:00'));
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('#weekNo').innerText(), 'W46');
  assert.equal(await page.locator('#banner').isVisible(), true);
  assert.equal(await page.locator('#bannerHead').innerText(), '어제 미달.');
  assert.equal(await page.locator('#slotBlock .slot-plan').innerText(), '계획 점심');
  assert.equal(await page.locator('#slotBlock .slot-note').innerText(), '점심 슬롯 지남. 백업: 퇴근 런닝.');
  assert.equal(await page.locator('#slotBlock [data-slot="noon"]').getAttribute('class'), 'btn planned');
  for (let i = 0; i < 4; i++) await card('푸쉬업').locator('.btn', { hasText: '+25' }).click();
  await card('턱걸이').locator('.btn', { hasText: '+20' }).click();
  await card('독서').locator('.btn', { hasText: '+20' }).click();
  await page.locator('[data-check="c"] .btn', { hasText: 'O 폈다' }).click();
  assert.equal(await page.locator('#posLine .pill').innerText(), '최소 포지션');
  assert.equal(await page.locator('#posLine .pos-gap').innerText(), '정상까지 운동 슬롯');
  await page.screenshot({ path: path.join(report, 'v2-today-monday-before-slot-390.png'), fullPage: true });
  await page.locator('#slotBlock [data-slot="noon"]').click();
  assert.equal(await page.locator('#posLine .pill').innerText(), '정상 포지션');
  assert.equal(await page.locator('#slotBlock .slot-note').innerText(), '계획대로 완료.');
  assert.equal((await stored()).days['2026-11-09'].e, 'noon');
  await page.locator('#slotBlock [data-slot="noon"]').click(); // 다시 누르면 취소
  assert.equal(await page.locator('#posLine .pill').innerText(), '최소 포지션');
  await page.locator('#slotBlock [data-slot="run"]').click();
  assert.equal(await page.locator('#slotBlock .slot-note').innerText(), '계획 점심 → 실제 저녁런닝.');
  assert.equal(await page.locator('#posLine .pill').innerText(), '정상 포지션');
  await noDot('#slotBlock'); await noDot('#posLine'); await noDot('#banner');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await noOverflow();
    await page.screenshot({ path: path.join(report, 'v2-today-monday-' + width + '.png'), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-tab="plan"]').click();
  assert.equal(await page.locator('#planWeeks [aria-pressed="true"]').innerText(), '이번 주\nW46 11.9–11.15');
  assert.equal(await page.locator('#planRows .plan-row').nth(0).locator('.plan-note').innerText(), '실제 저녁런닝');
  await page.locator('[data-tab="today"]').click();

  // 자정 경계: 시간 경과 안내는 1분 갱신으로 바뀐다(다시 그리기 없이 21시 → 마감 안내)
  await page.locator('#slotBlock [data-slot="run"]').click(); // 취소해서 비운다
  await page.clock.setFixedTime(kst('2026-11-09T21:05:00'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  assert.equal(await page.locator('#slotBlock .slot-note').innerText(), '오늘 슬롯 비었음. 최소 포지션(푸쉬업, 턱걸이)으로 마감.');
  await page.locator('#slotBlock [data-slot="run"]').click();

  // C. 토요일 12시: 습관 정상이면 슬롯 없이 정상. 시간표는 다음 주(W47)로 열리고 W46 계획을 물려받는다 (완료 조건 1, 2)
  await page.clock.setFixedTime(kst('2026-11-14T12:00:00'));
  await page.reload({ waitUntil: 'networkidle' });
  for (let i = 0; i < 4; i++) await card('푸쉬업').locator('.btn', { hasText: '+25' }).click();
  await card('턱걸이').locator('.btn', { hasText: '+20' }).click();
  await card('독서').locator('.btn', { hasText: '+20' }).click();
  await page.locator('[data-check="c"] .btn', { hasText: 'O 폈다' }).click();
  assert.equal(await page.locator('#posLine .pill').innerText(), '정상 포지션');
  assert.equal((await stored()).days['2026-11-14'].e, undefined);
  await page.locator('[data-tab="plan"]').click();
  assert.equal(await page.locator('#planWeeks [aria-pressed="true"]').innerText(), '다음 주\nW47 11.16–11.22');
  assert((await page.locator('#planInherit').innerText()).includes('직전 계획을 물려받았다'));
  assert.deepEqual(await page.locator('#planRows .plan-row [aria-pressed="true"]').evaluateAll(els => els.map(e => e.dataset.slot)),
    ['noon', 'run', 'am', 'am', 'am']);
  assert.equal(await page.locator('#planRows .plan-row').nth(0).locator('input').inputValue(), ''); // 메모는 물려받지 않는다

  // D. v1 JSON 가져오기(합치기) → 월별 장부에 그 달이 나타난다 (완료 조건 4). 장부 7열, 캘린더 월요일 시작
  await page.locator('[data-tab="settings"]').click();
  await page.setInputFiles('#importFile', { name: 'v1.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(v1Sample)) });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('h2-routine-v1')).startDate === '2026-06-01');
  assert(dialogs.some(m => m.includes('합칠까')), '합치기 확인 창');
  assert(dialogs.some(m => m.startsWith('가져오기 완료: 새 날짜 3일')), '완료 알림');
  saved = await stored();
  assert.deepEqual(saved.days['2026-06-01'], v1Sample.days['2026-06-01']);
  assert.equal(saved.days['2026-11-09'].e, 'run');                 // 기존 기록 보존
  assert.equal(saved.plans['2026-11-09'].m1, '송은 회식');
  assert.equal(saved.exerciseSlotStart, '2026-11-08');             // 활성일은 더 이른 쪽(기기)
  await page.locator('[data-tab="trends"]').click();
  const ledger = await page.locator('#monthBody tr').evaluateAll(trs => trs.map(tr => [...tr.children].map(td => td.textContent)));
  assert.deepEqual(ledger.at(-1), ['26.06', '1', '1', '28', '3%', '—', '1']);
  assert.deepEqual(ledger[0].slice(0, 1).concat(ledger[0].slice(5)), ['26.11', '1/5', '0']); // 11-09~13 평일 5일 중 월요일 1일
  assert.deepEqual(await page.locator('.month-ledger thead th').allInnerTexts(), ['월', '정상', '최소', '미달', '정상률', '슬롯', '송은 X']);
  // 320px에서도 장부 7열이 카드 안에 다 들어간다(가로 스크롤 없이)
  await page.setViewportSize({ width: 320, height: 844 });
  assert.equal(await page.locator('.month-ledger').evaluate(t => t.parentElement.scrollWidth <= t.parentElement.clientWidth), true);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal((await page.locator('#calWd').innerText()).replace(/\s/g, ''), '월화수목금토일');
  await page.locator('[data-calendar-mode="routine"]').click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await noOverflow();
    await page.screenshot({ path: path.join(report, 'v2-trends-' + width + '.png'), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // E. 기록 초기화 2단계: 첫 탭은 확인 줄만, 취소하면 원래대로, 탭을 옮기면 풀린다
  await page.locator('[data-tab="settings"]').click();
  await page.locator('#resetBtn').click();
  assert.equal(await page.locator('#resetConfirm').isVisible(), true);
  assert.equal(await page.locator('#resetBtn').isVisible(), false);
  await page.locator('#resetCancelBtn').click();
  assert.equal(await page.locator('#resetConfirm').isVisible(), false);
  await page.locator('#resetBtn').click();
  await page.locator('[data-tab="today"]').click();
  await page.locator('[data-tab="settings"]').click();
  assert.equal(await page.locator('#resetConfirm').isVisible(), false);
  assert.equal(Object.keys((await stored()).days).length > 0, true);
  await page.locator('#resetBtn').click();
  await page.locator('#resetConfirmBtn').click();
  saved = await stored();
  assert.deepEqual(saved.days, {});
  assert.equal(saved.plans, undefined);
  assert.equal(saved.exerciseSlotStart, '2026-11-14');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await noOverflow();
  }
  assert.deepEqual(errors, []);
  await context.close();
  return { v2: true, sundayOpensNextWeek: true, weekdaySlotGatesFull: true, saturdayFullWithoutSlot: true,
    yesterdayMissBanner: true, v1ImportInLedger: true, isoWeek46: true, resetTwoStep: true };
}

(async () => {
  fs.mkdirSync(report, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
    if (process.argv.includes('--v2-only')) {
      console.log(JSON.stringify(await v2Scenario(browser, 'http://127.0.0.1:' + server.address().port)));
      return;
    }
    const context = await browser.newContext({ viewport: { width: 390, height: 844 },
      timezoneId: 'America/New_York', serviceWorkers: 'block' });
    const page = await context.newPage();
    const errors = [], sent = [];
    page.on('pageerror', error => errors.push(error.message));
    if (process.argv.includes('--live-smoke')) {
      const response = await page.goto('https://woogeun1221-svg.github.io/h2-routine/', { waitUntil: 'networkidle' });
      assert.equal(response.status(), 200);
      assert.equal(await page.locator('#reflection .reflection-question').textContent(),
        '스스로에게 만족할만한 하루를 보냈는가?');
      assert.equal(await page.locator('#reflection .reflection-motto').textContent(), '컨트롤 할 수 있는 건 오로지 나뿐');
      assert.equal(await page.locator('#reflection .reflection-choices button').count(), 2);
      assert.equal(await page.locator('#cards .card').count(), 7); // 일간 3(스쿼트 은퇴) + 송은 + 가슴 펴기 + 투자 원칙 + 손익비 스냅샷
      assert((await page.locator('[data-check="c"] .card-name').innerText()).includes('가슴 펴기'));
      assert((await page.locator('[data-weekly="rr"]').innerText()).includes('손익비 스냅샷'));
      assert.equal(await page.locator('#cards .card .btn').first().textContent(), '+5');
      assert.equal(await page.locator('#dayPrev').isVisible(), true);
      // v2: 운동 슬롯 블록(#cards 밖), ISO 주차, 시간표 탭(토일엔 다음 주)
      assert.equal(await page.locator('#slotBlock').isVisible(), true);
      assert.equal(await page.locator('#slotBlock [data-slot]').count(), 3);
      assert.equal(await page.locator('#weekNo').textContent(), 'W' + isoWeekOf(date));
      await page.locator('[data-tab="plan"]').click();
      assert.equal(await page.locator('#planRows .plan-row').count(), 7);
      assert((await page.locator('#planWeeks [aria-pressed="true"]').innerText()).startsWith(isWeekendDs(date) ? '다음 주' : '이번 주'));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(report, 'production-plan-390.png'), fullPage: true });
      await page.locator('[data-tab="trends"]').click();
      assert.equal(await page.locator('#reflectionHistory .reflection-stats').count(), 1);
      assert.equal(await page.locator('[data-calendar-mode="self"]').getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#archiveSearch').count(), 1);
      assert.equal(await page.locator('.archive-export').textContent(), '전체 아카이브 내보내기');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.locator('[data-tab="iron"]').click();
      await page.locator('#screen-iron.iron-root .iron-top .header').waitFor({ timeout: 15000 });
      assert.equal(await page.locator('#screen-iron .iron-subnav .iron-subnav-item').count(), 5);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(report, 'production-iron-390.png'), fullPage: true });
      await page.locator('[data-tab="settings"]').click();
      assert.equal(await page.locator('#reminderConnectBtn').count(), 1);
      assert.equal(await page.locator('#pushStatus').count(), 1);
      await page.locator('[data-tab="trends"]').click();
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(report, 'production-trends-390.png'), fullPage: true });
      console.log(JSON.stringify({ production: true, status: response.status(), questionVisible: true,
        choices: 2, trendsAndArchiveVisible: true, ironTabMounted: true, timetableTab: true, slotBlock: true,
        browserErrors: errors.length, screenshot: path.join(report, 'production-trends-390.png') }));
      return;
    }
    await page.addInitScript(data => {
      if (!localStorage.getItem('h2-routine-v1')) localStorage.setItem('h2-routine-v1', JSON.stringify(data));
    }, seed);
    // 푸시 알림: SW 는 차단돼 있으므로 등록 객체와 Notification 을 가짜로 끼운다(권한 요청은 승인, 구독은 고정 엔드포인트).
    await page.addInitScript(() => {
      const state = { permissionRequests: 0, subscription: null, unsubscribed: 0 };
      window.__qaPush = state;
      const makeSubscription = key => ({
        endpoint: 'https://web.push.apple.com/qa-endpoint', options: { applicationServerKey: key.buffer },
        toJSON: () => ({ endpoint: 'https://web.push.apple.com/qa-endpoint', keys: { p256dh: 'B' + 'q'.repeat(86), auth: 'a'.repeat(22) } }),
        unsubscribe: async () => { state.unsubscribed++; state.subscription = null; return true; }
      });
      const registration = {
        scope: location.origin + '/h2-routine/',
        pushManager: {
          getSubscription: async () => state.subscription,
          subscribe: async options => { state.subscription = makeSubscription(options.applicationServerKey); return state.subscription; }
        }
      };
      Object.defineProperty(navigator.serviceWorker, 'ready', { get: () => Promise.resolve(registration) });
      const FakeNotification = function () {};
      FakeNotification.permission = 'default';
      FakeNotification.requestPermission = async () => { state.permissionRequests++; FakeNotification.permission = 'granted'; return 'granted'; };
      window.Notification = FakeNotification;
    });
    await page.route(api + '/**', async route => {
      const url = route.request().url();
      if (route.request().method() === 'GET') {
        assert(url.endsWith('/push/key'));
        await route.fulfill({ json: { key: vapidKey } });
        return;
      }
      const body = route.request().postDataJSON();
      if (url.endsWith('/pair')) {
        assert.deepEqual(Object.keys(body).sort(), ['code', 'subscription']);
        assert.equal(body.subscription.endpoint, 'https://web.push.apple.com/qa-endpoint');
        sent.push({ pair: true });
        await route.fulfill({ json: { token: 'qa-device-token' } });
      } else if (url.endsWith('/push/unsubscribe')) {
        assert.deepEqual(body, { endpoint: 'https://web.push.apple.com/qa-endpoint' });
        sent.push({ unsubscribe: true });
        await route.fulfill({ json: { ok: true } });
      } else if (url.endsWith('/push/subscribe')) {
        assert.equal(body.subscription.endpoint, 'https://web.push.apple.com/qa-endpoint');
        sent.push({ subscribe: true });
        await route.fulfill({ json: { ok: true } });
      } else {
        assert(url.endsWith('/answer'));
        assert.deepEqual(Object.keys(body).sort(), ['answered', 'day', 'routine']);
        assert.equal(typeof body.routine, 'boolean');
        sent.push(body);
        await route.fulfill({ json: { ok: true } });
      }
    });
    await page.goto('http://127.0.0.1:' + server.address().port + '/h2-routine/', { waitUntil: 'networkidle' });
    assert.equal(await page.locator('#reflection [aria-pressed="true"]').count(), 0);
    assert.equal(sent.length, 0);
    const placement = await page.evaluate(() => ({
      reflection: document.getElementById('reflection').getBoundingClientRect().top,
      chips: document.querySelector('#screen-today .chips').getBoundingClientRect().top
    }));
    assert(placement.reflection < placement.chips);

    await page.getByRole('button', { name: 'X 만족하지 못했다', exact: true }).click();
    const reason = '정말 하고 싶었던 일을 미뤘다.\n스스로 세운 기준에 미치지 못했다.';
    await page.locator('#reflectionReason').fill(reason);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('#reflectionReason').inputValue(), reason);
    await page.getByRole('button', { name: 'O 만족했다', exact: true }).click();
    assert.equal(await page.locator('#reflectionReason').count(), 0);
    await page.getByRole('button', { name: 'X 만족하지 못했다', exact: true }).click();
    assert.equal(await page.locator('#reflectionReason').inputValue(), reason);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('h2-routine-v1')));
    assert.deepEqual(saved.days['2026-08-19'], oldRecord);
    assert.equal(saved.days[date].self, 'x');

    await page.locator('[data-tab="trends"]').click();
    assert((await page.locator('.reflection-stats').innerText()).includes('50%'));
    await page.locator('#calGrid [data-day="' + date + '"]').click();
    assert((await page.locator('#reflectionDay').innerText()).includes(reason));
    assert.equal(await page.locator('#archiveEntries article').count(), 3);
    assert((await page.locator('#reflectionArchive').innerText()).includes(oldRecord.selfReason));
    await page.locator('#archiveSearch').fill('오래된');
    assert.equal(await page.locator('#archiveEntries article').count(), 1);
    await page.locator('#calPrev').click();
    assert.equal(await page.locator('#archiveSearch').inputValue(), '오래된');
    await page.locator('#archiveSearch').fill('');
    await page.locator('#archiveMonth').selectOption('2026-08');
    assert.equal(await page.locator('#archiveEntries article').count(), 2);
    // 내보내기는 화면 필터와 무관하게 전체 기간의 사유를 담는다.
    const [archiveDownload] = await Promise.all([
      page.waitForEvent('download'), page.getByRole('button', { name: '전체 아카이브 내보내기', exact: true }).click()
    ]);
    const archiveText = fs.readFileSync(await archiveDownload.path(), 'utf8');
    assert(archiveText.includes(oldRecord.selfReason));
    assert(archiveText.includes(reason.split('\n')[0]));
    assert(archiveText.includes('현재 O · 보관된 X 사유'));
    await page.locator('#archiveMonth').selectOption('all');
    await page.locator('#calNext').click();
    await page.locator('[data-calendar-mode="routine"]').click();
    assert.equal(await page.locator('#routineStreaks').isVisible(), true);
    await page.locator('[data-calendar-mode="self"]').click();
    assert.equal(await page.locator('#routineStreaks').isVisible(), false);

    await page.locator('[data-tab="settings"]').click();
    // 연결 전 + 푸시 지원 → 버튼 하나로 권한 요청, 구독, 연결(구독 동봉)까지. 켜짐 상태와 끄기까지 확인.
    assert.equal(await page.locator('#reminderConnectBtn').textContent(), '연결하고 알림 켜기');
    assert((await page.locator('#pushStatus').textContent()).includes('연결하면 이 기기로 앱 알림'));
    assert.equal(await page.locator('#pushEnableBtn').isVisible(), false);
    await page.locator('#reminderConnectCode').fill('https://woogeun1221-svg.github.io/h2-routine/#reminder=' + 'a'.repeat(43));
    await page.getByRole('button', { name: '연결하고 알림 켜기', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('reminderSettingsStatus').textContent.includes('응답 전달됨'));
    await page.waitForFunction(() => document.getElementById('pushStatus').textContent.includes('이 기기로 앱 알림이 옵니다'));
    assert.equal(await page.evaluate(() => window.__qaPush.permissionRequests), 1);
    assert.equal(await page.evaluate(() => localStorage.getItem('h2-routine-push-endpoint')), 'https://web.push.apple.com/qa-endpoint');
    assert(sent.some(entry => entry.pair));
    assert.deepEqual(sent.filter(entry => entry.day).at(-1), { day: date, answered: true, routine: sent.filter(entry => entry.day).at(-1).routine });
    assert.equal(await page.locator('#reminderConnectBtn').textContent(), '이 기기 연결');
    assert.equal(await page.locator('#pushDisableBtn').isVisible(), true);
    await page.locator('#pushDisableBtn').click();
    await page.waitForFunction(() => document.getElementById('pushStatus').textContent.includes('꺼짐'));
    assert.equal(await page.evaluate(() => window.__qaPush.unsubscribed), 1);
    assert(sent.some(entry => entry.unsubscribe));
    assert.equal(await page.locator('#pushEnableBtn').isVisible(), true);
    await page.locator('#pushEnableBtn').click();
    await page.waitForFunction(() => document.getElementById('pushStatus').textContent.includes('이 기기로 앱 알림이 옵니다'));
    assert(sent.some(entry => entry.subscribe));
    assert.equal(await page.locator('#pushEnableBtn').isVisible(), false);
    await page.screenshot({ path: path.join(report, 'settings-390.png'), fullPage: true });
    const [backupDownload] = await Promise.all([
      page.waitForEvent('download'), page.getByRole('button', { name: '백업 파일로 내보내기', exact: true }).click()
    ]);
    const backup = JSON.parse(fs.readFileSync(await backupDownload.path(), 'utf8'));
    assert.deepEqual(backup.days['2026-08-19'], oldRecord);
    assert.equal(backup.days[date].selfReason, reason);
    await page.locator('[data-tab="today"]').click();
    await page.getByRole('button', { name: '선택 취소', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('reminderStatus').textContent.includes('미응답이면'));
    assert.equal(sent.filter(entry => entry.day).at(-1).answered, false);
    await page.getByRole('button', { name: 'X 만족하지 못했다', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('reminderStatus').textContent.includes('응답 전달됨'));

    // 헬스 탭: Iron Terminal 이 embedded 셸로 뜨고(헤더+보조 메뉴, 하단 네비 없음),
    // 루틴 화면의 버튼 스타일은 Iron CSS 에 오염되지 않아야 한다.
    const routineTabFont = await page.locator('.tabbar .tab').first().evaluate(el => getComputedStyle(el).fontFamily);
    await page.locator('[data-tab="iron"]').click();
    await page.locator('#screen-iron.iron-root .iron-top .header').waitFor();
    assert.equal(await page.locator('#screen-iron .iron-subnav .iron-subnav-item').count(), 5);
    assert.equal(await page.locator('#screen-iron .bottomnav').count(), 0);
    assert((await page.locator('#screen-iron .header').innerText()).includes('상체'));
    assert.equal(await page.locator('#screen-iron').getByRole('button', { name: '예전 기록 이사' }).count(), 0);
    await page.locator('#screen-iron .iron-subnav-item.is-input').click();
    assert.equal(await page.locator('#screen-iron .iron-subnav-item.is-input').getAttribute('aria-selected'), 'true');
    // 세트 수 조정: 기본 4세트 → 추가 5 → 삭제 4. 카드 머리의 세트 수도 따라간다.
    const firstCard = page.locator('#screen-iron .input-screen .card').first();
    await firstCard.locator('.set-row').first().waitFor();   // 드래프트는 effect 뒤에 그려진다
    assert.equal(await firstCard.locator('.set-row').count(), 4);
    await firstCard.getByRole('button', { name: '세트 추가' }).click();
    assert.equal(await firstCard.locator('.set-row').count(), 5);
    assert((await firstCard.locator('.card-sub').innerText()).includes('5세트'));
    await firstCard.locator('.set-remove').last().click();
    assert.equal(await firstCard.locator('.set-row').count(), 4);
    await page.locator('#screen-iron .iron-subnav-item').first().click();
    assert.equal(await page.locator('.tabbar .tab').first().evaluate(el => getComputedStyle(el).fontFamily), routineTabFont);
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).fontFamily.includes('IBM Plex Sans KR')), true);
    for (const width of [390, 320, 1200]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(report, 'iron-' + width + '.png'), fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-tab="today"]').click();
    assert.equal(await page.locator('#screen-iron').isVisible(), false);
    assert.equal(await page.locator('#cards .card').count(), 7); // 일간 3(푸쉬업, 턱걸이, 독서) + 송은 + 가슴 펴기 + 투자 원칙 + 손익비 스냅샷
    assert((await page.locator('#cards .card').nth(1).innerText()).includes('턱걸이'));
    // 가슴 펴기(2026-11-03 추가): 송은 다음 카드. O를 누르면 c='o' 저장과 O 플래그, 다시 누르면 미응답으로. 활성일(오늘) 전인 어제엔 카드가 없다.
    const postureCard = page.locator('[data-check="c"]');
    assert.equal(await page.locator('#cards .card').nth(4).getAttribute('data-check'), 'c');
    assert((await postureCard.locator('.card-name').innerText()).includes('가슴 펴기'));
    assert.deepEqual(await postureCard.locator('.btn').allInnerTexts(), ['O 폈다', 'X 움츠렸다']);
    await postureCard.locator('.btn', { hasText: 'O 폈다' }).click();
    assert.equal(await postureCard.locator('.done-flag').innerText(), 'O');
    let postureStored = await page.evaluate(() => JSON.parse(localStorage.getItem('h2-routine-v1')));
    assert.equal(postureStored.days[date].c, 'o');
    assert.equal(postureStored.postureStart, date);
    await postureCard.locator('.btn', { hasText: 'O 폈다' }).click();
    postureStored = await page.evaluate(() => JSON.parse(localStorage.getItem('h2-routine-v1')));
    assert.equal(postureStored.days[date].c, null);
    assert.equal(await postureCard.locator('.done-flag').count(), 0);
    // 손익비 스냅샷: 투자 원칙과 독립 토글, rr=true 로 저장, 취소하면 지워진다. 링크는 새 탭.
    const rrCard = page.locator('[data-weekly="rr"]');
    assert.equal(await rrCard.locator('.weekly-link').getAttribute('target'), '_blank');
    assert.equal(await page.locator('[data-weekly="i"] .weekly-btn').getAttribute('aria-pressed'), 'false');
    await rrCard.locator('.weekly-btn').click();
    assert.equal(await rrCard.locator('.done-flag').innerText(), '주간 완료');
    assert.equal(await page.locator('[data-weekly="i"] .weekly-btn').getAttribute('aria-pressed'), 'false');
    let rrStored = await page.evaluate(() => JSON.parse(localStorage.getItem('h2-routine-v1')));
    assert.equal(rrStored.days[date].rr, true);
    assert.equal(rrStored.days[date].i, undefined);
    assert.equal(rrStored.rrSnapshotStart, date);
    await rrCard.locator('.weekly-btn').click();
    rrStored = await page.evaluate(() => JSON.parse(localStorage.getItem('h2-routine-v1')));
    assert.equal(rrStored.days[date].rr, undefined);
    assert.equal((await page.locator('#cards .card').nth(0).innerText()).includes('스쿼트'), false);
    assert.deepEqual(await page.locator('#cards .card').nth(0).locator('.btn:not(.undo)').allInnerTexts(), ['+5', '+10', '+25']);
    assert.equal(await page.locator('#reflection .reflection-motto').textContent(), '컨트롤 할 수 있는 건 오로지 나뿐');

    // 과거 날짜 수정: ◀ 로 어제 → 안내 표시, 어제 카드엔 은퇴 전 스쿼트가 있고 턱걸이(오늘 활성)는 없다.
    // +5 는 어제 기록에 쓰이고 오늘 기록은 그대로. 14일 칸으로 돌아오기, '오늘로' 로 복귀.
    assert.equal(await page.locator('#editNotice').isVisible(), false);
    assert.equal(await page.locator('#dayNext').isDisabled(), true);
    await page.locator('#dayPrev').click();
    assert.equal(await page.locator('#editNotice').isVisible(), true);
    assert((await page.locator('#editNoticeText').innerText()).includes('기록을 수정하는 중'));
    assert.equal(await page.locator('#dayNext').isDisabled(), false);
    assert.equal(await page.locator('#reminderStatus').count(), 0);
    let names = await page.locator('#cards .card-name').allInnerTexts();
    assert(names[1].includes('스쿼트'));
    assert.equal(names.some(n => n.includes('턱걸이')), false);
    assert.equal(names.some(n => n.includes('가슴 펴기')), false);
    await page.locator('#cards .card').nth(0).locator('.btn', { hasText: '+5' }).click();
    await page.locator('#cards .card').nth(1).locator('.btn', { hasText: '+50' }).click();
    let stored = await page.evaluate(() => JSON.parse(localStorage.getItem('h2-routine-v1')));
    assert.equal(stored.days[yesterdayStr].p, 5);
    assert.equal(stored.days[yesterdayStr].s, 50);
    assert.equal(stored.days[date].p, 30);
    assert.equal(stored.squatEnd, date);
    assert.equal(await page.locator('#strip .day.selected').count(), 1);
    await page.locator('#strip .day').nth(13).click(); // 오늘 칸
    assert.equal(await page.locator('#editNotice').isVisible(), false);
    assert.equal((await page.locator('#cards .card').nth(0).locator('.card-val').innerText()).startsWith('30'), true);
    await page.locator('#strip .day').nth(12).click(); // 어제 칸
    assert.equal(await page.locator('#editNotice').isVisible(), true);
    assert.equal((await page.locator('#cards .card').nth(0).locator('.card-val').innerText()).startsWith('5'), true);
    await page.locator('#todayBtn').click();
    assert.equal(await page.locator('#editNotice').isVisible(), false);
    assert.equal(await page.locator('#strip .day.selected').count(), 0);
    names = await page.locator('#cards .card-name').allInnerTexts();
    assert(names[1].includes('턱걸이'));
    // v2: 시드에 활성일이 없으니 오늘 처음 연 날로 이행 → 슬롯 블록이 보이고 카드 수(7)는 그대로
    assert.equal(await page.locator('#slotBlock').isVisible(), true);
    assert.equal(await page.locator('#weekNo').textContent(), 'W' + isoWeekOf(date));
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('h2-routine-v1')))).exerciseSlotStart, date);
    await page.locator('[data-tab="plan"]').click();
    assert((await page.locator('#planWeeks [aria-pressed="true"]').innerText()).startsWith(isWeekendDs(date) ? '다음 주' : '이번 주'));
    await page.locator('[data-tab="today"]').click();
    await page.setViewportSize({ width: 320, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(report, 'today-320.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#dayPrev').click();
    await page.screenshot({ path: path.join(report, 'today-past-390.png'), fullPage: true });
    await page.locator('#todayBtn').click();
    await page.screenshot({ path: path.join(report, 'today-390.png'), fullPage: true });

    await page.locator('[data-tab="trends"]').click();
    for (const width of [390, 320, 1200]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(report, 'trends-' + width + '.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);
    const v2 = await v2Scenario(browser, 'http://127.0.0.1:' + server.address().port);
    console.log(JSON.stringify({ passed: true, widths: [390, 320, 1200], browserErrors: errors.length,
      legacyRecordsPreserved: true, reasonReloaded: true, crossMonthArchiveAndDownloads: true, ironTabMounted: true,
      pastDayEdit: true, squatRetired: true, rrSnapshotWeekly: true, pushSubscribeFlow: true, apiMocked: true, ...v2, screenshots: report }));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
