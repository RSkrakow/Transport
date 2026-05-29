import { createServiceClient } from "@/lib/supabase";
import { countryName } from "@/lib/calculator";

export const revalidate = 0;

export default async function HistoryPage() {
  const supabase = createServiceClient();
  const { data: rows } = await supabase
    .from("route_calculations")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  const fmt = (n: number | null) =>
    n != null ? n.toLocaleString("pl-PL", { maximumFractionDigits: 0 }) : "—";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Historia kalkulacji</h1>
        <p className="text-slate-500 text-sm mt-1">
          Ostatnie {rows?.length ?? 0} zapisanych tras
        </p>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              {["Data", "Trasa", "Km", "Fracht EUR", "Koszt EUR", "Marża EUR", "Marża %", "Pojazd", "Uwagi"].map(h => (
                <th key={h} className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3 pr-4">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map(row => {
              const isProfit = (row.margin_eur ?? 0) >= 0;
              const marginPct = row.margin_pct ?? 0;
              const color =
                marginPct >= 15 ? "text-emerald-600" :
                marginPct >= 5  ? "text-amber-600"   :
                marginPct >= 0  ? "text-orange-600"  :
                "text-red-600";

              return (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 pr-4 text-slate-500 whitespace-nowrap">
                    {row.created_at ? new Date(row.created_at).toLocaleDateString("pl-PL") : "—"}
                  </td>
                  <td className="py-3 pr-4 font-medium whitespace-nowrap">
                    {countryName(row.origin_country)} → {countryName(row.dest_country)}
                  </td>
                  <td className="py-3 pr-4">{fmt(row.distance_km)}</td>
                  <td className="py-3 pr-4">{fmt(row.freight_eur)}</td>
                  <td className="py-3 pr-4">{fmt(row.cost_total)}</td>
                  <td className={`py-3 pr-4 font-semibold ${isProfit ? "text-emerald-600" : "text-red-600"}`}>
                    {(row.margin_eur ?? 0) >= 0 ? "+" : ""}{fmt(row.margin_eur)}
                  </td>
                  <td className={`py-3 pr-4 font-semibold ${color}`}>
                    {row.margin_pct?.toFixed(1) ?? "—"}%
                  </td>
                  <td className="py-3 pr-4 text-slate-500">{row.vehicle_reg ?? "—"}</td>
                  <td className="py-3 text-slate-400 text-xs">{row.notes ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!rows?.length && (
          <p className="text-slate-400 text-center py-12">
            Brak zapisanych kalkulacji. Oblicz pierwszą trasę i kliknij &ldquo;Zapisz kalkulację&rdquo;.
          </p>
        )}
      </div>
    </div>
  );
}
