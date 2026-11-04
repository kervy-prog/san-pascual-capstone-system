const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'public', 'resident.js'), 'utf8');
const start = source.indexOf("document.querySelector('#infrastructure-form').addEventListener('submit',");
const end = source.indexOf('\nasync function fetchResidentProfile()', start);
assert(start >= 0 && end > start, 'Submission handler must exist');

async function checkSubmission(files, uploadedMedia, networkError = false) {
  let handler;
  let request;
  let displayedMessage;
  let reset = false;
  const fieldValues = {
    '#report-category': 'roads',
    '#report-urgency': 'MEDIUM',
    '#report-location': 'Demo location',
    '#report-description': 'Synthetic report for transport testing',
  };
  const context = {
    FormData, TypeError, console: { error() {} },
    document: {
      querySelector(selector) {
        return selector === '#infrastructure-form'
          ? { addEventListener(_event, callback) { handler = callback; } }
          : { value: fieldValues[selector] };
      },
    },
    selectedMediaFiles: files,
    reportDateInput: { value: '2026-01-01T10:00' },
    message: { classList: { remove() {} } },
    submitReportButton: { disabled: false, querySelector() { return {}; } },
    getCurrentLocation: async () => { throw new Error('Submission must not request device location'); },
    uploadReportMediaDirectly: async () => uploadedMedia,
    maxMultipartMediaBytes: 4 * 1024 * 1024,
    API_BASE_URL: 'https://example.invalid',
    token: 'test-only',
    fetch: async (url, options) => {
      request = { url, ...options };
      if (networkError) throw new TypeError('Failed to fetch');
      return { ok: true, text: async () => '{"ticketNumber":"TEST-ONLY"}' };
    },
    showReportMessage(text) { displayedMessage = text; },
    showReportModal() {},
    renderMediaPreview() {},
    autoFillSubmissionDateTime() {},
    fetchResidentProfile: async () => {},
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  await handler({ preventDefault() {}, currentTarget: { reset() { reset = true; } } });
  assert.equal(context.submitReportButton.disabled, false);
  return { request, displayedMessage, reset };
}

(async () => {
  const noPhotos = await checkSubmission([]);
  assert.equal(noPhotos.request, undefined);
  assert.match(noPhotos.displayedMessage, /exactly 3 photos/);
  assert.equal(noPhotos.reset, false);

  const photo = new Blob(['test-only'], { type: 'image/png' });
  for (const count of [1, 2, 4]) {
    const invalid = await checkSubmission(Array(count).fill(photo));
    assert.equal(invalid.request, undefined);
    assert.match(invalid.displayedMessage, /exactly 3 photos/);
  }
  const photos = [photo, photo, photo];
  const references = photos.map((photo, index) => ({ storagePath: `reports/test-${index}.png`, originalname: `test-${index}.png`, mimetype: 'image/png', size: photo.size }));
  const direct = await checkSubmission(photos, references);
  assert.equal(direct.request.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(direct.request.body).uploadedMedia, references);
  const body = JSON.parse(direct.request.body);
  assert.equal(body.categoryId, 'roads');
  assert.equal(body.currentStatus, 'SUBMITTED');
  assert.equal(body.submitAnonymously, false);
  assert.equal(body.locationLatitude, undefined);
  assert.equal(body.locationLongitude, undefined);
  assert(direct.reset);

  const fallback = await checkSubmission(photos, null);
  assert(fallback.request.body instanceof FormData);
  assert.equal(fallback.request.headers['Content-Type'], undefined);
  assert.equal(fallback.request.body.getAll('media').length, 3);
  assert.equal(fallback.request.body.get('locationLatitude'), null);

  const failure = await checkSubmission(photos, references, true);
  assert.match(failure.displayedMessage, /My reports/);
  assert.equal(failure.reset, false);
  console.log('PASS: exactly 3 photos, direct/multipart transport, no device coordinates, and network error preserves form.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
