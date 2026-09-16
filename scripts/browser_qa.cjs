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
const oldRecord = { p: 100, s: 30, r: 20, w: 'o', i: true };
const seed = { startDate: '2026-08-19', investmentReviewStart: '2026-08-19',
  days: { '2026-08-19': oldRecord, [date]: { p: 30, s: 30, r: 5, w: null } } };
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
    await page.locator('#reflectionHistory summary').first().click();
    assert((await page.locator('#reflectionHistory').innerText()).includes(reason));

    await page.locator('[data-tab="settings"]').click();
    await page.locator('#reminderConnectCode').fill('https://woogeun1221-svg.github.io/h2-routine/#reminder=' + 'a'.repeat(43));
    await page.getByRole('button', { name: '이 기기 연결', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('reminderSettingsStatus').textContent.includes('응답 전달됨'));
    assert.deepEqual(sent.at(-1), { day: date, answered: true });
    await page.locator('[data-tab="today"]').click();
    await page.getByRole('button', { name: '선택 취소', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('reminderStatus').textContent.includes('미응답이면'));
    assert.deepEqual(sent.at(-1), { day: date, answered: false });
    await page.getByRole('button', { name: 'X 만족하지 못했다', exact: true }).click();
    await page.waitForFunction(() => document.getElementById('reminderStatus').textContent.includes('응답 전달됨'));

    for (const width of [390, 320, 1200]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(report, 'reflection-' + width + '.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: true, widths: [390, 320, 1200], browserErrors: errors.length,
      legacyRecordsPreserved: true, reasonReloaded: true, apiMocked: true, screenshots: report }));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
