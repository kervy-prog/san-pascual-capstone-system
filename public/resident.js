const API_BASE_URL = window.SAN_PASCUAL_API_URL || 'http://localhost:3000';
const authStorage = sessionStorage.getItem('sanPascualToken') ? sessionStorage : localStorage;
const token = authStorage.getItem('sanPascualToken');
const storedUser = JSON.parse(authStorage.getItem('sanPascualUser') || 'null');
const message = document.querySelector('#resident-message');
const reportDateInput = document.querySelector('#report-date');
const reportMediaInput = document.querySelector('#report-media');
const mediaPreview = document.querySelector('#media-preview');
const submitReportButton = document.querySelector('#submit-report-button');
const reportSuccessModal = document.querySelector('#report-success-modal');
const reportModalMessage = document.querySelector('#report-modal-message');
const reportModalTitle = document.querySelector('#report-modal-title');
const reportModalKicker = document.querySelector('#report-modal-kicker');
const reportModalIcon = document.querySelector('#report-modal-icon');
const closeReportModalLabel = document.querySelector('#close-report-modal-label');
let selectedMediaFiles = [];
const maxMediaFileBytes = 10 * 1024 * 1024;
const maxReportMediaBytes = 25 * 1024 * 1024;
const maxMultipartMediaBytes = 4 * 1024 * 1024;
const resolutionProofModal = document.querySelector('#resolution-proof-modal');
const resolutionProofImage = document.querySelector('#resolution-proof-image');
const resolutionProofError = document.querySelector('#resolution-proof-error');
let resolutionProofUrl = '';

function showReportModal({ error = false, message: modalMessage }) {
  reportSuccessModal.classList.toggle('error', error);
  reportModalIcon.textContent = error ? '!' : '✓';
  reportModalKicker.textContent = error ? 'REPORT NOT SUBMITTED' : 'REPORT RECEIVED';
  reportModalTitle.textContent = error ? 'Unable to submit report.' : 'Your report was submitted.';
  reportModalMessage.textContent = modalMessage;
  closeReportModalLabel.textContent = error ? 'Close' : 'View my reports';
  reportSuccessModal.classList.remove('hidden');
}

function showReportMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle('error', isError);
  message.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function closeResolutionProof() {
  resolutionProofModal.classList.add('hidden');
  resolutionProofImage.removeAttribute('src');
  resolutionProofError.textContent = '';
  if (resolutionProofUrl) URL.revokeObjectURL(resolutionProofUrl);
  resolutionProofUrl = '';
}

document.querySelector('#close-resolution-proof').addEventListener('click', closeResolutionProof);

async function viewResolutionProof(reportId) {
  closeResolutionProof();
  resolutionProofModal.classList.remove('hidden');
  try {
    const response = await fetch(`${API_BASE_URL}/api/requests/${encodeURIComponent(reportId)}/resolution-proof`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Unable to load resolution proof.');
    }
    resolutionProofUrl = URL.createObjectURL(await response.blob());
    resolutionProofImage.src = resolutionProofUrl;
  } catch (error) {
    resolutionProofError.textContent = error.message;
  }
}

function renderMediaPreview() {
  mediaPreview.innerHTML = '';
  selectedMediaFiles.forEach((file, index) => {
    const item = document.createElement('div');
    item.className = 'media-preview-item';
    const preview = file.type.startsWith('image/') ? document.createElement('img') : document.createElement('video');
    preview.src = URL.createObjectURL(file);
    preview.alt = file.name;
    if (preview.tagName === 'VIDEO') preview.controls = true;
    const details = document.createElement('div');
    details.className = 'media-preview-details';
    details.innerHTML = `<strong>${file.name}</strong><small>${Math.ceil(file.size / 1024)} KB</small>`;
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'media-remove';
    removeButton.textContent = 'Remove';
    removeButton.addEventListener('click', () => {
      selectedMediaFiles.splice(index, 1);
      renderMediaPreview();
    });
    item.append(preview, details, removeButton);
    mediaPreview.append(item);
  });
}

reportMediaInput.addEventListener('change', () => {
  const incomingFiles = Array.from(reportMediaInput.files || []);
  let selectedBytes = selectedMediaFiles.reduce((total, file) => total + file.size, 0);
  let tooManyFiles = false;
  let fileTooLarge = false;
  let reportTooLarge = false;
  for (const file of incomingFiles) {
    if (selectedMediaFiles.length >= 5) {
      tooManyFiles = true;
      continue;
    }
    if (file.size > maxMediaFileBytes) {
      fileTooLarge = true;
      continue;
    }
    if (selectedBytes + file.size > maxReportMediaBytes) {
      reportTooLarge = true;
      continue;
    }
    selectedMediaFiles.push(file);
    selectedBytes += file.size;
  }
  reportMediaInput.value = '';
  renderMediaPreview();
  if (fileTooLarge) showReportMessage('Each photo or video must be 10 MB or smaller.', true);
  else if (reportTooLarge) showReportMessage('All report photos and videos must total no more than 25 MB.', true);
  else if (tooManyFiles) showReportMessage('You can upload a maximum of 5 media files.', true);
});

async function uploadReportMediaDirectly(files) {
  const uploadedMedia = [];
  for (const file of files) {
    const signResponse = await fetch(`${API_BASE_URL}/api/requests/uploads/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size }),
    });
    const signedUpload = await signResponse.json().catch(() => ({}));
    if (signResponse.status === 503 && uploadedMedia.length === 0) return null;
    if (!signResponse.ok) throw new Error(signedUpload.error || `Unable to prepare media upload (HTTP ${signResponse.status}).`);

    const uploadResponse = await fetch(signedUpload.signedUrl, {
      method: 'PUT',
      headers: {
        apikey: signedUpload.uploadApiKey,
        'Content-Type': file.type,
        'x-upsert': 'false',
      },
      body: file,
    });
    if (!uploadResponse.ok) {
      throw new Error(`Unable to upload ${file.name} to cloud storage (HTTP ${uploadResponse.status}). No report was submitted.`);
    }
    uploadedMedia.push({
      storagePath: signedUpload.storagePath,
      originalname: file.name,
      mimetype: file.type,
      size: file.size,
    });
  }
  return uploadedMedia;
}

function closeReportModal() {
  reportSuccessModal.classList.add('hidden');
}

document.querySelector('#close-report-modal').addEventListener('click', () => {
  const isError = reportSuccessModal.classList.contains('error');
  closeReportModal();
  if (!isError) document.querySelector('a[href="#reports"]').click();
});

function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location services are unavailable in this browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      () => reject(new Error('Location permission was unavailable.')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  });
}

function autoFillSubmissionDateTime() {
  if (!reportDateInput) return;
  const now = new Date();
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  reportDateInput.value = localTime;
}

autoFillSubmissionDateTime();

if (!token || !storedUser || storedUser.role !== 'RESIDENT') {
  window.location.replace('/');
}

document.querySelector('#resident-name').textContent = storedUser?.firstName || 'Resident';
document.querySelector('#resident-date').textContent = new Intl.DateTimeFormat('en-PH', { dateStyle: 'long' }).format(new Date());
document.querySelector('#resident-logout').addEventListener('click', () => {
  localStorage.removeItem('sanPascualToken');
  localStorage.removeItem('sanPascualUser');
  sessionStorage.removeItem('sanPascualToken');
  sessionStorage.removeItem('sanPascualUser');
  window.location.replace('/');
});

document.querySelectorAll('nav a').forEach((link) => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    const targetId = link.getAttribute('href');
    if (!targetId) return;
    document.querySelectorAll('nav a').forEach((item) => item.classList.toggle('active', item === link));
    document.querySelectorAll('.resident-section').forEach((section) => {
      section.classList.toggle('active', `#${section.id}` === targetId);
    });
    history.replaceState(null, '', targetId);
  });
});

document.querySelector('#infrastructure-form').addEventListener('submit', async (event) => {
  event.preventDefault();

  const form = event.currentTarget;
  const mediaFiles = [...selectedMediaFiles];
  const submittedAt = reportDateInput?.value ? new Date(reportDateInput.value).toISOString() : new Date().toISOString();
  const categoryId = document.querySelector('#report-category').value;
  const urgencyLevel = document.querySelector('#report-urgency').value;
  const exactLocationLandmark = document.querySelector('#report-location').value.trim();
  const descriptionOfHazard = document.querySelector('#report-description').value.trim();
  const payload = new FormData();
  payload.append('categoryId', categoryId);
  payload.append('urgencyLevel', urgencyLevel);
  payload.append('exactLocationLandmark', exactLocationLandmark);
  payload.append('descriptionOfHazard', descriptionOfHazard);
  payload.append('currentStatus', 'SUBMITTED');
  payload.append('dateSubmitted', submittedAt);
  payload.append('submitAnonymously', 'false');

  if (!categoryId || !urgencyLevel || !exactLocationLandmark || !descriptionOfHazard || !reportDateInput?.value) {
    showReportMessage('Please choose a category and urgency, then complete the location and description.', true);
    return;
  }
  if (exactLocationLandmark.length < 5) {
    showReportMessage('Location must be at least 5 characters long.', true);
    return;
  }
  if (descriptionOfHazard.length < 10) {
    showReportMessage('Please describe the hazard using at least 10 characters.', true);
    return;
  }

  message.classList.remove('error');
  submitReportButton.disabled = true;
  submitReportButton.querySelector('span').textContent = 'Submitting...';
  try {
    let currentLocation;
    if (mediaFiles.length > 0) {
      try {
        currentLocation = await getCurrentLocation();
        payload.append('locationLatitude', String(currentLocation.latitude));
        payload.append('locationLongitude', String(currentLocation.longitude));
      } catch {
        // The server will still inspect the image's EXIF GPS metadata.
      }
    }
    let uploadedMedia;
    if (mediaFiles.length > 0) {
      uploadedMedia = await uploadReportMediaDirectly(mediaFiles);
      if (uploadedMedia === null) {
        const totalMediaBytes = mediaFiles.reduce((total, file) => total + file.size, 0);
        if (totalMediaBytes > maxMultipartMediaBytes) {
          throw new Error('Large uploads need cloud storage, which is not configured for this deployment. Ask the administrator to configure Supabase Storage or use media totaling 4 MB or less.');
        }
        mediaFiles.forEach((file) => payload.append('media', file));
      }
    }
    const headers = { Authorization: `Bearer ${token}` };
    let requestBody = payload;
    if (uploadedMedia) {
      headers['Content-Type'] = 'application/json';
      requestBody = JSON.stringify({
        categoryId,
        urgencyLevel,
        exactLocationLandmark,
        descriptionOfHazard,
        currentStatus: 'SUBMITTED',
        dateSubmitted: submittedAt,
        submitAnonymously: false,
        locationLatitude: currentLocation?.latitude,
        locationLongitude: currentLocation?.longitude,
        uploadedMedia,
      });
    }
    const response = await fetch(`${API_BASE_URL}/api/requests`, {
      method: 'POST',
      headers,
      body: requestBody,
    });
    const responseText = await response.text();
    let data = {};
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      data = {};
    }
    if (!response.ok) {
      const validationDetails = data.details
        ? Object.values(data.details).flat().filter(Boolean).join(' ')
        : '';
      const statusMessage = response.status === 413
        ? 'Report upload exceeds the configured storage limit. Photos and videos can total up to 25 MB when cloud storage is enabled.'
        : `Unable to submit infrastructure report (HTTP ${response.status}). Please try again.`;
      throw new Error(validationDetails || data.error || statusMessage);
    }

    showReportMessage('Infrastructure report submitted successfully.');
    showReportModal({ message: `Ticket ${data.ticketNumber || 'created'} has been recorded. The barangay team can now review your concern.` });
    form.reset();
    selectedMediaFiles = [];
    renderMediaPreview();
    autoFillSubmissionDateTime();
    await fetchResidentProfile();
  } catch (error) {
    showReportMessage(error.message, true);
    if (error.message === "Sorry, the uploaded image isn't part of our Barangay") {
      showReportModal({ error: true, message: error.message });
    }
  } finally {
    submitReportButton.disabled = false;
    submitReportButton.querySelector('span').textContent = 'Submit report';
  }
});

async function fetchResidentProfile() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to load resident profile');

    const resident = data.user;
    document.querySelector('#resident-name').textContent = resident.firstName;
    document.querySelector('#resident-avatar').textContent = resident.firstName[0] || 'R';
    document.querySelector('#full-name').textContent = `${resident.firstName} ${resident.middleName} ${resident.lastName}`;
    document.querySelector('#resident-email').textContent = resident.email;
    document.querySelector('#resident-age').textContent = resident.age;
    document.querySelector('#resident-gender').textContent = resident.gender?.replace('_', ' ');
    document.querySelector('#resident-birthdate').textContent = new Date(resident.birthDate).toLocaleDateString('en-PH');
    document.querySelector('#resident-nationality').textContent = resident.nationality;
    document.querySelector('#resident-phone').textContent = resident.phone;
    document.querySelector('#resident-address').textContent = resident.address;
    document.querySelector('#approval-status').textContent = resident.approvalStatus;
    document.querySelector('#barangay-name').textContent = resident.barangay || 'San Pascual';
    document.querySelector('#report-count').textContent = resident.reports?.length || 0;

    const rows = resident.reports?.length ? resident.reports.map((report) => {
      const residentComments = (report.actions || []).map((action) => `<div class="resident-status-comment"><strong>Barangay update</strong><p>${escapeHtml(action.actionRemarks)}</p><small>${new Date(action.actionDate).toLocaleString('en-PH')}</small></div>`).join('');
      const resolutionDate = report.resolvedAt ? `<small class="resolved-date">Resolved ${new Date(report.resolvedAt).toLocaleString('en-PH')}</small>` : '';
      const resolutionDetails = report.resolutionDetails ? `<div class="resident-resolution-result"><strong>Resolution results</strong><p>${escapeHtml(report.resolutionDetails)}</p></div>` : '';
      const hasResolutionProof = report.media?.some((item) => item.isResolutionProof);
      const resolutionProof = hasResolutionProof ? `<button type="button" class="resolution-proof-button" data-resolution-report-id="${report.id}">View photo proof</button>` : '';
      return `
      <tr>
        <td>${report.ticketNumber || report.id}</td>
        <td>${report.category?.name || 'N/A'}</td>
        <td>${report.exactLocationLandmark || 'N/A'}</td>
        <td><strong>${report.status || report.currentStatus || 'SUBMITTED'}</strong>${resolutionDate}${resolutionDetails}${resolutionProof}${residentComments}</td>
        <td>${new Date(report.dateSubmitted || report.createdAt).toLocaleDateString('en-PH')}</td>
      </tr>
    `;
    }).join('') : '<tr><td colspan="5" class="empty-state">No reports submitted yet.</td></tr>';
    document.querySelector('#resident-report-list').innerHTML = rows;
    document.querySelectorAll('.resolution-proof-button').forEach((button) => {
      button.addEventListener('click', () => viewResolutionProof(button.dataset.resolutionReportId));
    });
  } catch (error) {
    message.textContent = error.message;
    message.classList.add('error');
  }
}

fetchResidentProfile();
setInterval(fetchResidentProfile, 10000);
