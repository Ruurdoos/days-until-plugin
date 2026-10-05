const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { before, after, test } = require('node:test');
const { chromium } = require('playwright');

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
let browser;
const url = 'http://days-until.test/';

before(async () => {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {})
  });
});

after(async () => {
  await browser?.close();
});

function item(id, groupKey, isArchived = false) {
  return { id, groupKey, isArchived, title: id, targetDate: '2030-01-01' };
}

async function fixture(t, stored) {
  const context = await browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  await page.route(url, (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.addInitScript((initial) => {
    if (!localStorage.getItem('test-seeded')) {
      localStorage.setItem('countdowns', JSON.stringify(initial));
      localStorage.setItem('test-seeded', 'true');
    }
    window.saveCalls = 0;
    window.PluginAPI = {
      loadSyncedData: async (key) => localStorage.getItem(key),
      persistDataSynced: async (value, key) => {
        window.saveCalls++;
        if (window.failSave) throw new Error('Simulated storage failure');
        if (window.delaySave) await new Promise((resolve) => { window.releaseSave = resolve; });
        localStorage.setItem(key, value);
      }
    };
  }, stored);
  await page.goto(url);
  await page.waitForFunction(() => !document.querySelector('#board').textContent.includes('Loading...'));
  return page;
}

async function manage(page) {
  await page.click('#page-menu-button');
  await page.click('#manage-groups-button');
}

async function storedState(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('countdowns')));
}

async function confirmDelete(page, key) {
  await page.click(`[data-delete-group="${key}"]`);
  await page.click('#confirm-group-delete');
  await page.waitForSelector('#group-delete-dialog', { state: 'hidden' });
}

test('custom group deletion removes active and archived items and survives reload', async (t) => {
  const page = await fixture(t, {
    groups: [{ key: 'trip', label: 'Trip' }, { key: 'work', label: 'Work' }],
    items: [item('trip-active', 'trip'), item('trip-archived', 'trip', true), item('other', 'work'), item('base', 'countdown')]
  });
  await manage(page);
  await page.click('[data-delete-group="trip"]');
  assert.match(await page.textContent('#group-delete-warning'), /Trip.*All 2 countdowns.*including archived.*cannot be undone/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'cancel-group-delete');
  await page.click('#confirm-group-delete');
  await page.waitForSelector('#group-delete-dialog', { state: 'hidden' });
  const saved = await storedState(page);
  assert.deepEqual(saved.groups.map((group) => group.key), ['work']);
  assert.deepEqual(saved.items.map((entry) => entry.id), ['other', 'base']);
  await page.reload();
  await manage(page);
  assert.equal(await page.locator('[data-delete-group="trip"]').count(), 0);
  await page.click('#close-group-manager');
  await page.click('#add-button');
  assert.equal(await page.locator('[data-group-key="trip"]').count(), 0);
});

test('cancel, Escape and backdrop dismiss confirmation without saving', async (t) => {
  const initial = { groups: [{ key: 'trip', label: 'Trip' }], items: [item('trip', 'trip')] };
  const page = await fixture(t, initial);
  await manage(page);
  for (const dismiss of [
    () => page.click('#cancel-group-delete'),
    () => page.keyboard.press('Escape'),
    () => page.locator('#scrim').click({ position: { x: 5, y: 5 } })
  ]) {
    await page.click('[data-delete-group="trip"]');
    await dismiss();
    assert.equal(await page.locator('#group-delete-dialog').isVisible(), false);
    assert.equal(await page.locator('#group-manager').isVisible(), true);
    assert.deepEqual(await storedState(page), initial);
  }
  assert.equal(await page.evaluate(() => window.saveCalls), 0);
});

test('all removable defaults stay deleted across reload and later entry saves', async (t) => {
  const page = await fixture(t, {
    groups: [],
    items: [item('birthday', 'birthday'), item('birthday-archived', 'birthday', true), item('base', 'countdown')]
  });
  await manage(page);
  for (const key of ['birthday', 'anniversary', 'holiday']) {
    await confirmDelete(page, key);
  }
  assert.deepEqual((await storedState(page)).items.map((entry) => entry.id), ['base']);
  await page.reload();
  await manage(page);
  assert.equal(await page.locator('[data-delete-group]').count(), 0);
  await page.click('#close-group-manager');
  await page.click('#add-button');
  assert.equal(await page.locator('#add-menu [data-group-key]').count(), 1);
  await page.click('[data-group-key="countdown"]');
  await page.fill('#title-input', 'New countdown');
  await page.fill('#date-input', '2030-02-01');
  await page.click('#save-button');
  await page.waitForSelector('#editor', { state: 'hidden' });
  assert.deepEqual((await storedState(page)).deletedDefaultGroups, ['birthday', 'anniversary', 'holiday']);
});

test('Countdown and Alle remain protected even with invalid deletion metadata', async (t) => {
  const page = await fixture(t, {
    groups: [{ key: 'all', label: 'All' }, { key: 'alle', label: 'Alle' }],
    items: [item('base', 'countdown')],
    deletedDefaultGroups: ['countdown', 'all', 'alle', 'unknown']
  });
  await manage(page);
  for (const key of ['countdown', 'all', 'alle']) {
    assert.equal(await page.locator(`[data-delete-group="${key}"]`).count(), 0);
    // A forged UI action must also be rejected by the deletion handler.
    await page.evaluate((groupKey) => {
      const button = document.createElement('button');
      button.dataset.deleteGroup = groupKey;
      document.querySelector('#group-list').append(button);
      button.click();
      button.remove();
    }, key);
    assert.equal(await page.locator('#group-delete-dialog').isVisible(), false);
  }
  assert.match(await page.textContent('#group-list'), /Countdown/);
  assert.equal(await page.evaluate(() => window.saveCalls), 0);
});

test('legacy array data loads and supports default group deletion', async (t) => {
  const page = await fixture(t, [item('legacy', 'holiday'), item('base', 'countdown')]);
  await manage(page);
  await confirmDelete(page, 'holiday');
  const saved = await storedState(page);
  assert.deepEqual(saved.items.map((entry) => entry.id), ['base']);
  assert.deepEqual(saved.deletedDefaultGroups, ['holiday']);
});

test('failed save retains group and entries and allows retry', async (t) => {
  const initial = { groups: [], items: [item('birthday', 'birthday')] };
  const page = await fixture(t, initial);
  await manage(page);
  await page.click('[data-delete-group="birthday"]');
  await page.evaluate(() => { window.failSave = true; });
  await page.click('#confirm-group-delete');
  await page.waitForFunction(() => document.querySelector('#group-delete-error').textContent.length > 0);
  assert.deepEqual(await storedState(page), initial);
  assert.equal(await page.locator('#confirm-group-delete').isEnabled(), true);
  assert.equal(await page.locator('#cancel-group-delete').isEnabled(), true);
  await page.click('#cancel-group-delete');
  assert.equal(await page.locator('[data-delete-group="birthday"]').count(), 1);
  await page.evaluate(() => { window.failSave = false; });
  await confirmDelete(page, 'birthday');
  assert.deepEqual((await storedState(page)).items, []);
});

test('pending deletion prevents duplicate saves and dismissal or focus refresh', async (t) => {
  const page = await fixture(t, { groups: [], items: [item('birthday', 'birthday')] });
  await manage(page);
  await page.click('[data-delete-group="birthday"]');
  await page.evaluate(() => { window.delaySave = true; });
  await page.click('#confirm-group-delete');
  assert.equal(await page.locator('#confirm-group-delete').isDisabled(), true);
  assert.equal(await page.locator('#cancel-group-delete').isDisabled(), true);
  await page.keyboard.press('Escape');
  await page.locator('#scrim').click({ position: { x: 5, y: 5 } });
  await page.evaluate(() => {
    document.querySelector('#confirm-group-delete').dispatchEvent(new Event('click'));
    window.dispatchEvent(new Event('focus'));
  });
  assert.equal(await page.locator('#group-delete-dialog').isVisible(), true);
  assert.equal(await page.evaluate(() => window.saveCalls), 1);
  await page.evaluate(() => window.releaseSave());
  await page.waitForSelector('#group-delete-dialog', { state: 'hidden' });
  assert.deepEqual((await storedState(page)).items, []);
});

test('mobile dialog handles long unsafe labels and keeps keyboard focus inside', async (t) => {
  const label = '<img src=x onerror=alert(1)>'.repeat(2);
  const page = await fixture(t, { groups: [{ key: 'trip', label }], items: [] });
  await page.setViewportSize({ width: 320, height: 568 });
  await manage(page);
  assert.equal(await page.locator('#group-list img').count(), 0);
  await page.click('[data-delete-group="trip"]');
  assert.match(await page.textContent('#group-delete-warning'), /All 0 countdowns/);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'confirm-group-delete');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'cancel-group-delete');
  const box = await page.locator('#group-delete-dialog').boundingBox();
  assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 320 && box.y + box.height <= 568);
  await page.click('#confirm-group-delete');
  await page.waitForSelector('#group-delete-dialog', { state: 'hidden' });
  assert.deepEqual((await storedState(page)).groups, []);
});
