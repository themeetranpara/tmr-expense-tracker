// ============================================================
// TMR Expense Tracker — Firebase Init (Phase 1 auth + Phase 2 additions)
// ============================================================
// What this file does:
//   1. Initializes the Firebase app from firebase-config.js
//   2. Sets up Firebase Authentication with Google Sign-In (unchanged from Phase 1)
//   3. Initializes Firestore WITH offline persistence (IndexedDB-backed),
//      where the browser supports it — falling back to an in-memory-only
//      instance otherwise, so the app never breaks on unsupported browsers.
//   4. On sign-in, bootstraps that user's users/{uid} profile document.
//   5. Exposes a small, stable API on `window.TMRAuth` so the main app
//      (a classic script, not a module) can use auth/Firestore without
//      needing to become a module itself or bundle anything.
//
// Actual per-collection sync logic (expenses, income, etc.) lives in
// firestore-sync.js, kept separate on purpose — this file only owns
// Firebase bootstrapping (app/auth/firestore/profile), nothing else.
//
// This is a native ES module — no build step, no bundler. It runs
// as-is on GitHub Pages or any static host.
// ============================================================

import { firebaseConfig } from './firebase-config.js';
import { ensureProfileDocument } from './firestore-sync.js';
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
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Firestore, with its own offline cache (IndexedDB) on top of our existing
// LocalStorage-first architecture. This does NOT change how the app reads/
// writes data day-to-day — LocalStorage remains what the UI reads from
// instantly (see useSyncedCollection in index.html). This is purely so
// Firestore itself can also queue writes/reads while offline and reconcile
// once back online, which is what makes multi-tab and offline-then-reconnect
// sync robust.
//
// persistentMultipleTabManager lets several open tabs/windows share one
// offline cache instead of fighting over it. If the browser doesn't support
// this (e.g. some private-browsing modes), we fall back to a plain
// in-memory Firestore instance rather than letting the app fail to load.
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (err) {
  console.warn('TMR Firestore: offline persistence unavailable in this browser, using in-memory cache instead.', err);
  db = getFirestore(app);
}

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

// Public bridge consumed by the app's TSX (see the useAuthUser / useSyncedCollection
// hooks in index.html).
window.TMRAuth = window.TMRAuth || {};
window.TMRAuth.currentUser = null;
window.TMRAuth.auth = auth;
window.TMRAuth.db = db;

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

    if (user) {
      // Fire-and-forget: creates users/{uid} on first sign-in, or quietly
      // refreshes the identity fields on subsequent sign-ins. Never blocks
      // auth-state notification, and never touches LocalStorage or any
      // existing app data.
      ensureProfileDocument(user.uid, user).catch((err) => {
        console.warn('TMR Firestore: could not create/update profile document', err);
      });
    }

    if (!window.TMRAuth._ready) {
      window.TMRAuth._ready = true;
      // Fired exactly once, after the very first auth state is known, so the
      // app can tell "still checking" apart from "checked, nobody's signed in".
      window.dispatchEvent(new CustomEvent('tmr-auth-ready', { detail: user }));
    }
  });
})();
