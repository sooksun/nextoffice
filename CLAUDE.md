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
