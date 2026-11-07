# UAT Deployment

1. Merge a feature PR into `development` (CI green, review approved).
2. `deploy-uat.yml` builds with the `uat` configuration and deploys
   Hosting plus Firestore rules and indexes to `arthapath-uat`.
3. Verify the UAT URL: landing page loads, sign-in works, PIN unlock works.
4. Run the UAT checklist in [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md#release-checklist).

Status: the workflow is added in Phase 2.
