const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3000';

async function assert(condition, message) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function run() {
  console.log("=== STARTING FULL END-TO-END SYSTEM TEST ===");

  // 1. Health Checks
  console.log("\n[Test 1] Health Endpoints");
  const healthRes = await fetch(`${BASE_URL}/health`);
  const healthData = await healthRes.json();
  await assert(healthRes.status === 200 && healthData.status === 'ok', "GET /health returns ok");

  const dbHealthRes = await fetch(`${BASE_URL}/health/db`);
  const dbHealthData = await dbHealthRes.json();
  await assert(dbHealthRes.status === 200 && dbHealthData.database === 'reachable', "GET /health/db returns reachable");

  // 2. Admin Login
  console.log("\n[Test 2] Admin Login");
  const adminLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@sanpascual.gov.ph', password: 'AdminPass123!' }),
  });
  const adminLoginData = await adminLoginRes.json();
  await assert(adminLoginRes.status === 200, "Admin login successful");
  await assert(adminLoginData.token && adminLoginData.user.role === 'ADMIN', "Admin received token and ADMIN role");
  const adminToken = adminLoginData.token;

  // 3. Resident Signup & Flow
  console.log("\n[Test 3] Resident Lifecycle (Signup, Approval, Login)");
  const residentEmail = `resident_${Date.now()}@example.com`;
  const residentForm = new FormData();
  residentForm.append('email', residentEmail);
  residentForm.append('password', 'ResidentPass123!');
  residentForm.append('confirmPassword', 'ResidentPass123!');
  residentForm.append('firstName', 'Maria');
  residentForm.append('lastName', 'Santos');
  residentForm.append('middleName', 'Cruz');
  residentForm.append('age', '28');
  residentForm.append('gender', 'FEMALE');
  residentForm.append('birthDate', '1998-05-12');
  residentForm.append('nationality', 'Filipino');
  residentForm.append('phone', '09987654321');
  residentForm.append('address', 'Sitio Riverside, Barangay San Pascual');
  residentForm.append('barangay', 'San Pascual');
  residentForm.append('municipality', 'San Narciso');
  residentForm.append('province', 'Zambales');
  residentForm.append('residencyConfirmed', 'true');
  residentForm.append('privacyConsent', 'true');
  residentForm.append('role', 'RESIDENT');
  const dummyResidencyId = Buffer.from('fake residency ID content');
  residentForm.append('residencyIdFile', new Blob([dummyResidencyId], { type: 'image/jpeg' }), 'residency_id.jpg');

  const resSignupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    body: residentForm,
  });
  const resSignupData = await resSignupRes.json();
  await assert(resSignupRes.status === 201, "Resident signup returns 201");
  await assert(resSignupData.pendingApproval === true, "Resident status is pendingApproval");
  const residentId = resSignupData.user.id;

  // Verify Resident cannot login before approval
  const resPreLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: residentEmail, password: 'ResidentPass123!' }),
  });
  await assert(resPreLoginRes.status === 403, "Resident cannot login prior to admin approval");

  // Admin approves resident
  const approveRes = await fetch(`${BASE_URL}/api/admin/accounts/${residentId}/approval`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ status: 'APPROVED' }),
  });
  await assert(approveRes.status === 200, "Admin approves resident account");

  // Resident logs in
  const resLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: residentEmail, password: 'ResidentPass123!' }),
  });
  const resLoginData = await resLoginRes.json();
  await assert(resLoginRes.status === 200 && resLoginData.token, "Resident logs in successfully with token");
  const residentToken = resLoginData.token;

  // Resident /me
  const resMeRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${residentToken}` },
  });
  const resMeData = await resMeRes.json();
  await assert(resMeRes.status === 200 && resMeData.user.email === residentEmail, "Resident profile accessible via /me");

  // 4. Official Lifecycle (Signup, Proof Document Upload, Approval, Login)
  console.log("\n[Test 4] Official Lifecycle");
  const officialEmail = `official_${Date.now()}@example.com`;
  const officialForm = new FormData();
  officialForm.append('email', officialEmail);
  officialForm.append('password', 'OfficialPass123!');
  officialForm.append('confirmPassword', 'OfficialPass123!');
  officialForm.append('firstName', 'Rodrigo');
  officialForm.append('lastName', 'Magsaysay');
  officialForm.append('middleName', 'Bautista');
  officialForm.append('age', '42');
  officialForm.append('gender', 'MALE');
  officialForm.append('birthDate', '1984-03-20');
  officialForm.append('nationality', 'Filipino');
  officialForm.append('phone', '09171234567');
  officialForm.append('address', 'Poblacion, Barangay San Pascual');
  officialForm.append('barangay', 'San Pascual');
  officialForm.append('municipality', 'San Narciso');
  officialForm.append('province', 'Zambales');
  officialForm.append('residencyConfirmed', 'true');
  officialForm.append('privacyConsent', 'true');
  officialForm.append('role', 'STAFF');
  officialForm.append('designationPosition', 'Barangay Kagawad - Infrastructure Committee');
  officialForm.append('governmentIdType', "Driver's License");
  officialForm.append('governmentIdNumber', 'D02-12-987654');

  const dummyImage = Buffer.from('fake image content');
  officialForm.append('governmentIdFile', new Blob([dummyImage], { type: 'image/jpeg' }), 'gov_id.jpg');
  officialForm.append('appointmentProofFile', new Blob([dummyImage], { type: 'image/jpeg' }), 'appointment_proof.jpg');

  const offSignupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    body: officialForm,
  });
  const offSignupData = await offSignupRes.json();
  await assert(offSignupRes.status === 201, "Official signup with documents returns 201");
  const officialUserId = offSignupData.user.id;

  // Admin inspects overview to get official's uploaded files
  const overviewRes = await fetch(`${BASE_URL}/api/admin/overview`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const overviewData = await overviewRes.json();
  const pendingOfficial = overviewData.pendingOfficials.find((o) => o.id === officialUserId);
  await assert(Boolean(pendingOfficial && pendingOfficial.officialProfile), "Pending official listed in admin overview");
  const officialProfileId = pendingOfficial.officialProfile.id;

  const proofFile = pendingOfficial.officialProfile.proofOfAppointment.split('/').pop();
  const docRes = await fetch(`${BASE_URL}/api/admin/officials/documents/${encodeURIComponent(proofFile)}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  await assert(docRes.status === 200, "Admin can retrieve official's uploaded appointment proof");

  // Admin approves official
  const approveOffRes = await fetch(`${BASE_URL}/api/admin/accounts/${officialUserId}/approval`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ status: 'APPROVED' }),
  });
  await assert(approveOffRes.status === 200, "Admin approves official account");

  // Official logs in
  const offLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: officialEmail, password: 'OfficialPass123!' }),
  });
  const offLoginData = await offLoginRes.json();
  await assert(offLoginRes.status === 200 && offLoginData.token, "Official logs in successfully");
  const officialToken = offLoginData.token;

  // 5. Infrastructure Report Lifecycle (Submit, Upload Media, Admin Review, Official Progress, Resolve)
  console.log("\n[Test 5] Infrastructure Report Lifecycle");
  const reportForm = new FormData();
  reportForm.append('categoryId', 'drainage');
  reportForm.append('exactLocationLandmark', 'Purok 3 near Main Irrigation Canal');
  reportForm.append('descriptionOfHazard', 'Clogged drainage culvert overflowing onto roadway');
  reportForm.append('currentStatus', 'SUBMITTED');
  reportForm.append('dateSubmitted', new Date().toISOString());
  reportForm.append('submitAnonymously', 'false');
  reportForm.append('locationLatitude', '15.0178547');
  reportForm.append('locationLongitude', '120.0829188');

  const reportImage = Buffer.from('dummy report photo bytes');
  reportForm.append('media', new Blob([reportImage], { type: 'image/jpeg' }), 'clogged_drain.jpg');

  const reportSubmitRes = await fetch(`${BASE_URL}/api/requests`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${residentToken}` },
    body: reportForm,
  });
  const reportSubmitData = await reportSubmitRes.json();
  await assert(reportSubmitRes.status === 201, "Resident submits infrastructure report successfully");
  await assert(Boolean(reportSubmitData.ticketNumber && reportSubmitData.ticketNumber.startsWith('SP-')), "Report generated valid ticket number");
  const reportId = reportSubmitData.id;

  // Resident verifies report in /me
  const resMeAfterReport = await (await fetch(`${BASE_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${residentToken}` } })).json();
  await assert(resMeAfterReport.user.reports.length >= 1, "Submitted report appears in resident's reports history");

  // Admin views report in /api/admin/reports
  const adminReportsRes = await fetch(`${BASE_URL}/api/admin/reports`, { headers: { Authorization: `Bearer ${adminToken}` } });
  const adminReports = await adminReportsRes.json();
  const createdReport = adminReports.find((r) => r.id === reportId);
  await assert(Boolean(createdReport), "Report visible in admin reports database");
  await assert(createdReport.media.length === 1, "Report media correctly linked");

  const assignReportRes = await fetch(`${BASE_URL}/api/admin/reports/${reportId}/assignment`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ officialId: officialProfileId }),
  });
  await assert(assignReportRes.status === 200, "Admin assigns report to an approved official");

  // Admin views the report photo
  const mediaFileName = createdReport.media[0].filePath.split('/').pop();
  const adminMediaRes = await fetch(`${BASE_URL}/api/admin/reports/media/${encodeURIComponent(mediaFileName)}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  await assert(adminMediaRes.status === 200, "Admin can load uploaded report media");

  // Admin approves report for review
  const adminReviewRes = await fetch(`${BASE_URL}/api/admin/reports/${reportId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ status: 'UNDER_REVIEW' }),
  });
  await assert(adminReviewRes.status === 200, "Admin advances report status to UNDER_REVIEW");

  // Official views report in /api/official/overview
  const officialOverview = await (await fetch(`${BASE_URL}/api/official/overview`, { headers: { Authorization: `Bearer ${officialToken}` } })).json();
  const offReport = officialOverview.reports.find((r) => r.id === reportId);
  await assert(Boolean(offReport && (offReport.currentStatus === 'UNDER_REVIEW' || offReport.status === 'UNDER_REVIEW')), "Official views report in work queue");

  // Official views report media
  const offMediaRes = await fetch(`${BASE_URL}/api/official/reports/media/${encodeURIComponent(mediaFileName)}`, {
    headers: { Authorization: `Bearer ${officialToken}` },
  });
  await assert(offMediaRes.status === 200, "Official can load report media");

  // Official updates status to IN_PROGRESS
  const offInProgressRes = await fetch(`${BASE_URL}/api/official/reports/${reportId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${officialToken}` },
    body: JSON.stringify({ status: 'IN_PROGRESS', notes: 'Public works maintenance crew dispatched' }),
  });
  await assert(offInProgressRes.status === 200, "Official updates report to IN_PROGRESS");

  // Official updates status to RESOLVED
  const offResolvedRes = await fetch(`${BASE_URL}/api/official/reports/${reportId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${officialToken}` },
    body: JSON.stringify({ status: 'RESOLVED', notes: 'Culvert cleared and water flow restored' }),
  });
  await assert(offResolvedRes.status === 200, "Official marks report as RESOLVED");

  // Verify Admin dashboard progress metrics
  const adminFinalOverview = await (await fetch(`${BASE_URL}/api/admin/overview`, { headers: { Authorization: `Bearer ${adminToken}` } })).json();
  await assert(adminFinalOverview.reportProgress.done >= 1, "Admin dashboard progress reflects RESOLVED case in done count");

  // 6. Account Deletion and Cascade
  console.log("\n[Test 6] Account Deletion & Cleanup");
  const deleteRes = await fetch(`${BASE_URL}/api/admin/accounts/${residentId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  await assert(deleteRes.status === 204, "Admin successfully deletes resident account and associated data without constraint failure");

  const deleteOfficialRes = await fetch(`${BASE_URL}/api/admin/accounts/${officialUserId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  await assert(deleteOfficialRes.status === 204, "Admin removes the synthetic official test account");

  console.log("\n==============================================");
  console.log("🎉 ALL TESTS PASSED! SYSTEM RUNS FLAWLESSLY!");
  console.log("==============================================");
}

run().catch((err) => {
  console.error("\n❌ TEST RUN FAILED:", err);
  process.exit(1);
});
