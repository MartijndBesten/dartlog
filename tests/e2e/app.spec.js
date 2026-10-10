import { test, expect } from '@playwright/test';

const key = (page, n) => page.locator(`.nums [data-act=key][data-arg="${n}"], .specials [data-act=key][data-arg="${n}"]`).first().click();
const mod = (page, m) => page.click(`[data-act=mod][data-arg="${m}"]`);
async function dart(page, code) {
  if (code === 'M') return key(page, 0);
  if (code === 'SB') return key(page, 25);
  if (code === 'DB') return key(page, 50);
  const m = code[0], n = code.slice(1);
  if (m === 'D') await mod(page, 2);
  if (m === 'T') await mod(page, 3);
  await key(page, n);
}

async function onboard(page, name = 'Sem') {
  await page.goto('/');
  await page.fill('#wname', name);
  await page.click('text=Let\'s play darts');
  await expect(page.locator('.hero h2')).toHaveText(name);
}

const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('oche.data')));

test.beforeEach(async ({ page }) => {
  page.on('pageerror', e => { throw e; });
});

test('volledige scoretraining van 30 pijlen wordt berekend en bewaard', async ({ page }, info) => {
  await onboard(page);
  await page.click('.action.train');
  await page.click('[data-testid=start-score]');
  // Beurt 1: T20 + 5 + D10 = 85 (voorbeeld uit de opdracht)
  await dart(page, 'T20');
  await expect(page.getByTestId('turn-total')).toHaveText('60');
  await dart(page, 'S5');
  await expect(page.getByTestId('turn-total')).toHaveText('65');
  await dart(page, 'D10');
  await expect(page.getByTestId('live-total')).toHaveText('85');
  await expect(page.getByTestId('live-avg')).toHaveText('85,00');
  await page.screenshot({ path: `screenshots/e2e-${info.project.name}-training.png` });
  // Nog 9 beurten van 3× S20 → totaal 85 + 540 = 625, gemiddelde 62,50
  for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) await dart(page, 'S20');
  await expect(page.getByTestId('result-avg')).toHaveText('62,50');
  await page.screenshot({ path: `screenshots/e2e-${info.project.name}-uitslag.png`, fullPage: true });
  const d = await stored(page);
  expect(d.trainings).toHaveLength(1);
  expect(d.trainings[0].turns).toHaveLength(10);
  expect(d.trainings[0].turns[0].darts).toEqual(['T20', 'S5', 'D10']);
  expect(d.active.training).toBeNull();

  // Na herladen staat alles er nog en verschijnt een tweede training ernaast in de historie
  await page.reload();
  await expect(page.getByTestId('home-avg')).toHaveText('62,5');
  await page.click('.tabbar [data-go=train]');
  await page.click('[data-act=setup-turns][data-arg="0"]');
  await page.click('[data-testid=start-score]');
  for (const c of ['T20', 'T20', 'T20']) await dart(page, c);
  await expect(page.locator('.celebrate.show .cel-big')).toHaveText('180');
  await expect(page.locator('.celebrate.show .cel-small')).toHaveText('ONE HUNDRED AND EIGHTY!');
  await page.click('[data-act=finish-training]');
  await page.click('[data-act=modal-ok]');
  await expect(page.locator('.records-banner')).toContainText('Hoogste beurt: 180');
  await page.click('.tabbar [data-go=more]');
  await page.click('text=Open geschiedenis');
  await expect(page.locator('.h-item')).toHaveCount(2);
});

test('corrigeren, pauzeren en hervatten', async ({ page }) => {
  await onboard(page);
  await page.click('.action.train');
  await page.click('[data-testid=start-score]');
  await dart(page, 'T20'); await dart(page, 'T20'); await dart(page, 'S1');
  await expect(page.getByTestId('live-total')).toHaveText('121');
  // Laatste pijl wissen haalt de beurt terug en verwijdert pijl 3
  await page.click('[data-act=undo]');
  await expect(page.getByTestId('live-total')).toHaveText('0');
  await expect(page.getByTestId('turn-total')).toHaveText('120');
  await dart(page, 'T20');
  await expect(page.getByTestId('live-total')).toHaveText('180');
  await dart(page, 'S7');
  // Pauzeren en browser herladen: de open pijl blijft bewaard
  await page.click('[data-act=pause]');
  await page.reload();
  await expect(page.getByTestId('turn-total')).toHaveText('7'); // app opent direct de lopende training
  await page.click('[data-act=pause]');
  await expect(page.locator('.resume')).toBeVisible();
  await page.click('[data-act=resume-training]');
  await expect(page.locator('[data-testid=slot-0] b')).toHaveText('7');
  // Typen als alternatief
  await page.click('[data-act=toggle-type]');
  await page.fill('.typebox input', 'd16 bull');
  await page.press('.typebox input', 'Enter');
  await expect(page.getByTestId('live-total')).toHaveText(String(180 + 7 + 32 + 50));
  await page.fill('.typebox input', 'T21');
  await page.press('.typebox input', 'Enter');
  await expect(page.locator('#toast')).toContainText('bestaat niet');
});

test('501 met twee spelers: bust, checkout-advies en winst', async ({ page }, info) => {
  await onboard(page, 'Sem');
  await page.click('.action.match');
  await page.click('[data-act=match-set][data-arg="bestOf:1"]');
  await page.fill('.guest input', 'Papa');
  await page.click('.guest .btn');
  await page.click('[data-testid=start-match]');
  await expect(page.getByTestId('rest-0')).toHaveText('501');
  const turn = async codes => { for (const c of codes) await dart(page, c); };
  await turn(['T20', 'T20', 'T20']); // Sem 321
  await expect(page.getByTestId('rest-0')).toHaveText('321');
  await turn(['S20', 'S20', 'S20']); // Papa 441
  await turn(['T20', 'T20', 'T20']); // Sem 141
  await turn(['S1', 'S1', 'S1']); // Papa 438
  await expect(page.getByTestId('checkout')).toContainText('T20');
  await page.screenshot({ path: `screenshots/e2e-${info.project.name}-501.png` });
  // Bust: 141 - 60 - 60 = 21, dan S20 → rest 1 = bust
  await turn(['T20', 'T20', 'S20']);
  await expect(page.locator('.celebrate.show .cel-big')).toHaveText('BUST');
  await expect(page.getByTestId('rest-0')).toHaveText('141');
  await expect(page.locator('[data-testid=player-1]')).toHaveClass(/up/);
  await turn(['M', 'M', 'M']);
  // Uitgooien in 2 pijlen: T19 (57) → 84? nee: 141 = T20 T19 D12; we gooien T20, T19, D12
  await turn(['T20', 'T19']);
  await expect(page.getByTestId('checkout')).toContainText('D12');
  await dart(page, 'D12');
  await expect(page.locator('.result-hero strong')).toHaveText('Sem');
  const d = await stored(page);
  expect(d.matches).toHaveLength(1);
  expect(d.active.match).toBeNull();
  await page.screenshot({ path: `screenshots/e2e-${info.project.name}-501-uitslag.png`, fullPage: true });
});

test('checkout met minder dan drie pijlen eindigt de beurt direct', async ({ page }) => {
  await onboard(page);
  await page.click('.action.match');
  await page.click('[data-act=match-set][data-arg="start:301"]');
  await page.click('[data-act=match-set][data-arg="bestOf:3"]');
  await page.click('[data-testid=start-match]'); // solo
  for (const c of ['T20', 'T20', 'T20', 'T20', 'T20', 'S1']) await dart(page, c); // 301-301 → 60 left? 301-180-121 = 0? controle hieronder
  // 301 - 180 = 121; 121 - 60 - 60 = 1 → bust bij de tweede pijl, beurt eindigt na 2 pijlen
  await expect(page.getByTestId('rest-0')).toHaveText('120');
});

test('statistieken, trefferkaart en spelers gescheiden', async ({ page }, info) => {
  await onboard(page, 'Sem');
  await page.click('.action.train');
  await page.click('[data-testid=start-score]');
  for (let i = 0; i < 10; i++) for (const c of ['T20', 'S20', 'S1']) await dart(page, c);
  await page.click('.tabbar [data-go=stats]');
  await expect(page.locator('.tile.hl strong')).toHaveText('81,00');
  await expect(page.locator('.board path[data-seg=T20]')).toHaveAttribute('data-n', '10');
  await expect(page.locator('.chart')).toHaveCount(1);
  await page.screenshot({ path: `screenshots/e2e-${info.project.name}-stats.png`, fullPage: true });
  // Tweede speler heeft eigen (lege) statistieken
  await page.click('[data-act=switch-player]');
  await page.fill('.modal .guest input', 'Papa');
  await page.click('.modal .guest .btn');
  await page.click('[data-act=switch-player]');
  await page.click('.pick-btn:has-text("Papa")');
  await expect(page.locator('.player-chip')).toContainText('Papa');
  await expect(page.locator('.card.empty')).toBeVisible();
});

test('back-up exporteren en importeren', async ({ page }) => {
  await onboard(page);
  await page.click('.action.train');
  await page.click('[data-testid=start-score]');
  for (let i = 0; i < 30; i++) await dart(page, 'S5');
  await page.click('.tabbar [data-go=more]');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=export]')]);
  const path = await download.path();
  // Alles wissen en terugzetten
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.fill('#wname', 'Iemand');
  await page.click('text=Let\'s play darts');
  await page.click('.tabbar [data-go=more]');
  await page.setInputFiles('[data-input=import]', path);
  await expect(page.locator('.modal')).toContainText('1 trainingen');
  await page.click('[data-act=import-replace]');
  await page.click('[data-act=modal-ok]');
  const d = await stored(page);
  expect(d.trainings).toHaveLength(1);
  expect(d.players[0].name).toBe('Sem');
  // Ongeldig bestand wordt geweigerd
  await page.setInputFiles('[data-input=import]', { name: 'kapot.json', mimeType: 'application/json', buffer: Buffer.from('{"version":2,"players":"x"}') });
  await expect(page.locator('#toast')).toContainText('afgekeurd');
});

test('oude Dartlog-gegevens worden overgezet', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('dartlog.v1', JSON.stringify({ version: 1, trainings: [{ id: 'x', startedAt: '2026-10-08T19:00:00.000Z', dartLimit: 30, rounds: [{ createdAt: '2026-10-08T19:01:00.000Z', darts: [{ notation: 'T20', points: 60, segment: 20, multiplier: 3 }, { notation: '5', points: 5, segment: 5, multiplier: 1 }, { notation: 'D10', points: 20, segment: 10, multiplier: 2 }] }] }], matches: [] })));
  await page.reload();
  await expect(page.getByTestId('home-avg')).toHaveText('85,0');
});

test('XSS: namen worden nooit als HTML uitgevoerd', async ({ page }) => {
  await page.goto('/');
  await page.fill('#wname', '<img src=x onerror=alert(1)>');
  await page.click('text=Let\'s play darts');
  await expect(page.locator('.hero h2')).toContainText('img src=x');
  await expect(page.locator('.hero h2 img')).toHaveCount(0);
});

test('PWA: manifest, serviceworker en offline', async ({ page, context, browserName }, info) => {
  test.skip(info.project.name !== 'desktop', 'één keer is genoeg');
  await onboard(page);
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.short_name).toBe('OKKIE.');
  expect(manifest.name).toBe('OKKIE.');
  // Chrome's eigen installeerbaarheidscontrole
  const cdp = await context.newCDPSession(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  expect(installabilityErrors.filter(x => x.errorId !== 'in-incognito')).toEqual([]); // testbrowser is incognito
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('.hero h2')).toHaveText('Sem');
  await context.setOffline(false);
});

test('layout: speelscherm past zonder scrollen en knoppen zijn groot genoeg', async ({ page }) => {
  await onboard(page);
  await page.click('.action.train');
  await page.click('[data-testid=start-score]');
  const over = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  expect(over).toBeLessThanOrEqual(1);
  const box = await page.locator('.nums .key').first().boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(box.width).toBeGreaterThanOrEqual(44);
  const horiz = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(horiz).toBeLessThanOrEqual(0);
});

test('samen trainen: 3 spelers gooien om de beurt 3 pijlen', async ({ page }, info) => {
  await onboard(page, 'Senn');
  await page.click('.action.train');
  for (const name of ['Papa', 'Oma']) {
    await page.fill('[data-form=train-player] input', name);
    await page.click('[data-form=train-player] .btn');
  }
  await expect(page.locator('[data-testid=train-players] li')).toHaveCount(3);
  await page.click('[data-testid=start-score]'); // 30 pijlen = 10 beurten per speler
  await expect(page.getByTestId('now-up')).toHaveText('Senn');
  const turn = async codes => { for (const c of codes) await dart(page, c); };
  await turn(['T20', 'S20', 'S20']); // Senn 100
  await expect(page.getByTestId('now-up')).toHaveText('Papa');
  await expect(page.locator('[data-testid=gp-0] strong')).toHaveText('100');
  await turn(['S5', 'S5', 'S5']); // Papa 15
  await expect(page.getByTestId('now-up')).toHaveText('Oma');
  await page.screenshot({ path: `screenshots/e2e-${info.project.name}-samen.png` });
  // Corrigeren: laatste pijl van Papa terugzetten
  await page.click('[data-act=undo]');
  await expect(page.getByTestId('now-up')).toHaveText('Papa');
  await dart(page, 'S10'); // Papa 20
  await turn(['S1', 'S1', 'S1']); // Oma 3
  for (let r = 1; r < 10; r++) { await turn(['S20', 'S20', 'S20']); await turn(['S5', 'S5', 'S5']); await turn(['S1', 'S1', 'S1']); }
  await expect(page.getByTestId('group-winner')).toHaveText('Senn');
  await expect(page.locator('.ranking li')).toHaveCount(3);
  await page.screenshot({ path: `screenshots/e2e-${info.project.name}-samen-uitslag.png`, fullPage: true });
  const d = await stored(page);
  expect(d.trainings).toHaveLength(3);
  const byName = n => d.trainings.find(t => t.playerId === d.players.find(p => p.name === n).id);
  expect(byName('Senn').turns).toHaveLength(10);
  expect(byName('Papa').turns[0].darts).toEqual(['S5', 'S5', 'S10']);
  expect(new Set(d.trainings.map(t => t.groupId)).size).toBe(1);
  // Papa heeft zijn eigen statistieken
  await page.click('[data-act=switch-player]');
  await page.click('.pick-btn:has-text("Papa")');
  await page.click('.tabbar [data-go=stats]');
  await expect(page.locator('.tile.hl strong')).toHaveText(((20 + 9 * 15) / 30 * 3).toFixed(2).replace('.', ','));
  // Nog een potje: zelfde spelers staan klaar
  await page.click('.tabbar [data-go=train]');
  await expect(page.locator('[data-testid=train-players] li')).toHaveCount(1);
});

test('DartCounter-scores toevoegen, datum invullen en meetellen', async ({ page }, info) => {
  await onboard(page, 'Senn');
  await page.click('.tabbar [data-go=more]');
  await page.click('[data-act=import-dc]');
  await page.click('[data-act=modal-ok]');
  await expect(page.locator('[data-testid=other-app]')).toContainText('zijn toegevoegd');
  await page.click('.tabbar [data-go=stats]');
  await page.click('[data-act=stats-set][data-arg="statsFilter:99"]');
  await expect(page.locator('.tile.hl strong')).toHaveText('38,51'); // 12707 punten / 990 pijlen × 3
  await expect(page.locator('.chart .pt')).toHaveCount(10);
  await page.screenshot({ path: `screenshots/e2e-${info.project.name}-dc-stats.png`, fullPage: true });
  await page.click('.tabbar [data-go=more]');
  await page.click('text=Open geschiedenis');
  await expect(page.locator('.history .day')).toContainText('Datum onbekend');
  await page.locator('.h-item').first().click();
  await page.fill('[data-form=set-date] input', '2026-10-03');
  await page.click('[data-form=set-date] .btn');
  await expect(page.locator('.history .day').first()).toContainText('3 oktober 2026');
  // Handmatig een score invullen
  await page.click('.tabbar [data-go=more]');
  await page.fill('[data-form=summary] [name=points]', '1300');
  await page.fill('[data-form=summary] [name=high]', '111');
  await page.click('[data-form=summary] .btn');
  await expect(page.locator('#toast')).toContainText('gem. 39,39');
  expect((await stored(page)).trainings).toHaveLength(11);
  // Niet dubbel toevoegen
  await expect(page.locator('[data-act=import-dc]')).toHaveCount(0);
});

test('bestaande gegevens van de vorige versie blijven bewaard', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('oche.data', JSON.stringify({
    version: 2, activePlayerId: 'p1', players: [{ id: 'p1', name: 'Senn', color: '#3ddc84', createdAt: '2026-10-10T10:00:00.000Z' }],
    trainings: [{ id: 't1', playerId: 'p1', kind: 'score', limitTurns: 10, startedAt: '2026-10-10T11:00:00.000Z', finishedAt: '2026-10-10T11:10:00.000Z', turns: [{ at: '2026-10-10T11:01:00.000Z', darts: ['T20', 'S5', 'D10'] }] }],
    matches: [], settings: { theme: 'dark', sound: true, vibrate: true },
    // lopende training uit de vorige versie (zonder spelerslijst)
    active: { training: { id: 'a1', playerId: 'p1', kind: 'score', limitTurns: 10, startedAt: '2026-10-10T12:00:00.000Z', turns: [{ at: '2026-10-10T12:01:00.000Z', darts: ['S20', 'S20', 'S20'] }], pending: ['T20'] }, match: null },
  })));
  await page.reload();
  await expect(page.getByTestId('live-total')).toHaveText('60');
  await expect(page.getByTestId('turn-total')).toHaveText('60');
  await dart(page, 'S1'); await dart(page, 'S1');
  await expect(page.getByTestId('live-total')).toHaveText('122');
  await page.click('[data-act=pause]');
  await page.click('.tabbar [data-go=more]');
  await page.click('text=Open geschiedenis');
  await expect(page.locator('.h-item')).toHaveCount(1);
});

test('merknaam OKKIE en onderschrift', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/OKKIE/);
  await expect(page.locator('.tagline')).toHaveText('Gooi. Scoor. Word beter.');
  await expect(page.locator('.welcome .fineprint')).toContainText('Ontwikkeld door Denckh.');
  await expect(page.locator('.welcome svg.logo')).toHaveAttribute('aria-label', 'OKKIE.');
  await page.screenshot({ path: `screenshots/e2e-welkom-okkie.png` });
});

test('scorevieringen: 100+!, 140+!, 180 en nooit blijven hangen', async ({ page }) => {
  await onboard(page);
  await page.click('.action.train');
  await page.click('[data-act=setup-turns][data-arg="0"]');
  await page.click('[data-testid=start-score]');
  // Geen viering onder de 100, ook niet halverwege een beurt
  await dart(page, 'T20'); await dart(page, 'T19');
  await expect(page.locator('.celebrate.show')).toHaveCount(0);
  await dart(page, 'M'); // 117
  await expect(page.locator('.celebrate.show .cel-big')).toHaveText('117');
  await expect(page.locator('.celebrate.show .cel-small')).toHaveText('100+!');
  await expect(page.locator('body')).not.toContainText('TON');
  // Invoer blijft werken terwijl de viering zichtbaar is
  await dart(page, 'T20'); await dart(page, 'T20'); await dart(page, 'S20'); // 140
  await expect(page.locator('.celebrate.show .cel-small')).toHaveText('140+!');
  await expect(page.locator('.celebrate.show .cel-big')).toHaveText('140');
  await expect(page.getByTestId('live-total')).toHaveText('257');
  await dart(page, 'S1'); await dart(page, 'S1'); await dart(page, 'S1');
  await expect(page.locator('.celebrate.show')).toHaveCount(0, { timeout: 3000 });
  // Viering verdwijnt direct bij een schermwissel
  await dart(page, 'T20'); await dart(page, 'T20'); await dart(page, 'T20');
  await expect(page.locator('.celebrate.show .cel-small')).toHaveText('ONE HUNDRED AND EIGHTY!');
  await page.click('[data-act=pause]');
  await expect(page.locator('.celebrate.show')).toHaveCount(0);
  await expect(page.locator('#toast')).not.toHaveClass(/show/);
});

test('uitslag: vergelijking met vorige training met hetzelfde aantal pijlen', async ({ page }, info) => {
  await onboard(page);
  const play30 = async code => {
    await page.click('.tabbar [data-go=train]');
    await page.click('[data-act=setup-turns][data-arg="10"]');
    await page.click('[data-testid=start-score]');
    for (let i = 0; i < 30; i++) await dart(page, code);
  };
  await play30('S20'); // 60,00
  await expect(page.getByTestId('compare')).toHaveCount(0);
  await play30('T20'); // 180,00 → 120,00 hoger
  await expect(page.getByTestId('compare')).toHaveText('Vandaag 180,00 – 120,00 hoger dan je vorige training.');
  // Een 60-pijlentraining vergelijkt niet met een 30-pijlentraining
  await page.click('.tabbar [data-go=train]');
  await page.click('[data-act=setup-turns][data-arg="20"]');
  await page.click('[data-testid=start-score]');
  for (let i = 0; i < 60; i++) await dart(page, 'S5');
  await expect(page.getByTestId('compare')).toHaveCount(0);
  await expect(page.locator('details.more')).toHaveCount(1);
  await expect(page.locator('details.more')).not.toHaveAttribute('open', '');
  await page.screenshot({ path: `screenshots/e2e-${info.project.name}-uitslag-v2.png`, fullPage: true });
});

test('pijl corrigeren door op een ingevulde pijl te tikken', async ({ page }) => {
  await onboard(page);
  await page.click('.action.train');
  await page.click('[data-testid=start-score]');
  await dart(page, 'T20'); await dart(page, 'S5');
  await page.click('[data-testid=slot-0]'); // eerste pijl fout: alles opnieuw
  await expect(page.getByTestId('turn-total')).toHaveText('0');
  await dart(page, 'T19'); await dart(page, 'S5');
  await page.click('[data-testid=slot-1]'); // alleen de tweede pijl opnieuw
  await expect(page.getByTestId('turn-total')).toHaveText('57');
  await dart(page, 'D10'); await dart(page, 'S1');
  await expect(page.getByTestId('live-total')).toHaveText('78');
});
