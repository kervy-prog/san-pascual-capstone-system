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
- A PostgreSQL database named `san_pascual_db`

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and set `DATABASE_URL` for your PostgreSQL database.

3. Generate the Prisma client:

   ```bash
   npm run prisma:generate
   ```

4. Apply the database schema:

   ```bash
   npm run prisma:migrate -- --name initial
   ```

   When updating an existing database, stop the running development server first, then run:

   ```bash
   npm run prisma:migrate -- --name resident-profile-fields
   ```

5. Start the API development server:

   ```bash
   npm run dev
   ```

The API runs on `http://localhost:3000` by default. It only serves API endpoints; the frontend runs separately.

6. In a second terminal, start the frontend:

   ```bash
   npm run frontend
   ```

The frontend runs on `http://localhost:5500` by default.

Before opening Chrome, verify the backend directly:

```text
http://localhost:3000/health
http://localhost:3000/health/db
```

The first endpoint confirms that Express is running. The second confirms that PostgreSQL and Prisma are reachable.

## Endpoints

- `GET /health` - API health check
- `GET /health/db` - Database connectivity check
- `POST /api/auth/signup` - Submit a resident or barangay official account for approval
- `POST /api/auth/login` - Authenticate an account and receive a JWT
- `GET /api/requests` - List complaints and service requests
- `POST /api/requests` - Create a complaint or service request

The interactive sign-up and login interface is served at `http://localhost:5500/`.

Resident registration collects last name, first name, middle name, age, gender, birthdate, nationality, contact number, full address, email, and password. Resident accounts require Filipino nationality and the fixed location Barangay San Pascual, San Narciso, Zambales, plus an eligibility confirmation.

Barangay official signup collects the same resident information plus designation or position, government-issued ID type and number, an ID upload, and proof of appointment or oath of office. ID and appointment documents accept JPG, PNG, WEBP, or PDF files up to 5 MB each. Official accounts require verification before official tools should be enabled.

## Approval and Admin Security

- New resident and barangay official accounts are created with `PENDING` approval and receive no login token.
- Pending accounts cannot log in until an admin approves them.
- Public signup cannot create an admin account.
- `/api/admin/*` requires a valid JWT with the `ADMIN` role; residents and barangay officials receive `403` access denial.
- The admin dashboard is served at `/admin.html` and loads resident records, official records, pending approvals, and infrastructure reports through protected endpoints.
- Uploaded official documents are stored in `private-uploads/`, outside the public static directory.

Provision the single administrator from a PowerShell session by setting the values temporarily, then running the seed command:

```powershell
$env:ADMIN_EMAIL = "admin@sanpascual.gov.ph"
$env:ADMIN_PASSWORD = "ChangeThisAdminPassword1!"
$env:ADMIN_FIRST_NAME = "San Pascual"
$env:ADMIN_LAST_NAME = "Administrator"
npm.cmd run admin:seed
```

After changing the approval fields, apply the migration:

```powershell
npm.cmd run prisma:migrate -- --name approval-privacy-admin-security
```

## ERD Integration

The uploaded ERD is represented in `prisma/schema.prisma` through these connected models:

- `Resident` - resident accounts and report ownership
- `InfrastructureReport` - submitted infrastructure hazards and ticket numbers
- `InfrastructureCategory` - report classification and urgency
- `ReportMedia` - photos, videos, and documents attached to reports
- `BarangayOfficial` - official identity and appointment information
- `BarangayAction` - official actions, remarks, and status updates on reports

After stopping the development server, apply the ERD changes with:

```powershell
npm.cmd run prisma:generate
npm.cmd run prisma:migrate -- --name erd-infrastructure-reports
```

New passwords must be at least 8 characters and include an uppercase letter, lowercase letter, number, and special character. Examples of accepted special characters include `!`, `@`, `#`, `$`, `%`, `&`, and `*`. Signup also requires entering the password a second time for confirmation.

Authentication, staff workflows, file attachments, notifications, reporting, and audit logs are planned modules for the next implementation phase.
