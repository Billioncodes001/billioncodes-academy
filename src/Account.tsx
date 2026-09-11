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
export function AccountPage() {
  const account = useAccount();
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const [profile, setProfile] = useState<{ name: string; email: string } | null>(null), [consent, setConsent] = useState(false);
  async function login() {
    setPending(true); setError('');
    try {
      const result = await (await import('./firebaseClient')).googleSignIn(account.config!.firebase!);
      const current = await request<{ user: Member | null }>('/api/v2/account');
      if (current.user) { await account.refresh(); window.location.hash = '/library'; }
      else setProfile(result);
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      setError(code === 'auth/popup-blocked' ? 'Allow the Google sign-in popup for this site, then try again.' : code === 'auth/popup-closed-by-user' ? 'Sign-in was cancelled. You can try again.' : code.startsWith('auth/') ? 'Google sign-in could not finish. Please retry or contact the team.' : message(error));
    } finally { setPending(false); }
  }
  async function complete(event: React.FormEvent) {
    event.preventDefault(); setPending(true); setError('');
    try { await request('/api/auth/register', jsonBody({ name: profile!.name, consent })); await account.refresh(); window.location.hash = '/library'; }
    catch (error) { setError(message(error)); } finally { setPending(false); }
  }
  return <div className="wrap page-section account-page"><div className="account-intro"><p className="eyebrow">BILLION CODES / YOUR NEXT CHAPTER</p><h1>A little curiosity.<br /><span className="lime-underline">A lot of possibility.</span></h1><p className="lead">Your courses, your progress, your next training intake. All connected to one account.</p><div className="account-paths"><div><span>01 / YOUR PACE</span><h2>The course library</h2><p>Learn independently and keep your reading progress across devices when signed in.</p></div><div><span>02 / TOGETHER</span><h2>The training portal</h2><p>Prepare your application, choose an announced intake and follow its review.</p></div></div><p className="small-note">No payment is required to create an account. Sign-in lasts for this page session; reload or close the page to end it.</p></div><section className="platform-panel signin-panel"><p className="eyebrow">START WHERE YOU ARE</p><h2>{account.user ? `Welcome, ${account.user.name.split(' ')[0]}.` : profile ? 'Make it yours.' : 'Your learning starts here.'}</h2>{account.user ? <><p>{account.user.email}</p><a href="#/library" className="button button-dark">Open my dashboard</a><PortalNav /></> : profile ? <form className="platform-form" onSubmit={complete}><p>Google verified <strong>{profile.email}</strong>.</p><label>Full name<input value={profile.name} required minLength={2} maxLength={100} onChange={e => setProfile({ ...profile, name: e.target.value })} autoComplete="name" /></label><label className="platform-check"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} required /><span>I agree to the <a href="#/policies">account privacy notice</a> and storage of my profile, course progress and training applications. This is not marketing consent.</span></label><button className="button button-dark" disabled={pending || !consent}>{pending ? 'Creating account...' : 'Create my Academy account'}</button></form> : <><p>Continue securely with Google. We never see or store your Google password.</p><button className="button button-dark google-button" disabled={pending || !account.config?.accountsReady} onClick={login}>{pending ? 'Connecting to Google...' : 'Continue with Google'}</button>{account.loading ? <p role="status">Checking sign-in availability...</p> : !account.config?.accountsReady && <p role="status">Sign-in is not enabled yet. You can still explore the free introductions.</p>}<p className="small-note">Google processes your sign-in information. We request only basic identity, not access to Gmail or Drive.</p><a className="text-link" href="#/learn/web-foundations-intro">Read without an account</a></>}{(error || account.error) && <p className="platform-error" role="alert">{error || account.error}</p>}</section></div>;
}
