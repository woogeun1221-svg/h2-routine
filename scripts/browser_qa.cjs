/* 기존 workspace Playwright/Chrome 재사용. 알림 API와 외부 발송은 모의 처리한다. */
const { chromium } = require('/Users/ourteam/projects/holdem-tutor/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const dist = path.resolve(__dirname, '../dist');
const report = '/private/tmp/h2-routine-qa';
const api = 'https://macmini.taile484c7.ts.net/routine-api';
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const oldRecord = { p: 100, s: 30, r: 20, w: 'o', i: true, self: 'x', selfReason: '오래된 사유도 아카이브에 남는다.' };
// 선택 월 O 비율 50% 기대: 이번 달 1일 O + 오늘 X. 9월 고정 날짜는 달이 바뀌면 0%가 돼 깨졌다(2026-10-13).
const firstOfMonth = date.slice(0, 8) + '01';
// pullupStart=오늘: 턱걸이(2026-10-19 추가)는 활성일부터만 판정 — 옛 기록은 세 습관 기준 그대로.
// squatEnd=오늘: 스쿼트(2026-10-29 은퇴)는 오늘부터 판정 제외 — 어제까지의 카드와 판정에는 그대로 남는다.
const yesterday = new Date(date + 'T12:00:00+09:00'); yesterday.setDate(yesterday.getDate() - 1);
const yesterdayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(yesterday);
// rrSnapshotStart=오늘: 손익비 스냅샷(2026-10-29 추가) 주간 카드는 활성일부터.
const seed = { startDate: '2026-08-19', investmentReviewStart: '2026-08-19', rrSnapshotStart: date, pullupStart: date, squatEnd: date,
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

(async () => {
  fs.mkdirSync(report, { recursive: true });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  try {
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
      assert.equal(await page.locator('#cards .card').count(), 6); // 일간 3(스쿼트 은퇴) + 송은 + 투자 원칙 + 손익비 스냅샷
      assert((await page.locator('[data-weekly="rr"]').innerText()).includes('손익비 스냅샷'));
      assert.equal(await page.locator('#cards .card .btn').first().textContent(), '+5');
      assert.equal(await page.locator('#dayPrev').isVisible(), true);
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
      await page.locator('[data-tab="trends"]').click();
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(report, 'production-trends-390.png'), fullPage: true });
      console.log(JSON.stringify({ production: true, status: response.status(), questionVisible: true,
        choices: 2, trendsAndArchiveVisible: true, ironTabMounted: true, browserErrors: errors.length, screenshot: path.join(report, 'production-trends-390.png') }));
      return;
    }
    await page.addInitScript(data => {
      if (!localStorage.getItem('h2-routine-v1')) localStorage.setItem('h2-routine-v1', JSON.stringify(data));
    }, seed);
    await page.route(api + '/**', async route => {
      const body = route.request().postDataJSON();
      if (route.request().url().endsWith('/pair')) {
        assert.deepEqual(Object.keys(body), ['code']);
        await route.fulfill({ json: { token: 'qa-device-token' } });
      } else {
        assert.deepEqual(Object.keys(body).sort(), ['answered', 'day']);
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
    await page.locator('#reminderConnectCode').fill('https://woogeun1221-svg.github.io/h2-routine/#reminder=' + 'a'.repeat(43));
    await page.getByRole('button', { name: '이 기기 연결', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('reminderSettingsStatus').textContent.includes('응답 전달됨'));
    assert.deepEqual(sent.at(-1), { day: date, answered: true });
    const [backupDownload] = await Promise.all([
      page.waitForEvent('download'), page.getByRole('button', { name: '백업 파일로 내보내기', exact: true }).click()
    ]);
    const backup = JSON.parse(fs.readFileSync(await backupDownload.path(), 'utf8'));
    assert.deepEqual(backup.days['2026-08-19'], oldRecord);
    assert.equal(backup.days[date].selfReason, reason);
    await page.locator('[data-tab="today"]').click();
    await page.getByRole('button', { name: '선택 취소', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('reminderStatus').textContent.includes('미응답이면'));
    assert.deepEqual(sent.at(-1), { day: date, answered: false });
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
    assert.equal(await page.locator('#cards .card').count(), 6); // 일간 3(푸쉬업, 턱걸이, 독서) + 송은 + 투자 원칙 + 손익비 스냅샷
    assert((await page.locator('#cards .card').nth(1).innerText()).includes('턱걸이'));
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
    console.log(JSON.stringify({ passed: true, widths: [390, 320, 1200], browserErrors: errors.length,
      legacyRecordsPreserved: true, reasonReloaded: true, crossMonthArchiveAndDownloads: true, ironTabMounted: true,
      pastDayEdit: true, squatRetired: true, rrSnapshotWeekly: true, apiMocked: true, screenshots: report }));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
