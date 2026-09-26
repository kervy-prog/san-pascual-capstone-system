const nominatimUrl = "https://nominatim.openstreetmap.org/search";
const barangayContext = "San Pascual, San Narciso, Zambales, Philippines";

export async function geocodeReportedLandmark(landmark: string) {
  const query = `${landmark}, ${barangayContext}`;
  const url = new URL(nominatimUrl);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ph");

  const headers = { "User-Agent": "SanPascualConnect/1.0 contact@sanpascual.gov.ph" };
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error(`Geocoder returned HTTP ${response.status}`);

  const results = await response.json() as Array<{ lat?: string; lon?: string; display_name?: string; type?: string }>;
  const result = results[0];
  const landmarkWords = landmark.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  const displayName = result?.display_name?.toLowerCase() || "";
  const hasLandmarkMatch = landmarkWords.some((word) => displayName.includes(word));
  if (!hasLandmarkMatch || result?.type === "administrative") return undefined;
  const latitude = Number(result?.lat);
  const longitude = Number(result?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;

  return { latitude, longitude };
}

export async function geocodeBarangayCenter() {
  const url = new URL(nominatimUrl);
  url.searchParams.set("q", barangayContext);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ph");
  const response = await fetch(url, {
    headers: { "User-Agent": "SanPascualConnect/1.0 contact@sanpascual.gov.ph" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Geocoder returned HTTP ${response.status}`);
  const results = await response.json() as Array<{ lat?: string; lon?: string }>;
  const latitude = Number(results[0]?.lat);
  const longitude = Number(results[0]?.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  return { latitude, longitude };
}
