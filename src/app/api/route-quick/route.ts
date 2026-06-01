// Lightweight route verification endpoint for batch analysis
// Returns distance + toll estimate without per-country Nominatim reverse geocoding
import { NextRequest, NextResponse } from "next/server";
import { geocodeCity } from "@/lib/routing";

// Calibrated from real TMS fleet data 2025-2026 (DKV/viaTOLL invoices)
const TOLL_MATRIX: Record<string, number> = {
  PL: 13.00, DE: 30.00, FR: 30.00, IT: 27.00, ES: 14.00,
  AT: 22.00, CZ: 20.00, HU: 12.00, NL: 14.00, BE: 15.00,
  LU: 11.00, CH: 38.00, SI: 18.00, HR: 18.00, SK: 14.00,
  RO:  8.00, BG:  6.00, PT: 18.00, SE: 12.00, DK: 13.00,
  GB: 12.00, UA:  4.00, BY:  3.00, GR: 12.00,
};

function avgToll(countries: string[]): number {
  const rates = countries.map(c => TOLL_MATRIX[c.toUpperCase()] ?? 8.0);
  return rates.reduce((a, b) => a + b, 0) / rates.length;
}

export async function POST(req: NextRequest) {
  try {
    const { from, to, originCountry, destCountry } = await req.json();
    if (!from || !to) {
      return NextResponse.json({ error: "Podaj from i to" }, { status: 400 });
    }

    const apiKey = process.env.ORS_API_KEY ?? "";

    // Qualify city names with country to avoid Nominatim geocoding wrong city
    // e.g. "Levice, SK" instead of just "Levice" (could match a town in another country)
    const fromQuery = originCountry ? `${from}, ${originCountry}` : from;
    const toQuery   = destCountry   ? `${to}, ${destCountry}`     : to;

    // Sequential geocoding (Nominatim policy: max 1 req/sec)
    // Each call: primary (city+country), fallback (city only) if null
    const delay = () => new Promise(r => setTimeout(r, 1100));

    let fromGeo = await geocodeCity(fromQuery);
    if (!fromGeo && originCountry) {
      await delay();
      fromGeo = await geocodeCity(from);
    }

    await delay();

    let toGeo = await geocodeCity(toQuery);
    if (!toGeo && destCountry) {
      await delay();
      toGeo = await geocodeCity(to);
    }

    if (!fromGeo) {
      return NextResponse.json(
        { error: `Miasto nie znalezione w OSM: ${from}${originCountry ? ` (${originCountry})` : ""}` },
        { status: 400 }
      );
    }
    if (!toGeo) {
      return NextResponse.json(
        { error: `Miasto nie znalezione w OSM: ${to}${destCountry ? ` (${destCountry})` : ""}` },
        { status: 400 }
      );
    }

    const orsUrl = new URL("https://api.openrouteservice.org/v2/directions/driving-hgv");
    if (apiKey) orsUrl.searchParams.set("api_key", apiKey);

    const body = {
      coordinates: [[fromGeo.lon, fromGeo.lat], [toGeo.lon, toGeo.lat]],
      units: "km",
      instructions: false,
    };

    const res = await fetch(orsUrl.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: apiKey },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `ORS: ${err.slice(0, 100)}` }, { status: 502 });
    }

    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return NextResponse.json({ error: "Brak trasy ORS" }, { status: 502 });

    const distanceKm = Math.round(route.summary.distance * 10) / 10;
    const durationH  = Math.round((route.summary.duration / 3600) * 10) / 10;

    // Estimate toll using TMS countries (no Nominatim reverse geocoding needed)
    const countries = [originCountry, destCountry].filter(Boolean);
    const rate = avgToll(countries.length > 0 ? countries : ["PL", "DE"]);
    const tollEur = Math.round((rate / 100) * distanceKm * 100) / 100;

    return NextResponse.json({ distanceKm, durationH, tollEur });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
