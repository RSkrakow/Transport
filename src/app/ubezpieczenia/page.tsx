"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface Policy {
  id: number;
  vehicle_reg: string;
  policy_number: string | null;
  insurance_type: string | null;
  is_archived: boolean;
  make: string | null;
  model: string | null;
  year_produced: number | null;
  policy_start: string | null;
  policy_end: string | null;
  cost_pln: number | null;
  vehicle_group: string | null;
  days_left: number;
}

type FilterType = "all" | "OC" | "AC" | "NNW";

export default function UbezpieczeniaPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [alertDays, setAlertDays] = useState(90);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const { data, error } = await supabase
      .from("insurance_policies")
      .select("*")
      .order("policy_end", { ascending: true });

    if (error || !data) { setLoading(false); return; }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const enriched: Policy[] = data.map((p) => {
      const endDate = p.policy_end ? new Date(p.policy_end) : null;
      const daysLeft = endDate
        ? Math.ceil((endDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
        : 9999;
      return { ...p, days_left: daysLeft };
    });

    setPolicies(enriched);
    setLoading(false);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const filtered = policies.filter((p) => {
    if (!showArchived && p.is_archived) return false;
    if (filter !== "all" && p.insurance_type !== filter) return false;
    return true;
  });

  const alerts = filtered.filter((p) => !p.is_archived && p.days_left >= 0 && p.days_left <= alertDays);
  const expired = filtered.filter((p) => !p.is_archived && p.days_left < 0);

  function urgencyColor(days: number) {
    if (days < 0) return "bg-red-100 text-red-800 border-red-200";
    if (days <= 30) return "bg-red-50 text-red-700 border-red-100";
    if (days <= 60) return "bg-amber-50 text-amber-700 border-amber-100";
    return "bg-yellow-50 text-yellow-700 border-yellow-100";
  }

  function badgeColor(typ: string | null) {
    if (typ === "OC") return "bg-blue-100 text-blue-700";
    if (typ === "AC") return "bg-purple-100 text-purple-700";
    if (typ === "NNW") return "bg-slate-100 text-slate-600";
    return "bg-gray-100 text-gray-600";
  }

  function daysLabel(days: number) {
    if (days < 0) return `Wygasło ${Math.abs(days)} dni temu`;
    if (days === 0) return "Wygasa DZIŚ";
    return `${days} dni`;
  }

  // Group alerts by vehicle
  const alertVehicles = Array.from(new Set(alerts.map((p) => p.vehicle_reg)));
  const expiredVehicles = Array.from(new Set(expired.map((p) => p.vehicle_reg)));

  // Total active policies
  const active = policies.filter((p) => !p.is_archived && p.days_left >= 0);
  const totalCost = active.reduce((s, p) => s + (p.cost_pln ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Rejestr Ubezpieczeń</h1>
          <p className="text-sm text-slate-500 mt-1">
            Polisy OC/AC/NNW — monitorowanie terminów wygaśnięcia
          </p>
        </div>
        <button
          onClick={loadData}
          className="text-xs text-blue-600 hover:text-blue-800 underline"
        >
          Odśwież
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-blue-600 text-sm py-8">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          Ładuję polisy…
        </div>
      ) : policies.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-slate-400 text-sm">
            Brak danych. Wgraj plik <strong>rejestr ubezpieczen.xls</strong> przez panel importu.
          </p>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Aktywnych polis</p>
              <p className="text-3xl font-bold text-slate-800 mt-1">{active.length}</p>
            </div>
            <div className={`card border ${expiredVehicles.length > 0 ? "border-red-200 bg-red-50" : ""}`}>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Wygasłe</p>
              <p className={`text-3xl font-bold mt-1 ${expiredVehicles.length > 0 ? "text-red-600" : "text-slate-800"}`}>
                {expiredVehicles.length}
              </p>
              <p className="text-xs text-slate-400">{expired.length} polis</p>
            </div>
            <div className={`card border ${alertVehicles.length > 0 ? "border-amber-200 bg-amber-50" : ""}`}>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Alerty ≤{alertDays}d</p>
              <p className={`text-3xl font-bold mt-1 ${alertVehicles.length > 0 ? "text-amber-600" : "text-slate-800"}`}>
                {alertVehicles.length}
              </p>
              <p className="text-xs text-slate-400">{alerts.length} polis</p>
            </div>
            <div className="card">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Koszt polis (PLN)</p>
              <p className="text-3xl font-bold text-slate-800 mt-1">
                {totalCost > 0 ? totalCost.toLocaleString("pl-PL", { maximumFractionDigits: 0 }) : "—"}
              </p>
            </div>
          </div>

          {/* Alert section */}
          {(expired.length > 0 || alerts.length > 0) && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="text-base font-semibold text-slate-700">⚠ Wymagające uwagi</h2>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500">Próg alertu (dni):</label>
                  <select
                    className="text-xs border border-slate-200 rounded px-2 py-1"
                    value={alertDays}
                    onChange={(e) => setAlertDays(Number(e.target.value))}
                  >
                    <option value={30}>30 dni</option>
                    <option value={60}>60 dni</option>
                    <option value={90}>90 dni</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                {[...expired, ...alerts]
                  .sort((a, b) => a.days_left - b.days_left)
                  .map((p) => (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between rounded-lg border px-4 py-3 ${urgencyColor(p.days_left)}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-sm">{p.vehicle_reg}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeColor(p.insurance_type)}`}>
                          {p.insurance_type}
                        </span>
                        <span className="text-sm">{p.make} {p.model}</span>
                        {p.policy_number && (
                          <span className="text-xs opacity-60">{p.policy_number}</span>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">{daysLabel(p.days_left)}</p>
                        <p className="text-xs opacity-70">{p.policy_end}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex gap-1">
              {(["all", "OC", "AC", "NNW"] as FilterType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    filter === t
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {t === "all" ? "Wszystkie" : t}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded"
              />
              Pokaż archiwalne
            </label>
            <span className="text-xs text-slate-400 ml-auto">{filtered.length} polis</span>
          </div>

          {/* Table */}
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Pojazd</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Typ</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Marka / Model</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Nr polisy</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Początku</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Końca</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Pozostało</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Koszt PLN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p) => (
                  <tr
                    key={p.id}
                    className={`hover:bg-slate-50 ${p.is_archived ? "opacity-40" : ""} ${
                      p.days_left < 0 ? "bg-red-50" : p.days_left <= 30 ? "bg-red-50/50" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">{p.vehicle_reg}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeColor(p.insurance_type)}`}>
                        {p.insurance_type}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{p.make} {p.model} {p.year_produced ? `(${p.year_produced})` : ""}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 font-mono">{p.policy_number ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500 text-xs">{p.policy_start ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right text-slate-700 text-xs font-medium">{p.policy_end ?? "—"}</td>
                    <td className={`px-4 py-2.5 text-right text-xs font-semibold ${
                      p.days_left < 0 ? "text-red-600" :
                      p.days_left <= 30 ? "text-red-500" :
                      p.days_left <= 60 ? "text-amber-600" :
                      p.days_left <= alertDays ? "text-yellow-600" : "text-slate-400"
                    }`}>
                      {daysLabel(p.days_left)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">
                      {p.cost_pln ? p.cost_pln.toLocaleString("pl-PL", { maximumFractionDigits: 0 }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
