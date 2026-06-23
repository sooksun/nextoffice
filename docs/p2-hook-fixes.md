# P2 — Frontend hook / React-compiler errors (deferred to an app-tested session)

`next build` does **not** fail on these (verified: production build passes), so
they are code-quality issues, not release blockers. Each fix restructures a
data-loading / device effect, so they must be verified with the dev server
running (`npm run dev:web`) to confirm data still loads, the camera/GPS still
initialise, and no render loops appear.

Run `npx eslint .` in `apps/web` to reproduce.

## Errors (priority — fix first)

| # | File:line | Rule | Intended fix |
|---|-----------|------|--------------|
| 1 | `src/components/ImpersonateBanner.tsx:15` | set-state-in-effect | Read impersonation state via `useSyncExternalStore` (server snapshot = not-impersonating) instead of 4× `setState` in a mount effect. |
| 2 | `src/components/attendance/FaceCamera.tsx:95` | set-state-in-effect | `startCamera()` mount init sets state synchronously. Move the synchronous `setError("")`/`setLoading` out; keep only async `setState` after `getUserMedia` resolves. |
| 3 | `src/components/attendance/FaceCamera.tsx:157` | set-state-in-effect | Same for `requestGps()` — only `setState` inside the geolocation callback, not synchronously in the effect body. |
| 4 | `src/app/calendar/page.tsx:39` | set-state-in-effect | `setLoading(false)` runs in `.finally()`; compiler flags reachable sync setState via `fetchEvents/fetchUsers`. Gate initial load with a `loading` start state set during render, not in the effect. |
| 5 | `src/app/liff/leave/page.tsx:63` | set-state-in-effect | Loader called in mount effect sets state synchronously before first `await`; move sync setState (e.g. `setLoading(true)`) to render-time initial state. |
| 6 | `src/app/liff/registry/page.tsx:67` | set-state-in-effect | Same pattern as #5. |
| 7 | `src/app/liff/travel/page.tsx:46` | set-state-in-effect | Same pattern as #5. |
| 8 | `src/app/saraban/dispatch/page.tsx:78` | set-state-in-effect | Same pattern as #5. |
| 9 | `src/app/saraban/handover/page.tsx:72` | set-state-in-effect | Same pattern as #5. |
| 10 | `src/app/saraban/loans/page.tsx:52` | set-state-in-effect | `loadData()` in effect keyed on `tab`; wrap in `useCallback` and ensure setState is post-await only. |
| 11 | `src/app/saraban/archive/page.tsx:68` | immutability | `loadData(id)` after `setOrgId(id)` — review the value flagged as mutated; likely pass `id` immutably and avoid reassigning a captured variable. |
| 12 | `src/calendar/components/week-and-day-view/week-view-multi-day-events-row.tsx:41` | preserve-manual-memoization | Manual `useMemo` deps don't match compiler expectation; align deps or let the compiler memoize. |
| 13 | `src/calendar/components/week-and-day-view/week-view-multi-day-events-row.tsx:74` | preserve-manual-memoization | Same as #12. |

## Warnings (after the errors)

`react-hooks/exhaustive-deps` in: `attendance/enrollments/page.tsx:69`,
`download/page.tsx:63`, `liff/cases/[id]/page.tsx:179`, `messages/page.tsx:43`,
`saraban/circular/page.tsx:69`, `saraban/loans/page.tsx:53`, `tender/page.tsx:73`,
`webboard/page.tsx:68`, `FaceCamera.tsx:167` — wrap loader fns in `useCallback`
and add to the dependency array (verify no refetch loop).

Then the bulk `@typescript-eslint/no-explicit-any` errors (lower priority per
the agreed plan) — replace `any` with concrete types module by module.
