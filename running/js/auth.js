// Firebase Auth (Google sign-in), the only module that touches the Firebase SDK.
//
// The SDK is loaded lazily with import() from the official CDN, so the unit
// tests, the service worker and an offline start never need it. Tests (and
// anything else) can define globalThis.__RUNNING_TEST_AUTH__ before this
// module runs: an object with the same six methods, used instead of Firebase.
import { FIREBASE_CONFIG } from './config.js';

export const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/12.3.0';

const fake = typeof globalThis !== 'undefined' ? globalThis.__RUNNING_TEST_AUTH__ : undefined;

let sdk = null;          // { auth, fns } once loaded
let initPromise = null;  // resolves with the first auth state (User | null)
let user = null;
const listeners = new Set();

async function loadSdk() {
  const [appMod, authMod] = await Promise.all([
    import(`${FIREBASE_SDK}/firebase-app.js`),
    import(`${FIREBASE_SDK}/firebase-auth.js`),
  ]);
  const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(FIREBASE_CONFIG);
  let auth;
  try {
    auth = authMod.initializeAuth(app, {
      persistence: authMod.browserLocalPersistence,
      popupRedirectResolver: authMod.browserPopupRedirectResolver,
    });
  } catch {
    auth = authMod.getAuth(app); // already initialised (hot reload)
    await authMod.setPersistence(auth, authMod.browserLocalPersistence);
  }
  return { auth, fns: authMod };
}

/** Load Firebase and wait for the persisted session to be restored. Resolves with the user or null. */
export function initAuth() {
  if (fake) return fake.initAuth();
  if (!initPromise) {
    initPromise = loadSdk().then(s => {
      sdk = s;
      return new Promise(resolve => {
        let first = true;
        s.fns.onAuthStateChanged(s.auth, u => {
          user = u || null;
          if (first) { first = false; resolve(user); }
          for (const cb of listeners) { try { cb(user); } catch { /* listener error */ } }
        });
      });
    });
    initPromise.catch(() => { initPromise = null; }); // allow a retry (e.g. came back online)
  }
  return initPromise;
}

/** Subscribe to sign-in / sign-out. Returns an unsubscribe function. */
export function onUser(cb) {
  if (fake) return fake.onUser(cb);
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Google sign-in in a popup. Rejects with a Firebase error ({ code: 'auth/popup-blocked', … }). */
export async function signIn() {
  if (fake) return fake.signIn();
  await initAuth();
  const provider = new sdk.fns.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await sdk.fns.signInWithPopup(sdk.auth, provider);
  return cred.user;
}

export async function signOut() {
  if (fake) return fake.signOut();
  if (!sdk) { try { await initAuth(); } catch { return; } }
  await sdk.fns.signOut(sdk.auth);
}

/** Current ID token, or null when signed out. The SDK refreshes it before it expires. */
export async function getIdToken() {
  if (fake) return fake.getIdToken();
  try { await initAuth(); } catch { return null; }
  const u = sdk.auth.currentUser;
  return u ? u.getIdToken(false) : null;
}

export function currentUser() {
  if (fake) return fake.currentUser();
  return user;
}
