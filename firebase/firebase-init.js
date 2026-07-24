
// ===========================================================
// What this file does:
//   1. Initializes the Firebase app from firebase-config.js
//   2. Sets up Firebase Authentication with Google Sign-In
//   3. Initializes Firestore — created but never read from or
//      written to in this phase. It's just ready for Phase 2.
//   4. Exposes a small, stable API on `window.TMRAuth` so the
//      main app (a classic script, not a module) can use auth
//      without needing to become a module itself or bundle anything.
//
// What this file deliberately does NOT do:
//   - No Firestore reads or writes
//   - No changes to LocalStorage
//   - No changes to any existing app data or UI
//
// This is a native ES module — no build step, no bundler. It runs
// as-is on GitHub Pages or any static host.
// ============================================================

import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// Firestore is initialized only — intentionally unused until Phase 2.
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

function serializeUser(u) {
  if (!u) return null;
  // Only the fields Phase 1 asked for — nothing else is stored or exposed.
  return {
    uid: u.uid,
    displayName: u.displayName,
    email: u.email,
    photoURL: u.photoURL,
  };
}

function notify(user) {
  window.TMRAuth.currentUser = user;
  window.dispatchEvent(new CustomEvent('tmr-auth-changed', { detail: user }));
}

// Public bridge consumed by the app's TSX (see the useAuthUser hook in index.html).
window.TMRAuth = window.TMRAuth || {};
window.TMRAuth.currentUser = null;
window.TMRAuth.auth = auth;
window.TMRAuth.db = db; // reserved for Phase 2 — do not use yet

// Continue with Google. Tries a popup first (best experience on desktop
// Safari/Chrome); falls back to a full-page redirect when a popup can't
// be used — which is common inside an installed iOS/iPadOS PWA and in
// some in-app/standalone browser contexts.
window.TMRAuth.signInWithGoogle = async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return serializeUser(result.user);
  } catch (err) {
    const shouldFallbackToRedirect = [
      'auth/popup-blocked',
      'auth/popup-closed-by-user',
      'auth/cancelled-popup-request',
      'auth/operation-not-supported-in-this-environment',
    ].includes(err && err.code);
    if (shouldFallbackToRedirect) {
      await signInWithRedirect(auth, googleProvider);
      return null; // the page will navigate away for the redirect flow
    }
    throw err;
  }
};

// Sign-out only ever signs the user out of Firebase Auth. It never touches
// LocalStorage or any application data — those are completely separate systems.
window.TMRAuth.signOutUser = function signOutUser() {
  return signOut(auth);
};

(async function init() {
  // Explicit local persistence: the user stays signed in across visits/reloads,
  // and Firebase restores the session automatically — this is also the SDK's
  // default, but it's set explicitly here so the behavior is documented and stable.
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (err) {
    console.warn('TMR Auth: could not set persistence', err);
  }

  // Completes a signInWithRedirect() flow, if one is in progress (e.g. the
  // PWA/iOS popup fallback above). Safe to call even when there's nothing
  // to complete — it just resolves with null.
  try {
    await getRedirectResult(auth);
  } catch (err) {
    console.warn('TMR Auth: redirect sign-in could not complete', err);
  }

  onAuthStateChanged(auth, (u) => {
    const user = serializeUser(u);
    notify(user);
    if (!window.TMRAuth._ready) {
      window.TMRAuth._ready = true;
      // Fired exactly once, after the very first auth state is known, so the
      // app can tell "still checking" apart from "checked, nobody's signed in".
      window.dispatchEvent(new CustomEvent('tmr-auth-ready', { detail: user }));
    }
  });
})();
