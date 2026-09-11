import { initializeApp } from 'firebase/app';
import { initializeAuth, inMemoryPersistence, browserPopupRedirectResolver, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { setTokenProvider } from './api';

export type FirebaseConfig = { apiKey: string; projectId: string; authDomain: string; appId: string };
let auth: ReturnType<typeof initializeAuth> | undefined;
export async function googleSignIn(config: FirebaseConfig) {
  if (!auth) {
    auth = initializeAuth(initializeApp(config), { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
    setTokenProvider(async () => auth?.currentUser?.getIdToken());
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return { name: result.user.displayName || '', email: result.user.email || '' };
}
export async function googleSignOut() {
  if (auth) await signOut(auth);
}
