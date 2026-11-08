const assert = require('node:assert/strict');
const http = require('node:http');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');
const { Prisma } = require('@prisma/client');
const { boundarySchema, isInsideBoundary, isWithinSanPascualVicinity } = require('../dist/modules/requests/report-geofence.js');
const { validateReportPhotoLocations } = require('../dist/modules/requests/report-photo-location.js');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'geofence-tests-only-not-a-real-secret';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/not-used';

const point = (latitude, longitude) => ({ latitude, longitude });
const boundary = [point(15.01, 120.08), point(15.01, 120.09), point(15.02, 120.09), point(15.02, 120.08)];
const inside = point(15.015, 120.085);
const outside = point(16, 121);
let stored;
let createdReports = [];
let mediaRows = [];
const prisma = {
  appSetting: {
    findUnique: async () => ({ value: true }),
    upsert: async ({ update }) => ({ value: update.value }),
  },
  reportGeofence: {
    findUnique: async () => stored,
    create: async ({ data }) => {
      if (stored) throw new Prisma.PrismaClientKnownRequestError('Duplicate', { code: 'P2002', clientVersion: 'test' });
      stored = { ...data, revision: 1 };
      return stored;
    },
    updateMany: async ({ where, data }) => {
      if (!stored || stored.revision !== where.revision) return { count: 0 };
      stored = { ...stored, boundary: data.boundary, revision: stored.revision + 1 };
      return { count: 1 };
    },
  },
  infrastructureCategory: { findFirst: async () => ({ id: 'roads', urgencyLevel: 'MEDIUM' }) },
  infrastructureReport: { create: async ({ data }) => {
    createdReports.push(data);
    return { id: 'test-report', ticketNumber: 'TEST', ...data };
  } },
  reportMedia: { createMany: async ({ data }) => { mediaRows.push(...data); return { count: data.length }; } },
};

function mockModule(path, exports) {
  const resolved = require.resolve(path);
  require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}
mockModule('../dist/lib/prisma.js', { prisma, isDatabaseConnectionError: () => false });
let uploadedBuffer;
mockModule('../dist/lib/file-storage.js', {
  readStoredUpload: async () => uploadedBuffer,
  storeUpload: async ({ fileName }) => fileName,
});
const { getReportGeofenceSettings, saveReportBoundary, BoundaryConflictError } = require('../dist/modules/requests/report-geofence-settings.js');
const { adminRouter } = require('../dist/modules/admin/admin.routes.js');
const { requestRouter } = require('../dist/modules/requests/request.routes-RADDUS.js');
const { errorHandler } = require('../dist/middleware/error-handler.js');
const express = require('express');

function gpsJpeg(jpeg, location) {
  const tiff = Buffer.alloc(128);
  tiff.write('II'); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8);
  tiff.writeUInt16LE(0x8825, 10); tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14); tiff.writeUInt32LE(26, 18);
  tiff.writeUInt16LE(4, 26);
  for (const [index, tag, type, count, value] of [
    [0, 1, 2, 2, location.latitude < 0 ? 'S' : 'N'],
    [1, 2, 5, 3, 80],
    [2, 3, 2, 2, location.longitude < 0 ? 'W' : 'E'],
    [3, 4, 5, 3, 104],
  ]) {
    const offset = 28 + index * 12;
    tiff.writeUInt16LE(tag, offset); tiff.writeUInt16LE(type, offset + 2); tiff.writeUInt32LE(count, offset + 4);
    if (typeof value === 'string') tiff.write(value, offset + 8);
    else tiff.writeUInt32LE(value, offset + 8);
  }
  for (const [value, offset] of [[location.latitude, 80], [location.longitude, 104]]) {
    const absolute = Math.abs(value);
    const degrees = Math.floor(absolute);
    const minutes = Math.floor((absolute - degrees) * 60);
    const seconds = ((absolute - degrees) * 60 - minutes) * 60;
    for (const [index, numerator, denominator] of [[0, degrees, 1], [1, minutes, 1], [2, Math.round(seconds * 1000000), 1000000]]) {
      tiff.writeUInt32LE(numerator, offset + index * 8);
      tiff.writeUInt32LE(denominator, offset + index * 8 + 4);
    }
  }
  const exif = Buffer.concat([Buffer.from('Exif\0\0'), tiff]);
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(exif.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), header, exif, jpeg.subarray(2)]);
}

(async () => {
  boundarySchema.parse(boundary);
  assert(isInsideBoundary(inside, boundary));
  assert(!isInsideBoundary(outside, boundary));
  assert(isInsideBoundary(boundary[0], boundary), 'Boundary vertices are included');
  assert(isInsideBoundary(point(15.01, 120.085), boundary), 'Boundary edges are included');
  assert(isInsideBoundary(inside, [...boundary].reverse()), 'Both winding orders work');
  const concave = [point(0, 0), point(0, 4), point(2, 2), point(4, 4), point(4, 0)];
  boundarySchema.parse(concave);
  assert(isInsideBoundary(point(2, 1), concave));
  assert(!isInsideBoundary(point(2, 3), concave));
  for (const invalid of [
    [], boundary.slice(0, 2), [boundary[0], boundary[2], boundary[1], boundary[3]],
    [...boundary, boundary[0]], [point(0, 0), point(1, 1), point(2, 2)],
    [point(NaN, 0), ...boundary], [point(91, 0), ...boundary],
    [point(0, Infinity), ...boundary], Array(101).fill(boundary[0]),
  ]) assert(!boundarySchema.safeParse(invalid).success);
  assert(isWithinSanPascualVicinity(15.0178547, 120.0829188));
  assert(!isWithinSanPascualVicinity(16, 121));

  const files = Array.from({ length: 3 }, () => ({ buffer: Buffer.from('mock') }));
  assert.deepEqual(await validateReportPhotoLocations(files, true, boundary, async () => inside), inside);
  for (const count of [0, 1, 2, 4]) {
    await assert.rejects(validateReportPhotoLocations(Array(count).fill(files[0]), true, boundary, async () => inside), /exactly 3/);
  }
  for (const metadata of [undefined, {}, point(NaN, 120), point(91, 120), point(15, Infinity)]) {
    await assert.rejects(validateReportPhotoLocations(files, true, boundary, async () => metadata), /Photo 1 has no readable GPS/);
  }
  for (let badIndex = 0; badIndex < 3; badIndex++) {
    let index = 0;
    await assert.rejects(validateReportPhotoLocations(files, true, boundary, async () => index++ === badIndex ? outside : inside), new RegExp(`Photo ${badIndex + 1} was taken outside`));
    index = 0;
    await assert.rejects(validateReportPhotoLocations(files, true, boundary, async () => index++ === badIndex ? undefined : inside), new RegExp(`Photo ${badIndex + 1} has no readable GPS`));
  }
  assert.equal(await validateReportPhotoLocations(files, false, boundary, async () => undefined), undefined);
  assert.deepEqual(await validateReportPhotoLocations(files, false, boundary, async () => outside), outside);
  assert.deepEqual(await validateReportPhotoLocations(files, true, null, async () => inside), inside);

  const jpeg = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
  const original = gpsJpeg(jpeg, inside);
  const actual = await validateReportPhotoLocations(Array(3).fill({ buffer: original }), true, boundary);
  assert(Math.abs(actual.latitude - inside.latitude) < 1e-8);
  assert(Math.abs(actual.longitude - inside.longitude) < 1e-8);
  await assert.rejects(validateReportPhotoLocations(Array(3).fill({ buffer: jpeg }), true, boundary), /no readable GPS/);
  const warn = console.warn;
  let parseFailureLogged = false;
  console.warn = () => { parseFailureLogged = true; };
  try {
    await assert.rejects(validateReportPhotoLocations(files, true, boundary, async () => { throw new Error('Corrupt EXIF'); }), /no readable GPS/);
    assert(parseFailureLogged, 'Malformed metadata must be logged and rejected');
  } finally {
    console.warn = warn;
  }
  await assert.rejects(validateReportPhotoLocations(Array(3).fill({ buffer: gpsJpeg(jpeg, outside) }), true, boundary), /outside/);

  const initial = await getReportGeofenceSettings();
  assert.equal(initial.boundary, null);
  assert.equal(initial.legacyVicinity.radiusMeters, 2000);
  const saved = await saveReportBoundary(boundary, 0);
  assert.equal(saved.revision, 1);
  assert.deepEqual((await getReportGeofenceSettings()).boundary, boundary);
  await assert.rejects(saveReportBoundary(boundary, 0), BoundaryConflictError);
  await assert.rejects(saveReportBoundary(boundary, 2), BoundaryConflictError);
  assert.equal((await saveReportBoundary([...boundary].reverse(), 1)).revision, 2);
  assert.deepEqual((await getReportGeofenceSettings()).boundary, [...boundary].reverse());

  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  app.use('/api/requests', requestRouter);
  app.use(errorHandler);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = role => ({ Authorization: `Bearer ${jwt.sign({ role }, process.env.JWT_SECRET, { subject: 'test-resident', expiresIn: '5m' })}` });
  try {
    const endpoint = `${base}/api/admin/settings/report-geofence`;
    assert.equal((await fetch(endpoint)).status, 401);
    assert.equal((await fetch(endpoint, { headers: auth('RESIDENT') })).status, 403);
    const settings = await fetch(endpoint, { headers: auth('ADMIN') });
    assert.equal(settings.status, 200);
    assert.equal((await settings.json()).revision, 2);
    const residentGeofenceEndpoint = `${base}/api/requests/geofence`;
    assert.equal((await fetch(residentGeofenceEndpoint)).status, 401);
    assert.equal((await fetch(residentGeofenceEndpoint, { headers: auth('ADMIN') })).status, 403);
    const residentBoundaryResponse = await fetch(residentGeofenceEndpoint, { headers: auth('RESIDENT') });
    assert.equal(residentBoundaryResponse.status, 200);
    assert.equal(residentBoundaryResponse.headers.get('cache-control'), 'no-store');
    const residentBoundary = await residentBoundaryResponse.json();
    assert.deepEqual(residentBoundary.boundary, [...boundary].reverse());
    assert.equal(residentBoundary.revision, 2);
    assert.equal(residentBoundary.enforceReportGeofence, true);
    assert(!Object.hasOwn(residentBoundary, 'save'));
    assert(!Object.hasOwn(residentBoundary, 'edit'));
    assert.equal(stored.revision, 2, 'Read-only resident access must not modify the boundary');
    for (const [payload, status] of [
      [{ boundary: [boundary[0]], expectedRevision: 2 }, 400],
      [{ boundary, expectedRevision: 1 }, 409],
      [{ boundary, expectedRevision: 2 }, 200],
    ]) {
      const response = await fetch(`${endpoint}/boundary`, {
        method: 'PATCH', headers: { ...auth('ADMIN'), 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      assert.equal(response.status, status);
    }
    const fields = {
      categoryId: 'roads', exactLocationLandmark: 'Barangay test road', descriptionOfHazard: 'Synthetic geofence test only',
      currentStatus: 'SUBMITTED', locationLatitude: outside.latitude, locationLongitude: outside.longitude,
    };
    const post = async buffers => {
      const form = new FormData();
      for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
      buffers.forEach((buffer, index) => form.append('media', new Blob([buffer], { type: 'image/jpeg' }), `photo-${index}.jpg`));
      return fetch(`${base}/api/requests`, { method: 'POST', headers: auth('RESIDENT'), body: form });
    };
    for (const buffers of [[original], [original, original], [original, original, jpeg], [original, original, gpsJpeg(jpeg, outside)]]) {
      const response = await post(buffers);
      assert.equal(response.status, 422);
    }
    assert.equal(createdReports.length, 0, 'Invalid photos must not create reports');
    let response = await post([original, original, original]);
    assert.equal(response.status, 201);
    let report = await response.json();
    assert.equal(report.location.source, 'image-exif');
    assert(Math.abs(report.location.latitude - inside.latitude) < 1e-8, 'Outside submission device coordinates are ignored');
    assert.equal(mediaRows.length, 3);
    uploadedBuffer = original;
    const references = Array.from({ length: 3 }, (_, index) => ({
      storagePath: `reports/test-resident-upload-${index}.jpg`, originalname: `photo-${index}.jpg`,
      mimetype: 'image/jpeg', size: original.length,
    }));
    response = await fetch(`${base}/api/requests`, {
      method: 'POST', headers: { ...auth('RESIDENT'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, uploadedMedia: references }),
    });
    assert.equal(response.status, 201);
    report = await response.json();
    assert.equal(report.location.source, 'image-exif');
    assert.equal(createdReports.length, 2);
    assert.equal(mediaRows.length, 6);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
  console.log('PASS: polygon geometry, real JPEG GPS, all 3 photos, legacy circle, enforcement off, saved revisions/conflicts, admin/resident authorization, read-only resident boundary, multipart/direct uploads, and device-location independence. No database or storage writes.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
