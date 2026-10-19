// Optional browser check: node web/cloudflare/tests/shell-navigation-browser.mjs
// Uses the built App Worker with local fixtures; no provider requests or credentials.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import worker from '../app-worker.mjs';

const {chromium} = await import(process.env.BRAZA_PLAYWRIGHT_MODULE || '/workspace/.braza-browser-validation/node_modules/playwright/index.mjs');
const env = {
  REVIEW_USERNAME: 'navigation-review-fixture',
  REVIEW_PASSWORD: 'navigation-password-fixture',
  SESSION_SECRET: 'navigation-session-fixture-1234567890',
  APP_INTERNAL_SECRET: 'navigation-internal-fixture-1234567890',
  ADMIN_SESSION_SECRET: 'navigation-admin-session-fixture-1234567890',
  ADMIN_USERNAME: 'navigation-admin-fixture',
  ADMIN_PASSWORD: 'navigation-admin-password-fixture',
};
const nativeFetch = globalThis.fetch;
const unexpectedNetwork = [];
const metrics = {spend: 123.45, gmv: 987.60, roas: 8, orders: 7, impressions: 123456, clicks: 1234, ctr: 0.01, cost_per_order: 17.64};
const fixtures = {
  '/internal/shopee/status': {connections: [{principal_type: 'shop', principal_id: 900001}]},
  '/internal/shopee/ads/summary': {connected: true, shop: {id: 900001}, balance: 45.67, metrics, daily: [{date: '20261018', expense: 123.45, broad_gmv: 987.60, broad_order: 7}]},
  '/internal/shopee/ads/campaigns': {connected: true, summary: metrics, campaigns: [{campaign_id: 900002, campaign_name: 'Synthetic cotton product campaign with a long descriptive name', status: 'ONGOING', ...metrics}]},
  '/internal/shopee/ads/gms-items': {connected: true, summary: metrics, items: [{item_id: 900003, item_name: 'Synthetic cotton product', ...metrics}]},
  '/internal/shopee/ads/opportunities': {connected: true, items: [], sources: {}},
};
let fixtureReads = 0;
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  if (url.origin === 'https://auth.brazacommerce.com.br' && fixtures[url.pathname]) {
    assert.equal(options.method, 'GET');
    assert.equal(options.headers['X-Braza-App-Key'], env.APP_INTERNAL_SECRET);
    fixtureReads++;
    return Response.json(fixtures[url.pathname]);
  }
  unexpectedNetwork.push(url.origin + url.pathname);
  throw new Error('Unexpected fixture network destination');
};

const server = createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const result = await worker.fetch(new Request('http://' + request.headers.host + request.url, {
      method: request.method,
      headers: request.headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : Buffer.concat(chunks),
    }), env);
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(await result.text());
  } catch (error) {
    response.writeHead(500, {'content-type': 'text/plain'});
    response.end('Fixture request failed');
    console.error(error);
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = 'http://localhost:' + server.address().port;
let browser;
const checks = [];
const passed = name => {
  checks.push(name);
  if (process.env.BRAZA_NAV_TRACE) console.log(name);
};
async function noOverflow(page, width, state) {
  const dimensions = await page.locator('html').evaluate(node => ({scrollWidth: node.scrollWidth, clientWidth: node.clientWidth}));
  assert.equal(dimensions.clientWidth, width);
  assert.ok(dimensions.scrollWidth <= dimensions.clientWidth, JSON.stringify({width, ...dimensions, state}));
}
async function signIn(page, path = '/dashboard') {
  await page.goto(base + '/');
  await page.locator('[name="username"]').fill(env.REVIEW_USERNAME);
  await page.locator('[name="password"]').fill(env.REVIEW_PASSWORD);
  await page.getByRole('button', {name: 'Sign in', exact: true}).click();
  await page.waitForURL(base + '/dashboard');
  if (path !== '/dashboard') await page.goto(base + path);
}
async function menuInFlow(page) {
  const positions = await page.locator('.shell-mobile-navigation').evaluate(header => {
    const controls = [...header.querySelectorAll('.mobile-brand,.mobile-admin,summary')].map(node => node.getBoundingClientRect());
    return {
      headerWidth: header.getBoundingClientRect().width,
      viewport: document.documentElement.clientWidth,
      headerBottom: header.getBoundingClientRect().bottom,
      mainTop: document.querySelector('.app').getBoundingClientRect().top,
      navTop: header.querySelector('nav').getBoundingClientRect().top,
      controlsBottom: Math.max(...controls.map(box => box.bottom)),
    };
  });
  assert.equal(positions.headerWidth, positions.viewport);
  assert.ok(positions.navTop >= positions.controlsBottom - 1, JSON.stringify(positions));
  assert.ok(positions.mainTop >= positions.headerBottom - 1, JSON.stringify(positions));
}
async function tablePansLocally(page) {
  const table = page.locator('.table-wrap').first();
  assert.ok(await table.locator('tbody tr').count() > 0);
  const dimensions = await table.evaluate(node => {
    node.scrollLeft = node.scrollWidth;
    const box = node.getBoundingClientRect();
    const lastCell = node.querySelector('tbody tr:last-child td:last-child').getBoundingClientRect();
    return {
      client: node.clientWidth, scroll: node.scrollWidth, pan: node.scrollLeft,
      overflow: getComputedStyle(node).overflowX,
      right: box.right, cellRight: lastCell.right, cellWidth: lastCell.width,
      viewport: document.documentElement.clientWidth,
    };
  });
  assert.equal(dimensions.overflow, 'auto');
  assert.ok(dimensions.scroll > dimensions.client, JSON.stringify(dimensions));
  assert.ok(dimensions.pan > 0, JSON.stringify(dimensions));
  assert.ok(dimensions.right <= dimensions.viewport, JSON.stringify(dimensions));
  assert.ok(dimensions.cellRight <= dimensions.right + 1 && dimensions.cellWidth > 0, JSON.stringify(dimensions));
  await table.evaluate(node => { node.scrollLeft = 0; });
}
try {
  browser = await chromium.launch({executablePath: process.env.BRAZA_CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--no-proxy-server']});
  for (const width of [320, 360, 390, 768, 850]) {
    const context = await browser.newContext({viewport: {width, height: 844}, javaScriptEnabled: false, isMobile: true, hasTouch: true});
    try {
      const page = await context.newPage();
      await signIn(page);
      const toolbar = page.locator('.shell-mobile-navigation');
      const menu = toolbar.locator('details');
      const summary = menu.locator('summary');
      const admin = toolbar.getByRole('link', {name: 'Administração', exact: true});
      assert.equal(await toolbar.isVisible(), true);
      assert.equal(await page.locator('aside.sidebar').isVisible(), false);
      assert.equal(await admin.isVisible(), true);
      assert.equal(await menu.getAttribute('open'), null);
      await noOverflow(page, width, 'closed');
      if (width <= 390) await tablePansLocally(page);
      await summary.focus();
      await page.keyboard.press('Enter');
      assert.notEqual(await menu.getAttribute('open'), null);
      const links = menu.locator('a');
      assert.equal(await links.count(), 9);
      for (const route of ['/dashboard', '/advertising', '/campaigns', '/gmv-max', '/opportunities', '/performance', '/optimization', '/integrations', '/logout']) {
        const link = menu.locator('a[href="' + route + '"]');
        assert.equal(await link.isVisible(), true, route);
        const bounds = await link.boundingBox();
        assert.ok(bounds.height >= 44, JSON.stringify({width, route, height: bounds.height}));
      }
      for (const control of [summary, admin]) assert.ok((await control.boundingBox()).height >= 44);
      await menuInFlow(page);
      await noOverflow(page, width, 'open');
      if (width === 390) await page.screenshot({path: '/tmp/braza-shell-mobile-navigation.png', fullPage: false});
      await menu.locator('a[href="/campaigns"]').click();
      await page.waitForURL(base + '/campaigns');
      assert.equal(await page.locator('.shell-mobile-navigation details').getAttribute('open'), null);
      await page.locator('.shell-mobile-navigation summary').click();
      await page.locator('.shell-mobile-navigation details a[href="/advertising"]').click();
      await page.waitForURL(base + '/advertising');
      await page.locator('.shell-mobile-navigation').getByRole('link', {name: 'Administração', exact: true}).click();
      await page.waitForURL(base + '/admin/login');
      assert.equal(await page.getByRole('heading', {name: 'Bem-vindo de volta', exact: true}).isVisible(), true);
      assert.equal((await context.cookies()).some(cookie => cookie.name === 'braza_admin'), false);
      await page.goto(base + '/advertising');
      await page.locator('.shell-mobile-navigation summary').click();
      await page.locator('.shell-mobile-navigation a[href="/logout"]').click();
      await page.waitForURL(base + '/');
      assert.equal(await page.getByRole('heading', {name: 'Sign in', exact: true}).isVisible(), true);
      assert.equal((await context.cookies()).some(cookie => cookie.name === 'mls_session'), false);
      passed(width + 'px: populated mobile dashboard, keyboard menu, section changes, admin login boundary and logout work without JavaScript');
    } finally {
      await context.close();
    }
  }
  for (const width of [320, 360, 390]) {
    const context = await browser.newContext({viewport: {width, height: 844}, javaScriptEnabled: false, isMobile: true, hasTouch: true});
    try {
      const page = await context.newPage();
      await signIn(page);
      for (const fontScale of [130, 160]) {
        for (const route of ['/dashboard', '/advertising', '/campaigns', '/gmv-max', '/opportunities', '/performance', '/optimization', '/integrations']) {
          await page.goto(base + route);
          await page.locator('html').evaluate((node, scale) => {
            node.style.webkitTextSizeAdjust = scale + '%';
            node.style.textSizeAdjust = scale + '%';
          }, fontScale);
          await noOverflow(page, width, route + ' text ' + fontScale + '% closed');
          const summary = page.locator('.shell-mobile-navigation summary');
          await summary.click({timeout: 2000});
          assert.notEqual(await page.locator('.shell-mobile-navigation details').getAttribute('open'), null);
          await noOverflow(page, width, route + ' text ' + fontScale + '% open');
          await menuInFlow(page);
          await page.locator('.mobile-admin').click({trial: true, timeout: 2000});
          if (route === '/dashboard') await tablePansLocally(page);
          await summary.click({timeout: 2000});
          assert.equal(await page.locator('.shell-mobile-navigation details').getAttribute('open'), null);
        }
        passed(width + 'px at ' + fontScale + '% text: all eight populated sections fit, menu controls stay tappable, tables pan locally and the open menu pushes content down');
      }
    } finally {
      await context.close();
    }
  }
  for (const width of [851, 1365]) {
    const context = await browser.newContext({viewport: {width, height: 950}, javaScriptEnabled: false});
    try {
      const page = await context.newPage();
      await signIn(page, '/advertising');
      assert.equal(await page.locator('.shell-mobile-navigation').isVisible(), false);
      assert.equal(await page.locator('aside.sidebar').isVisible(), true);
      assert.equal(await page.locator('aside.sidebar').getByRole('link', {name: 'Administração', exact: true}).isVisible(), true);
      assert.equal(await page.getByRole('link', {name: 'Administração', exact: true}).count(), 1);
      await noOverflow(page, width, 'desktop');
      if (width === 1365) await page.screenshot({path: '/tmp/braza-shell-desktop-navigation.png', fullPage: false});
      passed(width + 'px: existing desktop navigation stays visible without a duplicate mobile toolbar');
    } finally {
      await context.close();
    }
  }
  assert.ok(fixtureReads > 0);
  assert.deepEqual(unexpectedNetwork, []);
  console.log(JSON.stringify({status: 'PASS', checks, widths: [320, 360, 390, 768, 850, 851, 1365], mobileTextScales: [130, 160], javaScriptEnabled: false, providerRequests: 0, fixtureReads, screenshots: ['/tmp/braza-shell-mobile-navigation.png', '/tmp/braza-shell-desktop-navigation.png']}, null, 2));
} finally {
  globalThis.fetch = nativeFetch;
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
