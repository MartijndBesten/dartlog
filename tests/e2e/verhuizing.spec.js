import { test, expect } from '@playwright/test';

// Verhuizing naar app.okkiedarts.nl met twee echte, gescheiden browser-origins (eigen opslag), net als in het echt:
// OUD = http://localhost:4173 (speelt martijndbesten.github.io/dartlog), NIEUW = http://127.0.0.1:4173 (speelt app.okkiedarts.nl).
// Let op: dit is een gesimuleerde telefoon in Chromium. Safari op een echte iPhone (klembord, beginscherm-opslag)
// moet apart op een toestel worden getest; zie VERHUIZING.md.
const OLD = 'http://localhost:4173';
const NEW = 'http://127.0.0.1:4173';
const DEV = { transfer: { oldOrigin: OLD, oldPath: '/', newApp: NEW + '/', open: true }, install: true };
const at = (d, h = 18) => new Date(Date.UTC(2026, 9, d, h)).toISOString();
const SEED = {
  version: 2, activePlayerId: 'p1',
  players: [{ id: 'p1', name: 'Senn', color: '#3ddc84', createdAt: at(1) }, { id: 'p2', name: 'Mila', color: '#ff5a5f', createdAt: at(1) }],
  trainings: Array.from({ length: 12 }, (_, i) => ({ id: 't' + i, playerId: i % 3 ? 'p1' : 'p2', kind: 'score', limitTurns: 10, startedAt: at(2 + (i % 6)), finishedAt: at(2 + (i % 6), 19),
    turns: Array.from({ length: 10 }, (_, j) => ({ at: at(2 + (i % 6)), darts: j % 2 ? ['T20', 'S5', 'D10'] : ['S20', 'S1', 'T19'] })) })),
  matches: [{ id: 'm1', startedAt: at(7), finishedAt: at(7), settings: { start: 301, bestOf: 1, doubleOut: true }, players: [{ id: 'p1', name: 'Senn' }, { id: 'p2', name: 'Mila' }], legs: [{ starter: 0, turns: [{ p: 0, darts: ['T20', 'T20', 'T20'] }, { p: 1, darts: ['S1', 'S1', 'S1'] }] }] }],
  settings: { theme: 'dark', sound: false, vibrate: false },
  active: { training: { id: 'lopend', playerId: 'p1', players: ['p1'], kind: 'score', limitTurns: 10, startedAt: at(8), turns: [{ at: at(8), darts: ['S20', 'S20', 'S20'], p: 0 }], pending: ['T20'] }, match: null },
};
const ACCOUNT = JSON.stringify({ version: 1, accounts: { p1: { token: 'geheim-p1', nickname: 'SennDarts' } } });

async function phone(browser, info, { clipboard = true, ua } = {}) {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = info.project.use;
  const context = await browser.newContext({ viewport, userAgent: ua || userAgent, deviceScaleFactor, isMobile, hasTouch });
  if (clipboard) for (const origin of [OLD, NEW]) await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await context.addInitScript(([seed, dev, old, acc]) => {
    localStorage.setItem('okkie.dev', JSON.stringify(dev));
    if (location.origin === old && !localStorage.getItem('oche.data')) { localStorage.setItem('oche.data', JSON.stringify(seed)); localStorage.setItem('okkie.community.v1', acc); }
  }, [SEED, DEV, OLD, ACCOUNT]);
  return context;
}
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('oche.data') || 'null'));
// Inhoud per record, niet alleen aantallen
const content = d => JSON.stringify({ players: [...d.players].sort((a, b) => a.id.localeCompare(b.id)), trainings: [...d.trainings].sort((a, b) => a.id.localeCompare(b.id)), matches: d.matches, active: d.active });

test('automatisch: alles komt inhoudelijk gelijk over, ook lopende training en online profiel; oud blijft intact; twee keer = geen dubbele', async ({ browser }, info) => {
  const ctx = await phone(browser, info);
  const oldP = await ctx.newPage();
  const errors = []; oldP.on('pageerror', e => errors.push(e.message));
  await oldP.goto(OLD + '/');
  await oldP.click('[data-act=pause]');                       // lopende training gaat open; eerst pauzeren
  await expect(oldP.getByTestId('move-card')).toContainText('OKKIE. verhuist naar app.okkiedarts.nl');
  const before = await stored(oldP);
  await oldP.getByRole('button', { name: 'Zet mijn trainingen over' }).click();
  await expect(oldP.locator('#modal')).toContainText('2 spelers, 12 trainingen, 1 wedstrijd en een lopende training');
  const [newP] = await Promise.all([ctx.waitForEvent('page'), oldP.getByTestId('transfer-auto').click()]);
  newP.on('pageerror', e => errors.push(e.message));
  await expect(oldP.getByTestId('transfer-sent')).toHaveText('Overgezet en gecontroleerd', { timeout: 20000 });
  await expect(oldP.getByTestId('transfer-sent')).toHaveAttribute('data-status', 'identiek');
  // Nieuwe app: zelfde inhoud (elke pijl), opent op de lopende training, adres zonder #overzetten
  await expect.poll(async () => { const d = await stored(newP); return d && content(d); }).toBe(content(before));
  await expect(newP.getByTestId('transfer-result')).toHaveText('Overgezet en gecontroleerd');
  await expect(newP.getByTestId('transfer-table')).toContainText('Senn');
  expect(newP.url()).not.toContain('overzetten');
  expect(await newP.evaluate(() => JSON.parse(localStorage.getItem('okkie.community.v1')).accounts.p1.token)).toBe('geheim-p1');
  await newP.click('#modal [data-act=modal-close]');
  await expect(newP.getByTestId('live-total')).toHaveText('60');
  // Oude app: niets gewist, niet doorgestuurd, kaart toont "overgezet"
  expect(content(await stored(oldP))).toBe(content(before));
  expect(oldP.url().startsWith(OLD)).toBe(true);
  await oldP.goto(OLD + '/');
  await oldP.click('[data-act=pause]');
  await expect(oldP.getByTestId('move-card')).toContainText('Overgezet naar app.okkiedarts.nl');
  // Nog eens overzetten: geen dubbele
  await newP.close();
  await oldP.getByRole('button', { name: 'Nog eens overzetten' }).click();
  const [newP2] = await Promise.all([ctx.waitForEvent('page'), oldP.getByTestId('transfer-auto').click()]);
  await expect(oldP.getByTestId('transfer-sent')).toHaveAttribute('data-status', 'identiek', { timeout: 20000 });
  const twice = await stored(newP2);
  expect(twice.trainings).toHaveLength(12);
  expect(twice.players).toHaveLength(2);
  expect(content(twice)).toBe(content(before));
  expect(errors).toEqual([]);
  await ctx.close();
});

test('overzetcode (zoals vanuit een geïnstalleerde iPhone-app): nieuwe app al in gebruik, zelfde naam, samenvoegen op verzoek', async ({ browser }, info) => {
  const ctx = await phone(browser, info);
  const oldP = await ctx.newPage();
  await oldP.goto(OLD + '/');
  await oldP.click('[data-act=pause]');
  await oldP.getByRole('button', { name: 'Zet mijn trainingen over' }).click();
  await oldP.getByRole('button', { name: 'Met een overzetcode' }).click();
  const code = await oldP.getByTestId('transfer-code').inputValue();
  expect(code.startsWith('OKKIE-OVERZETTEN-1:')).toBe(true);
  await oldP.getByRole('button', { name: 'Kopieer de code' }).click();
  await expect(oldP.locator('#toast')).toContainText('gekopieerd');
  // Nieuwe app los geopend en al in gebruik door "Senn" (een nieuw ID) met één training
  const newP = await ctx.newPage();
  await newP.goto(NEW + '/');
  await expect(newP.getByTestId('fetch-card')).toBeVisible();
  await newP.fill('#wname', 'Senn');
  await newP.click("text=Let's play darts");
  await newP.locator('#modal [data-act=install-later]').click().catch(() => {});
  await newP.click('.action.train');
  await newP.click('[data-act=setup-turns][data-arg="0"]');
  await newP.click('[data-testid=start-score]');
  for (let i = 0; i < 3; i++) { await newP.click('.nums [data-arg="20"]'); await newP.waitForTimeout(60); }
  await newP.click('[data-act=finish-training]');
  await newP.click('[data-act=modal-ok]');
  await newP.click('.tabbar [data-go=more]');
  await newP.getByTestId('enter-code').click();
  await newP.click('[data-act=transfer-paste]');
  await expect(newP.locator('#modal')).toContainText('In deze code: 2 spelers, 12 trainingen, 1 wedstrijd en een lopende training');
  await expect(newP.getByTestId('transfer-names')).toContainText('Senn, Mila');
  await newP.getByTestId('transfer-apply').click();
  await expect(newP.getByTestId('transfer-result')).toHaveText('Overgezet en gecontroleerd');
  // Online profielsleutel gaat standaard niet mee in een code; dat wordt gemeld
  await expect(newP.getByTestId('transfer-omitted')).toBeVisible();
  expect(await newP.evaluate(() => localStorage.getItem('okkie.community.v1'))).toBeNull();
  // Twee keer "Senn": niet stilzwijgend samengevoegd, wel aangeboden
  await expect(newP.getByTestId('same-name')).toContainText('twee spelers met de naam Senn');
  let d = await stored(newP);
  expect(d.players).toHaveLength(3);
  expect(d.trainings).toHaveLength(13);
  await newP.getByTestId('same-name').getByRole('button', { name: 'Ja, samenvoegen' }).click();
  d = await stored(newP);
  expect(d.players.map(p => p.name).sort()).toEqual(['Mila', 'Senn']);
  expect(d.trainings).toHaveLength(13);
  expect(d.trainings.filter(t => t.playerId === 'p1')).toHaveLength(9);   // 8 oude + 1 nieuwe
  // Hier liep geen training: de lopende training van de oude app is overgenomen
  expect(d.active.training?.id).toBe('lopend');
  // Dezelfde code nog eens: niets dubbel
  await newP.goto(NEW + '/');
  await newP.click('[data-act=pause]');
  await newP.click('.tabbar [data-go=more]');
  await newP.getByTestId('enter-code').click();
  await newP.fill('[data-testid=transfer-input]', code);
  await newP.getByRole('button', { name: 'Controleren' }).click();
  await newP.getByTestId('transfer-apply').click();
  // Bij samenvoegen bleef de overgezette Senn (p1) staan: dezelfde code is daarna nog steeds identiek, niets dubbel
  await expect(newP.getByTestId('transfer-result')).toHaveAttribute('data-status', 'identiek');
  expect((await stored(newP)).trainings).toHaveLength(13);
  expect((await stored(newP)).players).toHaveLength(2);
  await ctx.close();
});

test('beschadigde code en back-upbestand: geweigerd of gecontroleerd teruggezet', async ({ browser }, info) => {
  const ctx = await phone(browser, info, { clipboard: false });
  const newP = await ctx.newPage();
  await newP.goto(NEW + '/');
  await newP.getByTestId('fetch-card').getByRole('button', { name: 'Trainingen ophalen' }).click();
  await newP.fill('[data-testid=transfer-input]', 'OKKIE-OVERZETTEN-1:z:H4sIAAAAAAAA');
  await newP.getByRole('button', { name: 'Controleren' }).click();
  await expect(newP.locator('#toast')).toContainText('onvolledig of beschadigd');
  expect(await stored(newP)).toBeNull();
  await newP.click('#modal [data-act=modal-close]');
  // Back-upbestand terugzetten met controleverslag
  await newP.fill('#wname', 'Opa');
  await newP.click("text=Let's play darts");
  await newP.locator('#modal [data-act=install-later]').click().catch(() => {});
  await newP.click('.tabbar [data-go=more]');
  const file = { name: 'okkie-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'okkie', exportedAt: at(9), data: SEED })) };
  await newP.locator('[data-input=import]').first().setInputFiles(file);
  await newP.getByRole('button', { name: 'Samenvoegen (veilig)' }).click();
  await expect(newP.getByTestId('transfer-result')).toHaveText('Overgezet en gecontroleerd');
  const d = await stored(newP);
  expect(d.players.map(p => p.name).sort()).toEqual(['Mila', 'Opa', 'Senn']);
  expect(d.trainings).toHaveLength(12);
  await ctx.close();
});

test('iPhone-app op het beginscherm: geen "automatisch", wel de overzetcode', async ({ browser }, info) => {
  const ctx = await phone(browser, info, { ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); });
  const oldP = await ctx.newPage();
  await oldP.goto(OLD + '/');
  await oldP.click('[data-act=pause]');
  await oldP.getByRole('button', { name: 'Zet mijn trainingen over' }).click();
  await expect(oldP.getByTestId('transfer-auto')).toHaveCount(0);
  await expect(oldP.locator('#modal')).toContainText('vanaf je beginscherm');
  await expect(oldP.getByRole('button', { name: 'Met een overzetcode' })).toBeVisible();
  await ctx.close();
});

test('zolang de verhuizing niet is aangekondigd, ziet het oude adres er precies hetzelfde uit', async ({ browser }, info) => {
  const ctx = await phone(browser, info);
  await ctx.addInitScript(() => { localStorage.setItem('okkie.dev', JSON.stringify({ transfer: { oldOrigin: 'http://localhost:4173', oldPath: '/', newApp: 'http://127.0.0.1:4173/', open: false } })); });
  const oldP = await ctx.newPage();
  await oldP.goto(OLD + '/');
  await oldP.click('[data-act=pause]');
  await expect(oldP.getByTestId('move-card')).toHaveCount(0);
  await oldP.click('.tabbar [data-go=more]');
  await expect(oldP.getByTestId('move-card')).toHaveCount(0);
  // De algemene overzetcode (Safari ↔ beginscherm) blijft wel beschikbaar
  await expect(oldP.getByTestId('make-code')).toBeVisible();
  await ctx.close();
});

test('zelfde training, andere inhoud: oud en nieuw melden een probleem, nergens "gecontroleerd", niets overschreven', async ({ browser }, info) => {
  const ctx = await phone(browser, info);
  const oldP = await ctx.newPage();
  await oldP.goto(OLD + '/');
  await oldP.click('[data-act=pause]');
  await oldP.getByRole('button', { name: 'Zet mijn trainingen over' }).click();
  const [newP] = await Promise.all([ctx.waitForEvent('page'), oldP.getByTestId('transfer-auto').click()]);
  await expect(oldP.getByTestId('transfer-sent')).toHaveAttribute('data-status', 'identiek', { timeout: 20000 });
  // In de nieuwe app is training t1 (zelfde ID) anders geworden, bijvoorbeeld door een fout of een oude kopie
  await newP.evaluate(() => { const d = JSON.parse(localStorage.getItem('oche.data')); d.trainings.find(t => t.id === 't1').turns[0].darts = ['T20', 'T20', 'T20']; localStorage.setItem('oche.data', JSON.stringify(d)); });
  await newP.close();
  await oldP.goto(OLD + '/');
  await oldP.click('[data-act=pause]');
  await oldP.getByRole('button', { name: 'Nog eens overzetten' }).click();
  const [newP2] = await Promise.all([ctx.waitForEvent('page'), oldP.getByTestId('transfer-auto').click()]);
  await expect(oldP.getByTestId('transfer-sent')).toHaveAttribute('data-status', 'probleem', { timeout: 20000 });
  await expect(oldP.getByTestId('transfer-sent')).toHaveText('Niet alles is goed overgekomen');
  await expect(oldP.locator('#modal')).not.toContainText('gecontroleerd');
  await expect(newP2.getByTestId('transfer-result')).toHaveAttribute('data-status', 'probleem');
  await expect(newP2.getByTestId('transfer-conflicts')).toContainText('training');
  expect((await stored(newP2)).trainings.find(t => t.id === 't1').turns[0].darts).toEqual(['T20', 'T20', 'T20']);
  // oude app: alles nog precies zoals het was
  expect((await stored(oldP)).trainings.find(t => t.id === 't1').turns[0].darts).toEqual(['S20', 'S1', 'T19']);
  await ctx.close();
});

test('online profiel bewust meenemen in de code: alleen als je het aanvinkt', async ({ browser }, info) => {
  test.skip(info.project.name !== 'iphone', 'één keer is genoeg');
  const ctx = await phone(browser, info);
  const oldP = await ctx.newPage();
  await oldP.goto(OLD + '/');
  await oldP.click('[data-act=pause]');
  await oldP.click('.tabbar [data-go=more]');
  await oldP.getByTestId('make-code').click();
  const plain = await oldP.getByTestId('transfer-code').inputValue();
  await oldP.getByTestId('transfer-secrets').check();
  await expect.poll(() => oldP.getByTestId('transfer-code').inputValue()).not.toBe(plain);
  const withProfile = await oldP.getByTestId('transfer-code').inputValue();
  const newP = await ctx.newPage();
  await newP.goto(NEW + '/');
  await newP.getByTestId('fetch-card').getByRole('button', { name: 'Trainingen ophalen' }).click();
  await newP.fill('[data-testid=transfer-input]', withProfile);
  await newP.getByRole('button', { name: 'Controleren' }).click();
  await newP.getByTestId('transfer-apply').click();
  await expect(newP.getByTestId('transfer-result')).toHaveAttribute('data-status', 'identiek');
  await expect(newP.getByTestId('transfer-omitted')).toHaveCount(0);
  expect(await newP.evaluate(() => JSON.parse(localStorage.getItem('okkie.community.v1')).accounts.p1.token)).toBe('geheim-p1');
  await ctx.close();
});

// Overgenomen uit het eerdere lokale ontwerp (feature/app-okkiedarts): zonder klembordtoestemming
// kun je de code nog steeds zelf selecteren en plakken.
test('zonder klembordtoegang: code zelf selecteren en in het vak plakken werkt ook', async ({ browser }, info) => {
  test.skip(info.project.name !== 'iphone', 'één keer is genoeg');
  const ctx = await phone(browser, info, { clipboard: false });
  await ctx.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => new Promise(() => {}), readText: () => Promise.reject(new Error('geen toestemming')) } }); });
  const oldP = await ctx.newPage();
  await oldP.goto(OLD + '/');
  await oldP.click('[data-act=pause]');
  await oldP.getByRole('button', { name: 'Zet mijn trainingen over' }).click();
  await oldP.getByRole('button', { name: 'Met een overzetcode' }).click();
  await oldP.getByRole('button', { name: 'Kopieer de code' }).click();
  await expect(oldP.locator('#toast')).toContainText('geselecteerd', { timeout: 5000 });
  const code = await oldP.getByTestId('transfer-code').inputValue();
  const newP = await ctx.newPage();
  await newP.goto(NEW + '/');
  await newP.getByTestId('fetch-card').getByRole('button', { name: 'Trainingen ophalen' }).click();
  await newP.click('[data-act=transfer-paste]');
  await expect(newP.locator('#toast')).toContainText('Plak');
  await newP.fill('[data-testid=transfer-input]', code.slice(0, 40));
  await newP.getByRole('button', { name: 'Controleren' }).click();
  await expect(newP.locator('#toast')).toContainText('onvolledig of beschadigd');
  await newP.fill('[data-testid=transfer-input]', code);
  await newP.getByRole('button', { name: 'Controleren' }).click();
  await expect(newP.locator('#modal')).toContainText('In deze code: 2 spelers, 12 trainingen');
  await ctx.close();
});

// Overgenomen uit het eerdere lokale ontwerp: alleen precies het oude adres mag gegevens sturen.
test('een vreemd venster of los geopende #overzetten kan geen gegevens injecteren', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'één keer is genoeg');
  const ctx = await phone(browser, info);
  const newP = await ctx.newPage();
  const errors = []; newP.on('pageerror', e => errors.push(e.message));
  await newP.goto(NEW + '/#overzetten');
  await expect(newP.locator('.welcome')).toBeVisible();
  const bad = { type: 'okkie-transfer', nonce: 'x', pkg: { app: 'okkie', data: { version: 2, players: [{ id: 'x', name: 'Hacker' }], trainings: [], matches: [] } } };
  await newP.evaluate(m => window.postMessage(m, '*'), bad);
  // ook een venster van een ander adres dat de nieuwe app opent, wordt genegeerd
  const evil = await ctx.newPage();
  await evil.goto('http://localhost:4174/');   // de website: ander adres dan het oude app-adres
  const [popup] = await Promise.all([ctx.waitForEvent('page'), evil.evaluate(u => { window.__w = window.open(u, '_blank'); }, NEW + '/#overzetten')]);
  await popup.waitForLoadState();
  await evil.evaluate(m => { for (let i = 0; i < 5; i++) setTimeout(() => window.__w.postMessage(m, '*'), i * 300); }, bad);
  await popup.waitForTimeout(2000);
  expect(await stored(newP)).toBeNull();
  expect(await stored(popup)).toBeNull();
  expect(errors).toEqual([]);
  await ctx.close();
});
