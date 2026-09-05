const token = localStorage.getItem('sanPascualToken');
const storedUser = JSON.parse(localStorage.getItem('sanPascualUser') || 'null');
const message = document.querySelector('#dashboard-message');

if (!token || !storedUser || storedUser.role !== 'ADMIN') {
  window.location.replace('/');
}

document.querySelector('#admin-name').textContent = storedUser?.firstName || 'Admin';
document.querySelector('#admin-date').textContent = new Intl.DateTimeFormat('en-PH', { dateStyle: 'long' }).format(new Date());
document.querySelector('#logout-button').addEventListener('click', () => {
  localStorage.removeItem('sanPascualToken');
  localStorage.removeItem('sanPascualUser');
  window.location.replace('/');
});

async function request(path, options = {}) {
  const response = await fetch(`/api/admin${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Admin request failed');
  return data;
}

function accountCard(account) {
  const official = account.officialProfile;
  const extra = official ? `<p><strong>${official.designationPosition}</strong> · ID ${official.identityVerification.split(' | ')[0]}</p><p class="documents">Documents received: ID and appointment/oath proof</p>` : '';
  return `<article class="approval-card"><div class="account-avatar">${account.firstName[0]}${account.lastName[0]}</div><div class="account-details"><div class="account-title"><h3>${account.firstName} ${account.middleName} ${account.lastName}</h3><span class="pending-badge">Pending</span></div><p>${account.email} · ${account.phone}</p><p>${account.address}, ${account.barangay}, ${account.municipality}, ${account.province}</p>${extra}<small>Submitted ${new Date(account.createdAt).toLocaleDateString('en-PH')}</small></div><div class="approval-actions"><button class="approve-button" data-id="${account.id}" data-status="APPROVED">Approve</button><button class="reject-button" data-id="${account.id}" data-status="REJECTED">Reject</button></div></article>`;
}

async function loadDashboard() {
  try {
    const overview = await request('/overview');
    document.querySelector('#resident-count').textContent = overview.counts.residents;
    document.querySelector('#official-count').textContent = overview.counts.officials;
    document.querySelector('#report-count').textContent = overview.counts.reports;
    document.querySelector('#pending-count').textContent = overview.counts.pending;
    document.querySelector('#nav-pending').textContent = overview.counts.pending;
    document.querySelector('#approval-count').textContent = overview.counts.pending;
    const accounts = [...overview.pendingResidents, ...overview.pendingOfficials];
    document.querySelector('#approval-list').innerHTML = accounts.length ? accounts.map(accountCard).join('') : '<div class="empty-state">No accounts are waiting for review.</div>';
    document.querySelectorAll('[data-status]').forEach((button) => button.addEventListener('click', () => updateApproval(button.dataset.id, button.dataset.status)));
    const reports = await request('/reports');
    document.querySelector('#report-list').innerHTML = reports.length ? reports.map((report) => `<tr><td><strong>${report.ticketNumber}</strong></td><td>${report.descriptionOfHazard}<small>${report.exactLocationLandmark}</small></td><td>${report.submitAnonymously ? 'Anonymous' : `${report.resident.firstName} ${report.resident.lastName}`}<small>${report.resident.email}</small></td><td><span class="status-pill">${report.status.replace('_', ' ')}</span></td><td>${new Date(report.dateSubmitted).toLocaleDateString('en-PH')}</td></tr>`).join('') : '<tr><td colspan="5" class="empty-state">No infrastructure reports yet.</td></tr>';
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
