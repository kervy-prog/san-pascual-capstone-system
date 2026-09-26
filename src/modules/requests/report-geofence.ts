const barangayCenter = { latitude: 15.0178547, longitude: 120.0829188 };
const barangayRadiusMeters = 2000;

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