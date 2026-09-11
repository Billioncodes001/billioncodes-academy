import { useRef, useState, type FormEvent } from 'react';
import { ApiError, request } from './api';

type Kind = 'applications' | 'project-requests';
type Values = Record<string, string | boolean>;
type Errors = Record<string, string>;
const empty: Values = { name: '', email: '', phone: '', track: '', format: 'undecided', experience: '', goals: '', category: 'business-software', summary: '', details: '', targetDate: '', consent: false, website: '' };
// Memory only: preserve drafts through navigation, never put personal details on disk.
const drafts: Record<Kind, { values: Values; key?: string }> = {
  applications: { values: { ...empty } },
  'project-requests': { values: { ...empty } },
};
const length = (value: string) => Array.from(value.trim()).length;

function validate(values: Values, kind: Kind): Errors {
  const errors: Errors = {};
  const ranges: Record<string, [number, number]> = {
    name: [2, 100],
    ...(kind === 'applications' ? { track: [2, 80], experience: [2, 1000], goals: [10, 2000] } : { summary: [10, 160], details: [20, 5000] }),
  };
  for (const [field, [min, max]] of Object.entries(ranges)) {
    const size = length(String(values[field] ?? ''));
    if (size < min || size > max) errors[field] = `Please enter ${min} to ${max} characters.`;
  }
  const email = String(values.email).trim();
  if (email.length > 254 || !/^[\x21-\x7e]+$/.test(email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.split('@')[0].length > 64) errors.email = 'Enter a valid email address, such as name@example.com.';
  const phone = String(values.phone).trim();
  if (phone && (length(phone) < 7 || length(phone) > 30 || !/^[+0-9(). -]+$/.test(phone))) errors.phone = 'Use 7 to 30 characters: digits, spaces, +, parentheses, dots or hyphens.';
  if (kind === 'applications' && !['online', 'physical', 'undecided'].includes(String(values.format))) errors.format = 'Choose a training format.';
  if (kind === 'project-requests' && !['business-software', 'mentorship', 'code-review'].includes(String(values.category))) errors.category = 'Choose a support category.';
  const date = String(values.targetDate);
  if (kind === 'project-requests' && date) {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || Number(date.slice(0, 4)) < 2026 || Number(date.slice(0, 4)) > 2100) errors.targetDate = 'Choose a real date between 2026 and 2100.';
  }
  if (values.consent !== true) errors.consent = 'Please give permission to store and review your enquiry before sending.';
  return errors;
}

function Field({ label, name, value, error, hint, multiline, type = 'text', maxLength, onChange, children }: {
  label: string; name: string; value: string; error?: string; hint?: string; multiline?: boolean; type?: string; maxLength?: number;
  onChange: (name: string, value: string) => void; children?: React.ReactNode;
}) {
  const described = [hint && `${name}-hint`, error && `${name}-error`].filter(Boolean).join(' ') || undefined;
  const props = { id: name, name, value, 'aria-invalid': !!error, 'aria-describedby': described, onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange(name, event.target.value) };
  const optional = ['phone', 'targetDate'].includes(name);
  return <div className="field">
    <label htmlFor={name}>{label}{optional && <span className="optional">Optional</span>}</label>
    {hint && <p className="field-hint" id={`${name}-hint`}>{hint}</p>}
    {children ? <select {...props} required>{children}</select> : multiline ? <textarea {...props} rows={4} maxLength={maxLength} required={!optional} /> : <input {...props} type={type} maxLength={maxLength} required={!optional} autoComplete={name === 'name' ? 'name' : name === 'email' ? 'email' : name === 'phone' ? 'tel' : 'off'} {...(type === 'date' ? { min: '2026-01-01', max: '2100-12-31' } : {})} />}
    {error && <p className="field-error" id={`${name}-error`}>{error}</p>}
  </div>;
}

export function EnquiryForm({ kind }: { kind: Kind }) {
  const training = kind === 'applications';
  const [values, setValues] = useState<Values>(() => ({ ...drafts[kind].values }));
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState('');
  const noticeRef = useRef<HTMLDivElement>(null);
  const submitted = useRef(false);

  function update(name: string, value: string | boolean) {
    const next = { ...values, [name]: value };
    drafts[kind] = { values: next };
    setValues(next);
    setErrors(previous => { const remaining = { ...previous }; delete remaining[name]; return remaining; });
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitted.current) return;
    const found = validate(values, kind);
    setErrors(found);
    setMessage('');
    if (Object.keys(found).length) {
      setMessage('Please check the highlighted fields. Nothing has been sent.');
      requestAnimationFrame(() => noticeRef.current?.focus());
      return;
    }
    const keys = training ? ['name', 'email', 'phone', 'track', 'format', 'experience', 'goals', 'consent', 'website'] : ['name', 'email', 'phone', 'category', 'summary', 'details', 'targetDate', 'consent', 'website'];
    const payload = Object.fromEntries(
      keys.map(key => [key, typeof values[key] === 'string' ? String(values[key]).trim() : values[key]])
        .filter(([key, value]) => !(['phone', 'targetDate'].includes(String(key)) && value === ''))
    );
    if (new TextEncoder().encode(JSON.stringify(payload)).length > 16384) {
      setMessage('Your enquiry is too large to send. Please shorten the details; your draft is still here.');
      requestAnimationFrame(() => noticeRef.current?.focus());
      return;
    }
    submitted.current = true;
    setBusy(true);
    try {
      drafts[kind].key ??= crypto.randomUUID();
      const result = await request<{ accepted: boolean; id: string }>(`/api/v1/${kind}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': drafts[kind].key! },
        body: JSON.stringify(payload),
      });
      if (result.accepted !== true || typeof result.id !== 'string' || !result.id) throw new ApiError('The service did not confirm receipt. Please try again.');
      setSuccess(result.id);
      drafts[kind] = { values: { ...empty } };
      setValues({ ...empty });
      requestAnimationFrame(() => noticeRef.current?.focus());
    } catch (error) {
      setErrors(error instanceof ApiError ? error.fields : {});
      setMessage(`Receipt is not confirmed. ${error instanceof Error ? error.message : 'Please try again.'} Your draft is still here.`);
      requestAnimationFrame(() => noticeRef.current?.focus());
    } finally {
      setBusy(false);
      submitted.current = false;
    }
  }

  if (success) return <div className="success-card" ref={noticeRef} tabIndex={-1} role="status">
    <span className="eyebrow">Enquiry received</span>
    <h2>Thank you for reaching out.</h2>
    <p>Your {training ? 'training application' : 'project enquiry'} has been recorded for review. This is not {training ? 'a confirmed place or booking' : 'an accepted project or quote'}.</p>
    <p className="reference">Reference <strong>{success}</strong></p>
    <p>No payment has been taken. Please keep this reference if you contact us.</p>
    <a className="button button-dark" href="#/courses">Explore the free introductions <span aria-hidden="true">↗</span></a>
  </div>;

  const field = (name: string, label: string, options: Partial<React.ComponentProps<typeof Field>> = {}) => <Field key={name} name={name} label={label} value={String(values[name] ?? '')} error={errors[name]} onChange={update} {...options} />;
  return <form noValidate onSubmit={submit} className="enquiry-form" aria-label={training ? 'Training application' : 'Project enquiry'}>
    <div className="form-title"><span className="eyebrow">{training ? 'Your next chapter' : 'Tell us what you have in mind'}</span><h2>{training ? 'Apply for training' : 'Start a conversation'}</h2><p>All fields are required unless marked optional.</p></div>
    {message && <div className="form-notice" role="alert" tabIndex={-1} ref={noticeRef}><p>{message}</p>{Object.keys(errors).length > 0 && <ul>{Object.entries(errors).map(([name, error]) => <li key={name}><a href={`#${name}`} onClick={event => { event.preventDefault(); document.getElementById(name)?.focus(); }}>{name === 'targetDate' ? 'Target date' : name.charAt(0).toUpperCase() + name.slice(1)}: {error}</a></li>)}</ul>}</div>}
    <fieldset disabled={busy} className="form-fields">
      <legend className="sr-only">{training ? 'Training application details' : 'Project enquiry details'}</legend>
      <div className="field-row">{field('name', 'Full name', { maxLength: 100 })}{field('email', 'Email address', { type: 'email', maxLength: 254 })}</div>
      {field('phone', 'Phone number', { type: 'tel', maxLength: 30 })}
      {training ? <>
        {field('track', 'What would you like to learn?', { maxLength: 80, hint: 'For example, web development. Tell us your interest, not a paid course selection.' })}
        {field('format', 'Preferred training format', { children: <><option value="undecided">I am not sure yet</option><option value="online">Online</option><option value="physical">Physical / in person</option></> })}
        {field('experience', 'Your experience so far', { multiline: true, maxLength: 1000, hint: 'New to coding? Say so. A starting point is enough.' })}
        {field('goals', 'What would you like to be able to build?', { multiline: true, maxLength: 2000, hint: 'At least 10 characters. A short, specific goal helps us understand your needs.' })}
      </> : <>
        {field('category', 'Type of support', { children: <><option value="business-software">Business software</option><option value="mentorship">Project mentorship</option><option value="code-review">Code review</option></> })}
        {field('summary', 'The project in one sentence', { maxLength: 160, hint: '10 to 160 characters.' })}
        {field('details', 'The problem you want to solve', { multiline: true, maxLength: 5000, hint: 'At least 20 characters. Who is it for, what should it do, and what help do you need?' })}
        {field('targetDate', 'Preferred target date', { type: 'date', hint: 'A preference only, not a commitment to a delivery date.' })}
      </>}
      <div className="honeypot" aria-hidden="true"><label htmlFor="website">Leave this field empty</label><input id="website" name="website" type="text" value={String(values.website)} onChange={event => update('website', event.target.value)} tabIndex={-1} autoComplete="off" /></div>
      <div className="privacy-callout"><strong>Keep it non-confidential.</strong> Do not include passwords, payment details, private customer data or proprietary code. Attachments are not accepted at launch.</div>
      <div className="consent-field"><label className="checkbox-label" htmlFor="consent"><input type="checkbox" id="consent" checked={values.consent === true} onChange={event => update('consent', event.target.checked)} aria-invalid={!!errors.consent} aria-describedby={errors.consent ? 'consent-error' : 'consent-note'} required /><span>I agree that Billion Codes may store these details to review and respond to this enquiry.</span></label><p id="consent-note">Not marketing consent. Read the <a href="#/policies">launch privacy notice</a>.</p>{errors.consent && <p className="field-error" id="consent-error">{errors.consent}</p>}</div>
      <button className="button button-dark submit-button" type="submit" disabled={busy}>{busy ? 'Sending enquiry...' : training ? 'Send training application' : 'Send project enquiry'}<span aria-hidden="true">↗</span></button>
    </fieldset>
    <p className="form-footnote" role="status">{busy ? 'Please wait for confirmation. Do not close this page.' : 'No payment. No automatic enrolment. Your draft stays in this tab until it is sent or the page is reloaded.'}</p>
    <p className="email-fallback">Having trouble? <a href={`mailto:jhardeyemor@gmail.com?subject=${encodeURIComponent(training ? 'Billion Codes training enquiry' : 'Billion Codes project enquiry')}`}>Email Josiah instead</a>. Please send only a non-confidential summary.</p>
  </form>;
}
