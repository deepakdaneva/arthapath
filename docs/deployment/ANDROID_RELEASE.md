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

2. Store it as repository secrets (Settings > Secrets and variables >
   Actions > Repository secrets), or with the GitHub CLI:

   ```bash
   base64 -w0 arthapath-release.jks | gh secret set ANDROID_KEYSTORE_BASE64
   gh secret set ANDROID_KEYSTORE_PASSWORD
   gh secret set ANDROID_KEY_ALIAS --body arthapath
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

## Limits

- **Google sign-in** is hidden in the app: Google blocks sign-in inside a
  WebView. Use email and password; native Google sign-in is planned (it will
  use a native plugin and `signInWithCredential`, not redirects).
- **No Firebase Dynamic Links dependency:** the app does not use email-link
  sign-in or redirect-based OAuth. Verification and password-reset emails open
  Firebase's hosted page in the browser.
- **App Check:** the app runs at `https://localhost` inside the WebView. Add
  `localhost` to each reCAPTCHA key's domains before enforcing App Check, or
  Android requests will be rejected.
- Automatic in-app update prompts do not apply to the APK; new versions are
  installed from GitHub releases.
