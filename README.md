# Brgy. San Pascual Infrastructure API

Backend foundation for the infrastructure complaint and service request management system of Brgy. San Pascual, San Narciso, Zambales.

## Stack

- Node.js and Express 5
- TypeScript
- Prisma ORM
- PostgreSQL
- Zod validation

## Setup

### Prerequisites

- Node.js 20 or newer, including npm
- PostgreSQL 14 or newer
- An empty PostgreSQL database, for example `san_pascual_db`

### First run on another laptop

1. Clone the repository and enter it:

   ```bash
   git clone https://github.com/kervy-prog/san-pascual-capstone-system.git
   cd san-pascual-capstone-system
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and set `DATABASE_URL` and a long `JWT_SECRET`. To enable resident SMS notifications, also set `SEMAPHORE_API_KEY` and an approved `SEMAPHORE_SENDER_NAME`.

4. Generate and apply the Prisma schema:

   ```bash
   npm run prisma:generate
   npm run prisma:push
   ```

5. Seed report categories and the administrator:

   ```bash
   npm run categories:seed
   npm run admin:seed
   ```

   The admin defaults are `admin@sanpascual.gov.ph` and `AdminPass123!`; set `ADMIN_EMAIL` and `ADMIN_PASSWORD` first to use different values.

   To add approximate pins to older image reports that were submitted before geolocation was enabled, run `npm run reports:geocode`.

6. Start the API and frontend in separate terminals:

   ```bash
   npm run dev
   npm run frontend
   ```

Open `http://<computer-ip>:5500`. The API health checks are available through the same frontend host at `/health` and `/health/db`.

### Larger report media on Vercel

Vercel serverless requests have a roughly 4.5 MB body limit. Larger report photos and videos therefore upload directly to a private Supabase Storage bucket using short-lived signed URLs. Configure these Vercel environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (the public anon/publishable key; never use the service-role key here)
- `SUPABASE_SERVICE_ROLE_KEY` (server-side secret; never expose it to browser code)
- `SUPABASE_STORAGE_BUCKET` (defaults to `private-uploads`)

Set the private bucket's per-object limit to at least 10 MB and allow JPEG, PNG, WebP, GIF, MP4, WebM, and QuickTime media. The application permits up to five files, 10 MB each, and 25 MB total per report. Redeploy after changing Vercel environment variables. Without cloud storage configuration, local development falls back to multipart uploads limited to 4 MB total.

### Main screens

- `/` - resident sign in and registration
- `/resident.html` - resident desk
- `/official.html` - Barangay Official work queue
- `/admin.html` - admin approvals, assignments, and report progress

For phone or another laptop access on the same Wi-Fi, open `http://<computer-ip>:5500`. Set `FRONTEND_HOST=0.0.0.0` to listen on all network interfaces, or set it to a specific host/IP for a fixed deployment.

### Workflow

- Residents submit infrastructure reports with optional image media.
- Image reports require a geopin from image EXIF GPS metadata or the submitting device; the Node API returns this as JSON under `location`.
- If both GPS sources are unavailable, the API uses a clearly labeled approximate Barangay San Pascual area pin instead of blocking the report; it is not presented as the exact image location.
- New reports wait in the admin **Report approval** section.
- Admins approve and assign reports to approved officials.
- Assigned officials update inspection and resolution status. When a report is first marked resolved, supported JPEG, PNG, and WebP photos are recompressed in place when the result is smaller; saved report location data is unchanged.
- Residents see status changes automatically in their report history.
- When an official changes a report to `IN_PROGRESS`, Semaphore sends the resident an SMS notification.
- Admins can view uploaded images and their GPS-confirmed or landmark-based location.

Semaphore uses the resident's Philippine contact number and sends: `Your report SP-... is now under progress. Our Barangay team is working on it.` If `SEMAPHORE_API_KEY` is not configured, the report workflow still works and the SMS is skipped.

Run the full system test with:

```bash
npm test
```
