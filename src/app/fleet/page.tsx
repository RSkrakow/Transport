import { createServiceClient } from "@/lib/supabase";

export const revalidate = 0;

export default async function FleetPage() {
  const supabase = createServiceClient();
  const { data: vehicles } = await supabase
    .from("vehicles")
    .select("*")
    .eq("is_active", true)
    .order("reg");

  const fmt = (n: number | null) =>
    n != null ? n.toLocaleString("pl-PL") : "—";

  const ageClass = (km: number | null) => {
    if (!km) return "";
    if (km >= 900_000) return "bg-red-50 text-red-700";
    if (km >= 700_000) return "bg-amber-50 text-amber-700";
    return "";
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Flota pojazdów</h1>
        <p className="text-slate-500 text-sm mt-1">
          {vehicles?.length ?? 0} aktywnych ciągników
          &nbsp;·&nbsp;
          <span className="text-red-600 font-medium">Czerwony = &gt;900k km</span>
          &nbsp;·&nbsp;
          <span className="text-amber-600 font-medium">Żółty = &gt;700k km</span>
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              {["Rejestracja", "Marka", "Model", "Rok", "Licznik (km)", "Spalanie l/100km", "Leasing EUR/mies."].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3 pr-4">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(vehicles ?? []).map(v => (
              <tr key={v.id} className={`border-b border-slate-100 ${ageClass(v.odometer_km)}`}>
                <td className="py-2.5 pr-4 font-mono font-semibold">{v.reg}</td>
                <td className="py-2.5 pr-4">{v.brand ?? "—"}</td>
                <td className="py-2.5 pr-4">{v.model ?? "—"}</td>
                <td className="py-2.5 pr-4">{v.year_produced ?? "—"}</td>
                <td className="py-2.5 pr-4 font-medium">
                  {v.odometer_km ? fmt(v.odometer_km) : "—"}
                  {v.odometer_km && v.odometer_km >= 900_000 && (
                    <span className="ml-1 text-xs font-bold">⚠</span>
                  )}
                </td>
                <td className="py-2.5 pr-4">
                  {v.avg_fuel_l100 ? `${v.avg_fuel_l100} l` : "—"}
                </td>
                <td className="py-2.5">
                  {v.leasing_eur_mo ? `${fmt(v.leasing_eur_mo)} EUR` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
