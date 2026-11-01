import { test, expect } from '@playwright/test';

// 1.10.0: Gericht oefenen (Bob's 27, 121 Checkout, klok dubbels), Vandaag oefenen, weekdoel, beurt aanpassen, beurttotaal.
const TAP_GAP = 60;
const key = async (page, n) => { await page.locator(`.nums [data-act=key][data-arg="${n}"], .specials [data-act=key][data-arg="${n}"]`).first().click(); await page.waitForTimeout(TAP_GAP); };
async function dart(page, code) {
  if (code === 'M') return key(page, 0);
  if (code[0] === 'D') await page.click('[data-act=mod][data-arg="2"]');
  if (code[0] === 'T') await page.click('[data-act=mod][data-arg="3"]');
  await key(page, code.slice(1));
}
const at = n => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(18, 0, 0, 0); return d.toISOString(); };
const P1 = { id: 'p-senn', name: 'Senn', color: '#3ddc84' };
const old = (id, n) => ({ id, playerId: P1.id, kind: 'score', limitTurns: 10, startedAt: at(n), finishedAt: at(n), turns: Array.from({ length: 10 }, () => ({ at: at(n), darts: ['T20', 'S20', 'S20'] })) });
const SEED = { version: 2, activePlayerId: P1.id, players: [P1], matches: [], active: { training: null, match: null },
  settings: { theme: 'dark', sound: false, vibrate: false }, trainings: [old('t1', 30), old('t2', 20)] };
const seed = (page, extra = {}) => page.addInitScript(d => { localStorage.setItem('okkie.ping.v1', JSON.stringify({ day: '2099-01-01' })); if (!localStorage.getItem('oche.data')) localStorage.setItem('oche.data', JSON.stringify(d)); }, { ...SEED, ...extra });
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('oche.data')));

test("Gericht oefenen: precies drie kaarten; Bob's 27 met één tik per ronde, score nooit onder 0, record en geschiedenis", async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await page.click('.tabbar [data-go=train]');
  await expect(page.getByTestId('gericht-oefenen')).toBeVisible();
  await expect(page.locator('.drill-card')).toHaveCount(3);
  await page.getByTestId('start-bobs27').click();
  await expect(page.getByTestId('bobs-target')).toHaveText('D1');
  for (let i = 0; i < 5; i++) { await page.getByTestId('bobs-0').click(); await page.waitForTimeout(TAP_GAP); }
  await expect(page.getByTestId('bobs-score')).toHaveText('0');   // 27-2-4-6-8 = 7, D5 → 0 (niet −3)
  await page.getByTestId('drill-undo').click();
  await expect(page.getByTestId('bobs-target')).toHaveText('D5');
  for (let i = 0; i < 17; i++) { await page.getByTestId('bobs-1').click(); await page.waitForTimeout(TAP_GAP); }
  await expect(page.getByTestId('drill-result')).toBeVisible();
  await expect(page.getByTestId('drill-record')).toContainText('meteen je record');
  const d = await stored(page);
  expect(d.drills).toHaveLength(1);
  expect(d.drills[0].turns).toHaveLength(21);
  expect(d.drills[0].turns.map(t => t.target).slice(-2)).toEqual(['D20', 'DB']);
  expect(d.trainings).toHaveLength(2);   // bestaande trainingen ongemoeid
  await page.click('.tabbar [data-go=more]');
  await page.click('[data-go=history]');
  await expect(page.locator('[data-act=open-drill]')).toHaveCount(1);
});

test('121 Checkout: X01-invoer met uitgooi-advies; uit → doel + 1, niet gelukt → terug naar laatst gehaald', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await page.click('.tabbar [data-go=train]');
  await page.getByTestId('start-c121').click();
  await expect(page.getByTestId('c121-rest')).toHaveText('121');
  await expect(page.getByTestId('checkout')).toContainText('Uitgooien');
  for (const c of ['T20', 'T11', 'D14']) await dart(page, c);
  await expect(page.getByTestId('c121-target')).toHaveText('122');
  await expect(page.getByTestId('c121-best')).toHaveText('121');
  for (let i = 0; i < 9; i++) await dart(page, 'S1');
  await expect(page.getByTestId('c121-target')).toHaveText('121');
  const d = await stored(page);
  expect(d.active.drill.turns.map(t => t.target)).toEqual([121, 122, 122, 122]);
});

test('Rond de klok alleen dubbels: dubbel staat standaard aan, mikpunt per pijl opgeslagen', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await page.click('.tabbar [data-go=train]');
  await page.getByTestId('clock-mode-D').click();
  await page.getByTestId('start-clock').click();
  await expect(page.getByTestId('clockv-target')).toHaveText('D1');
  await key(page, 1);            // D1
  await page.click('[data-act=mod][data-arg="2"]'); await key(page, 2);   // dubbel uitgezet → S2 (mis)
  await key(page, 2);            // D2
  await expect(page.getByTestId('clockv-target')).toHaveText('D3');
  const d = await stored(page);
  expect(d.active.drill.turns[0]).toMatchObject({ darts: ['D1', 'S2', 'D2'], aims: ['D1', 'D2', 'D2'] });
});

test('Vandaag oefenen: advies met "Waarom?" en eerlijke melding over dubbels; weekdoel in plaats van dagteller', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  const coach = page.getByTestId('coach');
  await expect(coach).toContainText("Vandaag: Bob's 27");
  await coach.locator('summary').click();
  await expect(page.getByTestId('coach-why')).toContainText('nog te weinig gegooid');
  await expect(page.getByTestId('weekgoal')).toContainText('van 3');
  await expect(page.locator('body')).not.toContainText('dagen op rij');
  await page.getByTestId('weekgoal').locator('summary').click();
  await page.click('[data-act=week-goal][data-arg="5"]');
  await expect(page.getByTestId('week-count')).toHaveText(/van 5$/);
  expect((await stored(page)).settings.weekGoal).toBe(5);
  await page.getByTestId('coach-start').click();
  await expect(page.getByTestId('bobs-target')).toHaveText('D1');
});

test('beurt aanpassen tijdens een scoretraining', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await page.click('.tabbar [data-go=train]');
  await page.getByTestId('start-score').click();
  for (const c of ['S20', 'S20', 'S20', 'S5', 'S5', 'S5']) await dart(page, c);
  await page.getByTestId('edit-turns').click();
  await page.getByTestId('edit-turn-0').click();
  await expect(page.getByTestId('edit-banner')).toBeVisible();
  for (const c of ['T20', 'T20', 'T20']) await dart(page, c);
  await expect(page.getByTestId('live-total')).toHaveText('195');
  expect((await stored(page)).active.training.turns[0].darts).toEqual(['T20', 'T20', 'T20']);
});

test('wedstrijd met beurttotaal: rest klopt, beurt aanpassen, uitgooien met aantal pijlen', async ({ page }) => {
  await seed(page);
  await page.goto('/');
  await page.click('.tabbar [data-go=match]');
  await page.click('[data-act=match-set][data-arg="start:301"]');
  await page.click('[data-act=match-set][data-arg="bestOf:1"]');
  await page.click('[data-act=match-set][data-arg="entry:total"]');
  await page.getByTestId('start-match').click();
  const tot = async v => { for (const c of String(v)) await page.click(`[data-act=total-key][data-arg="${c}"]`); await page.getByTestId('total-ok').click(); await page.waitForTimeout(TAP_GAP); };
  await tot(179);
  await expect(page.locator('#toast')).toContainText('kan geen beurtscore');
  await page.click('[data-act=total-key][data-arg="del"]'); await page.click('[data-act=total-key][data-arg="del"]'); await page.click('[data-act=total-key][data-arg="del"]');
  await tot(140); await tot(100);
  await expect(page.getByTestId('rest-0')).toHaveText('61');
  await page.getByTestId('edit-turns').click(); await page.getByTestId('edit-turn-1').click();
  await tot(60);
  await expect(page.getByTestId('rest-0')).toHaveText('101');
  await tot(60); await tot(41);
  await expect(page.getByTestId('co-darts-1')).toHaveCount(0);   // 41 kan niet met één pijl
  await page.getByTestId('co-darts-2').click();
  await expect(page.locator('.result-hero')).toContainText('Uitgegooid');
  const m = (await stored(page)).matches[0];
  expect(m.settings.entry).toBe('total');
  expect(m.legs[0].turns.every(t => t.total === true)).toBe(true);
  expect(m.legs[0].turns.map(t => t.darts.length)).toEqual([3, 3, 3, 2]);
});
