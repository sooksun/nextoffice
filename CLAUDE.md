# Project Operating Rules

## General
- Think before coding.
- For large tasks, start with system-analyst or architecture-design.
- Reuse existing patterns before creating new ones.
- Keep changes small, reviewable, and production-oriented.
- Do not change unrelated files.

## Backend
- Prefer clear module boundaries.
- Validate input.
- Handle errors explicitly.
- Consider auth, roles, and logging.

## Frontend
- Reuse existing components and styling patterns.
- Handle loading, error, empty, and success states.
- Keep UI responsive and readable.

## Database
- Do not change schema unless necessary.
- Explain migration impact before applying schema changes.
- Add indexes and constraints thoughtfully.

## Testing
- Add or update tests when logic changes.
- Cover normal, edge, and failure cases.

## Delivery
- Before finishing, summarize:
  - files changed
  - what was implemented
  - risks remaining
  - what should be tested next

---

## Claude Routing Rules

### Preferred Auto Skills
- Use `system-analyst` for requirement analysis, scope definition, users, roles, modules, and workflows.
- Use `architecture-design` for architecture, data flow, service boundaries, and integration design.
- Use `database-designer` for schema, entities, relationships, keys, constraints, and indexes.
- Use `backend-implementer` only for backend implementation work.
- Use `frontend-implementer` only for frontend implementation work.
- Use `test-engineer` when logic changes or new features are added.

### Manual-Only Skills
Do not automatically invoke these unless explicitly called with `/skill-name`:
- `delivery-manager`
- `code-reviewer`
- `release-readiness`
- `read-assets`
- `debug-deep`
- `migration-safe`
- `api-contract-guardian`
- `log-analyzer`
- `performance-optimizer`
- `security-guard`
- `env-config-checker`

### Routing Guidance
- For a new feature: `system-analyst` → `architecture-design` → `database-designer` → implementation → `test-engineer`
- For backend-only work: `backend-implementer`
- For frontend-only work: `frontend-implementer`
- For production bugs: ask for logs, stack traces, or reproduction steps before proposing fixes
- Treat debugging, migrations, API compatibility, security review, performance review, and deployment checks as separate concerns — not default implementation steps
- Do not combine reviewer, release manager, debugger, and implementer roles unless explicitly requested
- Keep responses role-consistent during implementation; do not switch into review or release mode unless requested
