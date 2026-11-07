#!/usr/bin/env bash
# Configure keyless GitHub Actions -> Firebase deploys with Workload Identity Federation.
# Usage: scripts/setup-wif.sh <firebase-project-id> <github-environment> [owner/repo]
#   e.g. scripts/setup-wif.sh arthapath-uat uat
#        scripts/setup-wif.sh arthapath-prod production
# Requires: gcloud authenticated as a project owner. Safe to re-run.
set -euo pipefail

PROJECT_ID="${1:?project id required}"
GH_ENV="${2:?github environment required}"
REPO="${3:-deepakdaneva/arthapath}"
OWNER="${REPO%%/*}"
POOL=github
PROVIDER=github-oidc
SA_NAME=github-deployer
SA="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
OWNER_ID="$(curl -fsSL "https://api.github.com/users/${OWNER}" | sed -n 's/.*"id": \([0-9]*\).*/\1/p' | head -1)"

gcloud services enable iamcredentials.googleapis.com sts.googleapis.com iam.googleapis.com --project "$PROJECT_ID"

gcloud iam service-accounts describe "$SA" --project "$PROJECT_ID" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT_ID" \
    --display-name "GitHub Actions deployer"

# Least privilege for: firebase deploy --only hosting,firestore
for ROLE in roles/firebasehosting.admin roles/firebaserules.admin roles/datastore.indexAdmin \
            roles/serviceusage.serviceUsageConsumer roles/firebase.viewer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:${SA}" \
    --role "$ROLE" --condition=None --quiet >/dev/null
done

gcloud iam workload-identity-pools describe "$POOL" --location global --project "$PROJECT_ID" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" --location global --project "$PROJECT_ID" \
    --display-name "GitHub Actions"

gcloud iam workload-identity-pools providers describe "$PROVIDER" --workload-identity-pool "$POOL" \
  --location global --project "$PROJECT_ID" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --workload-identity-pool "$POOL" --location global --project "$PROJECT_ID" \
    --display-name "GitHub OIDC" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner_id=assertion.repository_owner_id,attribute.ref=assertion.ref" \
    --attribute-condition "assertion.repository=='${REPO}' && assertion.repository_owner_id=='${OWNER_ID}'"

# Only jobs running in the given GitHub environment may impersonate the deployer.
gcloud iam service-accounts add-iam-policy-binding "$SA" --project "$PROJECT_ID" \
  --role roles/iam.workloadIdentityUser \
  --member "principal://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/subject/repo:${REPO}:environment:${GH_ENV}" \
  --quiet >/dev/null

echo "WIF_PROVIDER=projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"
echo "WIF_SERVICE_ACCOUNT=${SA}"
