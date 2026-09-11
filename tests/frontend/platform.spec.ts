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
  await page.route('**/src/firebaseClient.ts*',route => route.fulfill({contentType:'text/javascript',body:'export async function googleSignIn(){return {name:"Ada Learner",email:"ada@example.com",verified:true}}; export async function googleSignOut(){}'}));
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
test('email signup validates confirmation and waits for verified email before creating an Academy profile',async ({page}) => {
  let registered = false;
  await page.route('**/src/firebaseClient.ts*',route => route.fulfill({contentType:'text/javascript',body:`
    let checks=0;
    export async function emailSignUp(config,name,email,password){if(name!=="Email Learner"||email!=="email@example.com"||password!=="local-test-passphrase")throw Error("Incorrect signup fields");return {name,email,verified:false}}
    export async function sendVerification(){}
    export async function checkVerification(){return {name:"Email Learner",email:"email@example.com",verified:++checks>1}}
    export async function googleSignOut(){}
  `}));
  const member = {id:'email',name:'Email Learner',email:'email@example.com'};
  await page.route('**/api/v2/account',route => route.fulfill({json:{user:registered ? member : null}}));
  await page.route('**/api/auth/register',route => {expect(route.request().postDataJSON()).toEqual({name:'Email Learner',consent:true});registered=true;return route.fulfill({json:{user:member}});});
  await page.route('**/api/v2/library',route => route.fulfill({json:{courses:[]}}));
  await page.goto('/#/account');
  await page.getByRole('button',{name:'Create account',exact:true}).click();
  await page.getByLabel('Full name',{exact:true}).fill('Email Learner');
  await page.getByLabel('Email address',{exact:true}).fill('email@example.com');
  await page.getByLabel('Password',{exact:true}).fill('local-test-passphrase');
  await page.getByLabel('Confirm password',{exact:true}).fill('does-not-match-password');
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'Create account with email',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Your passwords do not match');
  await page.getByLabel('Confirm password',{exact:true}).fill('local-test-passphrase');
  await page.getByRole('button',{name:'Show password',exact:true}).click();
  await expect(page.getByLabel('Password',{exact:true})).toHaveAttribute('type','text');
  await page.getByRole('button',{name:'Create account with email',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Check your inbox.',exact:true})).toBeVisible();
  expect(registered).toBe(false);
  await page.getByRole('button',{name:'I have verified my email',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('not verified yet');
  expect(registered).toBe(false);
  await page.getByRole('button',{name:'I have verified my email',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Make it yours.',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Create my Academy account',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your first chapter is waiting.',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain('local-test-passphrase');
});
test('email sign-in provides generic errors and the reset flow returns a privacy-preserving confirmation',async ({page}) => {
  await page.route('**/src/firebaseClient.ts*',route => route.fulfill({contentType:'text/javascript',body:`
    export async function emailSignIn(){throw {code:"auth/invalid-credential"}}
    export async function resetPassword(config,email){if(email!=="learner@example.com")throw Error("Incorrect reset email")}
  `}));
  await page.goto('/#/account');
  await page.getByLabel('Email address',{exact:true}).fill('learner@example.com');
  await page.getByLabel('Password',{exact:true}).fill('incorrect-test-password');
  await page.getByRole('button',{name:'Sign in with email',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('We could not sign you in');
  await page.getByRole('button',{name:'Forgot password?',exact:true}).click();
  await expect(page.getByLabel('Password',{exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'Send password reset link',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('We do not disclose whether an account exists');
  await page.getByRole('button',{name:'Back to sign in',exact:true}).click();
  await expect(page.getByLabel('Password',{exact:true})).toHaveValue('');
});
test('verified email sign-in opens the existing account without registering it again',async ({page}) => {
  await page.route('**/src/firebaseClient.ts*',route => route.fulfill({contentType:'text/javascript',body:'export async function emailSignIn(){return {name:"Email Learner",email:"email@example.com",verified:true}}'}));
  await page.route('**/api/v2/account',route => route.fulfill({json:{user:{id:'email',name:'Email Learner',email:'email@example.com'}}}));
  await page.route('**/api/v2/library',route => route.fulfill({json:{courses:[]}}));
  await page.goto('/#/account');
  await page.getByLabel('Email address',{exact:true}).fill('email@example.com');
  await page.getByLabel('Password',{exact:true}).fill('local-test-passphrase');
  await page.getByRole('button',{name:'Sign in with email',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your first chapter is waiting.',exact:true})).toBeVisible();
});
