# Development Guide

Read first: [ARCHITECTURE.md](../architecture/ARCHITECTURE.md),
[PROJECT_STATUS.md](../PROJECT_STATUS.md), and the [ADRs](../architecture/ADR/).

## Branch workflow

```bash
git checkout development && git pull
git checkout -b feature/<short-name>
# work, commit with Conventional Commits
git push -u origin feature/<short-name>
gh pr create --base development
```

## Where code goes

| Kind of change | Location |
|---|---|
| New calculation | `src/app/domain/engine` + unit test |
| New persisted entity | domain type, repository, Firestore rules, rules test, DATA_MODEL.md |
| New AI provider | adapter in `src/app/ai/adapters`, AI_PROVIDER_ARCHITECTURE.md |
| New screen | `src/app/pages/<name>`, lazy route |

## Rules for AI coding agents

- Keep `docs/PROJECT_STATUS.md` current at the end of each work session.
- Never write plaintext financial data to Firestore; use the repository
  layer, which encrypts.
- Never call a provider SDK from UI or stores; go through the AI router.
- Never compute displayed money values with AI.
- Add an ADR for any architectural decision.
