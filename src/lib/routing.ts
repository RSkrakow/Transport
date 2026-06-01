// ============================================================
// TruckCalc HBM — Routing & Toll Engine
// OpenRouteService API (HGV profile) + Nominatim geocoding
// Country identification via Nominatim reverse geocode on
// midpoint of each country segment — no hardcoded ORS code map
// ============================================================

export interface GeoPoint {
  lat: number;
  lon: number;
  name: string;
}

export interface CountrySegment {
  iso2: string;
  name: string;
  distanceKm: number;
  tollEurPer100km: number;
  tollEur: number;
}

export interface RouteResult {
  distanceKm: number;
  durationH: number;
  countries: CountrySegment[];
  totalTollEur: number;
  source: "ors" | "estimate";
  error?: string;
}

const COUNTRY_NAMES: Record<string, string> = {
  AT: "Austria", BE: "Belgia", BG: "Bułgaria", HR: "Chorwacja",
  CZ: "Czechy", DK: "Dania", FR: "Francja", DE: "Niemcy",
  GR: "Grecja", HU: "Węgry", IT: "Włochy", LU: "Luksemburg",
  NL: "Holandia", PL: "Polska", PT: "Portugalia", RO: "Rumunia",
  SK: "Słowacja", SI: "Słowenia", ES: "Hiszpania", SE: "Szwecja",
  CH: "Szwajcaria", GB: "Wlk. Brytania", UA: "Ukraina", BY: "Białoruś",
};

const TOLL_MATRIX: Record<string, number> = {
  PL:  4.20, DE: 18.50, FR: 20.00, IT: 22.50, ES: 10.50,
  AT: 16.20, CZ:  8.00, HU:  6.50, NL: 12.00, BE: 13.50,
  LU:  9.00, CH: 32.00, SI: 15.00, HR: 14.00, SK:  8.50,
  RO:  5.50, BG:  4.00, PT: 14.00, SE: 10.00, DK: 11.00,
  GB: 10.00, UA:  3.00, BY:  2.50, GR:  9.00,
};

// ─── Nominatim forward geocoding ─────────────────────────────
export async function geocodeCity(city: string): Promise<GeoPoint | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1&addressdetails=0`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "TruckCalc-HBM/1.0 (hbm-audyt.pl)" },
      next: { revalidate: 86400 },
    });
    const data = await res.json();
    if (!data || data.length === 0) return null;
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      name: data[0].display_name.split(",")[0],
    };
  } catch {
    return null;
  }
}

// ─── Nominatim reverse geocoding → ISO-2 country ────────────
async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "TruckCalc-HBM/1.0 (hbm-audyt.pl)" },
      next: { revalidate: 86400 },
    });
    const data = await res.json();
    return data?.address?.country_code?.toUpperCase() ?? null;
  } catch {
    return null;
  }
}

// ─── ORS HGV routing with country breakdown ──────────────────
export async function calculateRoute(
  from: GeoPoint,
  to: GeoPoint,
  apiKey: string
): Promise<RouteResult> {
  const url = "https://api.openrouteservice.org/v2/directions/driving-hgv";

  const body = {
    coordinates: [
      [from.lon, from.lat],
      [to.lon,   to.lat],
    ],
    extra_info: ["countryinfo"],
    units: "km",
    instructions: false,
    geometry_format: "geojson",  // returns coordinates as [[lon,lat], ...]
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json, application/geo+json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      return fallbackEstimate(from, to, `ORS HTTP ${res.status}: ${err.slice(0, 120)}`);
    }

    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return fallbackEstimate(from, to, "Brak trasy w odpowiedzi ORS");

    const distanceKm = route.summary.distance;
    const durationH  = route.summary.duration / 3600;

    // Geometry: [[lon, lat], [lon, lat], ...]
    const coords: [number, number][] = route.geometry?.coordinates ?? [];

    // countryinfo.values: [[startIdx, endIdx, orsCode], ...]
    // countryinfo.summary: [{value: orsCode, distance: ?, amount: pct}, ...]
    const countryInfo = route.extras?.countryinfo;
    const values: Array<[number, number, number]> = countryInfo?.values ?? [];
    const summary: Array<{ value: number; amount: number }> = countryInfo?.summary ?? [];

    if (values.length === 0 || coords.length === 0) {
      return { distanceKm, durationH, countries: [], totalTollEur: 0, source: "ors" };
    }

    // Build map: orsCode → amount% (from summary)
    const amountByCode = new Map<number, number>();
    for (const s of summary) amountByCode.set(s.value, s.amount);

    // For each country segment, reverse-geocode the midpoint waypoint
    // Nominatim usage policy: max 1 req/s — we batch with small delay
    const segmentPromises = values.map(async ([startIdx, endIdx, orsCode]) => {
      const midIdx = Math.floor((startIdx + endIdx) / 2);
      const coord  = coords[Math.min(midIdx, coords.length - 1)];
      if (!coord) return null;

      const iso2 = await reverseGeocode(coord[1], coord[0]); // Nominatim: lat, lon
      if (!iso2) return null;

      const pct      = amountByCode.get(orsCode) ?? 0;
      const distKm   = Math.round((pct / 100) * distanceKm * 10) / 10;
      const toll100  = TOLL_MATRIX[iso2] ?? 8.0;

      return {
        iso2,
        name:            COUNTRY_NAMES[iso2] ?? iso2,
        distanceKm:      distKm,
        tollEurPer100km: toll100,
        tollEur:         Math.round((toll100 / 100) * distKm * 100) / 100,
        orsCode,
      };
    });

    // Nominatim policy: sequential with 300ms delay between calls
    const rawSegments: (CountrySegment & { orsCode: number } | null)[] = [];
    for (const p of segmentPromises) {
      rawSegments.push(await p);
      await new Promise(r => setTimeout(r, 350));
    }

    // Deduplicate by iso2 (same country may appear if route re-enters)
    const merged = new Map<string, CountrySegment>();
    for (const seg of rawSegments) {
      if (!seg) continue;
      const existing = merged.get(seg.iso2);
      if (existing) {
        existing.distanceKm   = Math.round((existing.distanceKm + seg.distanceKm) * 10) / 10;
        existing.tollEur      = Math.round((existing.tollEur    + seg.tollEur)    * 100) / 100;
      } else {
        merged.set(seg.iso2, { iso2: seg.iso2, name: seg.name, distanceKm: seg.distanceKm, tollEurPer100km: seg.tollEurPer100km, tollEur: seg.tollEur });
      }
    }

    const countries = Array.from(merged.values())
      .sort((a, b) => b.distanceKm - a.distanceKm);

    const totalTollEur = Math.round(
      countries.reduce((s, c) => s + c.tollEur, 0) * 100
    ) / 100;

    return { distanceKm, durationH, countries, totalTollEur, source: "ors" };

  } catch (e) {
    return fallbackEstimate(from, to, String(e));
  }
}

// ─── Fallback: straight-line × 1.3 if ORS unavailable ────────
function fallbackEstimate(from: GeoPoint, to: GeoPoint, error: string): RouteResult {
  const R = 6371;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((from.lat * Math.PI) / 180) *
      Math.cos((to.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const straightKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = Math.round(straightKm * 1.3 * 10) / 10;

  return {
    distanceKm,
    durationH: distanceKm / 80,
    countries: [],
    totalTollEur: 0,
    source: "estimate",
    error,
  };
}
