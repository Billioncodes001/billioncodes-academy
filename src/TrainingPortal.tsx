import { useState } from 'react';
import { request } from './api';
import { AccountGate, PortalNav, jsonBody, message, useAccount } from './Account';
import { RemoteNotice, useRemote } from './LearningPortal';
import { applicationStatus } from './applicationStatus';

type Cohort = { id: string; title: string; year: number; quarter: number; status: string; acceptingApplications: boolean; opensAt: string | null; closesAt: string | null; startsAt: string | null; details: string; tuitionNote: string; format: string };
type Details = { track: string; format: string; experience: string; goals: string; phone: string };
type Application = { id: string; cohortId: string; cohortTitle: string; status: string; version: number; data: Details; submittedAt?: string | null; updatedAt: string };
const date = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('en-NG', { dateStyle: 'medium', timeZone: 'Africa/Lagos' }) : 'To be announced';

export function TrainingLanding() {
  const state = useRemote<{ cohorts: Cohort[] }>('/api/v2/cohorts');
  return <div className="wrap page-section studio-page training-page">
    <div className="portal-heading"><div><p className="eyebrow">A SHARED DIRECTION</p><h1>Learn with intention.<br />Build with others.</h1><p>Two intended training windows each year. Create an account first, then prepare an application for an announced intake. Dates, format, fees and places are confirmed separately for each cohort.</p></div><a className="button button-dark" href="#/training-dashboard">Open training dashboard</a></div>
    <div className="portal-grid training-windows">{[['Q1', 'Early-year intake', 'January to March'], ['Q4', 'Late-year intake', 'October to December']].map(([quarter, title, months]) => <section className="portal-card" key={quarter}><span className="portal-window">{quarter}</span><div><p className="studio-overline">PLANNED WINDOW</p><h2>{title}</h2><p>{months}. This is a planning window, not an announced start date.</p></div></section>)}</div>
    <section className="portal-section"><h2>Announced intakes</h2><RemoteNotice state={state} />{state.value && !state.value.cohorts.length && <div className="platform-notice">No intake dates or fees have been announced yet. You can create your account now; applications open only for published cohorts.</div>}<CohortCards cohorts={state.value?.cohorts || []} /></section>
    <section className="training-guide"><div><p className="studio-overline">FROM INTEREST TO APPLICATION</p><h2>Know your next step.</h2><p>An application or offer is not a confirmed enrolment or payment.</p><a className="text-link" href="#/training-dashboard">Prepare for an intake</a></div><ol>
      <li><span aria-hidden="true">01</span><div><h3>Make your account</h3><p>Verify your email and keep your application in one private place.</p></div></li>
      <li><span aria-hidden="true">02</span><div><h3>Shape your application</h3><p>Choose an announced intake, save a draft and submit during its application window.</p></div></li>
      <li><span aria-hidden="true">03</span><div><h3>Follow the decision</h3><p>See the current review status. Confirm any offer's arrangements with the team.</p></div></li>
    </ol></section>
  </div>;
}

function CohortCards({ cohorts }: { cohorts: Cohort[] }) {
  return <div className="portal-grid">{cohorts.map(cohort => <article className="portal-card intake-card" key={cohort.id}>
    <span className="portal-tag">{cohort.year} / Q{cohort.quarter} / {cohort.acceptingApplications ? 'Applications open' : cohort.status}</span>
    <h3>{cohort.title}</h3><p>{cohort.details}</p>
    <dl className="journey-facts"><div><dt>Training starts</dt><dd>{date(cohort.startsAt)}</dd></div><div><dt>Applications close</dt><dd>{date(cohort.closesAt)}</dd></div><div><dt>Format</dt><dd>{cohort.format}</dd></div></dl>
    <p>{cohort.tuitionNote}</p><a className="text-link" href={`#/apply/${cohort.id}`}>{cohort.acceptingApplications ? 'Apply for this intake' : 'Prepare a draft'}</a>
  </article>)}</div>;
}

function ApplicationState({ application, headingLevel = 3 }: { application: Application; headingLevel?: 2 | 3 }) {
  const status = applicationStatus(application.status);
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return <div className={`application-next application-next-${status.tone}`}>
    <p className="studio-overline">WHAT HAPPENS NEXT</p><Heading>{status.heading}</Heading><p>{status.next}</p>
    {application.status === 'offered' && <a className="text-link" href="#/contact">Contact the team</a>}
  </div>;
}

function ApplicationFacts({ application }: { application: Application }) {
  return <dl className="journey-facts">
    {application.submittedAt && <div><dt>Submitted</dt><dd>{date(application.submittedAt)}</dd></div>}
    <div><dt>Last updated</dt><dd>{date(application.updatedAt)}</dd></div>
    <div><dt>Reference</dt><dd className="application-reference">{application.id}</dd></div>
  </dl>;
}

function Dashboard() {
  const state = useRemote<{ applications: Application[] }>('/api/v2/training/applications');
  const intakes = useRemote<{ cohorts: Cohort[] }>('/api/v2/cohorts');
  return <>
    <div className="portal-heading"><div><p className="eyebrow">YOUR TRAINING JOURNEY</p><h1>Your next step, in view.</h1><p>Your drafts, current application status and next action. Private to your account. An offer is not a confirmed place until arrangements are agreed with the team.</p></div><a className="text-link" href="#/library">Keep learning at your pace</a></div>
    <RemoteNotice state={state} />
    <div className="portal-grid application-grid">{state.value?.applications.map(application => {
      const status = applicationStatus(application.status);
      return <article className="portal-card application-card" key={application.id}>
        <span className={`application-badge application-badge-${status.tone}`} id={`application-status-${application.id}`}>{status.label}</span>
        <h2>{application.cohortTitle}</h2><p>{application.data.track || 'Track not chosen yet'}</p>
        <ApplicationState application={application} /><ApplicationFacts application={application} />
        <a className="text-link" href={`#/apply/${application.cohortId}`} aria-describedby={`application-status-${application.id}`}>{status.action}<span className="sr-only"> for {application.cohortTitle}</span> <span aria-hidden="true">&rarr;</span></a>
      </article>;
    })}</div>
    {state.value?.applications.length === 0 && <section className="platform-panel application-empty"><p className="studio-overline">YOUR FIRST STEP</p><h2>A direction starts with you.</h2><p>You have not started an application yet. Choose an announced intake below when one is available.</p><a className="text-link" href="#/training">How training applications work</a></section>}
    <section className="portal-section"><h2>Intakes</h2><RemoteNotice state={intakes} /><CohortCards cohorts={intakes.value?.cohorts || []} />{intakes.value?.cohorts.length === 0 && <p className="platform-notice">Intakes are planned for Q1 and Q4. Exact dates and fees have not been announced.</p>}</section>
  </>;
}

export function TrainingDashboard() { const { user } = useAccount(); return <div className="wrap page-section studio-page training-page"><PortalNav /><AccountGate><Dashboard key={user?.id} /></AccountGate></div>; }

function ApplicationEditor({ cohort, saved, reload }: { cohort: Cohort; saved?: Application; reload: () => void }) {
  const [data, setData] = useState<Details>(saved?.data || { track: '', format: 'undecided', experience: '', goals: '', phone: '' });
  const [consent, setConsent] = useState(false), [pending, setPending] = useState(false), [notice, setNotice] = useState('');
  const editable = !saved || ['draft', 'withdrawn'].includes(saved.status);
  const { user } = useAccount();
  async function save(submit: boolean) {
    if (pending || !editable) return;
    setPending(true); setNotice('');
    try { await request(`/api/v2/training/cohorts/${cohort.id}/application`, jsonBody({ data, version: saved?.version || 0, submit, consent }, 'PUT')); reload(); }
    catch (error) { setNotice(message(error)); } finally { setPending(false); }
  }
  async function withdraw() {
    if (pending || !window.confirm('Withdraw this application? It will no longer be under review.')) return;
    setPending(true); setNotice('');
    try { await request(`/api/v2/training/applications/${saved!.id}/withdraw`, jsonBody({ version: saved!.version })); reload(); }
    catch (error) { setNotice(message(error)); } finally { setPending(false); }
  }
  return <>
    <a className="back-link" href="#/training-dashboard">Back to training dashboard</a>
    <div className="portal-heading"><div><p className="eyebrow">{cohort.year} / Q{cohort.quarter} / TRAINING APPLICATION</p><h1>{cohort.title}</h1><p>{cohort.details}</p></div><span className={`application-badge application-badge-${saved ? applicationStatus(saved.status).tone : 'neutral'}`}>{saved ? applicationStatus(saved.status).label : 'Not started'}</span></div>
    <div className="training-layout application-layout">
      <aside className="application-context">
        {saved ? <ApplicationState application={saved} headingLevel={2} /> : <div className="application-next application-next-blue"><p className="studio-overline">START WITH A DRAFT</p><h2>A little context goes a long way.</h2><p>Tell us what you want to build and where you are starting. You can save an unfinished draft before submitting.</p></div>}
        <section className="platform-panel"><h2>Intake details</h2><dl className="journey-facts"><div><dt>Training starts</dt><dd>{date(cohort.startsAt)}</dd></div><div><dt>Application deadline</dt><dd>{date(cohort.closesAt)}</dd></div><div><dt>Format</dt><dd>{cohort.format}</dd></div></dl><p>{cohort.tuitionNote}</p>{saved && <ApplicationFacts application={saved} />}</section>
      </aside>
      <section className="platform-panel application-form-panel"><h2>{editable ? 'Your starting point.' : 'Your application.'}</h2><p>{user?.name} / {user?.email}</p>
        <p className="small-note">{editable ? 'All fields except phone are required to submit. A draft can be incomplete. Save before leaving this page.' : 'Your submitted details are read-only. Check the status panel for your next step.'}</p>
        <form className="platform-form" onSubmit={e => { e.preventDefault(); void save(true); }}>
          <label>What would you like to learn?<input required maxLength={80} minLength={2} disabled={!editable || pending} value={data.track} onChange={e => setData({ ...data, track: e.target.value })} /></label>
          <label>Preferred format<select value={data.format} disabled={!editable || pending} onChange={e => setData({ ...data, format: e.target.value })}><option value="undecided">Not sure yet</option><option value="online">Online</option><option value="physical">Physical</option></select></label>
          <label>Your experience<textarea required maxLength={1000} minLength={2} disabled={!editable || pending} value={data.experience} onChange={e => setData({ ...data, experience: e.target.value })} /></label>
          <label>What do you want to achieve?<textarea required maxLength={2000} minLength={10} disabled={!editable || pending} value={data.goals} onChange={e => setData({ ...data, goals: e.target.value })} /></label>
          <label>Phone (optional)<input type="tel" autoComplete="tel" maxLength={30} disabled={!editable || pending} value={data.phone} onChange={e => setData({ ...data, phone: e.target.value })} /></label>
          {editable && <>
            <label className="platform-check"><input type="checkbox" checked={consent} disabled={pending} onChange={e => setConsent(e.target.checked)} /><span>I agree that Billion Codes can store and review this application. This does not reserve a place or authorize a payment.</span></label>
            <div className="platform-actions"><button className="button button-outline" type="button" disabled={pending} onClick={() => save(false)}>Save draft</button><button className="button button-dark" disabled={pending || !consent || !cohort.acceptingApplications}>Submit application</button></div>
            {!cohort.acceptingApplications && <p className="small-note">This intake is not accepting submissions. You can still save a draft.</p>}
          </>}
          {saved && !['withdrawn', 'declined'].includes(saved.status) && <button className="text-link" type="button" disabled={pending} onClick={withdraw}>Withdraw application</button>}
          {pending && <p role="status">Saving your application...</p>}{notice && <p role="alert" className="platform-error">{notice}</p>}
        </form>
      </section>
    </div>
  </>;
}

function ApplicationData({ id }: { id: string }) {
  const intakes = useRemote<{ cohorts: Cohort[] }>('/api/v2/cohorts');
  const state = useRemote<{ applications: Application[] }>('/api/v2/training/applications');
  const cohort = intakes.value?.cohorts.find(item => item.id === id), saved = state.value?.applications.find(item => item.cohortId === id);
  return <><RemoteNotice state={intakes} /><RemoteNotice state={state} />{cohort && state.value && <ApplicationEditor key={`${id}:${saved?.version || 0}`} cohort={cohort} saved={saved} reload={state.reload} />}{intakes.value && !cohort && <p role="alert">This intake was not found.</p>}</>;
}
export function ApplyPage({ id }: { id: string }) { return <div className="wrap page-section studio-page training-page"><PortalNav /><AccountGate><ApplicationData id={id} /></AccountGate></div>; }
