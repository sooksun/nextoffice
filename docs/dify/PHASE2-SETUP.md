# Dify Phase 2 — Multi-app, workflow, case context, caching

Builds on [Phase 1](./PHASE1-SETUP.md).

## What’s new

| Feature | Endpoint / env |
|---------|----------------|
| Richer status (apps + cache) | `GET /dify/status` |
| Chat + **caseId** → auto letter context | `POST /dify/chat` `{ caseId }` |
| Workflow app | `POST /dify/workflows/run` + `DIFY_API_KEY_WORKFLOW` |
| Completion / text generator | `POST /dify/completion` + `DIFY_API_KEY_COMPLETION` |
| App parameters | `GET /dify/parameters?app=chat\|workflow\|completion` |
| Short answer cache (chat, no context) | 5 min in-memory, org-scoped; disable with `DIFY_CHAT_CACHE=false` |
| Retry | 502/503/504/429 with backoff |
| UI | `/dify` — case id field, workflow tab, app badges |

## Environment

```env
ENABLE_DIFY=true
DIFY_API_BASE=http://host.docker.internal:5001/v1
DIFY_API_KEY_CHAT=app-xxxx
# Optional Phase 2 apps
DIFY_API_KEY_WORKFLOW=app-yyyy
DIFY_API_KEY_COMPLETION=app-zzzz
# Optional: set false to disable chat answer cache
DIFY_CHAT_CACHE=true
```

## Create Workflow app (optional)

1. Dify Studio → **Workflow** app  
2. Start node input: `query` (text) — match Nest UI  
3. Optional: `org_id`  
4. Publish → copy API key → `DIFY_API_KEY_WORKFLOW`  
5. UI tab **Workflow** on `/dify`

## Chat with case context

```bash
curl -s -X POST "$API/dify/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"query":"หนังสือนี้ต้องตอบหรือไม่?","caseId":42}'
```

Nest loads `CasesService.findById` (org-scoped), builds `letter_context`, then calls Dify.  
Answer cache is **skipped** when `caseId` or `letterContext` is present.

## Security

- Case access still enforces org (ADMIN can cross-org).  
- No PDF upload to Dify.  
- Workflow/completion keys stay server-side only.  
- Do not use Dify to mint registration numbers.

## Phase 2 checklist

- [ ] Phase 1 chat still works  
- [ ] `GET /dify/status` shows `phase: 2` and `apps.*`  
- [ ] Chat with `caseId` returns answer + `hasLetterContext: true`  
- [ ] (Optional) Workflow key + tab works  
- [ ] Repeat same plain query twice → second may set `cached: true`

## Next

| Phase | Work | Status |
|-------|------|--------|
| 3 | Embed ChatPanel + case page | See [PHASE3-SETUP.md](./PHASE3-SETUP.md) |
| 4 | Outbound draft outline workflow | See [PHASE4-SETUP.md](./PHASE4-SETUP.md) |
| 5 | Agent tools → read-only NextOffice APIs | See [PHASE5-SETUP.md](./PHASE5-SETUP.md) |
