const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'public', 'resident.js'), 'utf8');
const start = source.indexOf('function addReportPhotos(');
const end = source.indexOf('\nasync function uploadReportMediaDirectly(', start);
assert(start >= 0 && end > start);
const mb = 1024 * 1024;
const photo = (size = mb, type = 'image/jpeg') => ({ name: 'test.jpg', size, type });

function setup(capture) {
  const handlers = {};
  const button = { hidden: true, disabled: false, addEventListener(_event, fn) { handlers.camera = fn; } };
  const context = {
    selectedMediaFiles: [],
    maxMediaFileBytes: 10 * mb,
    maxReportMediaBytes: 25 * mb,
    reportMediaInput: { value: 'test', addEventListener(_event, fn) { handlers.picker = fn; } },
    submitReportButton: { disabled: false },
    window: { sanPascualTakePhoto: capture },
    document: { querySelector: () => button },
    renderMediaPreview() {},
    showReportMessage(text) { context.lastMessage = text; },
    console: { error() { context.loggedError = true; } },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return { context, button, handlers };
}

(async () => {
  assert.equal(setup().button.hidden, true, 'Website must not show native camera button');
  let captures = 0;
  const { context, button, handlers } = setup(async () => { captures++; return photo(); });
  assert.equal(button.hidden, false);
  context.reportMediaInput.files = [photo()];
  handlers.picker();
  assert.equal(context.reportMediaInput.value, '');
  await handlers.camera();
  await handlers.camera();
  assert.equal(context.selectedMediaFiles.length, 3);
  await handlers.camera();
  assert.equal(captures, 2, 'Camera must not launch after three photos');
  assert.match(context.lastMessage, /maximum of 3/);
  assert.equal(button.disabled, false);
  context.submitReportButton.disabled = true;
  await handlers.camera();
  assert.equal(captures, 2);

  const cancelled = setup(async () => null);
  cancelled.context.selectedMediaFiles.push(photo());
  await cancelled.handlers.camera();
  assert.equal(cancelled.context.selectedMediaFiles.length, 1);
  assert.equal(cancelled.context.lastMessage, undefined);
  const failed = setup(async () => { throw new Error('Camera unavailable'); });
  await failed.handlers.camera();
  assert.match(failed.context.lastMessage, /Unable to take a photo/);
  assert(failed.context.loggedError);
  assert.equal(failed.button.disabled, false);
  assert.equal(failed.context.submitReportButton.disabled, false);

  const limits = setup();
  limits.context.addReportPhotos([photo(11 * mb), photo(mb, 'video/mp4')]);
  assert.equal(limits.context.selectedMediaFiles.length, 0);
  limits.context.addReportPhotos([photo(10 * mb), photo(10 * mb), photo(6 * mb)]);
  assert.equal(limits.context.selectedMediaFiles.length, 2);
  assert.match(limits.context.lastMessage, /25 MB/);

  const nativeSource = fs.readFileSync(path.join(__dirname, '..', 'mobile', 'native.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '');
  let cameraError;
  let readable = true;
  let options;
  const native = {
    window: {}, Error, File, Date,
    Capacitor: { isNativePlatform: () => true },
    CameraResultType: { Uri: 'uri' },
    CameraSource: { Camera: 'CAMERA' },
    Camera: { async getPhoto(settings) {
      options = settings;
      if (cameraError) throw cameraError;
      return { webPath: 'https://localhost/_capacitor_file_/test.jpg' };
    } },
    fetch: async () => ({ ok: readable, blob: async () => new Blob(['camera-photo']) }),
    App: { addListener: async () => {} },
  };
  vm.runInNewContext(nativeSource, native);
  const file = await native.window.sanPascualTakePhoto();
  assert(file instanceof File);
  assert.equal(file.type, 'image/jpeg');
  assert.equal(await file.text(), 'camera-photo');
  assert.equal(options.source, 'CAMERA');
  assert.equal(options.resultType, 'uri');
  assert.equal(options.saveToGallery, false);
  cameraError = new Error('User cancelled photos app');
  assert.equal(await native.window.sanPascualTakePhoto(), null);
  cameraError = new Error('User denied access to camera');
  await assert.rejects(native.window.sanPascualTakePhoto, /denied/);
  cameraError = undefined;
  readable = false;
  await assert.rejects(native.window.sanPascualTakePhoto, /Unable to read/);
  console.log('PASS: native camera file, cancellation/errors, APK-only button, gallery/camera limits, and busy-state guard.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
