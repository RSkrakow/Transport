"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabase";

interface Vehicle {
  id: number;
  reg: string;
  brand: string | null;
  model: string | null;
  year_produced: number | null;
  odometer_km: number | null;
  avg_fuel_l100: number | null;
  leasing_eur_mo: number | null;
  is_active: boolean;
}

type SortKey = keyof Pick<Vehicle, "reg" | "brand" | "year_produced" | "odometer_km" | "avg_fuel_l100" | "leasing_eur_mo">;

const fmt = (n: number | null) => n != null ? n.toLocaleString("pl-PL") : "—";

export default function FleetPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [filterBrand, setFilterBrand] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [filterOdo, setFilterOdo] = useState("all");
  const [filterLeasing, setFilterLeasing] = useState("all");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("reg");
  const [sortDesc, setSortDesc] = useState(false);

  useEffect(() => {
    supabase.from("vehicles").select("*").eq("is_active", true)
      .then(({ data }) => { setVehicles(data ?? []); setLoading(false); });
  }, []);

  const brands = useMemo(() =>
    ["all", ...Array.from(new Set(vehicles.map(v => v.brand ?? "—").filter(Boolean))).sort()],
    [vehicles]);

  const years = useMemo(() =>
    ["all", ...Array.from(new Set(vehicles.map(v => v.year_produced?.toString() ?? "").filter(Boolean))).sort().reverse()],
    [vehicles]);

  const filtered = useMemo(() => {
    let list = [...vehicles];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(v =>
        v.reg.toLowerCase().includes(q) ||
        (v.brand ?? "").toLowerCase().includes(q) ||
        (v.model ?? "").toLowerCase().includes(q)
      );
    }
    if (filterBrand !== "all") list = list.filter(v => v.brand === filterBrand);
    if (filterYear !== "all") list = list.filter(v => v.year_produced?.toString() === filterYear);
    if (filterOdo === "critical") list = list.filter(v => (v.odometer_km ?? 0) >= 900_000);
    if (filterOdo === "warn") list = list.filter(v => (v.odometer_km ?? 0) >= 700_000 && (v.odometer_km ?? 0) < 900_000);
    if (filterOdo === "ok") list = list.filter(v => (v.odometer_km ?? 0) < 700_000);
    if (filterLeasing === "yes") list = list.filter(v => v.leasing_eur_mo && v.leasing_eur_mo > 0);
    if (filterLeasing === "no") list = list.filter(v => !v.leasing_eur_mo || v.leasing_eur_mo === 0);

    list.sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") return sortDesc ? bv - av : av - bv;
      return sortDesc
        ? String(bv).localeCompare(String(av), "pl")
        : String(av).localeCompare(String(bv), "pl");
    });

    return list;
  }, [vehicles, search, filterBrand, filterYear, filterOdo, filterLeasing, sortKey, sortDesc]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc(d => !d);
    else { setSortKey(key); setSortDesc(false); }
  }

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? <span className="ml-1 text-blue-500">{sortDesc ? "↓" : "↑"}</span> : <span className="ml-1 text-slate-300">↕</span>;

  const odoColor = (km: number | null) => {
    if (!km) return "";
    if (km >= 900_000) return "bg-red-50";
    if (km >= 700_000) return "bg-amber-50";
    return "";
  };

  const odoBadge = (km: number | null) => {
    if (!km) return null;
    if (km >= 900_000) return <span className="ml-1.5 px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded">KRYT</span>;
    if (km >= 700_000) return <span className="ml-1.5 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold rounded">UWAGA</span>;
    return null;
  };

  const euroClass = (year: number | null) => {
    if (!year) return null;
    const cls = year >= 2014 ? 6 : year >= 2009 ? 5 : year >= 2006 ? 4 : 3;
    const color = cls >= 6 ? "bg-emerald-100 text-emerald-700" : cls === 5 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
    return <span className={`ml-1.5 px-1.5 py-0.5 ${color} text-[10px] font-bold rounded`}>E{cls}</span>;
  };

  const resetFilters = () => {
    setSearch(""); setFilterBrand("all"); setFilterYear("all");
    setFilterOdo("all"); setFilterLeasing("all");
  };
  const hasFilters = search || filterBrand !== "all" || filterYear !== "all" || filterOdo !== "all" || filterLeasing !== "all";

  // Stats
  const critical = vehicles.filter(v => (v.odometer_km ?? 0) >= 900_000).length;
  const warn = vehicles.filter(v => (v.odometer_km ?? 0) >= 700_000 && (v.odometer_km ?? 0) < 900_000).length;
  const withLeasing = vehicles.filter(v => v.leasing_eur_mo && v.leasing_eur_mo > 50).length;
  const avgFuel = vehicles.filter(v => v.avg_fuel_l100).length > 0
    ? (vehicles.reduce((s, v) => s + (v.avg_fuel_l100 ?? 0), 0) / vehicles.filter(v => v.avg_fuel_l100).length).toFixed(1)
    : "—";

  if (loading) return (
    <div className="flex items-center gap-2 text-blue-600 text-sm p-8">
      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      Ładowanie floty…
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Flota pojazdów</h1>
          <p className="text-slate-500 text-sm mt-1">
            {vehicles.length} aktywnych ciągników · wyświetlono {filtered.length}
          </p>
        </div>
      </div>

      {/* KPI mini */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card py-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Łącznie</p>
          <p className="text-2xl font-bold text-slate-800 mt-0.5">{vehicles.length}</p>
          <p className="text-xs text-slate-400">aktywnych ciągników</p>
        </div>
        <div className={`card py-3 ${critical > 0 ? "border-l-4 border-red-500" : ""}`}>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Krytyczne &gt;900k km</p>
          <p className={`text-2xl font-bold mt-0.5 ${critical > 0 ? "text-red-600" : "text-slate-800"}`}>{critical}</p>
          <p className="text-xs text-slate-400">wymiana w planie</p>
        </div>
        <div className={`card py-3 ${warn > 0 ? "border-l-4 border-amber-500" : ""}`}>
          <p className="text-xs text-slate-500 uppercase tracking-wide">Uwaga 700–900k km</p>
          <p className={`text-2xl font-bold mt-0.5 ${warn > 0 ? "text-amber-600" : "text-slate-800"}`}>{warn}</p>
          <p className="text-xs text-slate-400">obserwacja</p>
        </div>
        <div className="card py-3">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Śr. spalanie</p>
          <p className="text-2xl font-bold text-slate-800 mt-0.5">{avgFuel} <span className="text-sm font-normal">l/100km</span></p>
          <p className="text-xs text-slate-400">leasing: {withLeasing} pojazdów</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Search */}
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Szukaj</label>
            <input
              type="text"
              placeholder="Rejestracja, marka, model…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Brand */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Marka</label>
            <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              {brands.map(b => <option key={b} value={b}>{b === "all" ? "Wszystkie marki" : b}</option>)}
            </select>
          </div>

          {/* Year */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Rok prod.</label>
            <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              {years.map(y => <option key={y} value={y}>{y === "all" ? "Wszystkie lata" : y}</option>)}
            </select>
          </div>

          {/* Odometer */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Przebieg</label>
            <select value={filterOdo} onChange={e => setFilterOdo(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="all">Wszystkie</option>
              <option value="ok">Dobry (&lt;700k km)</option>
              <option value="warn">Uwaga (700–900k km)</option>
              <option value="critical">Krytyczny (&gt;900k km)</option>
            </select>
          </div>

          {/* Leasing */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide block mb-1">Leasing</label>
            <select value={filterLeasing} onChange={e => setFilterLeasing(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
              <option value="all">Wszystkie</option>
              <option value="yes">Z leasingiem</option>
              <option value="no">Bez leasingu</option>
            </select>
          </div>

          {/* Reset */}
          {hasFilters && (
            <button onClick={resetFilters}
              className="px-3 py-2 text-sm text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg hover:border-slate-400 transition-colors">
              ✕ Resetuj
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {([
                ["reg", "Rejestracja"],
                ["brand", "Marka / Model"],
                ["year_produced", "Rok"],
                ["odometer_km", "Licznik (km)"],
                ["avg_fuel_l100", "Spalanie"],
                ["leasing_eur_mo", "Leasing EUR/mies."],
              ] as [SortKey, string][]).map(([key, label]) => (
                <th key={key}
                  onClick={() => toggleSort(key)}
                  className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-800 select-none">
                  {label}<SortIcon k={key} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400 text-sm">Brak pojazdów spełniających kryteria</td></tr>
            ) : filtered.map(v => (
              <tr key={v.id} className={`hover:bg-slate-50 transition-colors ${odoColor(v.odometer_km)}`}>
                <td className="px-4 py-3 font-mono font-semibold text-slate-800">{v.reg}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{v.brand ?? "—"}</div>
                  <div className="text-xs text-slate-400">{v.model ?? ""}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-slate-700">{v.year_produced ?? "—"}</span>
                  {euroClass(v.year_produced)}
                </td>
                <td className="px-4 py-3">
                  <span className={`font-medium ${(v.odometer_km ?? 0) >= 900_000 ? "text-red-700" : (v.odometer_km ?? 0) >= 700_000 ? "text-amber-700" : "text-slate-700"}`}>
                    {v.odometer_km ? fmt(v.odometer_km) : "—"}
                  </span>
                  {odoBadge(v.odometer_km)}
                </td>
                <td className="px-4 py-3">
                  {v.avg_fuel_l100
                    ? <span className={`font-medium ${v.avg_fuel_l100 > 32 ? "text-red-600" : v.avg_fuel_l100 > 29 ? "text-amber-600" : "text-emerald-600"}`}>
                        {v.avg_fuel_l100} l/100
                      </span>
                    : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-3">
                  {v.leasing_eur_mo && v.leasing_eur_mo > 50
                    ? <span className="font-medium text-slate-700">{fmt(Math.round(v.leasing_eur_mo))} EUR</span>
                    : <span className="text-slate-400 text-xs">brak / spłacony</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length > 0 && (
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 text-xs text-slate-500 flex gap-6">
            <span>Pojazdów: <strong>{filtered.length}</strong></span>
            {filtered.some(v => v.avg_fuel_l100) && (
              <span>Śr. spalanie: <strong>
                {(filtered.filter(v=>v.avg_fuel_l100).reduce((s,v)=>s+(v.avg_fuel_l100??0),0) / filtered.filter(v=>v.avg_fuel_l100).length).toFixed(1)} l/100
              </strong></span>
            )}
            {filtered.some(v => v.leasing_eur_mo && v.leasing_eur_mo > 50) && (
              <span>Łączny leasing: <strong>
                {fmt(Math.round(filtered.reduce((s,v)=>s+(v.leasing_eur_mo&&v.leasing_eur_mo>50?v.leasing_eur_mo:0),0)))} EUR/mies.
              </strong></span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
