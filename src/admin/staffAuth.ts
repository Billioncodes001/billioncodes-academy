// Staff sign-in for the private operations console (public/admin.html).
// Bundled separately to /admin-auth.js so the console keeps its own strict, nonce-based CSP.
// Sessions use in-memory persistence: reloading, locking or leaving the console signs out.
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, browserPopupRedirectResolver, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut, type Auth, type User } from 'firebase/auth';

type Config = { apiKey: string; projectId: string; authDomain: string; appId: string };
type Identity = { email: string; verified: boolean };
let app: FirebaseApp | undefined;
let auth: Auth | undefined;

function client(config: Config) {
  if (!auth) {
    app = initializeApp(config, 'staff-console');
    auth = initializeAuth(app, { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
  }
  return auth;
}
const identity = (user: User): Identity => ({ email: user.email || '', verified: user.emailVerified });
function friendly(error: unknown): Error {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'Email or password is incorrect.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/popup-closed-by-user': 'Google sign-in was closed before it finished.',
    'auth/popup-blocked': 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.',
    'auth/network-request-failed': 'Network problem. Check your connection and try again.',
    'auth/unauthorized-domain': 'Google sign-in is not enabled for this website address yet.'
  };
  return new Error(messages[code] || 'Sign-in failed. Try again.');
}

const api = Object.freeze({
  async google(config: Config) {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try { return identity((await signInWithPopup(client(config), provider)).user); } catch (error) { throw friendly(error); }
  },
  async email(config: Config, email: string, password: string) {
    try { return identity((await signInWithEmailAndPassword(client(config), email.trim(), password)).user); } catch (error) { throw friendly(error); }
  },
  async sendVerification() {
    if (!auth?.currentUser) throw new Error('Sign in again first.');
    await sendEmailVerification(auth.currentUser, { url: `${location.origin}/admin`, handleCodeInApp: false });
  },
  async resetPassword(config: Config, email: string) {
    if (!email.trim()) throw new Error('Enter your email address first.');
    try { await sendPasswordResetEmail(client(config), email.trim(), { url: `${location.origin}/admin`, handleCodeInApp: false }); }
    catch (error) { throw friendly(error); }
  },
  // Fresh ID token for each API call; Firebase refreshes it before expiry.
  async token() {
    const value = await auth?.currentUser?.getIdToken();
    if (!value) throw new Error('Your staff sign-in ended. Sign in again.');
    return value;
  },
  async signOut() { if (auth) await signOut(auth); }
});
Object.defineProperty(window, 'billionStaffAuth', { value: api, writable: false, configurable: false });
