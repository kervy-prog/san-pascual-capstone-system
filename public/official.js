const API_BASE_URL = window.SAN_PASCUAL_API_URL || 'http://localhost:3000';
const authStorage = sessionStorage.getItem('sanPascualToken') ? sessionStorage : localStorage;
const token = authStorage.getItem('sanPascualToken');
const storedUser = JSON.parse(authStorage.getItem('sanPascualUser') || 'null');
const message = document.querySelector('#official-message');
const attachmentModal = document.querySelector('#attachment-modal');
const attachmentImage = document.querySelector('#attachment-image');
const attachmentVideo = document.querySelector('#attachment-video');
const attachmentError = document.querySelector('#attachment-error');
let attachmentObjectUrl = '';

if (!token || !storedUser || storedUser.role !== 'STAFF') {
  window.location.replace('/');
}

document.querySelector('#official-date').textContent = new Intl.DateTimeFormat('en-PH', { dateStyle: 'long' }).format(new Date());
document.querySelector('#official-logout').addEventListener('click', () => {
  localStorage.removeItem('sanPascualToken');
  localStorage.removeItem('sanPascualUser');
  sessionStorage.removeItem('sanPascualToken');
  sessionStorage.removeItem('sanPascualUser');
  window.location.replace('/');
});

function closeAttachmentModal() {
  attachmentModal.classList.add('hidden');
  attachmentImage.classList.add('hidden');
  attachmentVideo.classList.add('hidden');
  attachmentImage.removeAttribute('src');
  attachmentVideo.removeAttribute('src');
  attachmentVideo.load();
  attachmentError.textContent = '';
  if (attachmentObjectUrl) URL.revokeObjectURL(attachmentObjectUrl);
  attachmentObjectUrl = '';
}

document.querySelector('#close-attachment-modal').addEventListener('click', closeAttachmentModal);

async function viewReportAttachment(fileName) {
  closeAttachmentModal();
  attachmentModal.classList.remove('hidden');
  try {
    const response = await fetch(`${API_BASE_URL}/api/official/reports/media/${encodeURIComponent(fileName)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await response.blob();
    if (!response.ok) {
      const errorData = await blob.text().then((text) => JSON.parse(text)).catch(() => ({}));
      throw new Error(errorData.error || 'Unable to load this report attachment.');
    }
    attachmentObjectUrl = URL.createObjectURL(blob);
    if (blob.type.startsWith('image/')) {
      attachmentImage.src = attachmentObjectUrl;
      attachmentImage.classList.remove('hidden');
    } else if (blob.type.startsWith('video/')) {
      attachmentVideo.src = attachmentObjectUrl;
      attachmentVideo.classList.remove('hidden');
    } else {
      throw new Error('This attachment format cannot be previewed.');
    }
  } catch (error) {
    attachmentError.textContent = error.message;
  }
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('.attachment-preview-button');
  if (button) viewReportAttachment(decodeURIComponent(button.dataset.fileName));
});

document.querySelectorAll('nav a').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const targetId = link.dataset.target;
    document.querySelectorAll('nav a').forEach((item) => item.classList.toggle('active', item === link));
    document.querySelectorAll('.official-section').forEach((section) => section.classList.toggle('active', section.id === targetId));
    history.replaceState(null, '', `#${targetId}`);
  });
});

function formatDate(value, includeTime = false) {
  return new Intl.DateTimeFormat('en-PH', includeTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function reportRow(report) {
  const resident = report.submitAnonymously ? 'Anonymous' : `${report.resident.firstName} ${report.resident.lastName}`;
  const reportIdSub = report.reportId && report.reportId !== report.ticketNumber ? `<small>${report.reportId}</small>` : '';
  return `<tr><td><strong>${report.ticketNumber}</strong>${reportIdSub}</td><td>${resident}<small>${report.resident.email}</small></td><td>${report.category.name}</td><td><span class="urgency urgency-${report.category.urgencyLevel.toLowerCase()}">${report.category.urgencyLevel}</span></td><td><span class="status-pill">${(report.currentStatus || report.status).replaceAll('_', ' ')}</span></td><td>${formatDate(report.dateSubmitted, true)}</td></tr>`;
}

function hazardCard(report) {
  const resident = report.submitAnonymously ? 'Anonymous resident' : `${report.resident.firstName} ${report.resident.lastName}`;
  const currentStatus = report.currentStatus || report.status;

  let mediaHtml = 'No media attached';
  if (report.media?.length) {
    const mediaLinks = report.media.map((item, idx) => {
      const fileName = item.filePath.split('/').pop();
      return `<button type="button" class="attachment-preview-button" data-file-name="${encodeURIComponent(fileName)}">View attachment ${idx + 1} (${item.mediaType.toLowerCase()})</button>`;
    }).join(' · ');
    mediaHtml = `Media: ${mediaLinks}`;
  }

  let actionButtons = '';
  if (currentStatus === 'SUBMITTED' || currentStatus === 'UNDER_REVIEW') {
    actionButtons = `<button type="button" class="approve-button action-btn" data-action-id="${report.id}" data-action-status="IN_PROGRESS">Start Work (In Progress)</button>`;
  } else if (currentStatus === 'IN_PROGRESS') {
    actionButtons = `<button type="button" class="approve-button action-btn" data-action-id="${report.id}" data-action-status="RESOLVED">Mark as Resolved</button>`;
  } else if (currentStatus === 'RESOLVED') {
    actionButtons = `<span class="status-pill" style="color: #065f46; background: #d1fae5;">✓ Resolved</span>`;
  }

  const feedback = (report.actions || []).filter((action) => action.actionStatus === 'FIELD_FEEDBACK');
  const feedbackHtml = feedback.length
    ? `<div class="field-feedback-list"><h4>On-site feedback</h4>${feedback.map((action) => `<p>${escapeHtml(action.actionRemarks)}<small>${formatDate(action.actionDate, true)}</small></p>`).join('')}</div>`
    : '';
  const feedbackForm = !['RESOLVED', 'REJECTED', 'CANCELLED'].includes(currentStatus)
    ? `<form class="field-feedback-form" data-feedback-report-id="${report.id}"><label for="field-feedback-${report.id}">On-site feedback</label><textarea id="field-feedback-${report.id}" name="notes" rows="2" minlength="5" maxlength="1000" placeholder="Example: We need additional tools for this report." required></textarea><button type="submit" class="feedback-button">Save field feedback</button></form>`
    : '';

  return `<article class="hazard-card"><div class="hazard-card-head"><div><p class="eyebrow">${report.category.urgencyLevel} PRIORITY</p><h3>${report.category.name}</h3></div><span class="status-pill">${currentStatus.replaceAll('_', ' ')}</span></div><div class="hazard-grid"><div><label>Ticket</label><p>${report.ticketNumber}</p></div><div><label>Reported by</label><p>${resident}</p></div><div><label>Exact location</label><p>${report.exactLocationLandmark}</p></div><div><label>Date submitted</label><p>${formatDate(report.dateSubmitted, true)}</p></div></div><div class="hazard-description"><label>Description</label><p>${report.descriptionOfHazard}</p><small>${mediaHtml}</small></div>${feedbackHtml}${feedbackForm}<div class="hazard-actions" style="margin-top: 1rem; display: flex; gap: 0.5rem;">${actionButtons}</div></article>`;
}

async function updateReportStatus(reportId, newStatus) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/official/reports/${reportId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update report status');
    message.textContent = `Report ${data.ticketNumber || reportId} updated to ${newStatus.replaceAll('_', ' ')}.`;
    message.classList.remove('error');
    await loadDashboard();
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
  }
}

async function submitFieldFeedback(reportId, notes) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/official/reports/${reportId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ notes }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to save field feedback');
    message.textContent = 'On-site feedback saved for this report.';
    message.classList.remove('error');
    await loadDashboard();
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
  }
}

async function loadDashboard() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/official/overview`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load official dashboard.');

    const official = data.official;
    document.querySelector('#official-name').textContent = official.firstName;
    document.querySelector('#official-avatar').textContent = official.firstName[0] || 'O';
    document.querySelector('#full-name').textContent = `${official.firstName} ${official.middleName} ${official.lastName}`;
    document.querySelector('#official-email').textContent = official.email;
    document.querySelector('#designation').textContent = official.officialProfile?.designationPosition || 'Barangay official';
    document.querySelector('#official-phone').textContent = official.phone;
    document.querySelector('#approval-status').textContent = official.approvalStatus;
    document.querySelector('#official-barangay').textContent = official.barangay;
    document.querySelector('#official-municipality').textContent = official.municipality;
    document.querySelector('#official-address').textContent = official.address;
    document.querySelector('#report-count').textContent = data.counts.reports;
    document.querySelector('#submitted-count').textContent = data.counts.submitted;
    document.querySelector('#resolved-count').textContent = data.counts.resolved;
    document.querySelector('#report-list').innerHTML = data.reports.length ? data.reports.map(reportRow).join('') : '<tr><td colspan="6" class="empty-state">No infrastructure reports yet.</td></tr>';
    document.querySelector('#hazard-list').innerHTML = data.reports.length ? data.reports.map(hazardCard).join('') : '<p class="empty-state">No designated hazards yet.</p>';

    document.querySelectorAll('.action-btn').forEach((btn) => {
      btn.addEventListener('click', () => updateReportStatus(btn.dataset.actionId, btn.dataset.actionStatus));
    });
    document.querySelectorAll('.field-feedback-form').forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const notes = form.elements.notes.value.trim();
        if (notes.length >= 5) submitFieldFeedback(form.dataset.feedbackReportId, notes);
      });
    });
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
  }
}

loadDashboard();
