# NextOffice Frontend Analysis

**Project Path:** `D:\laragon\www\nextoffice\apps\web`
**Framework:** Next.js 16.2.2 (React 19.2.4)
**Date:** 2026-04-13

---

## 1. UI Component Library & Styling

### Current Stack
- **No shadcn/ui** — Custom Tailwind CSS components only
- **Tailwind CSS v4** with custom PostCSS (`@tailwindcss/postcss`)
- **Custom Design System:** Material Design 3-inspired color tokens
- **Icon Library:** Lucide React v1.7.0
- **Date Picker:** react-datepicker v9.1.0 (Thai-localized)
- **Toast Notifications:** react-toastify v11.0.5

### Custom UI Components Folder
📁 **`src/components/ui/`** — Only 3 components:
1. **ThaiDateInput.tsx** — Hidden input for Thai date storage (CE format)
2. **ThaiDatePicker.tsx** — React-datepicker wrapper with Thai month names, Buddhist year display (CE+543)
3. **ThaiDateRangeFilter.tsx** — Date range filter component

### Custom Design System (globals.css)
- **Color Tokens** (CSS variables):
  - Primary: `#00236f` (deep blue) + container variants
  - Secondary: `#4b41e1` (purple)
  - Tertiary: `#410073` (dark magenta)
  - Error: `#ba1a1a`
  - Surface palette: 7 variants (lowest to highest brightness)
  - 100+ semantic color variables (e.g., `--color-on-surface`, `--color-outline`)
  
- **Typography:**
  - Font family: Sarabun (Thai-optimized Google Font)
  - Weights: 300, 400, 500, 600, 700, 800
  - Custom CSS classes for headlines

- **Shared Form/Button Classes:**
  ```css
  .input-text       /* Text input styling */
  .input-select     /* Select dropdown */
  .input-date       /* Date input */
  .label-sm         /* Small label text */
  .btn-primary      /* Primary button */
  .btn-ghost        /* Ghost/outline button */
  .custom-scrollbar /* Styled scrollbars */
  ```

---

## 2. Existing Calendar/Event/Schedule Features

### Found
1. **Leave Management** (`/leave` routes)
   - `/leave` — List leave requests + balance overview
   - `/leave/new` — Submit new leave request (form-based, no calendar picker)
   - `/leave/approvals` — Approval workflow
   - `/leave/travel` — Business trip requests
   - Uses `ThaiDateInput` for start/end date selection (not calendar UI)
   - Displays leave requests in table format
   - Shows balance by leave type

2. **Attendance** (`/attendance` routes)
   - `/attendance` — Check-in/check-out status
   - `/attendance/check-in` — Face recognition + GPS check-in
   - `/attendance/face` — Face registration
   - `/attendance/history` — Historical records (date-based, not calendar view)
   - `/attendance/report` — Attendance reports

3. **Horizon Agendas** (`/horizon/agendas`)
   - Policy agenda management for admin/directors
   - Has icon `CalendarClock` in sidebar but no visible implementation

### NOT Found
- ❌ No standalone calendar view/component
- ❌ No event scheduling system
- ❌ No meeting/appointment booking
- ❌ No calendar integration (Google Calendar, etc.)
- ❌ No time slot picker UI

---

## 3. App Router Structure (`src/app/`)

### Main Pages (70 total)
```
Root Pages:
  / (root)              → Redirects to /director or /inbox based on role
  /page.tsx            → Role-based routing
  /layout.tsx          → Root layout with AppShell

Document Management (รับ-ส่งเอกสาร):
  /inbox               → Incoming documents
  /outbound            → Outgoing documents
  /outbound/new        → Create new document
  /track               → QR code tracking
  /saraban/*           → Document registry (7 sub-routes)

Time & Leave (ลงเวลาปฏิบัติงาน):
  /attendance          → Check-in/out status
  /attendance/check-in → Face + GPS check-in
  /attendance/face     → Face registration
  /attendance/history  → Historical records
  /attendance/report   → Attendance reports
  /leave               → Leave request list
  /leave/new           → Submit leave
  /leave/approvals     → Leave approvals (admin)
  /leave/travel        → Business trip

Back Office (หลังบ้านสารบรรณ):
  /documents           → Document vault
  /cases               → Case management (3 sub-routes)
  /reports/*           → Various reports

Intelligence (จัดการงานอัจฉริยะ):
  /horizon             → Intelligence overview
  /horizon/agendas     → Policy agendas
  /horizon/signals     → Signals/alerts
  /horizon/sources     → Data sources
  /knowledge/*         → Knowledge management (4 sub-routes)
  /vault/*             → Knowledge vault (4 sub-routes)
  /projects/*          → Projects (2 sub-routes)

Admin (จัดการ):
  /work-groups         → Organization structure
  /organizations       → Organization management
  /settings/*          → Settings (5 sub-routes)

Other:
  /login               → Authentication
  /help, /about, /terms, /privacy  → Info pages
```

### Routing Patterns
- **Server Components:** ~32 pages (default, marked `export const dynamic = "force-dynamic"`)
- **Client Components:** ~38 pages (marked `"use client"`)
- **Dynamic Routes:** Using `[id]` and `[code]` patterns
- **File-based routing:** Standard Next.js conventions

---

## 4. Page Structure Patterns

### Server Components (Async Pages)
**Example: `/attendance/page.tsx`**
```tsx
export const dynamic = "force-dynamic";  // Always fetch fresh data

async function getToday(): Promise<TodayStatus> { ... }
async function getFaceStatus(): Promise<FaceStatus> { ... }

export default async function AttendancePage() {
  const [today, faceStatus] = await Promise.all([...]);
  return <div>...</div>;
}
```

**Characteristics:**
- Fetch data server-side (avoids client hydration issues)
- Use `apiFetch()` from `/lib/api.ts`
- Render static HTML with data
- No useState/useEffect

### Client Components (Interactive Pages)
**Example: `/leave/new/page.tsx`**
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewLeavePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Handle form submission
}
```

**Characteristics:**
- Handle forms, user interactions
- Use React hooks (useState, useEffect)
- Router push/replace for navigation
- API mutations with apiFetch()

---

## 5. Dependencies

### Key Production Deps
| Package | Version | Purpose |
|---------|---------|---------|
| next | 16.2.2 | Framework |
| react | 19.2.4 | UI library |
| react-dom | 19.2.4 | DOM rendering |
| tailwindcss | 4 | Styling (dev) |
| lucide-react | 1.7.0 | Icons |
| react-datepicker | 9.1.0 | Date selection |
| @types/react-datepicker | 6.2.0 | Type defs |
| date-fns | 4.1.0 | Date utilities |
| clsx | 2.1.1 | Class name merging |
| react-toastify | 11.0.5 | Toast notifications |
| react-force-graph-2d | 1.29.1 | Knowledge graph viz |
| @react-oauth/google | 0.13.5 | Google OAuth |

**No calendar libraries installed** — Would need to add for new calendar features

---

## 6. Key Utilities & Patterns

### Authentication (`lib/auth.ts`)
```tsx
// LocalStorage + cookies for JWT token
getUser(): AuthUser | null
getToken(): string | null
login(email, password): Promise<LoginResponse>
loginWithGoogle(idToken): Promise<LoginResponse>
logout(): void
impersonate(userId): void  // Admin feature
```

**AuthUser interface:**
```tsx
{
  id: number
  email, fullName, roleCode
  organizationId, organizationName
  educationArea, educationAreaId
  activeAcademicYear: { id, year, name }
  _adminId?: number
}
```

**Roles:** DIRECTOR, VICE_DIRECTOR, ADMIN, TEACHER, CLERK, HEAD_TEACHER, etc.

### API (`lib/api.ts`)
```tsx
apiFetch<T>(path: string, init?: RequestInit): Promise<T>
// Auto-includes Bearer token, handles 401 redirects, etc.

getServerToken(): Promise<string | null>
getAuthToken(): string | null
```

### Thai Date Utilities (`lib/thai-date.ts`)
```tsx
formatThaiDate(raw)          // "15 มกราคม 2567" (BE, full month)
formatThaiDateShort(raw)     // "15 ม.ค. 67" (short)
formatThaiDateNumeric(raw)   // "๑๕/๑/๒๕๖๗" (Thai numerals)
formatThaiDateTime(raw)      // "15 ม.ค. 67, 10:30"
toThaiNumerals(text)         // "123" → "๑๒๓"
parseCeDate(s): Date | null  // Parse YYYY-MM-DD
```

**Date Convention:**
- Backend: CE (Common Era) format YYYY-MM-DD
- Display: BE (Buddhist Era) = CE + 543
- ThaiDatePicker: Converts between CE/BE internally

---

## 7. Component Organization

### Root Components (`src/components/`)
- **AppShell.tsx** — Layout wrapper (sidebar, header, main, chat panel)
- **Sidebar.tsx** — Navigation with 6 collapsible groups
- **Header.tsx** — Top header bar
- **ChatPanel.tsx** — AI chat sidebar (lazy loaded with Suspense)
- **AuthProvider.tsx** — OAuth wrapper
- **ToastProvider.tsx** — Toast notification provider

### Feature Components
- **DocumentUploadModal.tsx** — Upload UI
- **AdminSwitchPanel.tsx** — Admin impersonation UI
- **ImpersonateBanner.tsx** — Active impersonation indicator
- **ImpersonateMenu.tsx** — Switch user menu
- **CreateCaseButton.tsx** — Quick case creation
- **SignaturePad.tsx** — Signature capture
- **SignatureVerification.tsx** — Signature verification
- **PdfPreview.tsx** — PDF viewer
- **ChatPanel.tsx** — AI chatbot

### Sub-component Folders
- **`components/actions/`** — Server actions
- **`components/attendance/`** — Attendance-specific components
- **`components/knowledge/`** — Knowledge management components
- **`components/ui/`** — Reusable UI primitives (date pickers)

---

## 8. Sidebar Navigation Structure

### User Roles (in Sidebar.tsx)
```tsx
MANAGER = ["DIRECTOR", "VICE_DIRECTOR", "ADMIN"]
SARABAN = ["CLERK", "DIRECTOR", "VICE_DIRECTOR", "ADMIN"]
APPROVER = ["DIRECTOR", "VICE_DIRECTOR", "HEAD_TEACHER", "ADMIN"]
```

### Nav Groups (6 sections, 40+ items)
1. **รับ-ส่งเอกสาร** (Document Flow) — 11 items
2. **ลงเวลาปฏิบัติงาน** (Time & Leave) — 4 items
3. **หลังบ้านสารบรรณ** (Back Office) — 4 items
4. **จัดการงานอัจฉริยะ** (Intelligence) — 10 items
5. **จัดการ** (Admin) — 6 items
6. **ช่วยเหลือ & ข้อมูล** (Help) — 3 items

Each nav item has:
- `href` — Route path
- `label` — Thai display name
- `icon` — Lucide icon
- `roles?` — Optional role filter
- `children?` — Submenu items

---

## 9. Styling Approach

### No Component Library
- ❌ No shadcn/ui (no Radix UI primitives)
- ❌ No Material-UI
- ❌ No Chakra UI
- ✅ Pure Tailwind CSS with custom design tokens

### Design Tokens (CSS Variables)
All colors defined in `globals.css` as CSS custom properties:
```css
@theme inline {
  --color-primary: #00236f
  --color-primary-container: #1e3a8a
  /* ... 100+ token definitions ... */
  --font-headline: var(--font-sarabun)
}
```

Used in utility classes:
```css
.btn-primary {
  @apply rounded-xl bg-primary px-4 py-2 text-sm font-semibold 
         text-on-primary shadow-sm hover:opacity-90 transition-opacity;
}
```

### Responsive Design
- Mobile-first Tailwind approach
- Breakpoints: `sm`, `md`, `lg` (standard)
- Grid layouts: `grid-cols-1 md:grid-cols-4`
- Flex layouts: Most components flex-based

### Print Styles
Extensive print media queries for document printing:
- `.print-full` — Full-width unformatted
- `.print-title` — Document title
- `.registry-table` — Table printing with borders, specific font sizes

---

## 10. Next.js 16 Specifics

### Version Breaking Changes (from AGENTS.md)
> "This version has breaking changes — APIs, conventions, and file structure may all differ from your training data."

- Consult `node_modules/next/dist/docs/` for current best practices
- Watch for deprecation notices in version 16

### Configuration (`next.config.ts`)
```tsx
output: "standalone"            // Standalone build
poweredByHeader: false
headers: async () => [...]      // Security headers (HSTS, CSP, etc.)
```

### Security Headers
- Strict-Transport-Security
- X-Frame-Options: SAMEORIGIN
- X-Content-Type-Options: nosniff
- Content-Security-Policy (allows Google OAuth)
- Permissions-Policy (camera, geolocation)

---

## Summary for Calendar Integration

### Ready to Build
✅ Tailwind CSS + custom design tokens (no new setup needed)
✅ Lucide React icons available
✅ React 19 with hooks support
✅ Server/client component patterns established
✅ Thai date utilities (CE ↔ BE conversion)
✅ API fetch pattern (`apiFetch`)
✅ Authentication context available
✅ Toast notifications ready

### Need to Add
❌ Calendar library (react-big-calendar, TanStack Calendar, etc.)
❌ Calendar UI components (month view, week view, day view)
❌ Event/appointment data models
❌ Time slot validation logic
❌ Calendar sync endpoints

### Pattern to Follow
1. Create `/src/app/calendar` or `/schedule` route
2. Build calendar component in `/src/components/`
3. Use server component for data fetch, client component for interactivity
4. Style with Tailwind + existing color tokens
5. Fetch events from backend API
6. Use `ThaiDatePicker` or custom date selection for Thai date support
