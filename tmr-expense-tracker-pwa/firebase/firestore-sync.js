// ============================================================
// TMR Expense Tracker — Firestore Sync (Phase 2)
// ============================================================
// This module is intentionally generic: it doesn't know what an
// "expense" or a "goal" is. It just reads/writes documents under
//   users/{uid}/{collectionName}/{docId}
// for whatever collection name it's given. That's what lets every
// one of the 8 data models reuse the exact same sync logic instead
// of duplicating per-module Firestore code.
//
// This file never decides *when* to sync — that's the React-side
// useSyncedCollection hook in index.html. This file only knows how.
// ============================================================

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js';

function db() {
  const firestore = window.TMRAuth && window.TMRAuth.db;
  if (!firestore) throw new Error('Firestore is not initialized yet.');
  return firestore;
}

// ---- Core per-user data collections (expenses, incomes, etc.) ----

// One-time full fetch, used for the first-sign-in merge on a device.
export async function fetchAllDocs(uid, collectionName) {
  const snap = await getDocs(collection(db(), 'users', uid, collectionName));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// Live subscription. Reports both additions/updates and removals via
// Firestore's docChanges(), and exposes hasPendingWrites so the caller
// can tell "this is my own optimistic write echoing back" apart from
// "this is a genuine change from another device" — the key to avoiding
// sync feedback loops.
export function subscribeToCollection(uid, collectionName, onChange, onError) {
  const ref = collection(db(), 'users', uid, collectionName);
  return onSnapshot(
    ref,
    { includeMetadataChanges: true },
    (snapshot) => {
      const changes = snapshot.docChanges().map((change) => {
        if (change.type === 'removed') {
          return { id: change.doc.id, _deleted: true };
        }
        return { id: change.doc.id, ...change.doc.data() };
      });
      if (changes.length === 0) return;
      onChange(changes, {
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
        fromCache: snapshot.metadata.fromCache,
      });
    },
    (err) => { if (onError) onError(err); }
  );
}

// Every write is tagged with updatedAt (client ISO timestamp) and
// updatedByDevice (a per-browser id) — not used to prevent loops today,
// but stored on every document specifically so a future, smarter
// conflict-resolution pass (Phase 2 requirement) has real data to work
// with instead of only ever having "last write wins" to go on.
export async function pushDoc(uid, collectionName, item, deviceId) {
  const { id, ...fields } = item;
  await setDoc(
    doc(db(), 'users', uid, collectionName, id),
    { ...fields, updatedAt: new Date().toISOString(), updatedByDevice: deviceId },
    { merge: true }
  );
}

export async function deleteRemoteDoc(uid, collectionName, id) {
  await deleteDoc(doc(db(), 'users', uid, collectionName, id));
}

// ---- Profile document: users/{uid} ----
// Firestore paths must alternate collection/document, so the cleanest
// valid path for "a profile document for this user" is the user's own
// top-level document — users/{uid} — with the 8 data collections as
// subcollections beneath it (users/{uid}/expenses, etc., already in use
// above). This document holds identity fields plus placeholders for
// future settings/subscription info; nothing reads those placeholders
// yet, they just exist so Phase 3+ work doesn't need a schema change.
export async function ensureProfileDocument(uid, authUser) {
  const ref = doc(db(), 'users', uid);
  const nowFields = {
    displayName: authUser?.displayName ?? null,
    email: authUser?.email ?? null,
    photoURL: authUser?.photoURL ?? null,
    updatedAt: new Date().toISOString(),
  };
  const existing = await getDoc(ref);
  if (!existing.exists()) {
    await setDoc(ref, {
      ...nowFields,
      createdAt: new Date().toISOString(),
      plan: 'free',      // placeholder — not used yet, reserved for future subscription tier
      settings: {},       // placeholder — not used yet, reserved for future per-user settings
    });
  } else {
    // merge:true so we only ever touch the identity fields here — any
    // settings/plan fields added later (by this or future code) are left alone.
    await setDoc(ref, nowFields, { merge: true });
  }
}

// Registered for completeness/parity with the auth bridge pattern already
// used in firebase-init.js — the React hook calls these via window.TMRAuth.firestoreSync
// rather than importing this module directly, since the app itself is a
// classic script, not a module.
window.TMRAuth = window.TMRAuth || {};
window.TMRAuth.firestoreSync = {
  fetchAllDocs,
  subscribeToCollection,
  pushDoc,
  deleteRemoteDoc,
  ensureProfileDocument,
};
