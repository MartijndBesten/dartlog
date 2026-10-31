// De iPhone-app in de browser nagebootst: een nep-Capacitor met Filesystem, Share, Haptics, StatusBar en
// SplashScreen. Test de app-laag (js/native.js, js/boot.js) snel en zonder Mac; de echte app draait in
// .github/workflows/ios.yml in de iOS-simulator (tools/ios/smoke.sh).
import { test, expect } from '@playwright/test';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'iphone', 'app-laag: één toestelformaat is genoeg'));

// Nep-bestandssysteem in sessionStorage: overleeft herladen en het wissen van localStorage (zoals de echte app).
const fakeCapacitor = () => {
  const FS = '__fakefs';
  const fs = () => JSON.parse(sessionStorage.getItem(FS) || '{}');
  const put = (k, v) => { const f = fs(); f[k] = v; sessionStorage.setItem(FS, JSON.stringify(f)); };
  const log = (k, v) => { const l = JSON.parse(sessionStorage.getItem(k) || '[]'); l.push(v); sessionStorage.setItem(k, JSON.stringify(l)); };
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
    Plugins: {
      Filesystem: {
        readFile: async ({ path, directory }) => { const v = fs()[directory + '/' + path]; if (v == null) throw new Error('File does not exist'); return { data: v }; },
        writeFile: async ({ path, directory, data }) => { put(directory + '/' + path, data); return { uri: 'file:///' + directory + '/' + path }; },
        mkdir: async () => {},
        readdir: async ({ path, directory }) => { const pre = directory + '/' + path + '/'; const files = Object.keys(fs()).filter(k => k.startsWith(pre)).map(k => ({ name: k.slice(pre.length) })); if (!files.length) throw new Error('Directory does not exist'); return { files }; },
        getUri: async ({ path, directory }) => ({ uri: 'file:///' + directory + '/' + path }),
      },
      Share: { share: async o => log('__shared', o) },
      Haptics: { impact: async o => log('__haptics', o), notification: async o => log('__haptics', o) },
      StatusBar: { setStyle: async o => log('__status', o.style) },
      SplashScreen: { hide: async () => sessionStorage.setItem('__splash', 'weg') },
      App: { addListener: () => Promise.resolve({ remove() {} }) },
    },
  };
};
const fakeFs = page => page.evaluate(() => JSON.parse(sessionStorage.getItem('__fakefs') || '{}'));
const logged = (page, k) => page.evaluate(k => JSON.parse(sessionStorage.getItem(k) || '[]'), k);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(fakeCapacitor);
});

test('nieuwe app: Trainingen ophalen bovenaan, startscherm weg, geen serviceworker en geen installatieadvies', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('fetch-card')).toBeVisible();
  await expect(page.getByTestId('fetch-card')).toContainText('naar deze app');
  const order = await page.evaluate(() => [...document.querySelectorAll('.welcome > *')].map(e => e.dataset.testid || e.tagName));
  expect(order.indexOf('fetch-card')).toBeLessThan(order.indexOf('FORM'));
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('__splash'))).toBe('weg');
  await page.fill('#wname', 'Mila');
  await page.click('text=Let\'s play darts');
  await page.click('.tabbar [data-go=more]');
  await expect(page.getByTestId('install-help')).toHaveCount(0);
  await expect(page.locator('[data-act=export]')).toHaveCount(0);
  await expect(page.locator('[data-act=backup-share]')).toHaveText(/Back-up bewaren in Bestanden/);
  expect(await page.evaluate(async () => (await navigator.serviceWorker?.getRegistrations?.() || []).length)).toBe(0);
});

test('duurzame kopie: na het wissen van de webviewopslag komt alles terug, ook het online profiel', async ({ page }) => {
  await page.goto('/');
  await page.fill('#wname', 'Senn');
  await page.click('text=Let\'s play darts');
  await page.evaluate(() => localStorage.setItem('okkie.community.v1', JSON.stringify({ version: 1, accounts: { x: { handle: 'abcdefabcdef' } } })));
  await page.click('.action.train');
  await page.click('[data-testid=start-score]');
  for (let i = 0; i < 3; i++) { await page.click('.nums [data-act=key][data-arg="20"]'); await page.waitForTimeout(60); }
  // Kopie staat in Library/OKKIE (om en om a/b) met speler, lopende training en online profiel.
  const before = await page.evaluate(() => localStorage.getItem('oche.data'));
  expect(JSON.parse(before).active.training.pending.length + JSON.parse(before).active.training.turns.length).toBeGreaterThan(0);
  const newest = async () => Object.entries(await fakeFs(page)).filter(([k]) => /^LIBRARY\/OKKIE\/opslag-[ab]\.json$/.test(k)).map(([, v]) => JSON.parse(v)).sort((a, b) => b.seq - a.seq)[0];
  await expect.poll(async () => (await newest())?.items['oche.data'], { timeout: 5000 }).toBe(before);
  expect(JSON.parse((await newest()).items['okkie.community.v1']).accounts.x.handle).toBe('abcdefabcdef');
  // iOS ruimt de webviewopslag op; de app start opnieuw.
  await page.evaluate(() => localStorage.clear());
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  await page.reload();
  await expect(page.locator('.play')).toBeVisible();   // lopende training gaat gewoon verder
  expect(logs.some(l => /OKKIE\. opslag teruggezet uit kopie/.test(l))).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('oche.data'))).toBe(before);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('okkie.community.v1')).accounts.x.handle)).toBe('abcdefabcdef');
});

test('back-up via het iOS-deelmenu: echt back-upbestand, terug te zetten', async ({ page }) => {
  await page.goto('/');
  await page.fill('#wname', 'Noor');
  await page.click('text=Let\'s play darts');
  await page.click('.tabbar [data-go=more]');
  await page.click('[data-act=backup-share]');
  await expect.poll(async () => (await logged(page, '__shared')).length).toBe(1);
  const [shared] = await logged(page, '__shared');
  expect(shared.files[0]).toMatch(/^file:\/\/\/CACHE\/delen\/okkie-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const file = (await fakeFs(page))[shared.files[0].replace('file:///', '')];
  const backup = JSON.parse(Buffer.from(file, 'base64').toString('utf8'));
  expect(backup.app).toBe('okkie');
  expect(backup.data.players.map(p => p.name)).toEqual(['Noor']);
});

test('trillen via Haptics en de statusbalk volgt het thema', async ({ page }) => {
  await page.goto('/');
  await page.fill('#wname', 'Daan');
  await page.click('text=Let\'s play darts');
  await page.click('.tabbar [data-go=more]');
  await page.click('[data-act=theme][data-arg=light]');
  await expect.poll(async () => (await logged(page, '__status')).at(-1)).toBe('LIGHT');
  await page.click('[data-act=theme][data-arg=dark]');
  await expect.poll(async () => (await logged(page, '__status')).at(-1)).toBe('DARK');
  await page.click('.tabbar [data-go=home]');
  await page.click('.action.train');
  await page.click('[data-testid=start-score]');
  await page.click('.nums [data-act=key][data-arg="5"]');
  await expect.poll(async () => (await logged(page, '__haptics')).length).toBeGreaterThan(0);
});

test('Darters in de app: de ouderlink wijst naar het openbare adres, niet naar capacitor://', async ({ page }) => {
  await page.goto('/community/');
  const url = await page.evaluate(async () => (await import('/js/native.js')).publicUrl('community/'));
  expect(url).toBe('https://app.okkiedarts.nl/community/');
});
