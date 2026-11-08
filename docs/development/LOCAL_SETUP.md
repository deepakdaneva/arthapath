# Local Setup

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 22 LTS or newer (Angular 22 requirement; verified in Phase 3) |
| npm | 10+ |
| Java | JDK 25 (Android builds: the Gradle daemon requires 25; also runs the Firebase emulators) |
| Firebase CLI | latest (`npm i -g firebase-tools`) |
| Android Studio / Android SDK | Only for Android builds (API 36) |

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

The Android app is the same Ionic/Angular codebase wrapped by Capacitor
(hybrid): `npm run build` produces `www/`, and `cap sync` copies it into the
native project. There is no separate Android UI code.

Toolchain: Gradle 9.9.0 (wrapper, checksum-verified), Android Gradle Plugin
9.5.1, JDK 25 for the Gradle daemon (`android/gradle/gradle-daemon-jvm.properties`).
Java source/target level stays 21, as Capacitor 8 requires. CI builds a
debug APK on every PR (`android` job).

Google sign-in on Android needs a native plugin (planned); email/password
works. The WebView serves from `https://localhost`.

Local development always uses the Emulator Suite with a `demo-` project
ID, which cannot connect to real Firebase projects.

## AI providers locally

Get a free key from any supported provider and add it in the app under
Profile → AI Providers. Keys are never placed in config files.
