import { NextRequest, NextResponse } from "next/server";
import { geocodeCity, calculateRoute } from "@/lib/routing";

export async function POST(req: NextRequest) {
  try {
    const { from, to } = await req.json();
    if (!from || !to) {
      return NextResponse.json({ error: "Podaj from i to" }, { status: 400 });
    }

    const apiKey = process.env.ORS_API_KEY ?? "";

    // Geocode both cities
    const [fromGeo, toGeo] = await Promise.all([
      geocodeCity(from),
      geocodeCity(to),
    ]);

    if (!fromGeo) return NextResponse.json({ error: `Nie znaleziono miasta: ${from}` }, { status: 400 });
    if (!toGeo)   return NextResponse.json({ error: `Nie znaleziono miasta: ${to}` }, { status: 400 });

    const result = await calculateRoute(fromGeo, toGeo, apiKey);

    return NextResponse.json({
      from: fromGeo.name,
      to:   toGeo.name,
      ...result,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
