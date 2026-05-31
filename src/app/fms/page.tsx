"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface VehicleStat {
  vehicle_reg: string;
  total_km: number;
  avg_l100km: number;
  total_idle_l: number;
  total_fuel_l: number;
  idle_pct: number;
  days: number;
}

interface DriverStat {
  driver_name: string;
  total_km: number;
  avg_l100km: number;
  idle_pct: number;
  vehicles: number;
}

type SortKey = "avg_l100km" | "idle_pct" | "total_km";
type Tab = "vehicles" | "drivers";

export default function FmsPage() {
  const [vehicleStats, setVehicleStats] = useState<VehicleStat[]>([]);
  const [driverStats, setDriverStats] = useState<DriverStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("vehicles");
  const [sortKey, setSortKey] = useState<SortKey>("avg_l100km");
  const [sortDesc, setSortDesc] = useState(true);
  const [monthFilter, setMonthFilter] = useState<string>("all");

  useEffect(() => {
    loadData();
  }, [monthFilter]);

  async function loadData() {
    setLoading(true);

    let query = supabase
      .from("fuel_consumption")
      .select("vehicle_reg, driver_name, month, drive_km, drive_fuel_l, idle_fuel_l, total_fuel_l, report_date");

    if (monthFilter !== "all") {
      query = query.eq("month", parseInt(monthFilter));
    }

    const { data, error } = await query;
    if (error || !data) { setLoading(false); return; }

    // Aggregate per vehicle
    const vMap: Record<string, { km: number; fuel: number; idle: number; total: number; days: number }> = {};
    const dMap: Record<string, { km: number; fuel: number; idle: number; vehs: Set<string> }> = {};

    for (const r of data) {
      const veh = r.vehicle_reg;
      const drv = r.driver_name ?? "Nieznany";
      const km = Number(r.drive_km ?? 0);
      const fuel = Number(r.drive_fuel_l ?? 0);
      const idle = Number(r.idle_fuel_l ?? 0);
      const total = Number(r.total_fuel_l ?? 0);

      if (!vMap[veh]) vMap[veh] = { km: 0, fuel: 0, idle: 0, total: 0, days: 0 };
      vMap[veh].km += km;
      vMap[veh].fuel += fuel;
      vMap[veh].idle += idle;
      vMap[veh].total += total;
      vMap[veh].days++;

      if (!dMap[drv]) dMap[drv] = { km: 0, fuel: 0, idle: 0, vehs: new Set() };
      dMap[drv].km += km;
      dMap[drv].fuel += fuel;
      dMap[drv].idle += idle;
      dMap[drv].vehs.add(veh);
    }

    const vs: VehicleStat[] = Object.entries(vMap)
      .filter(([, s]) => s.km > 100)
      .map(([reg, s]) => ({
        vehicle_reg: reg,
        total_km: Math.round(s.km),
        avg_l100km: s.km > 0 ? Math.round((s.fuel / s.km) * 100 * 100) / 100 : 0,
        total_idle_l: Math.round(s.idle * 10) / 10,
        total_fuel_l: Math.round(s.total * 10) / 10,
        idle_pct: s.total > 0 ? Math.round((s.idle / s.total) * 100 * 10) / 10 : 0,
        days: s.days,
      }));

    const ds: DriverStat[] = Object.entries(dMap)
      .filter(([, s]) => s.km > 100)
      .map(([name, s]) => ({
        driver_name: name,
        total_km: Math.round(s.km),
        avg_l100km: s.km > 0 ? Math.round((s.fuel / s.km) * 100 * 100) / 100 : 0,
        idle_pct: (s.fuel + s.idle) > 0 ? Math.round((s.idle / (s.fuel + s.idle)) * 100 * 10) / 10 : 0,
        vehicles: s.vehs.size,
      }));

    setVehicleStats(vs);
    setDriverStats(ds);
    setLoading(false);
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDesc(!sortDesc);
    else { setSortKey(key); setSortDesc(true); }
  }

  function sortedVehicles() {
    return [...vehicleStats].sort((a, b) =>
      sortDesc ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]
    );
  }

  function sortedDrivers() {
    return [...driverStats].sort((a, b) =>
      sortDesc ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]
    );
  }

  function fuelColor(l100: number) {
    if (l100 >= 33) return "text-red-600 font-bold";
    if (l100 >= 30) return "text-amber-600 font-semibold";
    return "text-emerald-700";
  }

  function idleColor(pct: number) {
    if (pct >= 5) return "text-red-600 font-bold";
    if (pct >= 3) return "text-amber-600";
    return "text-slate-600";
  }

  // Fleet summary
  const fleetAvg = vehicleStats.length > 0
    ? Math.round(vehicleStats.reduce((s, v) => s + v.avg_l100km, 0) / vehicleStats.length * 100) / 100
    : 0;
  const totalKm = vehicleStats.reduce((s, v) => s + v.total_km, 0);
  const totalIdle = vehicleStats.reduce((s, v) => s + v.total_idle_l, 0);
  const fleetIdlePct = vehicleStats.length > 0
    ? Math.round(vehicleStats.reduce((s, v) => s + v.idle_pct, 0) / vehicleStats.length * 10) / 10
    : 0;

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (sortDesc ? <span className="ml-1">↓</span> : <span className="ml-1">↑</span>) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Analiza FMS — Trimble</h1>
        <p className="text-sm text-slate-500 mt-1">
          Zużycie paliwa per pojazd i kierowca z systemu telematycznego
        </p>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-slate-600">Miesiąc:</label>
        <select
          className="input-field max-w-xs"
          value={monthFilter}
          onChange={e => setMonthFilter(e.target.value)}
        >
          <option value="all">Wszystkie</option>
          <option value="1">Styczeń</option>
          <option value="2">Luty</option>
          <option value="3">Marzec</option>
          <option value="4">Kwiecień</option>
          <option value="5">Maj</option>
        </select>
      </div>

      {/* KPI cards */}
      {!loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Pojazdów</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">{vehicleStats.length}</p>
          </div>
          <div className="card">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Łączne km</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">{(totalKm / 1000).toFixed(0)}k</p>
          </div>
          <div className="card">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Śr. spalanie</p>
            <p className={`text-3xl font-bold mt-1 ${fuelColor(fleetAvg)}`}>{fleetAvg} l/100</p>
          </div>
          <div className="card">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Bieg jałowy</p>
            <p className={`text-3xl font-bold mt-1 ${idleColor(fleetIdlePct)}`}>{fleetIdlePct}%</p>
            <p className="text-xs text-slate-400 mt-0.5">{totalIdle.toFixed(0)} l zmarnowane</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-200">
        {(["vehicles", "drivers"] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t === "vehicles" ? `Pojazdy (${vehicleStats.length})` : `Kierowcy (${driverStats.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-blue-600 text-sm py-8">
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          Ładuję dane FMS…
        </div>
      ) : tab === "vehicles" ? (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Pojazd</th>
                <th
                  className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-800"
                  onClick={() => toggleSort("total_km")}
                >
                  Km <SortIcon k="total_km" />
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-800"
                  onClick={() => toggleSort("avg_l100km")}
                >
                  Spalanie l/100 <SortIcon k="avg_l100km" />
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-800"
                  onClick={() => toggleSort("idle_pct")}
                >
                  Bieg jałowy % <SortIcon k="idle_pct" />
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">
                  Jałowy (l)
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Dni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedVehicles().map(v => (
                <tr key={v.vehicle_reg} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">{v.vehicle_reg}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{v.total_km.toLocaleString("pl-PL")}</td>
                  <td className={`px-4 py-2.5 text-right ${fuelColor(v.avg_l100km)}`}>{v.avg_l100km}</td>
                  <td className={`px-4 py-2.5 text-right ${idleColor(v.idle_pct)}`}>{v.idle_pct}%</td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{v.total_idle_l}</td>
                  <td className="px-4 py-2.5 text-right text-slate-400">{v.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Kierowca</th>
                <th
                  className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-800"
                  onClick={() => toggleSort("total_km")}
                >
                  Km <SortIcon k="total_km" />
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-800"
                  onClick={() => toggleSort("avg_l100km")}
                >
                  Spalanie l/100 <SortIcon k="avg_l100km" />
                </th>
                <th
                  className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-800"
                  onClick={() => toggleSort("idle_pct")}
                >
                  Bieg jałowy % <SortIcon k="idle_pct" />
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Pojazdów</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedDrivers().map(d => (
                <tr key={d.driver_name} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-semibold text-slate-800">{d.driver_name}</td>
                  <td className="px-4 py-2.5 text-right text-slate-600">{d.total_km.toLocaleString("pl-PL")}</td>
                  <td className={`px-4 py-2.5 text-right ${fuelColor(d.avg_l100km)}`}>{d.avg_l100km}</td>
                  <td className={`px-4 py-2.5 text-right ${idleColor(d.idle_pct)}`}>{d.idle_pct}%</td>
                  <td className="px-4 py-2.5 text-right text-slate-400">{d.vehicles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && vehicleStats.length === 0 && (
        <div className="card text-center py-12">
          <p className="text-slate-400 text-sm">Brak danych FMS. Wgraj plik Trimble przez panel importu.</p>
        </div>
      )}
    </div>
  );
}
