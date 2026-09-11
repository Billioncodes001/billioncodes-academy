import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const config = { enabled: true, accountsReady: true, firebase: { apiKey: 'test-public-configuration', projectId: 'local-test', authDomain: 'local-test.firebaseapp.com', appId: 'test' }, checkoutEnabled: false, pdfStorageReady: false, videoReady: false };
const lessons = [
  { id: 'intro', title: 'Understand a web page', kind: 'text', body: ['A page starts with a clear structure.'] },
  { id: 'build', title: 'Build an accessible page', kind: 'text', body: ['Use headings, labels and meaningful links.'] },
  { id: 'reflect', title: 'Reflect on your work', kind: 'text', body: ['Review the structure before adding complexity.'] },
];
const course = { id: 'test-course', title: 'Web foundations', summary: 'A local test course for the reader.', level: 'Beginner', priceMinor: 0, status: 'published', lessons };
const cohort = { id: 'test-cohort', title: 'Test learning cohort', year: 2026, quarter: 4, status: 'open', acceptingApplications: true, opensAt: '2026-09-01T00:00:00Z', closesAt: '2026-10-01T00:00:00Z', startsAt: null, details: 'Local fixture, not a published training programme.', tuitionNote: 'Fees to be confirmed.', format: 'Online' };
const details = { track: 'Web development', format: 'online', experience: 'I have written a little HTML.', goals: 'Build accessible sites for my community.', phone: '' };
function application(status: string, index = 0) {
  return { id: `application-${index}`, cohortId: index ? `cohort-${index}` : cohort.id, cohortTitle: index ? `Learning cohort ${index}` : cohort.title, status, version: 1, data: details, submittedAt: status === 'draft' ? null : '2026-09-09T10:00:00Z', updatedAt: '2026-09-11T10:00:00Z' };
}

async function signIn(page: Page) {
  // Mock only the identity boundary. Backend authentication has a separate integration suite.
  await page.route('**/src/firebaseClient.ts*', route => route.fulfill({ contentType: 'text/javascript', body: 'export async function emailSignIn(){return {name:"Test Learner",email:"learner@example.com",verified:true}}; export async function googleSignOut(){}' }));
  await page.route('**/api/v2/platform', route => route.fulfill({ json: config }));
  await page.route('**/api/v2/account', route => route.fulfill({ json: { user: { id: 'test-learner', name: 'Test Learner', email: 'learner@example.com' } } }));
  await page.route('**/api/v2/library', route => route.fulfill({ json: { courses: [] } }));
  await page.route('**/api/v2/cohorts', route => route.fulfill({ json: { cohorts: [cohort] } }));
  await page.goto('/#/account');
  await page.getByLabel('Email address', { exact: true }).fill('learner@example.com');
  await page.getByLabel('Password', { exact: true }).fill('local-test-passphrase');
  await page.getByRole('button', { name: 'Sign in with email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your course library.' })).toBeVisible();
}

test('reader resumes the first unfinished lesson and navigation never writes progress', async ({ page }) => {
  let writes = 0;
  await page.route('**/api/v2/courses/test-course', route => route.fulfill({ json: { course, enrolled: true, completed: ['intro'] } }));
  await page.route('**/progress', route => { writes++; return route.fulfill({ json: { saved: true } }); });
  await signIn(page);
  await page.goto('/#/course/test-course');
  await expect(page.getByRole('heading', { name: lessons[1].title })).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
  await page.getByRole('button', { name: 'Next lesson', exact: true }).click();
  await expect(page.getByRole('heading', { name: lessons[2].title })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Next lesson', exact: true })).toBeDisabled();
  await page.getByRole('navigation', { name: 'Course contents', exact: true }).getByRole('button', { name: /Understand a web page/ }).click();
  await expect(page.getByRole('heading', { name: lessons[0].title })).toBeFocused();
  await expect(page.getByRole('button', { name: 'Previous lesson', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Undo lesson completion' })).toBeVisible();
  expect(writes).toBe(0);
});

test('progress saves only after confirmation, without reloading or advancing the lesson', async ({ page }) => {
  let reads = 0;
  const completed = new Set(['intro']);
  let release!: () => void;
  const responseReady = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v2/courses/test-course', route => { reads++; return route.fulfill({ json: { course, enrolled: true, completed: [...completed] } }); });
  await page.route('**/lessons/build/progress', async route => {
    await responseReady;
    const body = route.request().postDataJSON();
    expect(route.request().method()).toBe('PUT');
    if (body.completed) completed.add('build'); else completed.delete('build');
    await route.fulfill({ json: { saved: true } });
  });
  await signIn(page);
  await page.goto('/#/course/test-course');
  const lessonNode = await page.getByRole('heading', { name: lessons[1].title }).elementHandle();
  await page.getByRole('button', { name: 'Mark lesson complete', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Next lesson', exact: true })).toBeDisabled();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
  release();
  await expect(page.getByRole('status')).toContainText('Lesson marked complete. Saved to your account.');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '2');
  await expect(page.getByRole('button', { name: 'Undo lesson completion' })).toBeFocused();
  expect(await lessonNode!.evaluate(node => node.isConnected)).toBe(true);
  expect(reads).toBe(1);
  await page.getByRole('button', { name: 'Undo lesson completion' }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
  expect(reads).toBe(1);
  await page.getByRole('button', { name: 'Mark lesson complete', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '2');
  await page.getByRole('link', { name: 'Back to my library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your course library.' })).toBeVisible();
  await page.goto('/#/course/test-course');
  await expect(page.getByRole('heading', { name: lessons[2].title })).toBeVisible();
});

test('failed and unconfirmed saves retain reading state and allow retry', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/v2/courses/test-course', route => route.fulfill({ json: { course, enrolled: true, completed: [] } }));
  await page.route('**/progress', route => {
    attempts++;
    return route.fulfill({ status: attempts === 1 ? 503 : 200, json: attempts === 1 ? { error: 'Temporarily unavailable.' } : { saved: attempts > 2 } });
  });
  await signIn(page);
  await page.goto('/#/course/test-course');
  await page.getByRole('button', { name: 'Mark lesson complete', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Temporarily unavailable');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
  await expect(page.getByRole('heading', { name: lessons[0].title })).toBeVisible();
  await page.getByRole('button', { name: 'Mark lesson complete', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Your progress was not confirmed');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
  await page.getByRole('button', { name: 'Mark lesson complete', exact: true }).click();
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '1');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('empty and fully completed courses have honest, usable states', async ({ page }) => {
  let empty = false;
  await page.route('**/api/v2/courses/test-course', route => route.fulfill({ json: { course: { ...course, lessons: empty ? [] : lessons }, enrolled: true, completed: lessons.map(lesson => lesson.id) } }));
  await signIn(page);
  await page.goto('/#/course/test-course');
  await expect(page.getByRole('heading', { name: lessons[0].title })).toBeVisible();
  await expect(page.getByText('Every lesson is marked complete.', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Back to my library', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your course library.' })).toBeVisible();
  empty = true;
  await page.goto('/#/course/test-course');
  await expect(page.getByRole('heading', { name: 'No lessons published yet.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /lesson complete/ })).toHaveCount(0);
});

test('video access is explicit, rejects untrusted players and resets between lessons', async ({ page }) => {
  let plays = 0;
  await page.route('**/api/v2/courses/test-course', route => route.fulfill({ json: { course: { ...course, lessons: [{ id: 'video', title: 'Watch the walkthrough', kind: 'video', resourceId: 'video-resource' }, lessons[0]] }, enrolled: true, completed: [] } }));
  await page.route('**/api/v2/resources/video-resource/playback', route => {
    plays++;
    return route.fulfill({ json: { url: plays === 1 ? 'https://untrusted.invalid/player' : 'https://iframe.videodelivery.net/test-signed-token' } });
  });
  await page.route('https://iframe.videodelivery.net/**', route => route.fulfill({ contentType: 'text/html', body: '<p>Local player fixture</p>' }));
  await signIn(page);
  await page.goto('/#/course/test-course');
  await expect(page.getByRole('heading', { name: 'Watch the walkthrough' })).toBeVisible();
  expect(plays).toBe(0);
  await expect(page.locator('.portal-reader iframe')).toHaveCount(0);
  await page.getByRole('button', { name: 'Play lesson video', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Invalid player address.');
  await expect(page.locator('.portal-reader iframe')).toHaveCount(0);
  await page.getByRole('button', { name: 'Play lesson video', exact: true }).click();
  await expect(page.locator('.portal-reader iframe')).toHaveAttribute('src', 'https://iframe.videodelivery.net/test-signed-token');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
  await page.getByRole('button', { name: 'Next lesson', exact: true }).click();
  await expect(page.locator('.portal-reader iframe')).toHaveCount(0);
  await page.getByRole('button', { name: 'Previous lesson', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Play lesson video', exact: true })).toBeVisible();
  expect(plays).toBe(2);
});

test('PDF failure can be retried without marking the lesson complete', async ({ page }) => {
  let downloads = 0;
  await page.route('**/api/v2/courses/test-course', route => route.fulfill({ json: { course: { ...course, lessons: [{ id: 'pdf', title: 'Read the workbook', kind: 'pdf', resourceId: 'pdf-resource' }] }, enrolled: true, completed: [] } }));
  await page.route('**/api/v2/resources/pdf-resource', route => {
    downloads++;
    return downloads === 1 ? route.fulfill({ status: 503, contentType: 'text/plain', body: 'Unavailable' }) : route.fulfill({ contentType: 'application/pdf', headers: { 'Content-Disposition': 'attachment; filename="workbook.pdf"' }, body: '%PDF-1.4 local-download-fixture' });
  });
  await signIn(page);
  await page.goto('/#/course/test-course');
  await page.getByRole('button', { name: 'Download lesson PDF', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Download is unavailable.');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download lesson PDF', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('workbook.pdf');
  await expect(page.getByRole('status')).toContainText('Your PDF download has started.');
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '0');
});

test('training explains every actual status without inventing submission history or confirmed places', async ({ page }) => {
  const states = ['draft', 'submitted', 'under-review', 'offered', 'declined', 'withdrawn', 'unexpected'];
  await page.route('**/api/v2/training/applications', route => route.fulfill({ json: { applications: states.map(application) } }));
  await signIn(page);
  await page.goto('/#/training-dashboard');
  const cards = page.locator('.application-card');
  await expect(cards).toHaveCount(7);
  const labels = ['Draft', 'Submitted', 'Under review', 'Offer made', 'Not offered', 'Withdrawn', 'Status unavailable'];
  for (let index = 0; index < labels.length; index++) await expect(cards.nth(index).locator('.application-badge')).toHaveText(labels[index]);
  await expect(cards.nth(0).locator('dt', { hasText: /^Submitted$/ })).toHaveCount(0);
  await expect(cards.nth(1).locator('dt', { hasText: /^Submitted$/ })).toHaveCount(1);
  await expect(cards.nth(3)).toContainText('An offer, not yet a confirmed place.');
  await expect(cards.nth(3)).not.toContainText('Under review');
  await expect(cards.nth(3).getByRole('link', { name: 'Contact the team' })).toHaveAttribute('href', '#/contact');
  await expect(cards.nth(0).getByRole('link', { name: /Continue draft/ })).toHaveAttribute('aria-describedby', 'application-status-application-0');
});

test('draft edits survive a failed save and stay locked during an in-flight request', async ({ page }) => {
  let saved = application('draft');
  let rejectSave!: () => void;
  const rejection = new Promise<void>(resolve => { rejectSave = resolve; });
  let attempts = 0;
  await page.route('**/api/v2/training/applications', route => route.fulfill({ json: { applications: [saved] } }));
  await page.route('**/api/v2/training/cohorts/test-cohort/application', async route => {
    attempts++;
    const body = route.request().postDataJSON();
    expect(body.version).toBe(saved.version);
    expect(body.data.track).toBe('Accessible frontend development');
    if (attempts === 1) { await rejection; await route.fulfill({ status: 503, json: { error: 'Draft could not be saved.' } }); return; }
    saved = { ...saved, data: body.data, version: saved.version + 1, status: body.submit ? 'submitted' : 'draft', submittedAt: body.submit ? '2026-09-11T12:00:00Z' : null };
    await route.fulfill({ json: { saved: true } });
  });
  await signIn(page);
  await page.goto('/#/apply/test-cohort');
  const track = page.getByLabel('What would you like to learn?');
  await track.fill('Accessible frontend development');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(track).toBeDisabled();
  await expect(page.getByRole('checkbox')).toBeDisabled();
  rejectSave();
  await expect(page.getByRole('alert')).toContainText('Draft could not be saved.');
  await expect(track).toBeEnabled();
  await expect(track).toHaveValue('Accessible frontend development');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(track).toBeEnabled();
  await expect(track).toHaveValue('Accessible frontend development');
  await expect(page.getByRole('button', { name: 'Submit application', exact: true })).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit application', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Your application has been submitted.' })).toBeVisible();
  await expect(track).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Submit application', exact: true })).toHaveCount(0);
});

test('closed intakes allow draft editing but not submission', async ({ page }) => {
  await page.route('**/api/v2/training/applications', route => route.fulfill({ json: { applications: [application('withdrawn')] } }));
  await signIn(page);
  await page.route('**/api/v2/cohorts', route => route.fulfill({ json: { cohorts: [{ ...cohort, acceptingApplications: false, status: 'closed' }] } }));
  await page.goto('/#/apply/test-cohort');
  await expect(page.getByLabel('What would you like to learn?')).toBeEnabled();
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('button', { name: 'Submit application', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Withdraw application', exact: true })).toHaveCount(0);
});

test('signed-in reader, dashboard and application stay accessible at narrow widths and enlarged text', async ({ page }, testInfo) => {
  await page.route('**/api/v2/courses/test-course', route => route.fulfill({ json: { course, enrolled: true, completed: ['intro'] } }));
  await page.route('**/api/v2/training/applications', route => route.fulfill({ json: { applications: [application('draft')] } }));
  await signIn(page);
  for (const [route, title, file] of [
    ['/course/test-course', lessons[1].title, 'reader'],
    ['/training-dashboard', 'Your next step, in view.', 'dashboard'],
    ['/apply/test-cohort', cohort.title, 'application'],
  ]) {
    await page.goto(`/#${route}`);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${file}.png`), fullPage: true });
    for (const width of [320, 768, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.setViewportSize(testInfo.project.use.viewport!);
  }
});
