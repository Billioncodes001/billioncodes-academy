import { initializeApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, browserPopupRedirectResolver, GoogleAuthProvider, signInWithPopup, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, updateProfile, reload, type User } from 'firebase/auth';
import { setTokenProvider } from './api';

export type FirebaseConfig = { apiKey: string; projectId: string; authDomain: string; appId: string };
export type AuthIdentity = { name: string; email: string; verified: boolean };
let auth: ReturnType<typeof initializeAuth> | undefined;
const actions = { url: 'https://learnatbillioncodes.com/#/account', handleCodeInApp: false };
const identity = (user: User): AuthIdentity => ({ name: user.displayName || '', email: user.email || '', verified: user.emailVerified });
function client(config: FirebaseConfig) {
  if (!auth) {
    auth = initializeAuth(initializeApp(config), { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
    setTokenProvider(async () => auth?.currentUser?.getIdToken());
  }
  return auth;
}
export async function googleSignIn(config: FirebaseConfig) {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return identity((await signInWithPopup(client(config), provider)).user);
}
export async function emailSignIn(config: FirebaseConfig, email: string, password: string) {
  return identity((await signInWithEmailAndPassword(client(config), email.trim(), password)).user);
}
export async function emailSignUp(config: FirebaseConfig, name: string, email: string, password: string) {
  const result = await createUserWithEmailAndPassword(client(config), email.trim(), password);
  // Failure to save a display name must not hide an already-created account.
  try { await updateProfile(result.user, { displayName: name.trim() }); } catch { /* The Academy profile form can recover the name. */ }
  return { ...identity(result.user), name: name.trim() };
}
export async function sendVerification() {
  if (!auth?.currentUser) throw new Error('Sign in again to verify your email.');
  await sendEmailVerification(auth.currentUser, actions);
}
export async function checkVerification() {
  if (!auth?.currentUser) throw new Error('Sign in again to verify your email.');
  await reload(auth.currentUser);
  await auth.currentUser.getIdToken(true);
  return identity(auth.currentUser);
}
export async function resetPassword(config: FirebaseConfig, email: string) {
  try { await sendPasswordResetEmail(client(config), email.trim(), actions); }
  catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : '';
    if (code !== 'auth/user-not-found') throw error;
  }
}
export async function googleSignOut() {
  if (auth) await signOut(auth);
}
