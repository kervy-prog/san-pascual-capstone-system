import { gps } from "exifr";
import { z } from "zod";
import { isInsideBoundary, isWithinSanPascualVicinity, type BoundaryPoint } from "./report-geofence.js";

export class ReportPhotoLocationError extends Error {}

const gpsHelp = "Enable location tags in your camera settings and allow the camera to use location before taking the photo. Upload the original file, not a screenshot or a copy from a messaging app.";
const photoGpsSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

export async function validateReportPhotoLocations(
  files: { buffer: Buffer }[],
  enforceGeofence: boolean,
  boundary: BoundaryPoint[] | null,
  extractGps: (buffer: Buffer) => Promise<unknown> = gps,
) {
  if (files.length !== 3) throw new ReportPhotoLocationError("Upload exactly 3 photos before submitting your report.");
  let photoLocation: BoundaryPoint | undefined;
  for (const [index, file] of files.entries()) {
    let metadata: unknown;
    try {
      metadata = await extractGps(file.buffer);
    } catch (error) {
      console.warn(`Unable to read GPS metadata for report photo ${index + 1}:`, error instanceof Error ? error.message : "Invalid photo metadata");
    }
    const location = photoGpsSchema.safeParse(metadata);
    if (!location.success) {
      if (enforceGeofence) throw new ReportPhotoLocationError(`Photo ${index + 1} has no readable GPS location. ${gpsHelp}`);
      continue;
    }
    const point = location.data;
    if (enforceGeofence && !(boundary
      ? isInsideBoundary(point, boundary)
      : isWithinSanPascualVicinity(point.latitude, point.longitude))) {
      throw new ReportPhotoLocationError(`Photo ${index + 1} was taken outside the configured Barangay San Pascual vicinity. Upload photos taken inside the barangay. Your location when submitting does not affect this check.`);
    }
    photoLocation ??= point;
  }
  return photoLocation;
}
