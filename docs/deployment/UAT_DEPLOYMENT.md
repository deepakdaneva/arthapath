# UAT Deployment

1. Merge a feature PR into `development` (CI green, review approved).
2. `deploy.yml` (environment `uat`) builds with the `uat` configuration and deploys
   Hosting plus Firestore rules and indexes to `arthapath-uat`.
3. Verify the UAT URL: landing page loads, sign-in works, PIN unlock works.
4. Run the UAT checklist in [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md#release-checklist).

Until the app exists (Phase 3), only Firestore rules and indexes deploy.
