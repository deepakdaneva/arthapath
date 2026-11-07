# Local Setup

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 22 LTS or newer (Angular 22 requirement; verified in Phase 3) |
| npm | 10+ |
| Java | 21+ (Firebase emulators) |
| Firebase CLI | latest (`npm i -g firebase-tools`) |
| Android Studio | Only for Android builds |

## Steps

```bash
git clone https://github.com/deepakdaneva/arthapath.git
cd arthapath
git checkout development
npm ci
npm run emulators   # terminal 1: Auth + Firestore emulators (demo-arthapath)
npm start           # terminal 2: http://localhost:4200 against the emulators
```

Other scripts: `npm run lint`, `npm test`, `npm run build`,
`npm run test:rules` (needs `npm ci` in `firebase/rules-tests` once).

## Android

```bash
npm run cap:sync          # build web assets and copy them into android/
npx cap open android      # open in Android Studio, run on a device or emulator
```

Google sign-in on Android needs a native plugin (planned); email/password
works. The WebView serves from `https://localhost`.

Local development always uses the Emulator Suite with a `demo-` project
ID, which cannot connect to real Firebase projects.

## AI providers locally

Get a free key from any supported provider and add it in the app under
Profile → AI Providers. Keys are never placed in config files.
