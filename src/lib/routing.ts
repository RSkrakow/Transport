// ============================================================
// TruckCalc HBM — Routing & Toll Engine
// OpenRouteService API (HGV profile) + Nominatim geocoding
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

// ─── ISO 3166-1 numeric → ISO-2 mapping (European countries) ───
const ISO_NUMERIC_TO_2: Record<number, string> = {
  40:  "AT", // Austria
  56:  "BE", // Belgia
  100: "BG", // Bułgaria
  191: "HR", // Chorwacja
  203: "CZ", // Czechy
  208: "DK", // Dania
  250: "FR", // Francja
  276: "DE", // Niemcy
  300: "GR", // Grecja
  348: "HU", // Węgry
  380: "IT", // Włochy
  442: "LU", // Luksemburg
  528: "NL", // Holandia
  616: "PL", // Polska
  620: "PT", // Portugalia
  642: "RO", // Rumunia
  703: "SK", // Słowacja
  705: "SI", // Słowenia
  724: "ES", // Hiszpania
  752: "SE", // Szwecja
  756: "CH", // Szwajcaria
  826: "GB", // Wielka Brytania
  804: "UA", // Ukraina
  112: "BY", // Białoruś
};

const COUNTRY_NAMES: Record<string, string> = {
  AT: "Austria", BE: "Belgia", BG: "Bułgaria", HR: "Chorwacja",
  CZ: "Czechy", DK: "Dania", FR: "Francja", DE: "Niemcy",
  GR: "Grecja", HU: "Węgry", IT: "Włochy", LU: "Luksemburg",
  NL: "Holandia", PL: "Polska", PT: "Portugalia", RO: "Rumunia",
  SK: "Słowacja", SI: "Słowenia", ES: "Hiszpania", SE: "Szwecja",
  CH: "Szwajcaria", GB: "Wlk. Brytania", UA: "Ukraina", BY: "Białoruś",
};

// Toll matrix EUR/100km (matches calculator.ts TOLL_MATRIX)
const TOLL_MATRIX: Record<string, number> = {
  PL:  4.20, DE: 18.50, FR: 20.00, IT: 22.50, ES: 10.50,
  AT: 16.20, CZ:  8.00, HU:  6.50, NL: 12.00, BE: 13.50,
  LU:  9.00, CH: 32.00, SI: 15.00, HR: 14.00, SK:  8.50,
  RO:  5.50, BG:  4.00, PT: 14.00, SE: 10.00, DK: 11.00,
  GB: 10.00, UA:  3.00, BY:  2.50, GR:  9.00,
};

// ─── Geocoding via Nominatim ─────────────────────────────────
export async function geocodeCity(city: string): Promise<GeoPoint | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1&addressdetails=0`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "TruckCalc-HBM/1.0 (hbm-audyt.pl)" },
      next: { revalidate: 86400 }, // cache 24h
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

// ─── ORS HGV routing with country info ──────────────────────
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

    // Extract country breakdown from extras
    const countryInfo = route.extras?.countryinfo;
    const summary: Array<{ value: number; distance: number }> = countryInfo?.summary ?? [];

    const countries: CountrySegment[] = summary
      .map((seg) => {
        const iso2 = ISO_NUMERIC_TO_2[seg.value] ?? null;
        if (!iso2) return null;
        const distKm     = Math.round(seg.distance * 10) / 10;
        const tollPer100 = TOLL_MATRIX[iso2] ?? 8.0;
        return {
          iso2,
          name:           COUNTRY_NAMES[iso2] ?? iso2,
          distanceKm:     distKm,
          tollEurPer100km: tollPer100,
          tollEur:        Math.round((tollPer100 / 100) * distKm * 100) / 100,
        } as CountrySegment;
      })
      .filter((s): s is CountrySegment => s !== null)
      .sort((a, b) => b.distanceKm - a.distanceKm);

    const totalTollEur = Math.round(
      countries.reduce((s, c) => s + c.tollEur, 0) * 100
    ) / 100;

    return { distanceKm, durationH, countries, totalTollEur, source: "ors" };

  } catch (e) {
    return fallbackEstimate(from, to, String(e));
  }
}

// ─── Fallback: straight-line estimate if ORS unavailable ────
function fallbackEstimate(
  from: GeoPoint,
  to: GeoPoint,
  error: string
): RouteResult {
  const R = 6371;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLon = ((to.lon - from.lon) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((from.lat * Math.PI) / 180) *
      Math.cos((to.lat * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const straightKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceKm = Math.round(straightKm * 1.3 * 10) / 10; // road factor 1.3

  return {
    distanceKm,
    durationH: distanceKm / 80,
    countries: [],
    totalTollEur: 0,
    source: "estimate",
    error,
  };
}
