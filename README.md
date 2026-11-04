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

Resident and barangay official login requires both `approvalStatus: APPROVED` and
`isVerified: true`. Admin approval sets both fields; pending, rejected, or unverified
accounts cannot receive a login token.

### Larger report media on Vercel

Vercel serverless requests have a roughly 4.5 MB body limit. Larger report photos therefore upload directly to a private Supabase Storage bucket using short-lived signed URLs. Configure these Vercel environment variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (the public anon/publishable key; never use the service-role key here)
- `SUPABASE_SERVICE_ROLE_KEY` (server-side secret; never expose it to browser code)
- `SUPABASE_STORAGE_BUCKET` (defaults to `private-uploads`)

Set the private bucket's per-object limit to at least 10 MB and allow JPEG, PNG, WebP and GIF images. New reports require exactly three photos, 10 MB each, and 25 MB total per report; videos are rejected. Existing report attachments remain viewable. Redeploy after changing Vercel environment variables. Without cloud storage configuration, local development falls back to multipart uploads limited to 4 MB total.

### Android APK (Capacitor)

The `mobile` project packages the existing UI with Capacitor 7 in an Android
WebView. It connects to the live HTTPS Vercel API; no database credentials or
server secrets are bundled. Android 6.0 or newer and an internet connection are
required. Website UI updates require a new APK; backend changes remain live.

The **Build Android APK** GitHub Actions workflow runs on mobile/UI changes to
`main` and can also be run manually from GitHub's Actions tab. Download the
**San-Pascual-Connect-APK** artifact from a successful run, extract it, and install
`app-debug.apk` on the phone (allow installation from that download source).
This is a debug-signed demo APK, not a Play Store release. Future debug builds
may use a different signing key and require uninstalling the old app first.
Uninstalling clears saved sign-in data.

For Android Studio development:

```powershell
Set-Location mobile
npm ci
npm run sync
npx cap open android
```

Report submission does not request the device's current location. The app uses the
Android file picker for photos/verification documents and supports the hardware
Back button. In the resident report form, **Take photo** opens the phone camera
and adds the captured photo to the preview. Captured and selected photos share
the three-photo, 10 MB per-photo, and 25 MB combined limits. Canceling the camera
keeps previously selected photos. This button requires an updated APK; the website
keeps its existing photo picker. Camera photos are not saved to the phone gallery.
When geofencing is enabled, all three original photos need embedded GPS tags.
The native camera may omit these tags; use original GPS-tagged files from the
phone's camera instead. Device coordinates are never substituted for photo GPS.
App backups and cleartext HTTP are disabled. Test login, photo upload,
permission denial, and logout on a real device before distributing publicly.

### Main screens

The resident report form uses bold, high-contrast field labels and a highlighted
"Upload exactly 3 photos" notice below the photo picker.
After confirming cloud upload availability, three photos upload in parallel.
The API reads GPS metadata from each uploaded original before saving a report.
Direct-upload references use JSON, including in the Android app; multipart
submission is reserved for the photo-upload fallback. Reports without three
photos are rejected by both the UI and API.
If a network connection fails, check My reports before resubmitting because the
server may have saved the report even if the response did not reach the device.
Run `node scripts/test-report-submission.cjs` to check JSON and multipart transport
selection and network-error handling without creating reports.
Run `node scripts/test-report-camera.cjs` to check native capture, cancellation,
errors, and the shared photo limits without opening a camera or creating reports.
After `npm run build`, run `node scripts/test-report-geofence.cjs` for polygon,
photo-GPS, boundary persistence/concurrency, and authenticated API checks without
changing a database.

### Admin-drawn reporting vicinity

The admin overview contains a Map/Satellite boundary editor (Leaflet, OpenStreetMap
street tiles, and Esri World Imagery). Click **Edit boundary**, tap points in order
around the agreed barangay vicinity, or enter coordinates with **Add point**.
Drag numbered points to adjust, undo the last point, or clear the drawing.
**Save boundary** validates and persists a non-self-intersecting polygon with
3-100 distinct points. Cancel discards the drawing; concurrent edits return a
conflict rather than overwriting another admin's boundary.

Confirm the vicinity with barangay officials before saving. It is an admin-defined
reporting boundary, not a certified cadastral boundary. Until the first polygon is
saved, the existing approximate 2-km circle remains active and is labeled on the map.
The `ReportGeofence` table is added by Prisma migration during Vercel deployment;
no existing records or saved report locations are rewritten.

When **Barangay location range** is ON, exactly three photos must each contain
readable embedded GPS inside (or on) the saved boundary. A resident may submit
from elsewhere: submission-time device coordinates and landmark/center estimates
are not used. Missing/corrupt GPS and out-of-bound photos return HTTP 422 with
guidance. Enable camera location tags before capturing and upload original files;
screenshots and messaging apps commonly strip metadata. With enforcement OFF,
three photos are still required but missing GPS and out-of-bound locations are
allowed. The report's primary pin comes from the first photo with readable GPS.
EXIF GPS is editable metadata, not proof of authenticity; admin review is still
required. Existing reports retain their original location data. Older APKs also
receive API enforcement, but need rebuilding for the updated photo instructions.

- `/` - resident sign in and registration
- `/resident.html` - resident desk
- `/official.html` - Barangay Official work queue
- `/admin.html` - admin approvals, assignments, and report progress

In the official dashboard, resolved reports remain in Reports but are excluded from
Designated hazards. Resolving a report refreshes the work queue without deleting its record.

The admin resident and barangay official directories are sorted by last name (A-Z),
then first and middle name for matching surnames.
The admin directories are labeled Registered Residents and Registered Officials.
Report progress uses Work completed, Work in progress, and Other unresolved reports.
The last group includes reports awaiting review
or action and rejected or cancelled reports; in-progress reports remain separate.
Successful account approval also displays a confirmation popup for four seconds,
without requiring an OK button or interrupting the admin's work.

The sign-in page and dashboards display the barangay seal. All dashboards use a
horizontal header with wrapping module links and Sign out at the top right on
screens up to 800px wide. Wider screens retain the left navigation sidebar.
Mobile headers use the top half of the supplied barangay hall photo with a dark
overlay for readability. Module links appear in a fully visible, wrapping tile
grid rather than a horizontally scrolling strip.
The same photo background appears only in the mobile sign-in/registration welcome
header; form backgrounds and the desktop sign-in layout remain unchanged.

For phone or another laptop access on the same Wi-Fi, open `http://<computer-ip>:5500`. Set `FRONTEND_HOST=0.0.0.0` to listen on all network interfaces, or set it to a specific host/IP for a fixed deployment.

### Workflow

- Residents submit infrastructure reports with exactly three photos.
- With geofencing enabled, all three photos need embedded GPS inside the configured vicinity; the Node API returns the primary photo pin as JSON under `location`.
- New reports never substitute device GPS, landmark geocoding, or approximate barangay-center pins for missing photo GPS.
- New reports wait in the admin **Report approval** section.
- Admins approve and assign reports to approved officials.
- Assigned officials update inspection and resolution status. When a report is first marked resolved, supported JPEG, PNG, and WebP photos are recompressed in place when the result is smaller; saved report location data is unchanged.
- Residents see status changes automatically in their report history.
- When an official changes a report to `IN_PROGRESS`, Semaphore sends the resident an SMS notification.
- Admins can view uploaded images and their GPS-confirmed or landmark-based location.

Semaphore uses the resident's Philippine contact number and sends: `Your report SP-... is now under progress. Our Barangay team is working on it.` If `SEMAPHORE_API_KEY` is not configured, the report workflow still works and the SMS is skipped.

The full system test creates accounts and reports; run it only against a test
deployment. Set `REPORT_TEST_PHOTO` to an original GPS-tagged JPEG taken inside
its configured vicinity (used for all three test photo uploads), then run:

```bash
npm test
```
