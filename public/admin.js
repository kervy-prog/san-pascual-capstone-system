const API_BASE_URL = window.SAN_PASCUAL_API_URL || 'http://localhost:3000';
const authStorage = sessionStorage.getItem('sanPascualToken') ? sessionStorage : localStorage;
const token = authStorage.getItem('sanPascualToken');
const storedUser = JSON.parse(authStorage.getItem('sanPascualUser') || 'null');
const message = document.querySelector('#dashboard-message');
const reportMediaModal = document.querySelector('#report-media-modal');
const reportMediaImage = document.querySelector('#report-media-image');
const reportMediaLocation = document.querySelector('#report-media-location');
const reportMediaMap = document.querySelector('#report-media-map');
let approvedOfficials = [];

function closeReportMedia() {
  const imageUrl = reportMediaImage.src;
  reportMediaModal.classList.add('hidden');
  reportMediaImage.removeAttribute('src');
  reportMediaLocation.innerHTML = '';
  reportMediaMap.classList.add('hidden');
  reportMediaMap.removeAttribute('src');
  if (imageUrl.startsWith('blob:')) URL.revokeObjectURL(imageUrl);
}

document.querySelector('#close-report-media').addEventListener('click', closeReportMedia);

if (!token || !storedUser || storedUser.role !== 'ADMIN') {
  window.location.replace('/');
}

document.querySelector('#admin-name').textContent = storedUser?.firstName || 'Admin';
document.querySelector('#admin-date').textContent = new Intl.DateTimeFormat('en-PH', { dateStyle: 'long' }).format(new Date());

function showSection(targetId) {
  document.querySelectorAll('.admin-section').forEach((section) => {
    section.classList.toggle('active', section.id === targetId);
  });
  document.querySelectorAll('nav a').forEach((link) => {
    link.classList.toggle('active', link.dataset.target === targetId);
  });
}

document.querySelectorAll('nav a').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const targetId = link.dataset.target;
    if (targetId) {
      showSection(targetId);
      history.replaceState(null, '', `#${targetId}`);
    }
  });
});
document.querySelector('#logout-button').addEventListener('click', () => {
  localStorage.removeItem('sanPascualToken');
  localStorage.removeItem('sanPascualUser');
  sessionStorage.removeItem('sanPascualToken');
  sessionStorage.removeItem('sanPascualUser');
  window.location.replace('/');
});

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}/api/admin${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Admin request failed');
  return data;
}

async function removeAccount(id, name) {
  if (!window.confirm(`Remove ${name}? This also deletes the account's reports and cannot be undone.`)) return;
  try {
    await request(`/accounts/${id}`, { method: 'DELETE' });
    message.textContent = `${name} was removed.`;
    message.classList.remove('error');
    await loadDashboard();
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
  }
}

async function updateOfficialStatus(id, status) {
  try {
    await request(`/officials/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    message.textContent = 'Official status updated.';
    message.classList.remove('error');
    await loadDashboard();
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
  }
}

function accountCard(account) {
  const official = account.officialProfile;
  let extra = '';
  if (official) {
    const idParts = official.identityVerification?.split(' | ') || [];
    const idLabel = idParts[0] || 'ID';
    const idPath = idParts[1] || '';
    const proofPath = official.proofOfAppointment || '';
    const idFile = idPath ? idPath.split('/').pop() : '';
    const proofFile = proofPath ? proofPath.split('/').pop() : '';
    const idLink = idFile ? `<a href="${API_BASE_URL}/api/admin/officials/documents/${encodeURIComponent(idFile)}" target="_blank" class="document-link">View ID (${idLabel})</a>` : '';
    const proofLink = proofFile ? `<a href="${API_BASE_URL}/api/admin/officials/documents/${encodeURIComponent(proofFile)}" target="_blank" class="document-link">View Appointment Proof</a>` : '';
    const docs = [idLink, proofLink].filter(Boolean).join(' · ');
    extra = `<p><strong>${official.designationPosition}</strong> · ${idLabel}</p><p class="documents">Documents: ${docs || 'None received'}</p>`;
  }
  const residencyIdFile = account.residencyIdFile ? account.residencyIdFile.split('/').pop() : '';
  const residencyIdLink = residencyIdFile ? `<p class="documents">Proof of residency: <a href="${API_BASE_URL}/api/admin/residents/documents/${encodeURIComponent(residencyIdFile)}" target="_blank" class="document-link">View submitted ID</a></p>` : '<p class="documents">Proof of residency: None received</p>';
  return `<article class="approval-card"><div class="account-avatar">${account.firstName[0]}${account.lastName[0]}</div><div class="account-details"><div class="account-title"><h3>${account.firstName} ${account.middleName} ${account.lastName}</h3><span class="pending-badge">Pending</span></div><p>${account.email} · ${account.phone}</p><p>${account.address}, ${account.barangay}, ${account.municipality}, ${account.province}</p>${residencyIdLink}${extra}<small>Submitted ${new Date(account.createdAt).toLocaleDateString('en-PH')}</small></div><div class="approval-actions"><button class="approve-button" data-id="${account.id}" data-status="APPROVED">Approve</button><button class="reject-button" data-id="${account.id}" data-status="REJECTED">Reject</button></div></article>`;
}

function renderReportProgress(progress) {
  const total = progress.done + progress.ongoing + progress.unfinished;
  document.querySelector('#report-progress-total').textContent = total;
  document.querySelector('#report-done-count').textContent = progress.done;
  document.querySelector('#report-ongoing-count').textContent = progress.ongoing;
  document.querySelector('#report-unfinished-count').textContent = progress.unfinished;
  [['done', progress.done], ['ongoing', progress.ongoing], ['unfinished', progress.unfinished]].forEach(([key, count]) => {
    document.querySelector(`#report-${key}-bar`).style.width = total ? `${(count / total) * 100}%` : '0%';
  });
}

function reportLocationMarkup(report, compact = false) {
  const hasCoordinates = Number.isFinite(report.locationLatitude) && Number.isFinite(report.locationLongitude);
  if (hasCoordinates) {
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${report.locationLatitude}%2C${report.locationLongitude}`;
    const openStreetMapUrl = `https://www.openstreetmap.org/?mlat=${report.locationLatitude}&mlon=${report.locationLongitude}#map=18/${report.locationLatitude}/${report.locationLongitude}`;
    if (report.locationSource === 'landmark-geocode-approximate') {
      return `<a href="${mapUrl}" target="_blank" rel="noopener">View approximate area</a> · <a href="${openStreetMapUrl}" target="_blank" rel="noopener">OpenStreetMap</a><small>Barangay area estimate, not exact image GPS</small>`;
    }
    return `<a href="${mapUrl}" target="_blank" rel="noopener">${compact ? 'View report pin' : 'View on map'}</a> · <a href="${openStreetMapUrl}" target="_blank" rel="noopener">OpenStreetMap</a><small>${compact ? 'GPS-confirmed report pin' : `${report.locationLatitude.toFixed(6)}, ${report.locationLongitude.toFixed(6)}`}</small>`;
  }

  const reportedArea = `${report.exactLocationLandmark}, San Pascual, San Narciso, Zambales`;
  const searchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(reportedArea)}`;
  const openStreetMapSearchUrl = `https://www.openstreetmap.org/search?query=${encodeURIComponent(reportedArea)}`;
  return `<a href="${searchUrl}" target="_blank" rel="noopener">${compact ? 'View reported area' : 'View approximate area'}</a> · <a href="${openStreetMapSearchUrl}" target="_blank" rel="noopener">OpenStreetMap</a><small>Based on submitted landmark: ${report.exactLocationLandmark}</small>`;
}

function reportMediaButton(image, report) {
  return `<button class="view-media-button" data-media-path="${image.filePath}" data-location-landmark="${encodeURIComponent(report.exactLocationLandmark)}" data-location-latitude="${report.locationLatitude ?? ''}" data-location-longitude="${report.locationLongitude ?? ''}" data-location-source="${report.locationSource ?? ''}">View image</button>`;
}

async function loadApprovedResidents() {
  try {
    const residents = await request('/residents');
    document.querySelector('#resident-list').innerHTML = residents.length
      ? residents.map((resident) => `<tr><td><strong>${resident.firstName} ${resident.middleName} ${resident.lastName}</strong></td><td>${resident.email}</td><td>${resident.phone}</td><td>${resident.address}, ${resident.barangay}, ${resident.municipality}, ${resident.province}</td><td>${resident.gender}</td><td>${new Date(resident.updatedAt).toLocaleDateString('en-PH')}</td><td><button class="delete-button" data-delete-id="${resident.id}" data-delete-name="${resident.firstName} ${resident.lastName}">Delete</button></td></tr>`).join('')
      : '<tr><td colspan="7" class="empty-state">No Barangay Residents yet.</td></tr>';
    document.querySelectorAll('#resident-list [data-delete-id]').forEach((button) => button.addEventListener('click', () => removeAccount(button.dataset.deleteId, button.dataset.deleteName)));
  } catch (error) {
    document.querySelector('#resident-list').innerHTML = '<tr><td colspan="7" class="empty-state">Failed to load resident database.</td></tr>';
    message.textContent = error.message;
    message.classList.add('error');
  }
}

async function loadApprovedOfficials() {
  try {
    const officials = await request('/officials');
    approvedOfficials = officials;
    document.querySelector('#official-directory-count').textContent = officials.length;
    document.querySelector('#official-list').innerHTML = officials.length
      ? officials.map((official) => {
        const resident = official.resident;
        return `<tr><td><strong>${resident.firstName} ${resident.middleName} ${resident.lastName}</strong></td><td>${official.designationPosition}</td><td><select class="official-status" data-official-id="${official.id}"><option value="ACTIVE" ${official.status === 'ACTIVE' ? 'selected' : ''}>Active</option><option value="RETIRED" ${official.status === 'RETIRED' ? 'selected' : ''}>Retired</option><option value="NOT_ON_DUTY" ${official.status === 'NOT_ON_DUTY' ? 'selected' : ''}>Not on duty</option></select></td><td>${resident.email}</td><td>${official.contactNumber || resident.phone}</td><td>${resident.address}, ${resident.barangay}, ${resident.municipality}, ${resident.province}</td><td><button class="delete-button" data-delete-id="${resident.id}" data-delete-name="${resident.firstName} ${resident.lastName}">Delete</button></td></tr>`;
      }).join('')
      : '<tr><td colspan="7" class="empty-state">No Barangay Officials yet.</td></tr>';
    document.querySelectorAll('#official-list [data-official-id]').forEach((select) => select.addEventListener('change', () => updateOfficialStatus(select.dataset.officialId, select.value)));
    document.querySelectorAll('#official-list [data-delete-id]').forEach((button) => button.addEventListener('click', () => removeAccount(button.dataset.deleteId, button.dataset.deleteName)));
  } catch (error) {
    document.querySelector('#official-list').innerHTML = '<tr><td colspan="7" class="empty-state">Failed to load Barangay Officials.</td></tr>';
    message.textContent = error.message;
    message.classList.add('error');
  }
}

function assignmentControl(report) {
  const options = [`<option value="">Unassigned</option>`, ...approvedOfficials.map((official) => {
    const name = `${official.resident.firstName} ${official.resident.lastName}`;
    return `<option value="${official.id}" ${report.assignedOfficialId === official.id ? 'selected' : ''}>${name}</option>`;
  })].join('');
  return `<select class="report-assignee" data-report-id="${report.id}">${options}</select>`;
}

function statusControl(report) {
  const statuses = ['SUBMITTED', 'UNDER_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'CANCELLED'];
  return `<span class="status-pill">${(report.currentStatus || report.status).replace('_', ' ')}</span><select class="report-status" data-report-id="${report.id}">${statuses.map((status) => `<option value="${status}" ${status === report.status ? 'selected' : ''}>${status.replace('_', ' ')}</option>`).join('')}</select>`;
}

async function loadReports() {
  try {
    const reports = (await request('/reports')).filter((report) => report.status !== 'SUBMITTED');
    document.querySelector('#report-list').innerHTML = reports.length
      ? reports.map((report) => {
        const image = report.media?.find((item) => item.mediaType === 'IMAGE');
        const mediaAction = image ? reportMediaButton(image, report) : '<span class="muted-note">No image</span>';
        return `<tr><td><strong>${report.reportId || report.ticketNumber}</strong></td><td>${report.ticketNumber}</td><td>${report.submitAnonymously ? 'Anonymous' : `${report.resident.firstName} ${report.resident.lastName}`}<small>${report.resident.email}</small></td><td>${report.category.name}</td><td>${report.category.urgencyLevel}</td><td>${report.exactLocationLandmark}</td><td>${report.descriptionOfHazard}</td><td>${assignmentControl(report)}</td><td>${statusControl(report)}</td><td>${mediaAction}</td><td>${new Date(report.dateSubmitted).toLocaleDateString('en-PH')}</td></tr>`;
      }).join('')
      : '<tr><td colspan="11" class="empty-state">No reports submitted yet.</td></tr>';
    document.querySelectorAll('.view-media-button').forEach((button) => button.addEventListener('click', () => viewReportImage(button.dataset.mediaPath, button.dataset)));
    document.querySelectorAll('.report-assignee').forEach((select) => select.addEventListener('change', () => assignReport(select.dataset.reportId, select.value || null)));
    document.querySelectorAll('.report-status').forEach((select) => select.addEventListener('change', () => updateReportStatus(select.dataset.reportId, select.value)));
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
  }
}

async function viewReportImage(mediaPath, locationData) {
  const fileName = mediaPath.split('/').pop();
  const response = await fetch(`${API_BASE_URL}/api/admin/reports/media/${encodeURIComponent(fileName)}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) {
    message.textContent = 'Unable to load the report image.';
    message.classList.add('error');
    return;
  }
  const blob = await response.blob();
  reportMediaImage.src = URL.createObjectURL(blob);
  const hasGpsPin = Number.isFinite(Number.parseFloat(locationData.locationLatitude)) && Number.isFinite(Number.parseFloat(locationData.locationLongitude));
  const locationSource = locationData.locationSource || '';
  reportMediaLocation.innerHTML = `<strong>${hasGpsPin && locationSource !== 'landmark-geocode-approximate' ? 'Pinned image location' : 'Approximate image location'}</strong><br>${reportLocationMarkup({
    exactLocationLandmark: decodeURIComponent(locationData.locationLandmark || ''),
    locationLatitude: Number.parseFloat(locationData.locationLatitude),
    locationLongitude: Number.parseFloat(locationData.locationLongitude),
    locationSource,
  })}`;
  const latitude = Number.parseFloat(locationData.locationLatitude);
  const longitude = Number.parseFloat(locationData.locationLongitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    const delta = 0.004;
    reportMediaMap.src = `https://www.openstreetmap.org/export/embed.html?bbox=${longitude - delta}%2C${latitude - delta}%2C${longitude + delta}%2C${latitude + delta}&layer=mapnik&marker=${latitude}%2C${longitude}`;
    reportMediaMap.classList.remove('hidden');
  }
  reportMediaModal.classList.remove('hidden');
}

function reportApprovalCard(report) {
  const residentName = report.submitAnonymously ? 'Anonymous resident' : `${report.resident.firstName} ${report.resident.lastName}`;
  const image = report.media?.find((item) => item.mediaType === 'IMAGE');
  const mediaAction = image ? reportMediaButton(image, report) : '';
  const locationAction = reportLocationMarkup(report, true);
  return `<article class="approval-card report-approval-card"><div class="account-avatar">!</div><div class="account-details"><div class="account-title"><h3>${report.ticketNumber}</h3><span class="pending-badge">Needs review</span></div><p>${residentName} · ${report.category.name} · ${report.category.urgencyLevel}</p><p>${report.exactLocationLandmark}</p><p>${locationAction}</p><p>${report.descriptionOfHazard}</p><p><strong>Assign official</strong> ${assignmentControl(report)}</p><small>Submitted ${new Date(report.dateSubmitted).toLocaleString('en-PH')}</small></div><div class="approval-actions">${mediaAction}<button class="approve-button" data-report-status="UNDER_REVIEW" data-report-id="${report.id}">Approve</button><button class="reject-button" data-report-status="REJECTED" data-report-id="${report.id}">Reject</button></div></article>`;
}

async function loadReportApprovals() {
  try {
    const reports = await request('/reports');
    const pendingReports = reports.filter((report) => report.status === 'SUBMITTED');
    document.querySelector('#nav-report-pending').textContent = pendingReports.length;
    document.querySelector('#report-approval-count').textContent = pendingReports.length;
    document.querySelector('#report-approval-list').innerHTML = pendingReports.length
      ? pendingReports.map(reportApprovalCard).join('')
      : '<div class="empty-state">No reports are waiting for verification.</div>';
    document.querySelectorAll('[data-report-status]').forEach((button) => button.addEventListener('click', () => updateReportStatus(button.dataset.reportId, button.dataset.reportStatus)));
    document.querySelectorAll('.view-media-button').forEach((button) => button.addEventListener('click', () => viewReportImage(button.dataset.mediaPath, button.dataset)));
    document.querySelectorAll('.report-assignee').forEach((select) => select.addEventListener('change', () => assignReport(select.dataset.reportId, select.value || null)));
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
  }
}

async function loadDashboard() {
  try {
    const overview = await request('/overview');
    const residentCount = document.querySelector('#resident-count');
    const officialCount = document.querySelector('#official-count');
    const pendingCount = document.querySelector('#pending-count');
    if (residentCount) residentCount.textContent = overview.counts.residents;
    if (officialCount) officialCount.textContent = overview.counts.officials;
    if (pendingCount) pendingCount.textContent = overview.counts.pending;
    renderReportProgress(overview.reportProgress);
    document.querySelector('#nav-pending').textContent = overview.counts.pending;
    document.querySelector('#approval-count').textContent = overview.counts.pending;
    const accounts = [...overview.pendingResidents, ...overview.pendingOfficials];
    document.querySelector('#approval-list').innerHTML = accounts.length ? accounts.map(accountCard).join('') : '<div class="empty-state">No accounts are waiting for review.</div>';
    document.querySelectorAll('[data-status]').forEach((button) => button.addEventListener('click', () => updateApproval(button.dataset.id, button.dataset.status)));
    await loadApprovedResidents();
    await loadApprovedOfficials();
    await loadReportApprovals();
    await loadReports();
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
  }
}

async function updateReportStatus(id, status) {
  try {
    await request(`/reports/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    message.textContent = status === 'UNDER_REVIEW' ? 'Report approved for official review.' : 'Report rejected.';
    message.classList.remove('error');
    await loadReportApprovals();
    await loadReports();
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
  }
}

async function assignReport(id, officialId) {
  try {
    await request(`/reports/${id}/assignment`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ officialId }) });
    message.textContent = officialId ? 'Report assigned to the selected official.' : 'Report assignment cleared.';
    message.classList.remove('error');
    await loadReportApprovals();
    await loadReports();
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
  }
}

async function updateApproval(id, status) {
  try {
    await request(`/accounts/${id}/approval`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    message.textContent = status === 'APPROVED' ? 'Account approved.' : 'Account rejected.';
    message.classList.remove('error');
    await loadDashboard();
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
  }
}

loadDashboard();
setInterval(() => {
  loadReportApprovals();
  loadReports();
}, 10000);
