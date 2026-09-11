import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { request } from './api';
import type { FirebaseConfig } from './firebaseClient';
import './platform.css';

export type Member = { id: string; name: string; email: string };
type Config = { enabled: boolean; accountsReady: boolean; firebase: FirebaseConfig | null; pdfStorageReady: boolean; videoReady: boolean; checkoutEnabled: boolean };
type Identity = { config: Config | null; user: Member | null; error: string; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void> };
const AccountContext = createContext<Identity | null>(null);
export const message = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
export const jsonBody = (data: unknown, method = 'POST'): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
export function AccountProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null), [user, setUser] = useState<Member | null>(null);
  const [error, setError] = useState(''), [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    request<Config>('/api/v2/platform').then(value => { if (active) setConfig(value); }).catch(() => { if (active) setError('Account services could not be reached. Please reload to try again.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function refresh() { const value = await request<{ user: Member | null }>('/api/v2/account'); setUser(value.user); }
  async function logout() { await (await import('./firebaseClient')).googleSignOut(); setUser(null); window.location.hash = '/account'; }
  return <AccountContext.Provider value={{ config, user, error, loading, refresh, logout }}>{children}</AccountContext.Provider>;
}
export function useAccount() { const value = useContext(AccountContext); if (!value) throw new Error('Missing account provider'); return value; }
export function AccountNav() {
  const { config, user } = useAccount();
  return config?.enabled ? <a href={user ? '#/library' : '#/account'}>{user ? 'My account' : 'Sign in'}</a> : null;
}
export function AccountGate({ children }: { children: ReactNode }) {
  const { user, config, loading, error } = useAccount();
  if (loading) return <p role="status">Checking account availability...</p>;
  if (user) return <>{children}</>;
  return <section className="platform-panel"><p className="eyebrow">YOUR OWN SPACE TO GROW</p><h1>One account.<br />Two ways to learn.</h1><p>Sign in to save your course progress or manage a training application. Your practice-lab drafts stay on this device and are not uploaded.</p>{error && <p role="alert">{error}</p>}{config?.accountsReady ? <a className="button button-dark" href="#/account">Create an account or sign in</a> : <p role="status">Account setup is being completed. Free introductions are still available.</p>}</section>;
}
export function PortalNav() {
  const { user, logout } = useAccount();
  const [error, setError] = useState('');
  return <><nav className="portal-nav" aria-label="Account navigation"><a href="#/library">My learning</a><a href="#/training-dashboard">Training dashboard</a><a href="#/course-library">Explore courses</a><a href="#/resources">Open resources</a>{user && <button onClick={() => { logout().catch(error => setError(message(error))); }}>Sign out</button>}</nav>{error && <p role="alert">{error}</p>}</>;
}
type AccountMode = 'signin' | 'signup' | 'reset';
type Profile = { name: string; email: string; verified: boolean };
function authError(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found'].includes(code)) return 'We could not sign you in. Check your email and password, try Google, or reset your password.';
  if (code === 'auth/email-already-in-use' || code === 'auth/account-exists-with-different-credential') return 'We could not create this account. Try signing in, continuing with Google, or resetting your password.';
  if (code === 'auth/weak-password' || code === 'auth/password-does-not-meet-requirements') return 'Choose a password of 12 to 128 characters. A long, unique passphrase works well.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please wait a few minutes before trying again.';
  if (code === 'auth/network-request-failed') return 'Check your internet connection and try again.';
  if (code === 'auth/popup-blocked') return 'Allow the Google sign-in popup, or use email and password below.';
  if (code === 'auth/popup-closed-by-user') return 'Google sign-in was cancelled. You can try again.';
  if (code.startsWith('auth/')) return 'Sign-in could not finish. Please try again or contact the team.';
  return message(error);
}
export function AccountPage() {
  const account = useAccount();
  const [mode, setMode] = useState<AccountMode>('signin');
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState(''), [email, setEmail] = useState('');
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false), [consent, setConsent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const ready = !!account.config?.accountsReady;
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  function changeMode(value: AccountMode) {
    setMode(value); setError(''); setNotice(''); setPassword(''); setConfirmation(''); setConsent(false); setShowPassword(false);
  }
  async function acceptIdentity(value: Profile) {
    setPassword(''); setConfirmation('');
    if (!value.verified) { setProfile(value); return; }
    const current = await request<{ user: Member | null }>('/api/v2/account');
    if (current.user) { await account.refresh(); window.location.hash = '/library'; }
    else setProfile(value);
  }
  async function googleLogin() {
    setPending(true); setError(''); setNotice(''); setConsent(false);
    try { await acceptIdentity(await (await import('./firebaseClient')).googleSignIn(account.config!.firebase!)); }
    catch (error) { setError(authError(error)); }
    finally { setPending(false); }
  }
  async function submitEmail(event: React.FormEvent) {
    event.preventDefault(); setError(''); setNotice('');
    if (mode === 'signup' && (password.length < 12 || password.length > 128 || password !== confirmation)) {
      setError(password !== confirmation ? 'Your passwords do not match.' : 'Choose a password of 12 to 128 characters.'); return;
    }
    setPending(true);
    try {
      const client = await import('./firebaseClient');
      if (mode === 'reset') {
        await client.resetPassword(account.config!.firebase!, email);
        setNotice('If this email can receive a password reset, a link will arrive shortly. Check your inbox and spam folder. We do not disclose whether an account exists.');
        setCooldown(60);
      } else if (mode === 'signup') {
        if (!consent) throw new Error('Accept the account privacy notice before creating an account.');
        const value = await client.emailSignUp(account.config!.firebase!, name, email, password);
        setProfile(value); setPassword(''); setConfirmation('');
        try { await client.sendVerification(); setCooldown(60); setNotice('Verification email sent. Open the link in your inbox, then return here.'); }
        catch (error) { setError('Your sign-in account was created, but the verification email could not be sent. Use Resend verification email to try again. ' + authError(error)); }
      } else await acceptIdentity(await client.emailSignIn(account.config!.firebase!, email, password));
    } catch (error) { setError(authError(error)); }
    finally { setPending(false); }
  }
  async function verify(resend = false) {
    setPending(true); setError(''); setNotice('');
    try {
      const client = await import('./firebaseClient');
      if (resend) { await client.sendVerification(); setCooldown(60); setNotice('Verification email sent. Check your inbox and spam folder.'); }
      else {
        const value = await client.checkVerification();
        if (!value.verified) setNotice('Your email is not verified yet. Open the most recent verification link, then check again.');
        else await acceptIdentity({ ...value, name: value.name || profile!.name });
      }
    } catch (error) { setError(authError(error)); }
    finally { setPending(false); }
  }
  async function complete(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setError('');
    try { await request('/api/auth/register', jsonBody({ name: profile!.name, consent })); await account.refresh(); window.location.hash = '/library'; }
    catch (error) { setError(authError(error)); }
    finally { setPending(false); }
  }
  async function useAnotherAccount() {
    setPending(true); setError('');
    try { await (await import('./firebaseClient')).googleSignOut(); setProfile(null); changeMode('signin'); }
    catch (error) { setError(authError(error)); }
    finally { setPending(false); }
  }
  const privacy = <label className="platform-check"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required /><span>I agree to the <a href="#/policies">account privacy notice</a> and storage of my profile, course progress and training applications. This is not marketing consent.</span></label>;
  const title = account.user ? 'Welcome back.' : profile ? (profile.verified ? 'Make it yours.' : 'Check your inbox.') : mode === 'signup' ? 'Create your account.' : mode === 'reset' ? 'Forgot your password?' : 'Welcome back.';
  return <div className="wrap page-section account-page">
    <aside className="account-intro">
      <img className="account-official-logo" src="/brand/billioncodes-official-v1.jpeg" width="400" height="400" alt="Billion Codes" />
      <p className="eyebrow">BILLION CODES / LEARN. BUILD. GROW.</p>
      <h1>Your next chapter<br />starts here.</h1>
      <p>One account for the skills you want to learn and the projects you want to build.</p>
      <div className="account-paths">
        <div><span>01 / SELF-PACED</span><h2>Your course library</h2><p>Keep your courses and reading progress in one place.</p></div>
        <div><span>02 / GUIDED TRAINING</span><h2>Your training journey</h2><p>Apply for an announced intake and follow your application.</p></div>
      </div>
      <a href="#/learn/web-foundations-intro">Explore the free introduction without an account</a>
    </aside>
    <section className="platform-panel signin-panel" aria-labelledby="account-form-title">
      {!profile && !account.user && <div className="account-tabs" role="group" aria-label="Account options">
        <button type="button" aria-pressed={mode === 'signin'} disabled={pending} onClick={() => changeMode('signin')}>Sign in</button>
        <button type="button" aria-pressed={mode === 'signup'} disabled={pending} onClick={() => changeMode('signup')}>Create account</button>
      </div>}
      <h2 id="account-form-title">{title}</h2>
      {account.user ? <><p>You are signed in as <strong>{account.user.email}</strong>.</p><a href="#/library" className="button button-dark">Open my dashboard</a><PortalNav /></> : profile ? profile.verified ? (
        <form className="platform-form" onSubmit={complete}>
          <p>Verified email: <strong>{profile.email}</strong>. Confirm your details to finish your Academy profile.</p>
          <label>Full name<input value={profile.name} required minLength={2} maxLength={100} onChange={event => setProfile({ ...profile, name: event.target.value })} autoComplete="name" /></label>
          {privacy}
          <button className="button button-dark" disabled={pending || !consent}>{pending ? 'Creating account...' : 'Create my Academy account'}</button>
          <button type="button" className="account-text-button" disabled={pending} onClick={useAnotherAccount}>Use a different account</button>
        </form>
      ) : <div className="verification-step">
        <p>Verify <strong>{profile.email}</strong> before your Academy profile can be created. Your course library and training applications stay locked until then.</p>
        <ol><li>Open the verification email for Billion Codes Academy.</li><li>Follow the secure verification link.</li><li>Come back here and continue.</li></ol>
        <button className="button button-dark" disabled={pending} onClick={() => verify()}>{pending ? 'Please wait...' : 'I have verified my email'}</button>
        <button className="button button-outline" disabled={pending || cooldown > 0} onClick={() => verify(true)}>{cooldown ? 'Resend available in ' + cooldown + 's' : 'Resend verification email'}</button>
        <button className="account-text-button" disabled={pending} onClick={useAnotherAccount}>Use a different account</button>
      </div> : <>
        <p className="account-form-description">{mode === 'signup' ? 'Start with your details. Creating an account is free.' : mode === 'reset' ? 'Enter your email and we will help you reset your password securely through Firebase.' : 'Sign in to continue learning or manage your training application.'}</p>
        <form className="platform-form" onSubmit={submitEmail}>
          {mode === 'signup' && <label>Full name<input autoComplete="name" value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={100} /></label>}
          <label>Email address<input type="email" autoComplete={mode === 'signup' ? 'email' : 'username'} value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} autoCapitalize="none" spellCheck={false} /></label>
          {mode !== 'reset' && <>
            <label htmlFor="account-password">Password</label>
            <div className="password-control"><input id="account-password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} required minLength={mode === 'signup' ? 12 : 1} maxLength={mode === 'signup' ? 128 : 4096} aria-describedby={mode === 'signup' ? 'password-help' : undefined} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? 'Hide' : 'Show'}</button></div>
            {mode === 'signup' ? <><p id="password-help" className="password-help">Use 12 to 128 characters. Choose a unique passphrase you do not use elsewhere.</p><label>Confirm password<input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required minLength={12} maxLength={128} /></label>{privacy}</> : <button type="button" className="account-text-button forgot-link" disabled={pending} onClick={() => changeMode('reset')}>Forgot password?</button>}
          </>}
          <button className="button button-dark" disabled={pending || !ready || (mode === 'signup' && !consent) || (mode === 'reset' && cooldown > 0)}>{pending ? 'Please wait...' : mode === 'signup' ? 'Create account with email' : mode === 'reset' ? (cooldown ? 'Try again in ' + cooldown + 's' : 'Send password reset link') : 'Sign in with email'}</button>
        </form>
        {mode === 'reset' ? <button className="account-text-button" disabled={pending} onClick={() => changeMode('signin')}>Back to sign in</button> : <><div className="account-divider"><span>or continue with</span></div><button className="button google-button" disabled={pending || !ready} onClick={googleLogin}>Continue with Google</button></>}
        {account.loading ? <p role="status">Checking sign-in availability...</p> : !ready && <p role="status">Account services are unavailable. Please reload or contact the team.</p>}
      </>}
      {notice && <p className="account-notice" role="status">{notice}</p>}
      {(error || account.error) && <p className="platform-error" role="alert">{error || account.error}</p>}
      <p className="account-security-note">Your password goes directly to Firebase Authentication, never to our course database. Sign-in lasts for this page session; reload or close it to sign out.</p>
      <p className="account-support">Need help? <a href="mailto:jhardeyemor@gmail.com">Contact Billion Codes</a></p>
    </section>
  </div>;
}
