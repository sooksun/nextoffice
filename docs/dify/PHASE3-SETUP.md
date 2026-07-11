# Dify Phase 3 — Embed in ChatPanel + case page

Builds on [Phase 1](./PHASE1-SETUP.md) and [Phase 2](./PHASE2-SETUP.md).

## What’s new

| Surface | Behaviour |
|---------|-----------|
| **ChatPanel** (right rail) | Mode toggle **RAG** \| **Dify** when `ENABLE_DIFY` + chat key OK |
| On `/cases/:id` | Auto-select **Dify** mode; sends `caseId` so API injects letter context |
| **Case detail card** | `CaseDifyAsk` — inline Q&A for this letter; hidden if Dify off |
| Bubbles | Optional `provider: dify` + meta (latency / cache / บริบทเคส) |

RAG path (`/chat/compose`) is unchanged — leave/travel draft, page context, citations still work in RAG mode.

## Files

| File | Role |
|------|------|
| `apps/web/src/components/ChatPanel.tsx` | Mode toggle + `POST /dify/chat` |
| `apps/web/src/components/chat/CaseDifyAsk.tsx` | Case-page card |
| `apps/web/src/components/chat/ChatBubble.tsx` | `provider` / `meta` labels |
| `apps/web/src/app/cases/[id]/page.tsx` | Renders `CaseDifyAsk` |

No new API routes (uses Phase 2 endpoints).

## UX notes

1. Toggle appears only after `GET /dify/status` succeeds with chat configured.  
2. Switching mode **clears** the panel thread (separate conversation state).  
3. Case card does not show when Dify is disabled — zero noise for schools without Dify.  
4. Full-page studio remains at `/dify` (workflow tab, free-form case id).

## Checklist

- [ ] `ENABLE_DIFY=true` + chat key  
- [ ] Open ChatPanel → see RAG | Dify toggle  
- [ ] Open `/cases/123` → panel defaults to Dify; answers reference the letter  
- [ ] Case page shows violet “ถาม AI เกี่ยวกับหนังสือฉบับนี้” card  
- [ ] RAG mode still drafts leave/travel via compose  

## Next

| Phase | Work | Status |
|-------|------|--------|
| 4 | Outbound draft outline workflow | See [PHASE4-SETUP.md](./PHASE4-SETUP.md) |
| 5 | Agent tools → read-only NextOffice APIs | See [PHASE5-SETUP.md](./PHASE5-SETUP.md) |
