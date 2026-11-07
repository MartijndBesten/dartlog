// De Android-app in de browser nagebootst (nep-Capacitor met platform 'android'): terugknop en Android-teksten.
// De echte app start in .github/workflows/android.yml in de Android-emulator (tools/android/smoke.sh).
import { test, expect } from '@playwright/test';

test.beforeEach(({}, info) => test.skip(info.project.name !== 'android', 'app-laag: één toestelformaat is genoeg'));

const fakeAndroid = () => {
  window.__back = [];
  window.__appCalls = [];
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    Plugins: {
      App: {
        addListener: (ev, fn) => { if (ev === 'backButton') window.__back.push(fn); return Promise.resolve({ remove() {} }); },
        minimizeApp: async () => window.__appCalls.push('minimize'),
        exitApp: async () => window.__appCalls.push('exit'),
      },
      Share: { share: async () => {} },
      Haptics: { impact: async () => {}, notification: async () => {} },
      StatusBar: { setStyle: async () => {} },
      SplashScreen: { hide: async () => {} },
    },
  };
};
const seed = { version: 2, activePlayerId: 'p1', players: [{ id: 'p1', name: 'Anouk', color: '#3ddc84', createdAt: '2026-11-01T10:00:00Z' }],
  trainings: [], matches: [], settings: { theme: 'dark', sound: false, vibrate: false }, active: { training: null, match: null } };
const back = page => page.evaluate(() => window.__back.forEach(fn => fn({ canGoBack: false })));

test('terugknop: van een tabblad naar het startscherm, op het startscherm de app naar de achtergrond; Android-teksten', async ({ page }) => {
  await page.addInitScript(([fake, d]) => { eval('(' + fake + ')()'); if (!localStorage.getItem('oche.data')) localStorage.setItem('oche.data', JSON.stringify(d)); }, [fakeAndroid.toString(), seed]);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('.hero h2')).toHaveText('Anouk');
  await expect.poll(() => page.evaluate(() => window.__back.length)).toBe(1);
  // Meer: geen iPhone/iCloud in de Android-app.
  await page.click('.tabbar [data-go=more]');
  await expect(page.locator('[data-act=backup-share]')).toHaveText(/Back-up bewaren of delen/);
  await expect(page.locator('main')).not.toContainText('iCloud');
  await expect(page.locator('main')).toContainText('Android-back-up');
  // Terug: naar het startscherm.
  await back(page);
  await expect(page.locator('.hero h2')).toHaveText('Anouk');
  expect(await page.evaluate(() => window.__appCalls)).toEqual([]);
  // Op het startscherm: app naar de achtergrond (niet afsluiten).
  await back(page);
  expect(await page.evaluate(() => window.__appCalls)).toEqual(['minimize']);
  expect(errors).toEqual([]);
});
