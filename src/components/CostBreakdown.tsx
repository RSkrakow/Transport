"use client";

import { type CostBreakdown as CB } from "@/lib/calculator";

interface Props {
  result: CB;
  freightEur: number;
  distanceKm: number;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}

function profitabilityLabel(marginPct: number) {
  if (marginPct >= 15) return { label: "Rentowna (Dobra marża)", color: "emerald" };
  if (marginPct >= 5)  return { label: "Niska marża", color: "amber" };
  if (marginPct >= 0)  return { label: "Na granicy progu", color: "orange" };
  return { label: "Deficytowa (Strata)", color: "red" };
}

const fmt = (n: number) =>
  n.toLocaleString("pl-PL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtEur = (n: number) => `${fmt(n)} EUR`;

export default function CostBreakdown({
  result, freightEur, distanceKm, onSave, saving, saved,
}: Props) {
  const { label, color } = profitabilityLabel(result.marginPct);

  const costItems = [
    { name: "Paliwo ON",      value: result.fuel,           icon: "⛽" },
    { name: "AdBlue",         value: result.adblue,         icon: "💧" },
    { name: "Bieg jałowy",    value: result.idle,           icon: "🔄" },
    { name: "Autostrady",     value: result.toll,           icon: "🛣️" },
    { name: "Kierowca",       value: result.driver,         icon: "👤" },
    { name: "Serwis",         value: result.service,        icon: "🔧" },
    { name: "Leasing cią.",   value: result.leasing,        icon: "💳" },
    { name: "Leasing nacz.",  value: result.trailerLeasing, icon: "🚛" },
    { name: "Ubezpieczenie",  value: result.insurance,      icon: "🛡️" },
    { name: "Koszty ogólne",  value: result.overhead,       icon: "🏛️" },
  ];

  const marginColorClass =
    color === "emerald" ? "text-emerald-600 bg-emerald-50 border-emerald-200" :
    color === "amber"   ? "text-amber-600 bg-amber-50 border-amber-200" :
    color === "orange"  ? "text-orange-600 bg-orange-50 border-orange-200" :
    "text-red-600 bg-red-50 border-red-200";

  return (
    <div className="space-y-4">
      {/* ── Margin banner ── */}
      <div className={`rounded-xl p-5 border flex items-center justify-between ${marginColorClass}`}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{label}</p>
          <p className="text-3xl font-bold mt-1 font-mono">{fmtEur(result.marginEur)}</p>
          <p className="text-xs opacity-75 mt-0.5">
            Marża: <strong className="font-mono">{result.marginPct}%</strong> | Min. fracht: <strong className="font-mono">{fmtEur(result.minProfitableFreight)}</strong>
          </p>
        </div>
        <button
          onClick={onSave}
          disabled={saving || saved}
          className="bg-white border border-slate-200 shadow-sm px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50"
        >
          {saved ? "✓ Zapisano" : saving ? "Zapisywanie..." : "💾 Zapisz kalkulację"}
        </button>
      </div>

      {/* ── Summary statistics grid ── */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
          <p className="text-xs text-slate-400">Koszt / km</p>
          <p className="text-lg font-bold text-slate-800 font-mono mt-0.5">{result.costPerKm.toFixed(2)} EUR</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
          <p className="text-xs text-slate-400">Przychód / km</p>
          <p className="text-lg font-bold text-blue-700 font-mono mt-0.5">{result.revenuePerKm.toFixed(2)} EUR</p>
        </div>
        <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-sm">
          <p className="text-xs text-slate-400">Doby trasy</p>
          <p className="text-lg font-bold text-slate-800 font-mono mt-0.5">{result.routeDays} dni</p>
        </div>
      </div>

      {/* ── Cost breakdown table ── */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-slate-800 flex items-center justify-between">
          <span>📊 Rozbicie kosztów trasy</span>
          <span className="text-xs text-slate-400 font-mono">Suma: {fmtEur(result.total)}</span>
        </h3>

        <div className="space-y-2">
          {costItems.map(item => {
            const pct = result.total > 0 ? ((item.value / result.total) * 100).toFixed(1) : "0";
            return (
              <div key={item.name} className="flex items-center justify-between text-xs py-1 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-2">
                  <span className="w-3 text-center">{item.icon}</span>
                  <span className="font-medium text-slate-700">{item.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-slate-400 font-mono text-[11px] w-12 text-right">{pct}%</span>
                  <span className="font-mono font-semibold text-slate-800 w-20 text-right">{fmtEur(item.value)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
