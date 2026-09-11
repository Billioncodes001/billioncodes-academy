import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const config = { enabled:true, accountsReady:true, firebase:{apiKey:'test-public-configuration',projectId:'local-test',authDomain:'local-test.firebaseapp.com',appId:'test'},checkoutEnabled:false,pdfStorageReady:false,videoReady:false };
test.beforeEach(async ({page}) => {
  await page.route('**/api/v2/platform',route => route.fulfill({json:config}));
  await page.route('**/api/v2/cohorts',route => route.fulfill({json:{cohorts:[]}}));
  await page.route('**/api/v2/courses',route => route.fulfill({json:{courses:[],checkoutEnabled:false}}));
});
test('account, resources and training routes are accessible, responsive and gated',async ({page}) => {
  for (const route of ['/account','/resources','/training','/training-dashboard','/library','/course-library']) {
    await page.goto(`/#${route}`);
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page).not.toHaveTitle(/Page not found/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({page}).analyze()).violations).toEqual([]);
  }
  await page.goto('/#/training-dashboard');
  await expect(page.getByRole('link',{name:'Create an account or sign in'})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Full name'})).toHaveCount(0);
  await page.goto('/#/training');
  await expect(page.getByText('No intake dates or fees have been announced yet.',{exact:false})).toBeVisible();
});
test('external learning has creator credit, explicit source links and no purchase controls',async ({page}) => {
  await page.goto('/#/resources');
  await page.getByLabel('Find a resource').fill('CS50');
  await expect(page.getByRole('heading',{name:'CS50x',exact:true})).toBeVisible();
  await expect(page.getByText('David J. Malan and the CS50 team',{exact:false})).toBeVisible();
  await expect(page.getByRole('link',{name:'Learn at the original source',exact:false})).toHaveAttribute('href','https://cs50.harvard.edu/x/');
  await expect(page.getByRole('button',{name:/buy|pay/i})).toHaveCount(0);
});
test('account creation and separate dashboards work; Google SDK is mocked only in this UI test',async ({page}) => {
  let registered = false;
  await page.route('**/src/firebaseClient.ts',route => route.fulfill({contentType:'text/javascript',body:'export async function googleSignIn(){return {name:"Ada Learner",email:"ada@example.com"}}; export async function googleSignOut(){}'}));
  const member = {id:'ada',name:'Ada Learner',email:'ada@example.com'};
  await page.route('**/api/v2/account',route => route.fulfill({json:{user:registered ? member : null}}));
  await page.route('**/api/auth/register',route => { expect(route.request().postDataJSON()).toEqual({name:'Ada Learner',consent:true}); registered = true; return route.fulfill({json:{user:member}}); });
  await page.route('**/api/v2/library',route => route.fulfill({json:{courses:[]}}));
  await page.route('**/api/v2/training/applications',route => route.fulfill({json:{applications:[]}}));
  await page.goto('/#/account');
  await page.getByRole('button',{name:'Continue with Google'}).click();
  await expect(page.getByRole('heading',{name:'Make it yours.'})).toBeVisible();
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'Create my Academy account'}).click();
  await expect(page.getByRole('heading',{name:'Your first chapter is waiting.'})).toBeVisible();
  await page.getByRole('navigation',{name:'Account navigation'}).getByRole('link',{name:'Training dashboard',exact:true}).click();
  await expect(page.getByText('You have not started an application yet.',{exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('button',{name:'Continue with Google'})).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify({...localStorage,...sessionStorage}))).not.toContain('ada@example.com');
});
