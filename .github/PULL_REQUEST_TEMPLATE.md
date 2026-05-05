## Summary

- what changed
- why it changed

## Validation

### Automated (must all pass)

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm test` (unit + integration + ui + e2e)
- [ ] `npm audit --omit=dev --audit-level=high`

### Manual

- [ ] runtime behavior verified in sandbox (`npm run dev:watch-preview`) when relevant
- [ ] journey coverage report clean (no regressions in covered journeys)
- [ ] docs / metadata aligned when relevant

### Local CI (optional but recommended for infra changes)

- [ ] `npm run test-ci:act`

## Breaking changes

_If none, delete this section._

- list any changes that affect the public API, CLI flags, config schema,
  installed file layout, or consumer upgrade path

## Sandbox-specific constraints

- [ ] stays single-module-oriented (no multi-module orchestration)
- [ ] config persistence remains owned by the backend (no client-side storage)
- [ ] does not broaden scope into a generic MagicMirror replacement
- [ ] installed package layout and bin entry remain stable
- [ ] server/client boundary not violated (no server logic in client bundle)
