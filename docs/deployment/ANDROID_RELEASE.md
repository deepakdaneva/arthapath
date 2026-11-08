# Android Release

The Android app (`io.github.deepakdaneva.arthapath`) is the same web app
packaged with Capacitor. CI builds it from the exact bundle it just deployed,
so the APK and the website always match.

| Trigger | Checks | Output |
|---|---|---|
| Pull request | Web checks, rules, e2e, plus Gradle unit tests, lint, and a debug build | none |
| Push to `development` | Same checks, UAT deploy, then Gradle unit tests and lint on the release build | Signed **UAT APK** (`io.github.deepakdaneva.arthapath.uat`, "ArthaPath UAT") as a workflow artifact for 30 days |
| Push to `main` | Same checks, production deploy (after approval), then Gradle unit tests and lint | Signed **production APK** attached to a GitHub release `vX.Y.Z` with its SHA-256 |

The UAT app has its own package name, so both can be installed on one phone.
Version: `versionName` is the web version (`1.0.<commits>`), `versionCode`
is the commit count, so every release upgrades the previous one.

## Signing key (one time)

Android only accepts updates signed with the same key, so create it once and
keep a backup somewhere safe (a password manager). If it is lost, users must
uninstall and reinstall to get new versions.

1. Create the keystore (PKCS12; use one password for store and key):

   ```bash
   keytool -genkeypair -v -keystore arthapath-release.jks -alias arthapath -keyalg RSA -keysize 4096 -validity 10000 -dname "CN=ArthaPath, O=ArthaPath"
   ```

2. Store it as repository secrets (the key alias `arthapath` is not secret;
   set the `ANDROID_KEY_ALIAS` variable only if you use another one) (Settings > Secrets and variables >
   Actions > Repository secrets), or with the GitHub CLI:

   ```bash
   base64 -w0 arthapath-release.jks | gh secret set ANDROID_KEYSTORE_BASE64
   gh secret set ANDROID_KEYSTORE_PASSWORD
   ```

   On Windows PowerShell, encode with
   `[Convert]::ToBase64String([IO.File]::ReadAllBytes("arthapath-release.jks")) | gh secret set ANDROID_KEYSTORE_BASE64`.

3. Move the `.jks` file out of the repository folder. Never commit it.

The APK is built unsigned and signed afterwards with `apksigner`, so the key
is only present in that one CI step, not during dependency installs or the
Gradle build. The job then checks the signature, package name, and version.

## Installing

Download the APK from the GitHub release (or the UAT run artifact), allow
installs from that source when Android asks, and open it. Compare the
SHA-256 with the `.sha256` file if you want to confirm the download.

## The Android experience

- **Launch:** navy launch screen where the ArthaPath trend line draws itself
  (Android 12+; older versions show the finished mark). Adaptive and themed
  (Android 13 Material You) icons.
- **First launch:** story-style welcome slides (tap to move, hold to pause,
  Skip), ending in Create account or Sign in. Later launches open sign-in
  directly. The website keeps its landing page.
- **Edge to edge:** content sits below the status bar and above the gesture
  bar; status bar icons follow the app theme.
- **Fingerprint or face unlock:** offered after a PIN unlock and in
  Settings. The PIN is stored in the Android Keystore under a key that needs
  biometric authentication and is invalidated when a new fingerprint or face
  is enrolled; unlocking releases it only after a successful prompt. It is
  removed on sign-out, account deletion, PIN reset, or when it stops working
  (PIN changed on another device), and updated when the PIN is changed here.

## Sign-in on Android

- **Google sign-in** uses the system account picker (Android Credential
  Manager, `@capgo/capacitor-social-login`). The app gets a Google ID token and
  signs in to Firebase with `signInWithCredential`: no browser redirect and no
  Firebase Dynamic Links.
  - Each Firebase project has an Android app registered with the signing
    key's SHA-1 and SHA-256 (`io.github.deepakdaneva.arthapath` in
    production, `.uat` in UAT). A new signing key must be added there too.
  - The build reads the project's OAuth web client ID from the
    `GOOGLE_WEB_CLIENT_ID` environment variable; without it the Google
    button is hidden on Android.
- **Email and password**, verification, and password reset work as on the
  web; emails open Firebase's hosted page in the browser.
- **App Check:** each reCAPTCHA key lists `localhost`, because the app runs at
  `https://localhost` inside the WebView.
- New versions are installed from GitHub releases (no in-app update prompt).

Signing key fingerprints (public):

- SHA-1 `53:8E:C4:E6:C9:36:9C:98:EE:2D:74:EE:09:68:30:DA:28:22:1E:63`
- SHA-256 `CA:93:BF:4F:CD:88:50:D9:BF:3B:63:DC:77:D7:90:1D:08:C1:D4:A2:05:88:BF:70:DF:EB:FD:95:6B:4B:C6:46`
