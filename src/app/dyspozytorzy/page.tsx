"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { calculateRoute, FLEET } from "@/lib/calculator";

// ─── Types ────────────────────────────────────────────────────
interface Dispatcher {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
}

interface Vehicle {
  reg: string;
  brand: string | null;
  model: string | null;
  vehicle_type: string | null;
  dispatcher_id: string | null;
  avg_fuel_l100: number | null;
  year_produced: number | null;
  leasing_eur_mo: number | null;
  insurance_eur_mo: number | null;
  service_cost_km: number | null;
  avg_km_month: number | null;
}

interface RouteMetric {
  orderNr: string;
  vehicle: string;
  dispatcher_id: string | null;
  dispatcherName: string;
  originCountry: string;
  destCountry: string;
  distanceKm: number;
  frachtEur: number;
  totalCost: number;
  marginEur: number;
  marginPct: number;
  tollEur: number;
  label: string;
}

interface DispatcherKPI {
  id: string;
  name: string;
  vehicles: string[];
  ciagniki: string[];
  naczepy: string[];
  routes: number;
  frachtEur: number;
  costEur: number;
  marginEur: number;
  marginPct: number;
  kmTotal: number;
  losses: number;
  lowMargin: number;
  breakeven: number;
  profitable: number;
  avgMarginPct: number;
  routeList: RouteMetric[];
}

// ─── Helpers ──────────────────────────────────────────────────
function fmtEur(n: number) { return n.toLocaleString("pl-PL", { maximumFractionDigits: 0 }) + " €"; }
function fmtPct(n: number) { return n.toFixed(1) + "%"; }
function marginColor(pct: number) {
  if (pct >= 15) return "text-emerald-600";
  if (pct >= 5)  return "text-amber-600";
  if (pct >= 0)  return "text-orange-600";
  return "text-red-600";
}

function parseFracht(s: string, eurRate: number): number {
  if (!s) return 0;
  const str = String(s).replace(/\s/g, "");
  const m = str.match(/([\d,.]+)([A-Z]{3})/);
  if (!m) return 0;
  const num = parseFloat(m[1].replace(",", "."));
  if (isNaN(num)) return 0;
  return m[2] === "PLN" ? num / eurRate : num;
}

// ─── Main page ────────────────────────────────────────────────
export default function DyspozytorzyPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dispatchers, setDispatchers] = useState<Dispatcher[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [kpiData, setKpiData] = useState<DispatcherKPI[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"config" | "dashboard" | "routes">("dashboard");
  const [selectedDispatcher, setSelectedDispatcher] = useState<string | null>(null);
  const [weekLabel, setWeekLabel] = useState("");
  const [eurRate, setEurRate] = useState(4.27);
  const [fuelPrice, setFuelPrice] = useState(1.25);
  // Filters
  const [vehicleTypeFilter, setVehicleTypeFilter] = useState<"all" | "ciągnik" | "naczepa">("all");
  const [configTypeFilter, setConfigTypeFilter] = useState<"all" | "ciągnik" | "naczepa">("all");
  const [routeSearch, setRouteSearch] = useState("");

  // Config state
  const [newDispName, setNewDispName] = useState("");
  const [newDispEmail, setNewDispEmail] = useState("");
  const [assigningVehicle, setAssigningVehicle] = useState<string | null>(null);

  useEffect(() => {
    loadData();
    // Default week label
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    setWeekLabel(`${weekStart.toLocaleDateString("pl-PL")} – ${weekEnd.toLocaleDateString("pl-PL")}`);
  }, []);

  async function loadData() {
    setLoading(true);
    const [{ data: disps }, { data: vehs }] = await Promise.all([
      supabase.from("dispatchers").select("*").eq("is_active", true).order("name"),
      supabase.from("vehicles").select("reg,brand,model,vehicle_type,dispatcher_id,avg_fuel_l100,year_produced,leasing_eur_mo,insurance_eur_mo,service_cost_km,avg_km_month").eq("is_active", true).order("vehicle_type,reg"),
    ]);
    setDispatchers(disps ?? []);
    setVehicles(vehs ?? []);
    setLoading(false);
  }

  async function addDispatcher() {
    if (!newDispName.trim()) return;
    await supabase.from("dispatchers").insert({ name: newDispName.trim(), email: newDispEmail.trim() || null });
    setNewDispName(""); setNewDispEmail("");
    await loadData();
  }

  async function assignVehicle(reg: string, dispatcherId: string | null) {
    await supabase.from("vehicles").update({ dispatcher_id: dispatcherId }).eq("reg", reg);
    setAssigningVehicle(null);
    await loadData();
  }

  // ─── TMS Upload & Analysis ───────────────────────────────────
  async function handleTmsUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalysisLoading(true);

    const ab = await file.arrayBuffer();
    const wb = XLSX.read(ab, { type: "array", cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const all = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: "" }) as string[][];

    let hIdx = 0;
    for (let i = 0; i < Math.min(5, all.length); i++) {
      const j = all[i].join("|").toLowerCase();
      if (j.includes("nr") && j.includes("kraj")) { hIdx = i; break; }
    }
    const headers = all[hIdx].map(h => String(h).trim());
    function get(row: string[], ...keys: string[]): string {
      for (const key of keys) {
        const idx = headers.findIndex(h => h.toLowerCase().includes(key.toLowerCase()));
        if (idx >= 0 && row[idx]) return String(row[idx]).trim();
      }
      return "";
    }

    // Build maps
    const vehMap: Record<string, Vehicle> = {};
    for (const v of vehicles) vehMap[v.reg] = v;

    const dispMap: Record<string, string> = {};
    for (const v of vehicles) {
      if (v.dispatcher_id) dispMap[v.reg] = v.dispatcher_id;
    }
    const dispNameMap: Record<string, string> = {};
    for (const d of dispatchers) dispNameMap[d.id] = d.name;

    const metrics: RouteMetric[] = [];

    for (const row of all.slice(hIdx + 1)) {
      const orderNr = get(row, "Nr pełny", "Nr pe");
      if (!orderNr) continue;
      const distanceKm = parseFloat(get(row, "km ład", "Km") || "0");
      if (distanceKm < 10) continue;

      const frachtRaw = get(row, "fracht z wal", "fracht");
      const frachtEur = parseFracht(frachtRaw, eurRate);
      if (frachtEur === 0) continue;

      const vehicle = get(row, "ciągnik", "ciagnik", "pojazd").toUpperCase();
      const originCountry = get(row, "zał. kraj", "zal. kraj", "kraj za").toUpperCase() || "PL";
      const destCountry   = get(row, "roz. kraj", "kraj ro").toUpperCase() || "PL";

      const vData = vehMap[vehicle];
      const tmsTollPln = parseFloat(get(row, "myto na trasie pln") || "0");
      const tmsTollEur = tmsTollPln > 0 ? Math.round((tmsTollPln / eurRate) * 100) / 100 : 0;

      const bd = calculateRoute({
        originCountry, destCountry, distanceKm,
        fuelPriceEurL: fuelPrice, freightEur: frachtEur,
        transitCountries: [originCountry, destCountry],
        avgFuelL100: vData?.avg_fuel_l100 ?? FLEET.avgFuelL100,
        vehicleYearProduced: vData?.year_produced ?? undefined,
        leasingEurMo: vData?.leasing_eur_mo ?? undefined,
        insuranceEurMo: vData?.insurance_eur_mo ?? undefined,
        serviceCostKmOverride: vData?.service_cost_km ?? undefined,
        avgKmPerMonthActual: vData?.avg_km_month ?? undefined,
        overrideTollEur: tmsTollEur || undefined,
      });

      const disp_id = dispMap[vehicle] ?? null;
      metrics.push({
        orderNr, vehicle,
        dispatcher_id: disp_id,
        dispatcherName: disp_id ? (dispNameMap[disp_id] ?? "—") : "Nieprzypisany",
        originCountry, destCountry, distanceKm,
        frachtEur, totalCost: bd.total, marginEur: bd.marginEur,
        marginPct: bd.marginPct, tollEur: bd.toll,
        label: bd.marginPct >= 15 ? "Rentowna" : bd.marginPct >= 5 ? "Niska marża" : bd.marginPct >= 0 ? "Próg" : "STRATA",
      });
    }

    // Aggregate per dispatcher
    const grouped: Record<string, RouteMetric[]> = {};
    const UNASSIGNED = "__unassigned__";
    for (const m of metrics) {
      const key = m.dispatcher_id ?? UNASSIGNED;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    }

    const buildKpi = (d: {id: string; name: string}, routes: RouteMetric[], vehs: Vehicle[]) => {
      const frachtEur = routes.reduce((s, r) => s + r.frachtEur, 0);
      const costEur   = routes.reduce((s, r) => s + r.totalCost, 0);
      const marginEur = frachtEur - costEur;
      const marginPct = frachtEur > 0 ? (marginEur / frachtEur) * 100 : 0;
      return {
        id: d.id, name: d.name,
        vehicles: vehs.map(v => v.reg),
        ciagniki: vehs.filter(v => v.vehicle_type === "ciągnik").map(v => v.reg),
        naczepy:  vehs.filter(v => v.vehicle_type === "naczepa").map(v => v.reg),
        routes: routes.length, frachtEur, costEur, marginEur, marginPct,
        kmTotal: Math.round(routes.reduce((s, r) => s + r.distanceKm, 0)),
        losses:    routes.filter(r => r.marginPct < 0).length,
        lowMargin: routes.filter(r => r.marginPct >= 0 && r.marginPct < 5).length,
        breakeven: routes.filter(r => r.marginPct >= 5 && r.marginPct < 15).length,
        profitable: routes.filter(r => r.marginPct >= 15).length,
        avgMarginPct: routes.length > 0 ? routes.reduce((s,r) => s+r.marginPct,0)/routes.length : 0,
        routeList: routes,
      };
    };

    const kpis: DispatcherKPI[] = dispatchers.map(d => {
      const vehs = vehicles.filter(v => v.dispatcher_id === d.id);
      return buildKpi(d, grouped[d.id] ?? [], vehs);
    });

    // Add unassigned
    const unassigned = grouped[UNASSIGNED] ?? [];
    if (unassigned.length > 0) {
      const fr = unassigned.reduce((s,r)=>s+r.frachtEur,0);
      const co = unassigned.reduce((s,r)=>s+r.totalCost,0);
      kpis.push({
        id: UNASSIGNED, name: "⚠ Nieprzypisane", vehicles: [], ciagniki: [], naczepy: [],
        routes: unassigned.length, frachtEur: fr, costEur: co,
        marginEur: fr-co, marginPct: fr > 0 ? (fr-co)/fr*100 : 0,
        kmTotal: Math.round(unassigned.reduce((s,r)=>s+r.distanceKm,0)),
        losses: unassigned.filter(r=>r.marginPct<0).length,
        lowMargin: unassigned.filter(r=>r.marginPct>=0&&r.marginPct<5).length,
        breakeven: unassigned.filter(r=>r.marginPct>=5&&r.marginPct<15).length,
        profitable: unassigned.filter(r=>r.marginPct>=15).length,
        avgMarginPct: unassigned.length > 0 ? unassigned.reduce((s,r)=>s+r.marginPct,0)/unassigned.length : 0,
        routeList: unassigned,
      });
    }

    kpis.sort((a,b) => b.marginEur - a.marginEur);
    setKpiData(kpis);
    setActiveTab("dashboard");
    setAnalysisLoading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  // ─── Excel Export ─────────────────────────────────────────────
  function exportExcel() {
    const wb2 = XLSX.utils.book_new();

    // Summary sheet
    const summaryData = [
      ["RAPORT TYGODNIOWY HBM AUDYT — Wyniki Dyspozytorów"],
      [`Tydzień: ${weekLabel}`, "", "", `Kurs EUR/PLN: ${eurRate}`, `Paliwo: ${fuelPrice} EUR/l`],
      [],
      ["Dyspozytor", "Ciągniki", "Naczepy", "Trasy", "Fracht EUR", "Koszty HBM EUR", "Marża EUR", "Marża %",
       "Śr. marża %", "Km", "Straty", "Niska marża", "Rentowne"],
      ...kpiData.map(d => [
        d.name, d.ciagniki.length, d.naczepy.length, d.routes,
        Math.round(d.frachtEur), Math.round(d.costEur), Math.round(d.marginEur),
        +d.marginPct.toFixed(1), +d.avgMarginPct.toFixed(1), d.kmTotal,
        d.losses, d.lowMargin + d.breakeven, d.profitable,
      ]),
      [],
      ["SUMA FLOTY", "", kpiData.reduce((s,d)=>s+d.routes,0),
       Math.round(kpiData.reduce((s,d)=>s+d.frachtEur,0)),
       Math.round(kpiData.reduce((s,d)=>s+d.costEur,0)),
       Math.round(kpiData.reduce((s,d)=>s+d.marginEur,0)),
      ],
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData);
    ws1["!cols"] = [16,8,6,12,14,12,8,10,8,7,10,10].map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb2, ws1, "Podsumowanie");

    // Per-dispatcher sheets
    for (const d of kpiData) {
      if (d.routeList.length === 0) continue;
      const rows = [
        [`${d.name} — Trasy tygodnia ${weekLabel}`],
        [`Razem: ${d.routes} tras | Fracht: ${Math.round(d.frachtEur)} EUR | Marża: ${Math.round(d.marginEur)} EUR (${d.marginPct.toFixed(1)}%)`],
        [],
        ["Nr zlecenia", "Pojazd", "Trasa", "Km", "Fracht EUR", "Koszty HBM", "Marża EUR", "Marża %", "Status"],
        ...d.routeList.map(r => [
          r.orderNr, r.vehicle,
          `${r.originCountry} → ${r.destCountry}`,
          Math.round(r.distanceKm),
          Math.round(r.frachtEur), Math.round(r.totalCost), Math.round(r.marginEur),
          +r.marginPct.toFixed(1), r.label,
        ]),
      ];
      const wsD = XLSX.utils.aoa_to_sheet(rows);
      wsD["!cols"] = [16,10,12,7,10,12,10,8,12].map(w => ({ wch: w }));
      const sheetName = d.name.replace(/[^a-zA-Z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ ]/g, "").slice(0, 31);
      XLSX.utils.book_append_sheet(wb2, wsD, sheetName);
    }

    XLSX.writeFile(wb2, `Raport_Dyspozytorzy_${weekLabel.replace(/[^0-9\-]/g,"_")}.xlsx`);
  }

  const dispById = Object.fromEntries(dispatchers.map(d => [d.id, d]));
  const selectedKpi = kpiData.find(d => d.id === selectedDispatcher);
  const allRoutes = kpiData.flatMap(d => d.routeList);

  if (loading) return (
    <div className="flex items-center gap-2 text-blue-600 text-sm p-8">
      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      Ładowanie…
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dyspozytorzy — Rozliczenia tygodniowe</h1>
          <p className="text-slate-500 text-sm mt-1">{dispatchers.length} dyspozytorów · {vehicles.filter(v=>v.dispatcher_id).length}/{vehicles.length} pojazdów przypisanych</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>EUR/PLN:</span>
            <input type="number" value={eurRate} step="0.01" onChange={e=>setEurRate(+e.target.value)}
              className="w-16 px-2 py-1 border border-slate-200 rounded text-sm" />
            <span>Paliwo:</span>
            <input type="number" value={fuelPrice} step="0.01" onChange={e=>setFuelPrice(+e.target.value)}
              className="w-16 px-2 py-1 border border-slate-200 rounded text-sm" />
          </div>
          <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors
            ${analysisLoading ? "bg-slate-200 text-slate-500" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
            <span>⬆ Wczytaj TMS (tydzień)</span>
            <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleTmsUpload} disabled={analysisLoading} />
          </label>
          {kpiData.length > 0 && (
            <button onClick={exportExcel}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors">
              ⬇ Excel
            </button>
          )}
        </div>
      </div>

      {/* Week label */}
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500">Tydzień:</span>
        <input value={weekLabel} onChange={e=>setWeekLabel(e.target.value)}
          className="px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-64" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {([["dashboard","📊 Dashboard"], ["routes","📋 Trasy"], ["config","⚙ Konfiguracja"]] as [string,string][]).map(([t,l]) => (
          <button key={t} onClick={()=>setActiveTab(t as any)}
            className={`px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
              activeTab===t ? "border-blue-600 text-blue-600 bg-blue-50" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
            {l}
          </button>
        ))}
      </div>

      {/* ── Dashboard ── */}
      {activeTab === "dashboard" && (
        <div className="space-y-4">
          {/* Vehicle type filter */}
          {kpiData.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">Filtruj trasy wg pojazdu:</span>
              {(["all","ciągnik","naczepa"] as const).map(t => (
                <button key={t} onClick={() => setVehicleTypeFilter(t)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    vehicleTypeFilter === t
                      ? t === "ciągnik" ? "bg-blue-600 text-white"
                        : t === "naczepa" ? "bg-slate-600 text-white"
                        : "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {t === "all" ? "🚛+🚌 Wszystkie" : t === "ciągnik" ? "🚛 Ciągniki" : "🚌 Naczepy"}
                </button>
              ))}
            </div>
          )}
          {kpiData.length === 0 ? (
            <div className="card py-16 text-center text-slate-400">
              <p className="text-lg mb-2">Brak danych</p>
              <p className="text-sm">Wczytaj plik TMS żeby zobaczyć wyniki dyspozytorów</p>
            </div>
          ) : (
<>
              {/* Fleet totals */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  ["Łączny fracht", fmtEur(kpiData.reduce((s,d)=>s+d.frachtEur,0)), "text-slate-800"],
                  ["Łączne koszty HBM", fmtEur(kpiData.reduce((s,d)=>s+d.costEur,0)), "text-slate-800"],
                  ["Łączna marża", fmtEur(kpiData.reduce((s,d)=>s+d.marginEur,0)), kpiData.reduce((s,d)=>s+d.marginEur,0)>=0?"text-emerald-600":"text-red-600"],
                  ["Śr. marża floty", fmtPct(kpiData.filter(d=>d.id!=="__unassigned__" && d.routes>0).reduce((s,d)=>s+d.marginPct,0)/Math.max(1,kpiData.filter(d=>d.id!=="__unassigned__"&&d.routes>0).length)), "text-slate-800"],
                  ["Trasy ze stratą", kpiData.reduce((s,d)=>s+d.losses,0).toString(), kpiData.reduce((s,d)=>s+d.losses,0)>0?"text-red-600":"text-emerald-600"],
                ].map(([label,val,cls])=>(
                  <div key={label} className="card py-3">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">{label}</p>
                    <p className={`text-xl font-bold mt-0.5 ${cls}`}>{val}</p>
                  </div>
                ))}
              </div>

              {/* Per dispatcher cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {kpiData.filter(d=>d.id!=="__unassigned__").map(d => {
                  // Apply vehicle type filter to route list for this card
                  const filteredRoutes = vehicleTypeFilter === "all" ? d.routeList
                    : d.routeList.filter(r => {
                        const vType = vehicles.find(v=>v.reg===r.vehicle)?.vehicle_type;
                        return vehicleTypeFilter === "ciągnik" ? vType === "ciągnik" : vType === "naczepa";
                      });
                  const filtFracht = filteredRoutes.reduce((s,r)=>s+r.frachtEur,0);
                  const filtCost   = filteredRoutes.reduce((s,r)=>s+r.totalCost,0);
                  const filtMargin = filtFracht - filtCost;
                  const filtMarginPct = filtFracht > 0 ? (filtMargin/filtFracht)*100 : 0;
                  return (
                  <div key={d.id}
                    onClick={()=>setSelectedDispatcher(selectedDispatcher===d.id?null:d.id)}
                    className={`card cursor-pointer transition-all ${selectedDispatcher===d.id?"ring-2 ring-blue-500 shadow-md":""} ${filteredRoutes.some(r=>r.marginPct<0)?"border-l-4 border-red-400":filtMarginPct>=15?"border-l-4 border-emerald-400":"border-l-4 border-amber-400"}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-slate-800">{d.name}</h3>
                        {/* CIĄ / NAC badges */}
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {d.ciagniki.length > 0 && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${vehicleTypeFilter==="ciągnik"?"bg-blue-600 text-white":"bg-blue-100 text-blue-700"}`}>
                              🚛 {d.ciagniki.length} CIĄ
                            </span>
                          )}
                          {d.naczepy.length > 0 && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${vehicleTypeFilter==="naczepa"?"bg-slate-600 text-white":"bg-slate-100 text-slate-600"}`}>
                              🚌 {d.naczepy.length} NAC
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400">{filteredRoutes.length} tras · {Math.round(filteredRoutes.reduce((s,r)=>s+r.distanceKm,0)).toLocaleString("pl-PL")} km</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-2xl font-black ${marginColor(filtMarginPct)}`}>{fmtPct(filtMarginPct)}</div>
                        <div className="text-xs text-slate-400">marża</div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="bg-slate-50 rounded-lg py-2">
                        <div className="text-sm font-bold text-slate-800">{fmtEur(filtFracht)}</div>
                        <div className="text-xs text-slate-400">fracht</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg py-2">
                        <div className={`text-sm font-bold ${marginColor(filtMarginPct)}`}>{fmtEur(filtMargin)}</div>
                        <div className="text-xs text-slate-400">marża EUR</div>
                      </div>
                      <div className="bg-slate-50 rounded-lg py-2">
                        <div className="text-sm font-bold text-slate-800">
                          {filteredRoutes.length>0 ? fmtPct(filteredRoutes.reduce((s,r)=>s+r.marginPct,0)/filteredRoutes.length) : "—"}
                        </div>
                        <div className="text-xs text-slate-400">śr./trasę</div>
                      </div>
                    </div>

                    {/* Mini bar */}
                    <div className="mt-3 flex gap-1 text-xs flex-wrap">
                      {filteredRoutes.filter(r=>r.marginPct>=15).length>0 && <div className="bg-emerald-500 text-white rounded px-1.5 py-0.5">✓ {filteredRoutes.filter(r=>r.marginPct>=15).length}</div>}
                      {filteredRoutes.filter(r=>r.marginPct>=5&&r.marginPct<15).length>0 && <div className="bg-amber-400 text-white rounded px-1.5 py-0.5">~ {filteredRoutes.filter(r=>r.marginPct>=5&&r.marginPct<15).length}</div>}
                      {filteredRoutes.filter(r=>r.marginPct>=0&&r.marginPct<5).length>0 && <div className="bg-orange-400 text-white rounded px-1.5 py-0.5">↓ {filteredRoutes.filter(r=>r.marginPct>=0&&r.marginPct<5).length}</div>}
                      {filteredRoutes.filter(r=>r.marginPct<0).length>0 && <div className="bg-red-600 text-white rounded px-1.5 py-0.5 font-bold">✗ {filteredRoutes.filter(r=>r.marginPct<0).length} STRAT</div>}
                      {filteredRoutes.length===0 && <div className="text-slate-400 italic">brak tras w tym tygodniu</div>}
                    </div>
                  </div>
                  );
                })}
              </div>

              {/* Unassigned warning */}
              {kpiData.find(d=>d.id==="__unassigned__") && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                  <span className="text-amber-600 text-xl">⚠</span>
                  <div>
                    <p className="font-semibold text-amber-800">
                      {kpiData.find(d=>d.id==="__unassigned__")!.routes} tras bez przypisanego dyspozytora
                    </p>
                    <p className="text-sm text-amber-700">Przypisz pojazdy do dyspozytorów w zakładce Konfiguracja</p>
                  </div>
                </div>
              )}

              {/* Drill-down — selected dispatcher */}
              {selectedKpi && (
                <div className="card p-0 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b flex items-center justify-between">
                    <h3 className="font-bold text-slate-800">Trasy — {selectedKpi.name}</h3>
                    <button onClick={()=>setSelectedDispatcher(null)} className="text-slate-400 hover:text-slate-700">✕</button>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Zlecenie</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Pojazd</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Trasa</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Km</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Fracht</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Koszty</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Marża</th>
                        <th className="text-center px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedKpi.routeList.sort((a,b)=>a.marginPct-b.marginPct).map(r => (
                        <tr key={r.orderNr} className={`hover:bg-slate-50 ${r.marginPct<0?"bg-red-50/30":""}`}>
                          <td className="px-4 py-2 font-mono text-xs text-slate-600">{r.orderNr}</td>
                          <td className="px-4 py-2 font-mono text-xs font-semibold">{r.vehicle}</td>
                          <td className="px-4 py-2 text-xs text-slate-600">{r.originCountry}→{r.destCountry}</td>
                          <td className="px-4 py-2 text-right text-xs">{Math.round(r.distanceKm).toLocaleString("pl-PL")}</td>
                          <td className="px-4 py-2 text-right text-xs font-medium">{Math.round(r.frachtEur).toLocaleString("pl-PL")}</td>
                          <td className="px-4 py-2 text-right text-xs">{Math.round(r.totalCost).toLocaleString("pl-PL")}</td>
                          <td className={`px-4 py-2 text-right text-xs font-bold ${marginColor(r.marginPct)}`}>
                            {fmtPct(r.marginPct)}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              r.marginPct>=15?"bg-emerald-100 text-emerald-700":
                              r.marginPct>=5?"bg-amber-100 text-amber-700":
                              r.marginPct>=0?"bg-orange-100 text-orange-700":
                              "bg-red-100 text-red-700 font-bold"}`}>
                              {r.label}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── All Routes ── */}
      {activeTab === "routes" && (
        <div className="space-y-3">
          {/* Route filters */}
          <div className="flex gap-2 flex-wrap items-center">
            <input value={routeSearch} onChange={e=>setRouteSearch(e.target.value)}
              placeholder="Szukaj zlecenia, pojazdu, trasy…"
              className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-64" />
            {(["all","ciągnik","naczepa"] as const).map(t => (
              <button key={t} onClick={() => setVehicleTypeFilter(t)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  vehicleTypeFilter === t ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {t === "all" ? "Wszystkie" : t === "ciągnik" ? "🚛 Ciągniki" : "🚌 Naczepy"}
              </button>
            ))}
          </div>
        <div className="card overflow-x-auto p-0">
          {allRoutes.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-sm">Wczytaj plik TMS</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Zlecenie</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Dyspozytor</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Pojazd</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Trasa</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Fracht</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Marża</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allRoutes
                  .filter(r => {
                    const vType = vehicles.find(v=>v.reg===r.vehicle)?.vehicle_type;
                    const typeOk = vehicleTypeFilter === "all" || vType === vehicleTypeFilter;
                    const q = routeSearch.toLowerCase();
                    const searchOk = !q || r.orderNr.toLowerCase().includes(q) ||
                      r.vehicle.toLowerCase().includes(q) || r.dispatcherName.toLowerCase().includes(q) ||
                      r.originCountry.toLowerCase().includes(q) || r.destCountry.toLowerCase().includes(q);
                    return typeOk && searchOk;
                  })
                  .sort((a,b)=>a.marginPct-b.marginPct)
                  .map(r => {
                    const vType = vehicles.find(v=>v.reg===r.vehicle)?.vehicle_type;
                    return (
                    <tr key={r.orderNr} className={`hover:bg-slate-50 ${r.marginPct<0?"bg-red-50/40":""}`}>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{r.orderNr}</td>
                      <td className="px-4 py-2 text-xs font-medium text-slate-700">{r.dispatcherName}</td>
                      <td className="px-4 py-2">
                        <span className="font-mono text-xs font-semibold">{r.vehicle}</span>
                        <span className={`ml-1.5 text-[10px] px-1 py-0 rounded font-bold ${vType==="ciągnik"?"bg-blue-100 text-blue-700":"bg-slate-100 text-slate-600"}`}>
                          {vType==="ciągnik"?"CIĄ":"NAC"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-xs">{r.originCountry}→{r.destCountry}</td>
                      <td className="px-4 py-2 text-right text-xs">{Math.round(r.frachtEur).toLocaleString("pl-PL")} €</td>
                      <td className={`px-4 py-2 text-right text-xs font-bold ${marginColor(r.marginPct)}`}>{fmtPct(r.marginPct)}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          r.marginPct>=15?"bg-emerald-100 text-emerald-700":r.marginPct>=5?"bg-amber-100 text-amber-700":
                          r.marginPct>=0?"bg-orange-100 text-orange-700":"bg-red-100 text-red-700 font-bold"}`}>
                          {r.label}
                        </span>
                      </td>
                    </tr>
                  );})}
              </tbody>
            </table>
          )}
        </div>
        </div>
      )}

      {/* ── Config ── */}
      {activeTab === "config" && (
        <div className="space-y-5">
          {/* Add dispatcher */}
          <div className="card">
            <h3 className="font-bold text-slate-800 mb-3">Dodaj dyspozytora</h3>
            <div className="flex gap-2 flex-wrap">
              <input value={newDispName} onChange={e=>setNewDispName(e.target.value)} placeholder="Imię i nazwisko"
                className="flex-1 min-w-[180px] px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              <input value={newDispEmail} onChange={e=>setNewDispEmail(e.target.value)} placeholder="Email (opcjonalnie)"
                className="flex-1 min-w-[180px] px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
              <button onClick={addDispatcher} disabled={!newDispName.trim()}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                Dodaj
              </button>
            </div>
          </div>

          {/* Vehicle assignment */}
          <div className="card p-0 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-bold text-slate-800">Przypisanie pojazdów do dyspozytorów</h3>
                <p className="text-xs text-slate-500 mt-0.5">{vehicles.filter(v=>configTypeFilter==="all"||v.vehicle_type===configTypeFilter).length} pojazdów</p>
              </div>
              <div className="flex gap-1">
                {(["all","ciągnik","naczepa"] as const).map(t => (
                  <button key={t} onClick={()=>setConfigTypeFilter(t)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      configTypeFilter===t ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                    {t==="all"?"Wszystkie":t==="ciągnik"?"🚛 Ciągniki":"🚌 Naczepy"}
                  </button>
                ))}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Rejestracja</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Typ</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Marka</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Dyspozytor</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500 uppercase">Zmień</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                {vehicles.filter(v => configTypeFilter==="all" || v.vehicle_type===configTypeFilter).map(v => (
                  <tr key={v.reg} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono font-semibold text-slate-800">{v.reg}</td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${v.vehicle_type==="ciągnik"?"bg-blue-100 text-blue-700":"bg-slate-100 text-slate-600"}`}>
                        {v.vehicle_type==="ciągnik"?"CIĄ":"NAC"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-600 text-xs">{v.brand ?? "—"}</td>
                    <td className="px-4 py-2">
                      {v.dispatcher_id && dispById[v.dispatcher_id]
                        ? <span className="text-blue-700 font-medium text-sm">{dispById[v.dispatcher_id].name}</span>
                        : <span className="text-slate-400 text-xs italic">Nieprzypisany</span>}
                    </td>
                    <td className="px-4 py-2">
                      {assigningVehicle === v.reg ? (
                        <div className="flex gap-1 flex-wrap">
                          <select defaultValue={v.dispatcher_id ?? ""}
                            onChange={e => assignVehicle(v.reg, e.target.value || null)}
                            className="px-2 py-1 border border-slate-200 rounded text-xs bg-white focus:ring-2 focus:ring-blue-500 outline-none">
                            <option value="">— Nieprzypisany —</option>
                            {dispatchers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                          <button onClick={()=>setAssigningVehicle(null)} className="text-slate-400 hover:text-slate-700 text-xs px-2">✕</button>
                        </div>
                      ) : (
                        <button onClick={()=>setAssigningVehicle(v.reg)}
                          className="text-xs text-blue-600 hover:text-blue-800 underline">Zmień</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
