# Local Setup

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | 22 LTS or newer (Angular 22 requirement; verified in Phase 3) |
| npm | 10+ |
| Java | 21+ (Firebase emulators) |
| Firebase CLI | latest (`npm i -g firebase-tools`) |
| Android Studio | Only for Android builds |

## Steps (app code arrives in Phase 3)

```bash
git clone https://github.com/deepakdaneva/arthapath.git
cd arthapath
git checkout development
npm ci
cp .env.example .env.local
npm run emulators   # Auth + Firestore emulators, demo-arthapath project
npm start           # dev server against emulators
```

Local development always uses the Emulator Suite with a `demo-` project
ID, which cannot connect to real Firebase projects.

## AI providers locally

Get a free key from any supported provider and add it in the app under
Profile → AI Providers. Keys are never placed in config files.
