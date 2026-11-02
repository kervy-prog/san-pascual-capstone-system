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
    getCurrentLocation: async () => ({ latitude: 15, longitude: 120 }),
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
  assert.equal(noPhotos.request.headers['Content-Type'], 'application/json');
  const body = JSON.parse(noPhotos.request.body);
  assert.equal(body.categoryId, 'roads');
  assert.equal(body.currentStatus, 'SUBMITTED');
  assert.equal(body.submitAnonymously, false);
  assert.equal(body.uploadedMedia, undefined);
  assert(noPhotos.reset);

  const photo = new Blob(['test-only'], { type: 'image/png' });
  const references = [{ storagePath: 'reports/test.png', originalname: 'test.png', mimetype: 'image/png', size: photo.size }];
  const direct = await checkSubmission([photo], references);
  assert.equal(direct.request.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(direct.request.body).uploadedMedia, references);
  assert.equal(JSON.parse(direct.request.body).locationLatitude, 15);

  const fallback = await checkSubmission([photo], null);
  assert(fallback.request.body instanceof FormData);
  assert.equal(fallback.request.headers['Content-Type'], undefined);
  assert.equal(fallback.request.body.getAll('media').length, 1);

  const failure = await checkSubmission([], undefined, true);
  assert.match(failure.displayedMessage, /My reports/);
  assert.equal(failure.reset, false);
  console.log('PASS: JSON without photos, direct photo references, multipart fallback, and network error preserves form.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
