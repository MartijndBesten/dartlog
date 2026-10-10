import { test, expect } from '@playwright/test';

test('kids-uitleg heeft vier korte stappen en een oefenbeurt die niets opslaat', async ({page}) => {
  const errs=[];
  page.on('pageerror',e=>errs.push(e.message));
  await page.goto('/uitleg/');
  await expect(page).toHaveTitle(/Zo werkt OKKIE/);
  await expect(page.locator('.step-card')).toHaveCount(4);
  await expect(page.locator('#demo-total')).toHaveText('0');
  const before=await page.evaluate(()=>({keys:Object.keys(localStorage),training:localStorage.getItem('oche.data')}));
  await page.getByRole('button',{name:/MIS/}).click();
  await expect(page.locator('#demo-total')).toHaveText('0');
  await expect(page.locator('#demo-message')).toContainText('TRIPLE 20');
  await page.getByRole('button',{name:/TRIPLE 20/}).click();
  await expect(page.locator('#demo-total')).toHaveText('60');
  await page.getByRole('button',{name:/^5 5 punten$/}).click();
  await expect(page.locator('#demo-total')).toHaveText('65');
  await page.getByRole('button',{name:/DOUBLE 10/}).click();
  await expect(page.locator('#demo-total')).toHaveText('85');
  await expect(page.locator('#demo-step')).toHaveText('GOED GEDAAN!');
  await page.getByRole('button',{name:/Opnieuw proberen/}).click();
  await expect(page.locator('#demo-total')).toHaveText('0');
  const after=await page.evaluate(()=>({keys:Object.keys(localStorage),training:localStorage.getItem('oche.data')}));
  expect(after).toEqual(before);
  expect(errs).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(0);
});
test('eerstekind-gebruiker vindt de instructie vanuit de app',async({page},info)=>{
  test.skip(info.project.name!=='iphone','één browser is genoeg');
  await page.goto('/');
  await expect(page.locator('.welcome a[href="./uitleg/"]')).toBeVisible();
  await page.locator('.welcome a[href="./uitleg/"]').click();
  await expect(page).toHaveURL(/\/uitleg\/$/);
  await expect(page.getByRole('link',{name:/Open de app/}))
    .toHaveAttribute('href','https://martijndbesten.github.io/dartlog/');
});
test('de introductiewebsite laat kinderen naar de uitleg klikken',async({page},info)=>{
  test.skip(info.project.name!=='iphone','één browser is genoeg');
  await page.goto('/ontdek/');
  await expect(page.locator('.kids-invite')).toContainText('Je eerste 3 pijlen');
  await expect(page.locator('.kids-invite a[href="../uitleg/"]')).toBeVisible();
  await page.locator('.kids-invite a').click();
  await expect(page).toHaveURL(/\/uitleg\/$/);
});
