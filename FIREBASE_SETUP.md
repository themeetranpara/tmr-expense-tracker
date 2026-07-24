# Firebase Auth — Phase 1 Setup

## 1. Where the new files go

```
your-repo/
├── index.html                 ← updated (Google sign-in UI + auth wiring)
├── manifest.json               ← unchanged
├── service-worker.js           ← updated (cache version bumped, new files precached)
├── icons/                      ← unchanged
└── firebase/                   ← NEW folder
    ├── firebase-config.js      ← PASTE YOUR CONFIG HERE
    └── firebase-init.js        ← don't need to touch this
```

Drop the whole `firebase/` folder into the root of your repo, alongside `index.html`.

## 2. Where to paste your Firebase configuration

Open **`firebase/firebase-config.js`**. Replace the placeholder object with the real one from:

**Firebase Console → your project → ⚙️ Project Settings → General tab → "Your apps" → SDK setup and configuration**

```js
export const firebaseConfig = {
  apiKey: "YOUR_API_KEY",              // ← replace
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",   // ← replace
  projectId: "YOUR_PROJECT_ID",        // ← replace
  storageBucket: "YOUR_PROJECT_ID.appspot.com",    // ← replace
  messagingSenderId: "YOUR_SENDER_ID", // ← replace
  appId: "YOUR_APP_ID",                // ← replace
};
```

That's the **only** file you need to edit. Nothing else references your keys directly — `firebase-init.js` just imports this file.

## 3. Required steps in Firebase Console (one-time)

1. **Enable Google as a sign-in provider**
   Authentication → Sign-in method → Add new provider → **Google** → Enable → Save.

2. **Authorize your GitHub Pages domain**
   Authentication → Settings → Authorized domains → Add domain → add:
   - `yourusername.github.io`
   - (optional, for local testing) `localhost`

   Without this step, sign-in will fail with `auth/unauthorized-domain`.

3. Firestore itself doesn't need any manual setup for Phase 1 — it's initialized in code but never read from or written to, so no rules or collections are required yet.

## 4. What was added to `index.html`

- One `<script type="module" src="./firebase/firebase-init.js">` tag in `<head>`
- A `useAuthUser()` hook and a `GoogleGlyph` icon component in the app source
- A "Continue with Google" button / signed-in account card in the sidebar (above the existing "All data stays on this device" note)

Nothing else changed — no existing component, chart, filter, or LocalStorage key was touched.

## 5. How sign-in works across environments

- **Desktop Safari/Chrome, iPad, Mac:** uses a popup window.
- **Installed iPhone/iPad PWA:** popups aren't reliably supported in standalone mode, so it automatically falls back to a full-page redirect flow instead. You don't need to configure anything for this — it's handled automatically in `firebase-init.js`.
- **Session persistence:** handled by Firebase (`browserLocalPersistence`, set explicitly). Once signed in, reopening the app (browser tab or installed PWA) restores the session automatically — no repeated logins.
- **Sign out:** only calls Firebase's `signOut()`. It never touches `localStorage`, so none of your expenses/income/trades/notes/goals data is affected.

## 6. What's intentionally NOT done yet (Phase 2)

- No data is written to or read from Firestore.
- No LocalStorage data has been migrated or duplicated anywhere.
- No UI besides the sign-in control was changed.

This is purely an auth foundation — cloud sync itself is Phase 2.
