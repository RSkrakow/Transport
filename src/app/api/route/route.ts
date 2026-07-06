import { NextRequest, NextResponse } from "next/server";
import { geocodeCity, calculateRoute } from "@/lib/routing";

export async function POST(req: NextRequest) {
  try {
    const { from, to, via } = await req.json();
    if (!from || !to) {
      return NextResponse.json({ error: "Podaj from i to" }, { status: 400 });
    }

    const apiKey = process.env.ORS_API_KEY ?? "";

    // Geocode start, optional waypoint, end
    const geoPromises: Promise<Awaited<ReturnType<typeof geocodeCity>>>[] = [
      geocodeCity(from),
      ...(via?.trim() ? [geocodeCity(via.trim())] : []),
      geocodeCity(to),
    ];
    const geoResults = await Promise.all(geoPromises);

    const fromGeo = geoResults[0];
    const toGeo   = geoResults[geoResults.length - 1];
    const viaGeo  = via?.trim() ? geoResults[1] : null;

    if (!fromGeo) return NextResponse.json({ error: `Nie znaleziono miasta: ${from}` }, { status: 400 });
    if (!toGeo)   return NextResponse.json({ error: `Nie znaleziono miasta: ${to}` }, { status: 400 });
    if (via?.trim() && !viaGeo)
      return NextResponse.json({ error: `Nie znaleziono punktu pośredniego: ${via}` }, { status: 400 });

    const waypoints = viaGeo
      ? [fromGeo, viaGeo, toGeo]
      : [fromGeo, toGeo];

    const result = await calculateRoute(waypoints, apiKey);

    return NextResponse.json({
      from: fromGeo.name,
      via:  viaGeo?.name ?? null,
      to:   toGeo.name,
      ...result,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
