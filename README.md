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

Open `http://localhost:5500`. The API health checks are `http://localhost:3000/health` and `http://localhost:3000/health/db`.

### Main screens

- `/` - resident sign in and registration
- `/resident.html` - resident desk
- `/official.html` - Barangay Official work queue
- `/admin.html` - admin approvals, assignments, and report progress

For phone access on the same Wi-Fi, open `http://<computer-ip>:5500` instead of `localhost`.

### Workflow

- Residents submit infrastructure reports with optional image media.
- Image reports require a geopin from image EXIF GPS metadata or the submitting device; the Node API returns this as JSON under `location`.
- If both GPS sources are unavailable, the API accepts only a matching street-level landmark result; a barangay-center result is rejected so an inaccurate pin is never presented as the image location.
- New reports wait in the admin **Report approval** section.
- Admins approve and assign reports to approved officials.
- Assigned officials update inspection and resolution status.
- Residents see status changes automatically in their report history.
- When an official changes a report to `IN_PROGRESS`, Semaphore sends the resident an SMS notification.
- Admins can view uploaded images and their GPS-confirmed or landmark-based location.

Semaphore uses the resident's Philippine contact number and sends: `Your report SP-... is now under progress. Our Barangay team is working on it.` If `SEMAPHORE_API_KEY` is not configured, the report workflow still works and the SMS is skipped.

Run the full system test with:

```bash
npm test
```
