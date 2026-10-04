# 🏗️ Luit (Suchii Group Operations Console) · Agent Reference Manual

> **Comprehensive system documentation, architectural overview, data schema, feature matrix, API reference, and development guide for AI agents and developers working on the Suchii Group Operations Console.**

---

## 0. Luit product structure (read first)

Luit is the product, built by Boat Brothers; this deployment's client is Suchii Group. Keep product code client-neutral: anything that names or configures one client belongs in `config/client.js`.

| Path | What it holds |
|---|---|
| `config/client.js` | The client: name, logo, email domain, contact, sample firm, storage bucket default, and `modules` (the Luit modules they bought; empty means all). |
| `config/modules.js` | The 11 sellable modules, the routes each owns, and `requires` (Luit AI and EMD/SD need Tender Desk). `enabledModules`, `moduleForPath`, `routeEnabled`. |
| `lib/branding.js` | Product naming (Luit, Luit AI, Boat Brothers credit); reads the client from config. |
| `lib/luit-admin/account.mjs` | The Luit admin (Boat Brothers platform account). The only file that knows its stored role value (`SX`). Lookups are cached 30 s per database client. |
| `lib/luit-admin/privacy.mjs` | Keeps the Luit admin off client screens: response redaction (`hideLuitAdminResponse`), workforce and directory filters, Tender Desk actor masking. Presentation only; records stay intact. |
| `lib/luit-admin/single-session.js` | One Luit admin session at a time: each sign-in stores a session id (`ls` in the token); older tokens are refused everywhere. Other roles are unaffected. |
| `lib/luit-admin/workspace.js` | Runtime module switches (On / Preview / Off within the client's plan), the workspace notice, and the change log, in the `luit:workspace` setting. |
| `app/luit-admin`, `app/api/luit-admin` | The hidden admin panel. No link anywhere; anyone else gets not-found. |
| `components/luit-admin/WorkspaceGate.jsx` | Applies module switches and the notice to every console page. |

**Rules for agents**

- Never write the literal `'SX'` outside `lib/luit-admin/account.mjs`; use `isLuitAdmin` / `LUIT_ADMIN_ROLE`. The browser only ever sees public roles.
- New API routes that return people must go through `hideLuitAdminResponse` (console) or the Tender Desk `ok()` helper, which already redacts.
- Page titles match their sidebar names. Use `ModuleHeader` for console pages and the console colour tokens (`--md-*`) for new styles.
- A refused session clears its cookies (`lib/auth.js` `endedSession`), so `/login` never loops.

**Tender downloads (Luit AI)**

- A click enqueues a job (`lib/desk/portal-import/jobs.mjs`, rows `portalImport:job:<id>` in `DeskSetting`); the worker runs in the same function via `after()` (`job-worker.js`, 300 s limit).
- A job with no heartbeat for 2 min, or running past 330 s, is shown as interrupted. After a portal wait, paid portal work restarts only with 150 s left.
- The portal slot is released once files are downloaded, before extraction and saving. Rejected CAPTCHA answers are reported to 2Captcha.
- Failed jobs show a plain explanation and next steps from `failure-guide.mjs`; dead links and missing files never offer a retry.
- Job listing uses the partial expression index from migration `20261003_import_job_index`; the query in `ownedRows` must repeat its predicate verbatim. `prisma migrate dev` may offer to drop that index: decline. Finished jobs older than 30 days are pruned after an enqueue.
- Online search runs two grounded Gemini queries and a third only when fewer than six official notices come back; search readings are cached 15 min. Gemini 3 models get `thinkingLevel: 'low'` and no temperature; the search reading uses structured output (`SEARCH_SCHEMA`).

**Saved tenders and EMD**

- `SavedTender.resultDate` records when a tender was marked Win, Loss, or Cancelled. EMD Tracking counts days held from it, or from the bid end date for older rows.
- `status: 'manual'` marks a tender added from another source on the Saved tab (`POST /api/daily-tenders/saved`).

---

## 1. Executive Overview & System Purpose

The **Suchii Group Operations Console** is an enterprise-grade administrative portal and API backend built with **Next.js 15 (App Router)**, **Prisma ORM**, and **PostgreSQL (Neon)**.

Product naming (company, product, tagline, metadata description) is defined once in `lib/branding.js` and consumed by the landing page, sign-in screen, app shell (`components/layout/AppShell.jsx`, `Sidebar.jsx`, `Navbar.jsx`), root metadata, and `/api/health`. Change the name there, not in individual screens.

It serves as the central operational backbone for Suchii Group civil engineering, construction contracting, and tender operations, unifying:

1. **Multi-Firm Corporate Administration** — Multi-entity tracking with GSTINs, proprietor records, and firm-level asset mapping.
2. **Tender & Project Portfolio Management** — End-to-end lifecycle tracking from tender bidding through budgeting, scheduling, site allocation, and progress tracking.
3. **Bill of Quantities (BOQ) & Item Master** — Automated Excel BOQ import, itemized rate and quantity tracking, remaining balance calculations, extra item handling, and **Photographic Delivery Verification** stored in Google Cloud Storage with GPS coordinates (`lat`, `long`), serial numbers, and interactive image lightbox.
4. **Extra BOQ Items (Variations)** — Variation/extra items requested against specific BOQ line items, with approval workflow.
5. **Site & Geofenced Operations** — Job site mapping with GPS coordinates, assigned site managers, real-time site status, and configurable **Attendance Geofence Radius** (`attendanceRadius` in metres).
6. **Site Progress Gallery** — Photo uploads with GPS coordinates to document on-site construction progress per project/site stored in GCS under `site-progress/<siteId>/`.
7. **Human Resources & Workforce Directory** — Employee lifecycle management, digital KYC (PAN, Aadhar, UAN, Bank details), profile photo upload to GCS (`employee-profiles/`), department/designation hierarchies, role assignments, and soft-deactivation.
8. **Geofenced Attendance & Proximity Engine** — Precise check-in/check-out recording with GPS coordinates, accuracy scoring, anomaly flags (`isFlagged`), site location snapshot (`siteLat`, `siteLng`), site radius snapshot (`siteAttendanceRadius`), employee check-in location (`checkInLat`, `checkInLng`), real-time Haversine distance computation (`distanceFromSite` in metres), and automated geofence evaluation remarks (`locationRemarks`).
9. **Leave Application & Approval Workflow** — Multi-tier leave requests, approval tracking, and complete leave history.
10. **Third-Party Contractor Directory** — Comprehensive vendor and contractor records linked directly to executed projects.
11. **Construction Warehouse Management** — Full material lifecycle: master data (materials, categories, units, suppliers), goods receipt (GRN), stock issuance, material requests with approve/reject/issue workflow, manual stock adjustments, real-time stock ledger, low-stock alerts, and five analytical report types.
12. **Enterprise Reporting** — Filtered tables for attendance, projects, contractors, employees, and leave, with a CSV download of the tab on screen. BOQ import still reads Excel.
13. **Mobile Backend Readiness** — API-first architecture natively supporting the Flutter Site Manager mobile application with dual authentication (Bearer token & HTTP-only cookies).

### Size and complexity

Counted on 28 Sep 2026. Non-blank lines. Excludes `node_modules`, `.next`, `.dart_tool`, and build output. The same figures are in each repo’s `README.md`.

| | Operations console (this repo) | Site manager (`suchii-group-site-manager`) |
|---|---:|---:|
| Stack | Next.js 15, Prisma, Postgres | Flutter |
| Source files | 223 | 71 (64 app, 7 tests) |
| Non-blank lines | 35,225 | 11,607 |

Together about 47,000 non-blank lines. This console is about three times the phone app.

This repo: JavaScript 25,561, JSX 6,048, scripts 2,560, Prisma schema 427, CSS 398, SQL 231. API route files: 61. Complexity is concentrated in large screens, not in many small modules: `app/employees/page.js` 2,458, `app/boqs/page.js` 2,161, `app/attendance/page.js` 2,062, `app/sites/page.js` 1,513, `app/progress/page.jsx` 1,500, `app/projects/page.js` 1,345. Prefer extending the existing page over splitting it unless the change is a new module.

Site manager: features 8,270, models 1,133, core 899, services 692, routes 249, tests 340. Largest files: dashboard map 1,433, attendance 753, leave form 732, delivery photos 578. It does not own the database.

---

## 2. Technology Stack & Architecture

| Layer | Technology | Purpose & Details |
|---|---|---|
| **Framework** | Next.js 15.2.x (App Router) | Server Components, Client Components, Edge Middleware, Route Handlers |
| **Runtime & Bundler** | Node.js + Turbopack (`next dev --turbopack`) | High-performance local development and build pipeline |
| **Frontend UI** | React 19.0.x + Tailwind CSS 3.4.x | Custom dark modern design, Glassmorphism, Material-inspired shadows |
| **Icons** | Lucide React 1.16.x | Consistent iconography throughout navigation and status indicators |
| **3D & Visuals** | Three.js + React Three Fiber + Drei + tsParticles | Interactive 3D construction scene and animated canvas particles on the landing page |
| **ORM** | Prisma 6.4.x | Schema modeling, PostgreSQL migrations, type-safe queries, relation mapping |
| **Database** | PostgreSQL (Neon serverless) | Hosted at `ep-shiny-leaf-ael6ptxi-pooler.c-2.us-east-2.aws.neon.tech` |
| **Authentication** | JWT (`jsonwebtoken` + Web Crypto Subtle) + `bcryptjs` | Dual auth: Bearer tokens for mobile/API, HTTP-only `auth_token` cookie for web. Session TTL: **12 hours** |
| **Cloud Storage** | Google Cloud Storage (`@google-cloud/storage` 8.2.x) | BOQ Excel sheets, delivery proof photos, employee profile images, site progress photos. Credentials via `suchii-group-auth-key.json` or base64 env vars |
| **Spreadsheet Engine** | SheetJS (`xlsx` 0.18.5) | In-memory Excel parsing for BOQ import. The reports screen exports CSV. |
| **Deployment Target** | Vercel Serverless | `vercel.json` configured |

---

## 3. Role-Based Access Control (RBAC)

3-tier RBAC enforced by **Edge Middleware** (`middleware.js`) and **API route wrappers** (`lib/auth.js → requireRoles`):

| Role | Name | Access |
|---|---|---|
| **`A`** | Admin | Unrestricted. All modules, soft-activation/deactivation (`PATCH`+`DELETE`), user deletion, configuration. |
| **`M`** | Site Manager | Projects, Sites, BOQs, Attendance, Leaves, Contractors, Reports, Employees (create `E` only), Warehouse (all), Progress photos, BOQ delivery photos. Restricted from Departments and Designations. Cannot promote to Admin. |
| **`E`** | Employee | Self-service: Dashboard (own), Attendance (self), Leaves (self-apply), own Profile, BOQ delivery photo uploads. Blocked from Warehouse. |

### Edge Middleware Route Matrix (`middleware.js`)

```
/login, /             --> Public (redirects to /dashboard if valid token)
/dashboard            --> [A, M, E]
/profile              --> [A, M, E]
/attendance           --> [A, M, E] (E: self-scoped)
/leaves               --> [A, M, E] (E: self-scoped)
/projects             --> [A, M]
/sites                --> [A, M]
/boqs                 --> [A, M]
/contractors          --> [A, M]
/employees            --> [A, M]
/reports              --> [A, M]
/tenders              --> [A, M]   (portal: A, M; upload page: A)
/progress             --> [A, M]
/firms                --> [A, M]
/warehouse            --> [A, M]   (E explicitly blocked)
/departments          --> [A]
/designations         --> [A]
```

---

## 4. Database Schema & Data Models (Prisma)

The schema (`prisma/schema.prisma`) covers core HR, site management, BOQ, warehouse, and one tender-file table.

### 4.1 Entity Relationship Diagram

```mermaid
erDiagram
    Firm ||--o{ Employee : employs
    Firm ||--o{ Project : owns
    Department ||--o{ Employee : contains
    Department ||--o{ Project : oversees
    Designation ||--o{ Employee : designates
    Contractor ||--o{ Project : executes
    Project ||--o{ Site : has
    Project ||--o{ BOQs : includes
    Project ||--o{ Progress : tracks
    Project ||--o{ MaterialOutward : consumes
    Project ||--o{ MaterialRequest : requests
    Project ||--o{ TenderFile : holds
    Site ||--o{ BOQs : allocates
    Site ||--o{ Attendance : logs
    Site ||--o{ Progress : captures
    Site ||--o{ MaterialOutward : receives
    Site ||--o{ MaterialRequest : needs
    Employee ||--o{ Attendance : records
    Employee ||--o{ Leave : requests
    Employee ||--o{ Site : manages
    BOQs ||--o{ BOQItems : contains
    BOQItems ||--o{ ExtraItemBOQ : variations
    MaterialCategory ||--o{ Material : classifies
    Unit ||--o{ Material : measures
    Supplier ||--o{ MaterialInward : supplies
    Material ||--|| Stock : tracks
    Material ||--o{ StockLedger : logs
    Material ||--o{ StockAdjustment : adjusts
    Material ||--o{ MaterialInward : received
    Material ||--o{ MaterialOutward : issued
    Material ||--o{ MaterialRequest : requested
    MaterialRequest ||--o| MaterialOutward : fulfilled
```

### 4.2 Soft-Deactivation Pattern — Critical Design Rule

> Operational records use soft-deactivation. They are **not hard-deleted by default**. `TenderFile` is the exception: removing a file deletes that row and the stored object.

#### All models except `Employee`:
- Field: **`isActive`** (`Boolean`, default `true`)
- `DELETE` → sets `isActive = false` via `setActiveHandler` (Admin only)
- `PATCH` → explicit toggle via `setActiveHandler` with body `{ isActive: bool }` (Admin only)
- `GET` → auto-filters `{ isActive: true }` via `onlyActive()` unless Admin passes `?includeInactive=true`

#### `Employee` only:
- Field: **`status`** (`Boolean?`, default `true`) — **exact analogue of `isActive`** on other models
- `status: false` → blocks login via `isActiveAccount()` in `requireAuth()`
- Default `GET /api/employees` filters `NOT { status: false }`. Admin can pass `?status=false` or `?includeInactive=true`

### 4.3 Model Reference

#### Core HR & Operations (12 models)

**`Firm`** — `id`, `name`, `gstNo`(unique), `address`, `proprietorName`, `phoneNo`, `isActive`. → `employees[]`, `projects[]`

**`Department`** — `id`, `name`, `description`, `HOD`, `isActive`. → `employees[]`, `projects[]`

**`Designation`** — `id`, `title`, `description`, `isActive`. → `employees[]`

**`Employee`** — `id`, `employeeCode`, `name`, `email`, `phone`(BigInt), `dob`, `gender`, `address`(JSON), `profileImageUrl`(GCS proxy URL), `siteId`, `joinDate`, **`status`**(Boolean?=true, soft-deactivation), `passwordHash`(never exposed), `role`(A/M/E), `designationId`, `deptId`, `firmId`, `bankDetails`(JSON), `pan`, `aadhar`(BigInt), `uan`, `emergencyNo`(BigInt). → `firm`, `department`, `designation`, `managedSites[]`, `attendances[]`, `leaves[]`

**`Project`** — `id`, `name`, `description`, `type`, `status`(String operational: Planning/In Progress/Completed/On Hold), `department`(FK), `firmId`, `progress`(Int 0-100), `tenderId`, `startDate`, `endDate`, `budget`(Float), `contractor`(FK), `isActive`. → `firm`, `departmentRel`, `contractorRel`, `sites[]`, `boqRecords[]`, `progressRecords[]`, `materialOutwards[]`, `materialRequests[]`, `tenderFiles[]`

**`TenderFile`** — one row per file an admin uploads. `id`, `projectId`(FK, restrict delete), `tenderId`, `kind`(`file` or `doc`), `name`, `fileUrl`(`/api/files/...`), `storagePath`, `source`(`manual`), `createdAt`, `createdBy`. Indexed on `projectId` and `tenderId`. The table is the only list. Rows are deleted when an admin removes the file.

**`Site`** — `id`, `name`, `address`, `coordinates`(Lat,Long string), **`attendanceRadius`**(Int? geofence radius in metres), `status`(String operational), `sitManager`(FK→Employee), `projectId`, `isActive`. → `manager`, `project`, `attendances[]`, `boqRecords[]`, `progressRecords[]`, `materialOutwards[]`, `materialRequests[]`

**`Progress`** — `id`, `projectId`(required), `siteId`(required), `images`(GCS proxy URL string), `latitude`(Float), `longitude`(Float), `isActive`. Indexed on `projectId`, `siteId`.

**`BOQs`** — `id`, `boqCode`, `projectId`, `siteId`, `docsLinks`(JSON array GCS URLs), `validity`(Date), `isActive`. → `project`, `site`, `items[]`

**`BOQItems`** — `id`, `boqId`, `slNo`, `itemName`, `specification`, `unit`, `quantity`, `rate`(Float), `amount`(Float), `remarks`, `itemLeft`, `itemReceivedTotalQuantity`, **`itemReceivedImage`**(Json? array of objects: `[{ slNo, imageLink, quantity, lat, long, createdAt, createdBy }]`), `extraItem`, `isActive`. → `boq`, `extraItems[]`. `quantity` on each photo is the amount delivered with that photo. The line’s `itemReceivedTotalQuantity` is the running sum. `itemLeft` is ordered quantity minus that sum when the ordered quantity is numeric.

**`ExtraItemBOQ`** — `id`, `boqItemId`(FK, indexed), `itemName`, `itemQuantity`, `isApproved`(Boolean=false), `approvedBy`, `requestedBy`, `remarks`, `isActive`. → `boqItem`

**`Attendance`** — `id`, `employeeId`, `siteId`, `checkInTime`, `checkOutTime`, `method`(GPS/Biometric/Manual), `gpsAccuracy`(Float m), `isFlagged`(Boolean), **`siteLat`**(Float? site latitude snapshot at punch-in), **`siteLng`**(Float? site longitude snapshot), **`siteAttendanceRadius`**(Int? site geofence radius snapshot in metres), **`checkInLat`**(Float? employee check-in latitude), **`checkInLng`**(Float? employee check-in longitude), **`distanceFromSite`**(Float? calculated distance in metres from site centre), **`locationRemarks`**(String? auto-generated geofence audit remark), `isActive`. → `employee`, `site`

**`Leave`** — `id`, `employeeId`, `reason`, `leaveDate`, `duration`(Float days), `approved`(Boolean=false), `isActive`. → `employee`

**`Contractor`** — `id`, `name`, `phoneNo`, `description`, `isActive`. → `projects[]`

#### Warehouse (6 models)

**`MaterialCategory`** — `id`, `name`, `description`, `isActive`. → `materials[]`

**`Unit`** — `id`, `name`, `symbol`, `isActive`. → `materials[]`

**`Supplier`** — `id`, `name`, `phone`, `email`, `address`, `gstNumber`, `isActive`. → `inwards[]`

**`Material`** — `id`, `code`(unique), `name`, `categoryId`(FK), `unitId`(FK), `minStock`(Float=0), `description`, `isActive`. → `stock`, `ledger[]`, `adjustments[]`, `inwards[]`, `outwards[]`, `requests[]`. Indexed on `categoryId`, `unitId`.

**`Stock`** — `id`, `materialId`(unique, FK), `quantity`(Float=0). One-to-one with Material. Upserted automatically on every stock movement.

**`StockLedger`** — `id`, `materialId`, `movement`(INWARD/OUTWARD/ADJUSTMENT), `quantity`(signed Float), `balanceAfter`, `referenceType`(GRN/ISSUE/REQUEST/ADJUSTMENT), `referenceId`, `remarks`, `createdAt`, `createdBy`. Indexed on `materialId`, `createdAt`. **Read-only** — never manually mutated.

**`StockAdjustment`** — `id`, `materialId`, `direction`(INCREASE/DECREASE), `quantity`, `reason`, `isActive`.

**`MaterialInward`** — `id`, `grnNumber`(unique, auto-generated), `supplierId`, `materialId`, `quantity`, `rate`(Float=0), `receivedAt`, `remarks`, `isActive`. Indexed on `materialId`, `supplierId`.

**`MaterialOutward`** — `id`, `issueNumber`(unique, auto-generated), `materialId`, `projectId`, `siteId`, `quantity`, `purpose`, `issuedAt`, `requestId`(unique FK→MaterialRequest), `isActive`. Indexed on `materialId`, `projectId`.

**`MaterialRequest`** — `id`, `materialId`, `projectId`, `siteId`, `quantity`, `status`(PENDING/APPROVED/REJECTED/ISSUED, default PENDING), `remarks`, `requestedBy`, `isActive`. → `issue`(MaterialOutward). Indexed on `materialId`, `status`.

---

## 5. Core Library Reference (`lib/`)

| File | Purpose |
|---|---|
| `lib/auth.js` | `requireAuth`, `requireRoles`, `sanitizeEmployee`, `filterAllowedEmployeeUpdates`, `hashPassword`, `comparePassword`, `credentialTag`, `invalidateSession`, `ROLES`, `signToken`, `verifyToken`. Session reads are cached for 20 seconds and dropped when the employee record or password changes. Tokens are accepted from the `Authorization` header or the `auth_token` cookie, not from the query string. New tokens carry `cv`, a fingerprint of the password hash, so a password change rejects that token. |
| `lib/read-cache.js` | Short process cache. `readCache(key, ttl, loader)` does not store failures. `invalidateWarehouseOptions()` and `invalidateLowStock()` clear the warehouse dropdown cache (45s) and the low-stock cache (90s) after the write that changes them. Low stock is one filtered query, not every material. Missing stored files are remembered for 20s so a repeat miss does not call storage again. |
| `lib/api-response.js` | `successResponse`, `errorResponse`, `badRequest`, `unauthorized`, `forbidden`, `notFound`, `conflict`, `serverError`, `handleApiError`. All include `{ success, message, data, timestamp }` and `Cache-Control: private, no-store`. BigInt values are serialized as strings. |
| `lib/tender-portal-exchange.js` | Tender file kinds and the admin upload path `/boatbrothers/tenders`. |
| `lib/visibility.js` | `includeInactive(searchParams, user)`, `onlyActive(where, searchParams, user)`, `setActiveHandler(prismaDelegate, label)` |
| `lib/security.js` | `isActiveAccount(employee)` — checks `status` (Boolean+legacy string). `normalizeResourceUrl`, `isSafeResourceUrl`, `safeInternalPath`, `getSafeImageUrl` (GCS proxy router) |
| `lib/warehouse.js` | `StockError`, `docNo(prefix)` (auto doc numbers GRN-/ISS-), `positiveNumber`, `nonNegativeNumber`, `assertSiteBelongsToProject`, `isLowStock`, `shapeStockRow`, `loadMaterials`, `loadLowStock`, **`postStockMovement`** (atomic stock upsert + ledger entry inside Prisma `$transaction`) |
| `lib/warehouse-master.js` | `masterCollection({ delegateName, label, fields, include, orderBy, prepare })` → `{ GET, POST }` and `masterItem({ delegateName, label, fields, include, prepare })` → `{ PUT, PATCH, DELETE }`. Used by all warehouse master data routes (categories, units, suppliers, materials). |
| `lib/prisma.js` | Singleton Prisma Client (prevents connection pool exhaustion) |
| `lib/gcs.js` | Private object storage. `uploadToGCS`, `deleteFromGCS`, `downloadFromGCS`. Folders: `boq-files/`, `employee-profiles/`, `site-progress/<siteId>/`, `boq-received-images/<boqItemId>/`, `tender-packs/<projectId>/`. S3 is used when those env vars are set; otherwise GCS. Auth fallback: `GCS_CREDENTIALS_BASE64` → `GCS_CREDENTIALS_JSON` → `GCS_KEY_FILE_PATH` / `./suchii-group-auth-key.json`. |
| `lib/session.js` | `SESSION_TTL = '12h'`, `SESSION_TTL_SECONDS = 43200` |
| `lib/jwt-secret.js` | Safe `JWT_SECRET` env accessor |
| `lib/rate-limit.js` | In-memory request rate limiting |
| `lib/validation.js` | Input validation helpers |
| `lib/utils.js` | General utility functions |
| `lib/branding.js` | `BRAND` — company, product, full name, tagline, description, access notice. Single source for all product naming. |
| `lib/two-captcha.js` | `twoCaptchaKeyStatus()` — reports whether `TWOCAPTCHA_API_KEY` is set to a real value; the key itself is never returned to the client. |

### App Shell & Layout Contract

Every authenticated module layout (`app/<module>/layout.jsx`) renders `components/layout/AppShell.jsx`, optionally with `allowedRoles` for a client-side `RoleGuard`. The shell is locked to the viewport (`h-dvh overflow-hidden`): the sidebar and header stay fixed and **only `<main>` scrolls**. A footer on every shell page reads “Brought to you by Boat Brothers” and links to `https://boatbrothers.in`. It is always rendered. There is no setting to hide it. The same line is on the landing page, sign-in, 404, and error screen via `components/layout/Credit.jsx`.

Sidebar groups live in `components/layout/navigation.js`: Overview, Projects (Sites, BOQs, Site Progress, Tender portal, Tender upload, Tenders, Projects), Warehouse, Workforce, Companies, Insights, and Account pinned at the bottom. `/dashboard`, `/warehouse`, and `/tenders` highlight only on an exact match so child routes do not light the parent.

`Navbar.jsx` derives the current module title from the route via `resolvePageTitle()` exported by `Sidebar.jsx`.

Page guides are `components/guide/guides.js` rendered by `WorkflowGuide`. One id per screen. The panel stays closed until Help is opened. Done, Escape, or close stores `suchii-guide:<id>` in `localStorage`.

### Security Headers (`next.config.mjs`)

CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`. In production the CSP drops `'unsafe-eval'` (only needed by dev tooling), adds `upgrade-insecure-requests`, and HSTS is sent. Root metadata sets `robots: noindex, nofollow`.

### Key Pattern: Stock Movement (always inside `$transaction`)

```js
import { postStockMovement, docNo, StockError } from '@/lib/warehouse';

const saved = await prisma.$transaction(async (tx) => {
  const inward = await tx.materialInward.create({ data: { grnNumber: docNo('GRN'), ... } });
  await postStockMovement(tx, {
    materialId, direction: 'IN', quantity, movement: 'INWARD',
    referenceType: 'GRN', referenceId: inward.id, remarks, createdBy: user.id,
  });
  return inward.id;
});
```

- `direction: 'IN'` increments Stock; `direction: 'OUT'` decrements.
- Throws `StockError('Not enough stock...')` if balance would go negative.
- Always appends a `StockLedger` row — never skip this.

---

## 6. Feature & Module Breakdown

### 6.1 Interactive 3D Landing & Authentication (`/`, `/login`)
Cool charcoal theme (`#1e1f26` background, `#ebe8e3` text, indigo `#5c6bc0`) with particles on the landing page (`ParticlesBackground.jsx`). HTTP-only `auth_token` cookie (12h TTL) plus token JSON for mobile. Login responses are `private, no-store`.

### 6.2 Executive Dashboard (`/dashboard`)
Admin/Manager: total active projects, sites, today's attendance, open leaves, firm portfolio, active contractors.
Employee: personal attendance, active leaves, assigned project/site.

### 6.3 BOQ & Photographic Delivery Verification (`/boqs`)
- **Excel Import**: Excel upload (`.xlsx`/`.xls`) auto-parses rows into `BOQItems` linked to `BOQs`.
- **Received Quantities**: Tracks `itemReceivedTotalQuantity` against ordered `quantity`, computing `itemLeft`.
- **Photographic Delivery Verification**:
  - Modal opened per line item to view received item photos with serial numbers, upload timestamps, and GPS coordinates.
  - Image upload with optional manual GPS or "Detect GPS" button (browser HTML5 geolocation).
  - Each new photo requires a delivered quantity greater than zero. That amount is stored on the photo and added to `itemReceivedTotalQuantity`. Deleting a photo subtracts only the quantity recorded on it. Older photos with no quantity stay “not recorded”.
  - Images saved to object storage under `boq-received-images/<boqItemId>/` and stored as a JSON array in `itemReceivedImage`. JPG, PNG, WEBP, and GIF only. SVG is refused. An employee (`E`) can upload only for a BOQ on their assigned site.
  - Image removal with automatic storage cleanup.
  - High-res Lightbox modal with zoom and GPS metadata.

### 6.4 Extra BOQ Items / Variations (`/boqs` → Line Items → Extra Items button)
`ExtraItemBOQ` records are attached to individual `BOQItems`. The site manager submits them from Extra Item Requests. The console lists them from the Extra Items button on a line. A new request is always pending. `POST` ignores `isApproved` and `approvedBy`. Only an admin can set approval, with `PUT /api/extra-boq-items/[id]`. The console shows an Approve button for role `A`.

### 6.5 Site Progress Gallery (`/sites` → Progress, `/projects` → Progress)
Managers upload progress photos (max 8MB, jpg/png/webp/gif) with GPS coordinates. Photos stored in GCS under `site-progress/<siteId>/` and proxied via `/api/files/`. Accessible directly from both Sites and Projects list actions.

### 6.6 Geofenced Site Operations (`/sites`)
- Site directory with address and lat/long GPS coordinates.
- **Configurable Attendance Radius** (`attendanceRadius` in metres, e.g. 200m) configured per site.
- Assigned site managers and soft-deactivation.

### 6.7 Geofenced Attendance & Proximity Engine (`/attendance`)
- Check-in/check-out recording with GPS coordinates (`checkInLat`, `checkInLng`).
- **Haversine Distance Engine**: Computes exact straight-line distance in metres between worker check-in coordinates and site coordinates.
- **Location Snapshot**: Automatically records `siteLat`, `siteLng`, and `siteAttendanceRadius` at check-in time so historical checks remain permanently valid even if site coordinates change later.
- **Automated Geofence Audit Remarks** (`locationRemarks`):
  - `Within radius. Distance: Xm (limit: Ym).` (Green badge)
  - `Outside radius. Distance: Xm exceeds limit of Ym.` (Red badge)
  - `Distance from site: Xm. No attendance radius configured.` (Neutral badge)
  - `No employee GPS location provided.` / `No site GPS coordinates configured.`
- Verification details drawer showing full GPS snapshot breakdown.
- Admin/Manager manual corrections support updating coordinates, radius, distance, and remarks.

### 6.8 Leave Management (`/leaves`)
Employee leave requests with date, duration (0.5/1.0 day), reason. Admin/Manager approve/reject. `approved` Boolean field.

### 6.9 Workforce Directory & KYC (`/employees`)
Full profiles with KYC vault (PAN, Aadhar, UAN, Bank details). Employee `status` field controls soft-deactivation and login. Profile photos uploaded via `POST /api/upload/employee-image` stored in `employee-profiles/`. Role controls: Managers create `E` only. `passwordHash` always stripped by `sanitizeEmployee()`.

### 6.10 Corporate Entities (`/firms`, `/departments`, `/designations`)
Firms (GST, proprietor), Departments (HOD), Designations (hierarchy). All support `isActive` soft-deactivation.

### 6.11 Project & Tender Tracking (`/projects`, `/tenders`, `/tenders/portal`, `/boatbrothers/tenders`)
Projects keep the tender ID, budget, dates, and `progress` (0–100%). `/tenders` lists projects that already have a tender ID and shows whether `TWOCAPTCHA_API_KEY` is set. The key is never typed or shown on the page.

`/tenders/portal` (Admin, Manager) is the table of tender files. `/boatbrothers/tenders` (Admin only) adds a row: pick the tender, upload a tender file (`kind: file`) or a supporting document (`kind: doc`). Each upload is one `TenderFile` row and one object under `tender-packs/<projectId>/`, and that row is what the tender portal lists. `/tenders/admin` redirects to `/boatbrothers/tenders`. Managers and employees cannot open `/boatbrothers`.

### 6.12 Warehouse Management (`/warehouse`)
Full construction materials lifecycle:

| Sub-Module | Path | Description |
|---|---|---|
| **Dashboard** | `/warehouse` | KPIs: total materials, stock value, low-stock count, pending requests |
| **Materials** | `/warehouse/materials` | Master list of materials with category, unit, min-stock threshold |
| **Categories** | `/warehouse/categories` | Material classification groups |
| **Units** | `/warehouse/units` | Units of measure (e.g. MT, CUM, Nos) |
| **Suppliers** | `/warehouse/suppliers` | Vendor directory with GST, contact details |
| **Stock** | `/warehouse/stock` | Real-time stock levels per material with low-stock highlighting |
| **Inward (GRN)** | `/warehouse/inward` | Goods received notes — increments Stock + creates StockLedger entry |
| **Outward (Issue)** | `/warehouse/outward` | Direct material issues — decrements Stock + creates StockLedger entry |
| **Requests** | `/warehouse/requests` | Site material requests → PENDING → APPROVED/REJECTED → ISSUED |
| **Adjustments** | `/warehouse/adjustments` | Manual stock corrections (INCREASE/DECREASE) with reason |
| **Ledger** | `/warehouse/ledger` | Full chronological stock movement history per material |
| **Low Stock** | `/warehouse/low-stock` | Materials at or below minimum stock threshold |
| **Reports** | `/warehouse/reports/*` | stock, inward, outward, consumption, valuation reports |

**Material Request Workflow:**
```
POST /api/warehouse/requests         → status: PENDING
PATCH /api/warehouse/requests/[id]   body: { action: 'APPROVE' } → status: APPROVED
PATCH /api/warehouse/requests/[id]   body: { action: 'REJECT' }  → status: REJECTED
PATCH /api/warehouse/requests/[id]   body: { action: 'ISSUE' }   → status: ISSUED
                                      (creates MaterialOutward + StockLedger atomically)
```

### 6.13 Reports (`/reports`)
Tabs: Attendance, Project, Contractor, Employee, Leave. Export CSV downloads the tab on screen. It does not write records. Attendance, projects, contractors, and leave omit deactivated rows. The employee tab lists people and marks each one Active or Inactive.

---

## 7. Complete REST API Reference

All protected endpoints require `Authorization: Bearer <token>` or valid `auth_token` cookie.

### 7.1 Authentication

| Endpoint | Method | Role | Description |
|---|---|---|---|
| `/api/auth/login` | POST | Public | Authenticate; returns `{ token, user }` |
| `/api/auth/me` | GET | A,M,E | Current user sanitized profile |
| `/api/auth/change-password` | POST | A,M,E | Change password (min 8 chars) |
| `/api/auth/logout` | POST | Public | Clear `auth_token` cookie |

### 7.2 Core Business

| Endpoint | Methods | Roles | Notes |
|---|---|---|---|
| `/api/dashboard` | GET | A,M,E | Role-scoped KPIs |
| `/api/projects` | GET, POST | A,M | Paginated list / create |
| `/api/projects/[id]` | GET, PUT, DELETE, PATCH | A,M / A | Soft-delete via DELETE/PATCH |
| `/api/sites` | GET, POST | A,M | POST supports `attendanceRadius` (Int? metres), `coordinates` |
| `/api/sites/[id]` | GET, PUT, DELETE, PATCH | A,M / A | PUT supports `attendanceRadius` (Int? metres) |
| `/api/boqs` | GET, POST | A,M | `?projectId`, `?search` |
| `/api/boqs/[id]` | GET, PUT, DELETE, PATCH | A,M / A | |
| `/api/boq-items` | GET, POST | A,M | `?boqId` required on GET |
| `/api/boq-items/[id]` | GET, PUT, DELETE, PATCH | A,M / A | Supports updating `itemReceivedImage` (JSON array) |
| `/api/boq-items/[id]/images` | GET, POST, DELETE | A,M,E / A,M | **Delivery proof gallery**. POST is `multipart/form-data`: `file`, `quantity` (required, greater than zero), `lat`, `long`, `slNo`. Stores the file under `boq-received-images/<id>/`, appends the photo, and updates received total and quantity left. Role `E` only for their assigned site. DELETE (`?index=N` / `?slNo=X` / `?imageLink=URL`) removes the photo, subtracts its quantity, and deletes the stored file. |
| `/api/upload/boq-item-image` | POST | A,M,E | Same delivery rules as the route above (`boqItemId`, `file`, `quantity`, `lat`, `long`, `slNo`). |
| `/api/extra-boq-items` | GET, POST | A,M | `?boqItemId` required on GET. POST always creates a pending request. |
| `/api/extra-boq-items/[id]` | GET, PUT, DELETE, PATCH | A,M / A | Approval fields on PUT are admin only. Soft-delete via DELETE/PATCH is admin only. |
| `/api/tenders` | GET | A,M | Projects that already have a tender ID. Files are not embedded. |
| `/api/tenders/documents` | GET | A,M | `TenderFile` rows, newest first. |
| `/api/tenders/documents` | POST | A | `multipart/form-data`: `projectId`, `kind` (`file` or `doc`), `file` (max 20 MB). |
| `/api/tenders/documents` | DELETE | A | `?documentId=`. Deletes the row and the stored object. |
| `/api/tenders/captcha-status` | GET | A,M | Whether `TWOCAPTCHA_API_KEY` is set. The value is never returned. |
| `/api/progress` | GET, POST | A,M | `multipart/form-data` on POST: `file`, `projectId`, `siteId`, `latitude`, `longitude`. Photo stored in GCS `site-progress/<siteId>/` |
| `/api/progress/[id]` | DELETE, PATCH | A | Soft-deactivate |
| `/api/attendance` | GET, POST | A,M,E | **Geofence Check-in**: POST accepts `checkInLat`, `checkInLng`. Computes Haversine distance from site coordinates, snapshots `siteLat`, `siteLng`, `siteAttendanceRadius`, sets `distanceFromSite` and auto-generated `locationRemarks`. E: self-scoped. |
| `/api/attendance/[id]` | GET, PUT, DELETE, PATCH | A,M / A | PUT accepts overrides for location snapshot fields, coordinates, distance, remarks. |
| `/api/leaves` | GET, POST | A,M,E | E: self-scoped |
| `/api/leaves/[id]` | PUT | A,M | Approve/reject |
| `/api/leaves/[id]` | DELETE | A,M,E | E: pending only |
| `/api/employees` | GET | A,M | `?page`, `?limit`, `?department`, `?designation`, `?role`, `?search`, `?status=false`(A), `?includeInactive=true`(A) |
| `/api/employees` | POST | A,M | M: role E only |
| `/api/employees/[id]` | GET | A,M,E | E: own only |
| `/api/employees/[id]` | PUT | A,M,E | E: KYC fields only; M: non-admin; A: all |
| `/api/employees/[id]` | DELETE | A | Permanent delete |
| `/api/upload/employee-image` | POST | A,M | Upload employee KYC profile image (`multipart/form-data`: `file`, max 5MB). Stored in GCS `employee-profiles/`. Returns `{ publicUrl, directGcsUrl, gcsPath }`. |
| `/api/firms` | GET, POST | A,M | |
| `/api/firms/[id]` | GET, PUT, DELETE, PATCH | A,M / A | |
| `/api/departments` | GET, POST | A | |
| `/api/departments/[id]` | GET, PUT, DELETE, PATCH | A | |
| `/api/designations` | GET, POST | A | |
| `/api/designations/[id]` | GET, PUT, DELETE, PATCH | A | |
| `/api/contractors` | GET, POST | A,M | |
| `/api/contractors/[id]` | GET, PUT, DELETE, PATCH | A,M / A | |
| `/api/reports` | GET | A,M | `?type`, `?startDate`, `?endDate`, `?department`, etc. |
| `/api/upload/boq-excel` | POST | A,M | `multipart/form-data`: `file`, `boqId` |
| `/api/files/[...path]` | GET | A,M,E | GCS private bucket proxy route |
| `/api/health` | GET | Public | DB connectivity check |

### 7.3 Warehouse APIs

| Endpoint | Methods | Roles | Notes |
|---|---|---|---|
| `/api/warehouse/materials` | GET, POST | A,M | List/create materials |
| `/api/warehouse/materials/[id]` | PUT, PATCH, DELETE | A,M / A | Update / soft-deactivate |
| `/api/warehouse/categories` | GET, POST | A,M | |
| `/api/warehouse/categories/[id]` | PUT, PATCH, DELETE | A,M / A | |
| `/api/warehouse/units` | GET, POST | A,M | |
| `/api/warehouse/units/[id]` | PUT, PATCH, DELETE | A,M / A | |
| `/api/warehouse/suppliers` | GET, POST | A,M | |
| `/api/warehouse/suppliers/[id]` | PUT, PATCH, DELETE | A,M / A | |
| `/api/warehouse/stock` | GET | A,M | Current stock levels for all active materials |
| `/api/warehouse/low-stock` | GET | A,M | Materials at/below `minStock` |
| `/api/warehouse/inward` | GET, POST | A,M | POST: `{ supplierId, materialId, quantity, rate, remarks }` → auto-creates GRN number, updates Stock, appends StockLedger |
| `/api/warehouse/outward` | GET, POST | A,M | POST: `{ materialId, projectId?, siteId?, quantity, purpose? }` → auto-creates issue number, decrements Stock |
| `/api/warehouse/adjustments` | GET, POST | A,M | POST: `{ materialId, direction: INCREASE\|DECREASE, quantity, reason }` |
| `/api/warehouse/requests` | GET, POST | A,M | POST: `{ materialId, projectId?, siteId?, quantity, remarks? }` → status PENDING |
| `/api/warehouse/requests/[id]` | PATCH | A,M | `{ action: 'APPROVE'\|'REJECT'\|'ISSUE' }` — ISSUE atomically creates MaterialOutward |
| `/api/warehouse/ledger` | GET | A,M | Full stock movement ledger (read-only) |
| `/api/warehouse/summary` | GET | A,M | Aggregate KPIs for warehouse dashboard |
| `/api/warehouse/options` | GET | A,M | Dropdown data: materials, categories, units, suppliers, projects, sites |
| `/api/warehouse/reports` | GET | A,M | `?type=stock\|inward\|outward\|consumption\|valuation` |

### 7.4 Standard API Response Shape

```json
{
  "success": true,
  "message": "Operation successful",
  "data": { "...": "..." },
  "timestamp": "2026-09-26T12:00:00.000Z",
  "pagination": { "total": 100, "page": 1, "limit": 20, "totalPages": 5 }
}
```

- `BigInt` fields (`phone`, `aadhar`, `emergencyNo`) → auto-serialized to **strings**.
- Errors: `{ success: false, message, errors?, timestamp }`. Stack traces never exposed.

---

## 8. Security Architecture

### 8.1 Edge Middleware JWT Verification (`middleware.js`)
Uses **Web Crypto API (`crypto.subtle`)** — Edge-compatible:
- Extracts HS256 tokens from cookies or `Authorization: Bearer` header.
- Verifies HMAC-SHA256 signature against `JWT_SECRET`.
- Validates `exp` claim and role-based restricted prefix enforcement.

### 8.2 Account Deactivation Guard (`lib/security.js → isActiveAccount`)
Called by `requireAuth` on every protected request:
- `employee.status === false` → returns `401 Unauthorized` immediately.
- Supports both native Boolean and legacy strings: `inactive`, `disabled`, `deactivated`, `false`, `0`, `no`.

### 8.3 URL Safety & GCS Proxying (`lib/security.js`)
- `normalizeResourceUrl` — only `http:`/`https:` URLs accepted.
- `safeInternalPath` — prevents open-redirect after login.
- `getSafeImageUrl` — auto-proxies GCS URLs through `/api/files/` to avoid uniform-access bucket 403s.

### 8.4 Google Cloud Storage Private Bucket Architecture (`lib/gcs.js`)
- Service account resolution:
  1. `GCS_CREDENTIALS_BASE64` (Base64 JSON)
  2. `GCS_CREDENTIALS_JSON` (raw JSON)
  3. `GCS_KEY_FILE_PATH` / `./suchii-group-auth-key.json`
- Folder layout:
  - `boq-files/` — Excel BOQ imports
  - `employee-profiles/` — Profile images (max 5MB)
  - `site-progress/<siteId>/` — Site progress photos (max 8MB)
  - `boq-received-images/<boqItemId>/` — BOQ item delivery photos (max 10MB)
  - `tender-packs/<projectId>/` — manually uploaded tender files and supporting documents (max 20MB)
- `/api/files/...` requires a signed-in user. Admins and managers may open tender packs, BOQ documents, and site-progress photos. Employees may open delivery photos and their own profile image. Other prefixes are refused. Responses use `Cache-Control: private, max-age=300`, not a public cache.
- File names: `crypto.randomUUID()` + safe extension (collision-resistant).

---

## 9. Database Migrations & Schema Synchronization

| Migration / Version | Description |
|---|---|
| `20260925_soft_deactivate` | Adds `isActive BOOLEAN DEFAULT true` to all original models. Back-fills `isActive = false` on Site where legacy `status = INACTIVE`. |
| `20260925_extra_boq_items` | Creates `ExtraItemBOQ` table with FK to `BOQItems`, index on `boqItemId`. |
| `20260925_construction_warehouse` | Creates 8 warehouse models: `MaterialCategory`, `Unit`, `Supplier`, `Material`, `Stock`, `StockLedger`, `StockAdjustment`, `MaterialInward`, `MaterialOutward`, `MaterialRequest`. |
| `20260925_site_progress` | Creates `Progress` table: `id`, `projectId`, `siteId`, `images` (GCS proxy URL), `latitude`, `longitude`, `isActive`. Indexes on `projectId` and `siteId`. |
| `20260927_tender_documents` | Adds nullable `Project.tenderDocuments`. Superseded by the table below. |
| `20260927_tender_file_table` | Creates `TenderFile` and drops `Project.tenderDocuments`. |
| *Schema Sync (2026-09-26)* | Adds `attendanceRadius Int?` to `Site`. Adds location snapshot & geofence metrics to `Attendance`: `siteLat`, `siteLng`, `siteAttendanceRadius`, `checkInLat`, `checkInLng`, `distanceFromSite`, `locationRemarks`. |

### Migration Commands

```bash
npx prisma migrate deploy    # Apply pending migrations (production-safe)
npx prisma db push           # Push schema directly (dev only, no migration history)
npx prisma generate          # Regenerate Prisma Client after schema changes
npx prisma studio            # GUI database browser
npx prisma migrate resolve --rolled-back <name>  # Mark failed migration as rolled back
```

> **Note on Windows / PowerShell**: Always use `[System.IO.File]::WriteAllText(path, content, New-Object System.Text.UTF8Encoding $false)` to write SQL migration files — PowerShell `Set-Content -Encoding UTF8` adds a BOM (`\uFEFF`) that causes PostgreSQL error `42601`.

---

## 10. Mobile Companion App (Flutter) Context

1. **Auth**: `Authorization: Bearer <token>` on every request. TTL: **12 hours**.
2. **Token**: Flutter caches `data.token` via `flutter_secure_storage`.
3. **Geofenced Attendance Check-In**:
   - Punch-in: `POST /api/attendance`
   - Body: `{ employeeId, siteId, checkInLat, checkInLng, method: "GPS", gpsAccuracy }`
   - The backend computes `distanceFromSite` against the site's `coordinates` and compares it to `siteAttendanceRadius`.
   - The response includes `distanceFromSite`, `siteAttendanceRadius`, and `locationRemarks`.
4. **BOQ Item Delivery Photos**:
   - `POST /api/boq-items/[id]/images` or `POST /api/upload/boq-item-image`
   - Multipart fields: `file` (image), `quantity` (required, greater than zero), `lat` (double), `long` (double), `slNo` (optional).
   - The app asks for the quantity before the camera. The sheet lifts above the keyboard.
5. **Profile Image Upload**:
   - `POST /api/upload/employee-image` (Multipart `file`).
6. **BigInt Compatibility**:
   - `phone`, `aadhar`, `emergencyNo` returned as **strings** — parse as `String` in Dart, never as `int`.
7. **Scoping**: `role: E` users calling `/api/attendance` or `/api/leaves` auto-scoped to their own `employeeId`.

---

## 11. Environment Variables (`.env`)

```ini
DATABASE_URL="postgresql://user:password@ep-shiny-leaf-ael6ptxi-pooler.c-2.us-east-2.aws.neon.tech/neondb?schema=public"
JWT_SECRET="your-super-strong-jwt-secret-min-32-chars"
GCS_BUCKET_NAME="suchii-group-assets"
GCS_PROJECT_ID="suchii-group-production"
GCS_KEY_FILE_PATH="./suchii-group-auth-key.json"
# Or provide service account JSON directly:
# GCS_CREDENTIALS_JSON='{"type":"service_account",...}'
# GCS_CREDENTIALS_BASE64="ey..."
CORS_ORIGINS="http://localhost:3000,https://admin.suchiigroup.com"
NODE_ENV="development"
PORT=3000
```

---

## 12. Developer & Agent Operational Workflows

### 12.1 Running Locally

```bash
npm install
npx prisma generate
npm run dev   # → http://localhost:3000
```

### 12.2 Database Seeding & Auditing

```bash
node scripts/seed-initial-data.mjs
node scripts/detailed-db-audit.mjs
node scripts/verify-schema.mjs
```

### 12.3 API & Security Test Suites

```bash
node scripts/test-auth-endpoints.mjs
node scripts/test-role-authorization.mjs
node scripts/test-projects-api.mjs
node scripts/test-employees-api.mjs
```

### 12.4 Common Agent Gotchas

- **Never hard-delete**: Use `setActiveHandler` from `lib/visibility.js` for `DELETE`/`PATCH` on all models.
- **Employee deactivation** uses `status` (Boolean), not `isActive`. Check via `isActiveAccount()`, never compare directly.
- **Site Attendance Geofencing**:
  - `Site.coordinates` format: `"latitude, longitude"` (e.g., `"26.1445, 91.7362"`).
  - `Site.attendanceRadius`: Integer metres (e.g. `200`).
  - Attendance check-in snapshots `siteLat`, `siteLng`, and `siteAttendanceRadius` at punch time so historical audits are immutable.
  - Straight-line distance is computed server-side via the **Haversine formula**.
- **BOQ Delivery Verification Photos**:
  - Upload via `POST /api/boq-items/[id]/images` or `POST /api/upload/boq-item-image`.
  - Stored in GCS under `boq-received-images/<boqItemId>/`.
  - `BOQItems.itemReceivedImage` is a JSON array: `[{ slNo, imageLink, quantity, lat, long, createdAt, createdBy }]`. `quantity` is required on new uploads and is added to `itemReceivedTotalQuantity`.
  - When deleting an image via `DELETE /api/boq-items/[id]/images`, the API removes the item from the array and deletes the file from GCS.
- **Warehouse stock** must always go through `postStockMovement()` inside a Prisma `$transaction`. Never mutate `Stock` directly.
- **Document numbers** (GRN, ISS) are always auto-generated by `docNo('GRN')` / `docNo('ISS')` — never accept them from client input.
- **StockLedger** is append-only — never update or delete ledger rows.
- **Material requests** flow: PENDING → APPROVED/REJECTED → ISSUED. Skipping steps throws `StockError`.
- **BigInt fields** (`phone`, `aadhar`, `emergencyNo`) must be parsed with `BigInt(String(value).replace(/\D/g, ''))` before inserting. Output serialization is handled automatically by `successResponse()`.
- **GCS image URLs** must go through `getSafeImageUrl()` before rendering — proxies to `/api/files/`.
- **JWT secret** must be accessed via `lib/jwt-secret.js` — never read `process.env.JWT_SECRET` directly in route handlers.
- **`passwordHash`** must always be stripped via `sanitizeEmployee()` before returning any Employee record.
- **Session TTL** is 12 hours. Reference `SESSION_TTL`/`SESSION_TTL_SECONDS` from `lib/session.js`.
- **PowerShell + SQL files**: Write migration SQL with `[System.IO.File]::WriteAllText` using `New-Object System.Text.UTF8Encoding $false` to avoid BOM.

---

*Document maintained for the Suchii Group Engineering Team & AI Agent System. Last updated: 2026-09-28.*