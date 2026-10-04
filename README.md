# Luit

Luit (formerly the Suchii Group Operations Console) is the office portal and API for Suchii Group construction work: projects, sites, BOQs, attendance, warehouse, and tenders. The AI tender tools (Tender Desk, notice search, official downloads) sit under the **Luit AI** sidebar group; screens keep their own names. The phone app in `suchii-group-site-manager` signs in here and uses the same API.

Product names live in `lib/branding.js`. The "Luit, brought to you by Boat Brothers" line under every page is required and cannot be turned off.

Roles are `A` (admin), `M` (site manager), and `E` (employee). Architecture, schema, and the API list are in [agent.md](agent.md).

## Size

Counted on 28 Sep 2026. Non-blank lines only. `node_modules`, `.next`, and build folders are not included.

| | Operations console | Site manager |
|---|---:|---:|
| Stack | Next.js 15, Prisma, Postgres | Flutter |
| Source files | 223 | 71 (64 app, 7 tests) |
| Non-blank lines | 35,225 | 11,607 |

The two codebases together are about 47,000 non-blank lines. This console is about three times the phone app.

Most of this repo is JavaScript (25,561) and JSX (6,048), plus scripts (2,560), the Prisma schema (427), CSS (398), and SQL migrations (231). There are 61 API route files. Complexity is a few very large screens, not a wide set of small modules:

| Screen | Non-blank lines |
|---|---:|
| `app/employees/page.js` | 2,458 |
| `app/boqs/page.js` | 2,161 |
| `app/attendance/page.js` | 2,062 |
| `app/sites/page.js` | 1,513 |
| `app/progress/page.jsx` | 1,500 |
| `app/projects/page.js` | 1,345 |

The phone app’s heavy files are the dashboard map (1,433), attendance (753), the leave form (732), and delivery photos (578). It does not own the database.

## Run

```bash
npm install
npx prisma generate
npm run dev
```

The dev server is http://localhost:3000. Apply migrations with `npx prisma migrate deploy`. Do not commit `.env` or storage keys.
