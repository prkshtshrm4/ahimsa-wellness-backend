# Ahimsa Wellness — API

Express + MongoDB backend for **Ahimsa Wellness Centre** (bookings, payments, staff permissions).

## Local development

```bash
cp .env.example .env   # fill in MongoDB, Razorpay, etc.
npm install
npm run seed           # services + admin staff
npm start              # http://localhost:4000
```

Admin staff mobile after seed: `+911234567890` (Firebase test OTP `191001`).

## Deploy on Railway

1. Create a new project → **Deploy from GitHub repo** (this repository).
2. Add a **MongoDB** plugin or set `MONGODB_URI` to your Railway/external MongoDB URL.
3. Set environment variables:

| Variable | Notes |
|----------|--------|
| `PORT` | Set by Railway automatically |
| `CLIENT_ORIGIN` | Your Vercel URL, e.g. `https://ahimsa.vercel.app` |
| `MONGODB_URI` | MongoDB connection string |
| `FIREBASE_PROJECT_ID` | `ahimsa-wellness` |
| `AUTH_MODE` | `firebase` |
| `RAZORPAY_KEY_ID` | Razorpay test/live key |
| `RAZORPAY_KEY_SECRET` | Razorpay secret |
| `RAZORPAY_WEBHOOK_SECRET` | For payment webhooks |

4. After deploy, copy the public Railway URL into the frontend `VITE_API_URL` on Vercel.
5. Run seed once on Railway: `railway run npm run seed` (or use Railway shell).

Health check: `GET /health`

### Wellness packages

Packages use the existing Service collection with `kind: package`; existing records default to `service`. `GET /v1/packages` exposes active packages. `GET/POST /v1/admin/packages` and `PATCH/DELETE /v1/admin/packages/:id` require `services.manage`. Package fields: name, blurb, priceInPaise (total purchase price), visitCount (1–365), durationMin (per visit), capacity (dedicated per slot), inclusions (text list), active.

Authenticated patients purchase via the existing booking endpoint. The first appointment stores the package terms in `serviceSnapshot`. `GET /v1/me/packages` returns owned plans and remaining visits; `GET /v1/me/packages/:id/availability` and `POST /v1/me/packages/:id/visits` schedule included appointments after payment. Atomic reservations enforce one visit per day and the purchased visit limit. Cancelled follow-ups restore credits under the existing 12-hour cancellation window. Multi-visit purchase cancellation and first-visit changes are handled by the centre. Included therapies do not automatically reserve their separate room/staff resources.

No seed or data reset is needed. Admins add the real packages after deployment. Deploy this API before deploying the package-enabled frontend.

Run `npm ci && npm test` for integration coverage. Tests use an isolated mongodb-memory-server database (Node 20.19+ for the test tooling); the first run downloads MongoDB. They never connect to the configured production database.

Packages accept `serviceIds` (up to 50 unique existing service IDs). The API stores canonical service names and durations in `includedServices`; saving selections refreshes these details. New selections must be active; existing inactive inclusions may be retained. Packages may also retain free-text inclusions. Nested packages are rejected. Services can have `packageOnly: true`, including a zero reference price: admins can select them for packages, but public catalogue, individual availability and standalone booking exclude them. Referenced services cannot be deleted until removed from packages. Booking snapshots preserve purchased membership through later changes. Existing records need no migration. Package membership does not reserve separate therapy resources.

### Printed brochure catalogue
`src/data/brochure-catalogue.json` transcribes all four pages of `Scan documents20260921_174017.pdf` (supplied by the owner). Run `node scripts/sync-brochure.mjs` for a read-only preview; `--apply` performs the authorized replacement in a MongoDB transaction where supported, or validated writes with rollback on standalone MongoDB. It saves a private, git-ignored service backup, preserves matching IDs and booking records, verifies prices and visit counts, and deactivates unmatched offerings. Review the preview before any later rerun: it treats the brochure as the complete active catalogue. Never use the destructive demo seed for this import.

There are 13 treatment entries, first consultation, next OPD treatment, and 7 packages. Shirodhara and Herbal Plaster retain both printed rates without invented variant names. First consultation shows the printed introductory offer with confirmation required. Unknown durations/capacities on new records use internal placeholders (30 minutes/1 appointment) and `enquiryOnly: true`; those values are not advertised or bookable. Confirm real scheduling values in Admin, resolve the printed rate label, then turn off Contact to book. Existing matched service scheduling values are retained. Package inclusions follow the brochure only; no unprinted therapy membership is inferred.

Printed daily treatment hours: 08:00–13:00 and 16:00–19:00. Consultation category: 11:00–13:00 and 17:00–19:00. New bookings and reschedules validate these windows. The centre’s overall opening hours are 08:00–19:00.
