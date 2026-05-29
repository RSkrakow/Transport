import { NextResponse } from "next/server";
import { calculateRoute, type RouteInput } from "@/lib/calculator";
import { createServiceClient } from "@/lib/supabase";

export async function POST(req: Request) {
  try {
    const body: RouteInput = await req.json();

    // Validate
    if (!body.originCountry || !body.destCountry || !body.distanceKm) {
      return NextResponse.json({ error: "Brakuje wymaganych pól" }, { status: 400 });
    }
    if (body.distanceKm < 1 || body.distanceKm > 10_000) {
      return NextResponse.json({ error: "Nieprawidłowa odległość (1–10000 km)" }, { status: 400 });
    }

    // Optionally fetch vehicle data from Supabase
    let avgFuelL100 = body.avgFuelL100;
    let leasingEurMo = body.leasingEurMo;
    let vehicleYearProduced = body.vehicleYearProduced;

    if (body.vehicleReg && !avgFuelL100) {
      const supabase = createServiceClient();
      const { data: vehicle } = await supabase
        .from("vehicles")
        .select("avg_fuel_l100, leasing_eur_mo, year_produced")
        .eq("reg", body.vehicleReg)
        .single();

      if (vehicle) {
        avgFuelL100 = vehicle.avg_fuel_l100 ?? undefined;
        leasingEurMo = vehicle.leasing_eur_mo ?? undefined;
        vehicleYearProduced = vehicle.year_produced ?? undefined;
      }
    }

    const result = calculateRoute({
      ...body,
      avgFuelL100,
      leasingEurMo,
      vehicleYearProduced,
    });

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
