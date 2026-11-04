import { z } from "zod";

export const barangayCenter = { latitude: 15.0178547, longitude: 120.0829188 };
export const barangayRadiusMeters = 2000;
export type BoundaryPoint = { latitude: number; longitude: number };
const epsilon = 1e-10;

function cross(a: BoundaryPoint, b: BoundaryPoint, c: BoundaryPoint) {
  return (b.longitude - a.longitude) * (c.latitude - a.latitude)
    - (b.latitude - a.latitude) * (c.longitude - a.longitude);
}

function onSegment(point: BoundaryPoint, a: BoundaryPoint, b: BoundaryPoint) {
  return Math.abs(cross(a, b, point)) <= epsilon
    && point.latitude >= Math.min(a.latitude, b.latitude) - epsilon
    && point.latitude <= Math.max(a.latitude, b.latitude) + epsilon
    && point.longitude >= Math.min(a.longitude, b.longitude) - epsilon
    && point.longitude <= Math.max(a.longitude, b.longitude) + epsilon;
}

function intersects(a: BoundaryPoint, b: BoundaryPoint, c: BoundaryPoint, d: BoundaryPoint) {
  return (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0)
    || onSegment(a, c, d) || onSegment(b, c, d) || onSegment(c, a, b) || onSegment(d, a, b);
}

export const boundarySchema = z.array(z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
}).strict()).min(3, "Add at least 3 boundary points.").max(100, "Use no more than 100 boundary points.")
  .superRefine((points, context) => {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      area += (a.longitude - points[0].longitude) * (b.latitude - points[0].latitude)
        - (b.longitude - points[0].longitude) * (a.latitude - points[0].latitude);
      if (points.slice(i + 1).some((point) => point.latitude === a.latitude && point.longitude === a.longitude)) {
        context.addIssue({ code: "custom", message: "Boundary points must be distinct." });
        return;
      }
      for (let j = i + 1; j < points.length; j++) {
        if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
        if (intersects(a, b, points[j], points[(j + 1) % points.length])) {
          context.addIssue({ code: "custom", message: "Boundary lines must not cross or touch each other." });
          return;
        }
      }
      if (Math.abs(cross(points[(i + points.length - 1) % points.length], a, b)) <= epsilon) {
        context.addIssue({ code: "custom", message: "Remove points that lie on a straight boundary line." });
        return;
      }
    }
    if (Math.abs(area) <= epsilon) context.addIssue({ code: "custom", message: "Draw a boundary enclosing an area." });
  });

export function isInsideBoundary(point: BoundaryPoint, boundary: BoundaryPoint[]) {
  let inside = false;
  for (let i = 0, j = boundary.length - 1; i < boundary.length; j = i++) {
    const a = boundary[j];
    const b = boundary[i];
    if (onSegment(point, a, b)) return true;
    if ((a.latitude > point.latitude) !== (b.latitude > point.latitude)
      && point.longitude < (b.longitude - a.longitude) * (point.latitude - a.latitude)
        / (b.latitude - a.latitude) + a.longitude) inside = !inside;
  }
  return inside;
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}

export function isWithinSanPascualVicinity(latitude: number, longitude: number) {
  const earthRadiusMeters = 6371000;
  const latitudeDelta = toRadians(latitude - barangayCenter.latitude);
  const longitudeDelta = toRadians(longitude - barangayCenter.longitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(barangayCenter.latitude))
      * Math.cos(toRadians(latitude))
      * Math.sin(longitudeDelta / 2) ** 2;
  const distanceMeters = 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));

  return distanceMeters <= barangayRadiusMeters;
}