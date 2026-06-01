"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { calculateRoute, profitabilityLabel, euroClass as deriveEuroClass, FLEET } from "@/lib/calculator";

interface OrsVerification {
  distanceKm: number;
  tollEur: number;
  durationH: number;
  diffKm: number;       // ors - tms (km)
  diffKmPct: number;    // %
  status: "ok" | "warn" | "alert" | "error";
  error?: string;
}

interface RouteRow {
  orderNr: string;
  client: string;
  vehicle: string;
  originCountry: string;
  destCountry: string;
  originCity: string;
  destCity: string;
  distanceKm: number;
  frachtRaw: string;
  frachtEur: number;
  frachtEstimated: boolean;   // true when fracht=0 in TMS → estimated from TMS margin/km
  currency: string;
  avgFuelL100: number;
  tmsMarzaPerKm: number;      // "Marża EUR na 1 KM z mapy" from TMS
  marginEur: number;
  marginPct: number;
  costPerKm: number;
  revenuePerKm: number;
  totalCost: number;
  label: string;
  labelColor: string;
  euroClass: number;      // 3 | 4 | 5 | 6 — derived from vehicle year
  ors?: OrsVerification;
}

function parseFracht(s: string): { amount: number; currency: string } {
  if (!s) return { amount: 0, currency: "EUR" };
  const str = String(s).replace(/\s/g, "");
  const m = str.match(/([\d,.]+)([A-Z]{3})/);
  if (!m) return { amount: 0, currency: "EUR" };
  const num = parseFloat(m[1].replace(",", "."));
  return { amount: isNaN(num) ? 0 : num, currency: m[2] };
}

function orsStatusColor(s?: OrsVerification["status"]) {
  if (!s) return "";
  return { ok: "text-emerald-600", warn: "text-amber-600", alert: "text-red-600", error: "text-slate-400" }[s];
}

function DiffBadge({ pct }: { pct: number }) {
  const abs = Math.abs(pct);
  const cls = abs < 10
    ? "bg-emerald-50 text-emerald-700"
    : abs < 25
    ? "bg-amber-50 text-amber-700"
    : "bg-red-50 text-red-700";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-mono ${cls}`}>
      {pct > 0 ? "+" : ""}{pct.toFixed(1)}%
    </span>
  );
}

export default function AnalizaPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<RouteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debug, setDebug] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [eurRate, setEurRate] = useState(4.27);
  const [fuelPrice, setFuelPrice] = useState(1.25);
  const [sortKey, setSortKey] = useState<keyof RouteRow>("marginPct");
  const [sortDesc, setSortDesc] = useState(false);

  // ORS verification state
  const [verifying, setVerifying] = useState(false);
  const [verifyProgress, setVerifyProgress] = useState({ done: 0, total: 0 });
  const [showOrsColumns, setShowOrsColumns] = useState(false);
  const [hideEstimated, setHideEstimated] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFilename(file.name);
    setLoading(true);
    setRows([]);
    setError(null);
    setDebug(null);
    setShowOrsColumns(false);

    try {
      const { data: vehicles, error: dbErr } = await supabase
        .from("vehicles")
        .select("reg, avg_fuel_l100, year_produced, leasing_eur_mo");

      if (dbErr) setDebug(`DB warning: ${dbErr.message}`);

      const fuelMap: Record<string, number> = {};
      const yearMap: Record<string, number> = {};
      const leasingMap: Record<string, number> = {};
      for (const v of vehicles ?? []) {
        if (v.reg && v.avg_fuel_l100) fuelMap[v.reg] = Number(v.avg_fuel_l100);
        if (v.reg && v.year_produced) yearMap[v.reg] = Number(v.year_produced);
        if (v.reg && v.leasing_eur_mo) leasingMap[v.reg] = Number(v.leasing_eur_mo);
      }

      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const all = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as string[][];

      let hIdx = 0;
      for (let i = 0; i < Math.min(5, all.length); i++) {
        const joined = all[i].join("|").toLowerCase();
        if (joined.includes("nr") && joined.includes("kraj")) { hIdx = i; break; }
      }

      const headers = all[hIdx].map(h => String(h).trim());
      const dataRows = all.slice(hIdx + 1).filter(r => r.some(c => String(c).trim() !== ""));

      setDebug(`Znaleziono ${dataRows.length} wierszy, nagłówek: wiersz ${hIdx}. Kolumny: ${headers.filter(h=>h).slice(0,8).join(", ")}…`);

      function get(row: string[], ...keys: string[]): string {
        for (const key of keys) {
          const idx = headers.findIndex(h => h.toLowerCase().includes(key.toLowerCase()));
          if (idx >= 0 && row[idx] != null && String(row[idx]).trim() !== "")
            return String(row[idx]).trim();
        }
        return "";
      }

      const computed: RouteRow[] = dataRows
        .map((row): RouteRow | null => {
          const orderNr = get(row, "Nr pełny", "Nr pe", "Nr ");
          if (!orderNr) return null;

          const distanceKm = parseFloat(get(row, "km ład", "km wg", "Km") || "0");
          if (distanceKm < 10) return null;

          const frachtRaw = get(row, "fracht z wal", "fracht");
          const { amount: frachtAmount, currency } = parseFracht(frachtRaw);
          let frachtEur = currency === "PLN" ? frachtAmount / eurRate : frachtAmount;

          const vehicle = get(row, "ciągnik", "ciagnik", "pojazd").toUpperCase();
          const originCountry = get(row, "zał. kraj", "zal. kraj", "kraj za").toUpperCase() || "PL";
          const destCountry = get(row, "roz. kraj", "kraj ro").toUpperCase() || "PL";
          const originCity = get(row, "zał. miasto", "zal. miasto");
          const destCity   = get(row, "roz. miasto");

          const avgFuelL100  = fuelMap[vehicle] ?? FLEET.avgFuelL100;
          const vehicleYear  = yearMap[vehicle];
          const leasingEurMo = leasingMap[vehicle];

          // TMS own margin/km — "Marża EUR na 1 KM z mapy"
          const tmsMarzaPerKmRaw = parseFloat(get(row, "marża eur na 1 km", "marża eur") || "0");
          const tmsMarzaPerKm = isNaN(tmsMarzaPerKmRaw) ? 0 : tmsMarzaPerKmRaw;

          // Estimate fracht when TMS has no invoice yet (fracht=0)
          // fracht_est = our_HBM_cost + TMS_margin_EUR (TMS margin = marza_per_km × km)
          let frachtEstimated = false;
          if (frachtEur === 0 && tmsMarzaPerKm > 0) {
            const breakdown0 = calculateRoute({
              originCountry, destCountry, distanceKm,
              fuelPriceEurL: fuelPrice, freightEur: 1,
              transitCountries: [originCountry, destCountry],
              avgFuelL100, vehicleYearProduced: vehicleYear, leasingEurMo,
            });
            // fracht_est = cost + TMS_margin
            frachtEur = Math.round((breakdown0.total + tmsMarzaPerKm * distanceKm) * 100) / 100;
            frachtEstimated = true;
          }

          const breakdown = calculateRoute({
            originCountry, destCountry, distanceKm,
            fuelPriceEurL: fuelPrice,
            freightEur: frachtEur,
            transitCountries: [originCountry, destCountry],
            avgFuelL100, vehicleYearProduced: vehicleYear, leasingEurMo,
          });

          const { label, color } = profitabilityLabel(breakdown.marginPct);

          return {
            orderNr,
            client: get(row, "zleceniodawca", "klient"),
            vehicle: vehicle || "—",
            originCountry, destCountry, originCity, destCity,
            distanceKm, frachtRaw,
            frachtEur: Math.round(frachtEur * 100) / 100,
            frachtEstimated,
            currency, avgFuelL100, tmsMarzaPerKm,
            marginEur: breakdown.marginEur,
            marginPct: breakdown.marginPct,
            costPerKm: breakdown.costPerKm,
            revenuePerKm: breakdown.revenuePerKm,
            totalCost: breakdown.total,
            label, labelColor: color,
            euroClass: vehicleYear ? deriveEuroClass(vehicleYear) : 6,
          };
        })
        .filter((r): r is RouteRow => r !== null);

      setRows(computed);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // ─── ORS batch verification ──────────────────────────────────
  async function handleVerifyOrs() {
    const routesToVerify = rows.filter(r => r.originCity && r.destCity);
    if (routesToVerify.length === 0) {
      alert("Brak tras z miastami — upewnij się że plik zawiera kolumny miast.");
      return;
    }

    setVerifying(true);
    setVerifyProgress({ done: 0, total: routesToVerify.length });
    setShowOrsColumns(true);

    const updatedRows = [...rows];

    for (let i = 0; i < updatedRows.length; i++) {
      const row = updatedRows[i];
      if (!row.originCity || !row.destCity) continue;

      try {
        const res = await fetch("/api/route-quick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: row.originCity,
            to: row.destCity,
            originCountry: row.originCountry,
            destCountry: row.destCountry,
          }),
        });

        const data = await res.json();

        if (!res.ok || data.error) {
          updatedRows[i] = {
            ...row,
            ors: { distanceKm: 0, tollEur: 0, durationH: 0, diffKm: 0, diffKmPct: 0, status: "error", error: data.error },
          };
        } else {
          const diffKm    = Math.round((data.distanceKm - row.distanceKm) * 10) / 10;
          const diffKmPct = Math.round((diffKm / row.distanceKm) * 1000) / 10;
          const absP      = Math.abs(diffKmPct);
          const status: OrsVerification["status"] = absP < 10 ? "ok" : absP < 25 ? "warn" : "alert";

          updatedRows[i] = {
            ...row,
            ors: { distanceKm: data.distanceKm, tollEur: data.tollEur, durationH: data.durationH, diffKm, diffKmPct, status },
          };
        }
      } catch (e) {
        updatedRows[i] = {
          ...row,
          ors: { distanceKm: 0, tollEur: 0, durationH: 0, diffKm: 0, diffKmPct: 0, status: "error", error: String(e) },
        };
      }

      setRows([...updatedRows]);
      setVerifyProgress({ done: i + 1, total: routesToVerify.length });

      // Rate limit: route-quick makes 2 sequential Nominatim calls (1.1s each)
      // Wait 500ms extra after the API response to stay safely under 1 req/sec
      await new Promise(r => setTimeout(r, 500));
    }

    setVerifying(false);
  }

  function toggleSort(key: keyof RouteRow) {
    if (sortKey === key) setSortDesc(!sortDesc);
    else { setSortKey(key); setSortDesc(key === "marginPct" ? false : true); }
  }

  const sorted = [...displayRows].sort((a, b) => {
    const av = a[sortKey]; const bv = b[sortKey];
    if (typeof av === "number" && typeof bv === "number")
      return sortDesc ? bv - av : av - bv;
    return String(av).localeCompare(String(bv));
  });

  const SortIcon = ({ k }: { k: keyof RouteRow }) =>
    sortKey === k ? <span className="ml-1">{sortDesc ? "↓" : "↑"}</span> : null;

  const estimatedCount = rows.filter(r => r.frachtEstimated).length;
  const noFreightCount = rows.filter(r => r.frachtEur === 0 && !r.frachtEstimated).length;
  const displayRows    = hideEstimated ? rows.filter(r => !r.frachtEstimated) : rows;

  const profitable  = displayRows.filter(r => r.marginPct >= 15).length;
  const lowMargin   = displayRows.filter(r => r.marginPct >= 5 && r.marginPct < 15).length;
  const breakeven   = displayRows.filter(r => r.marginPct >= 0 && r.marginPct < 5).length;
  const losses      = displayRows.filter(r => r.marginPct < 0).length;
  const totalFreight = displayRows.reduce((s, r) => s + r.frachtEur, 0);
  const totalCosts   = displayRows.reduce((s, r) => s + r.totalCost, 0);
  const totalMargin  = totalFreight - totalCosts;
  const avgMargin    = displayRows.length > 0
    ? Math.round(displayRows.reduce((s, r) => s + r.marginPct, 0) / displayRows.length * 10) / 10 : 0;

  // ORS stats
  const verified       = displayRows.filter(r => r.ors && r.ors.status !== "error");
  const alertCount     = verified.filter(r => r.ors!.status === "alert").length;
  const warnCount      = verified.filter(r => r.ors!.status === "warn").length;
  const totalKmTms     = verified.reduce((s, r) => s + r.distanceKm, 0);
  const totalKmOrs     = verified.reduce((s, r) => s + (r.ors?.distanceKm ?? 0), 0);
  const kmFleetDiff    = totalKmOrs - totalKmTms;

  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-800",
    amber:   "bg-amber-100 text-amber-800",
    orange:  "bg-orange-100 text-orange-800",
    red:     "bg-red-100 text-red-800",
  };
  const borderMap: Record<string, string> = {
    emerald: "border-l-4 border-emerald-400",
    amber:   "border-l-4 border-amber-400",
    orange:  "border-l-4 border-orange-400",
    red:     "border-l-4 border-red-400",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Analiza rentowności tras</h1>
          <p className="text-sm text-slate-500 mt-1">
            Kalkulator kosztów · Weryfikacja km i myto przez ORS HGV
          </p>
        </div>
      </div>

      {/* Settings + Upload */}
      <div className="card">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="label">Cena paliwa (EUR/l)</label>
            <input type="number" step="0.01" min="0.8" max="2.5"
              value={fuelPrice} onChange={e => setFuelPrice(parseFloat(e.target.value) || 1.25)}
              className="input-field" />
          </div>
          <div>
            <label className="label">Kurs PLN/EUR</label>
            <input type="number" step="0.01" min="3.5" max="5.0"
              value={eurRate} onChange={e => setEurRate(parseFloat(e.target.value) || 4.27)}
              className="input-field" />
          </div>
          <div className="flex flex-col justify-end">
            <label className="label">Plik z trasami (XLS/XLSX)</label>
            <input ref={fileRef} type="file" accept=".xls,.xlsx"
              onChange={handleFile} disabled={loading}
              className="block w-full text-sm text-slate-500
                file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0
                file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700
                hover:file:bg-blue-100 cursor-pointer" />
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-blue-600 text-sm">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Analizuję {filename}…
          </div>
        )}
        {error && (
          <div className="mt-3 p-3 bg-red-50 rounded-lg text-red-700 text-sm">
            <strong>Błąd:</strong> {error}
          </div>
        )}
        {debug && (
          <div className="mt-3 p-3 bg-slate-50 rounded-lg text-slate-500 text-xs font-mono">
            {debug}
          </div>
        )}
      </div>

      {/* ORS verification button */}
      {rows.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap">
          {!verifying ? (
            <button
              onClick={handleVerifyOrs}
              disabled={verifying}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <span>🛣️</span>
              {verified.length > 0
                ? `Odśwież weryfikację ORS (${verified.length}/${rows.length})`
                : `Zweryfikuj trasy przez ORS HGV (${rows.filter(r => r.originCity && r.destCity).length} tras)`}
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <div className="flex-1 min-w-[200px]">
                <div className="flex justify-between text-xs text-slate-600 mb-1">
                  <span>Weryfikacja ORS… {verifyProgress.done}/{verifyProgress.total}</span>
                  <span>{Math.round((verifyProgress.done / verifyProgress.total) * 100)}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full transition-all"
                    style={{ width: `${(verifyProgress.done / verifyProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}
          {verified.length > 0 && (
            <button
              onClick={() => setShowOrsColumns(v => !v)}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              {showOrsColumns ? "Ukryj kolumny ORS" : "Pokaż kolumny ORS"}
            </button>
          )}
        </div>
      )}

      {/* Estimated freight banner */}
      {estimatedCount > 0 && (
        <div className="flex items-center justify-between gap-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <div className="flex items-center gap-2">
            <span className="text-amber-600 font-bold">⚠️</span>
            <span className="text-amber-800">
              <strong>{estimatedCount} tras</strong> bez faktury w TMS — fracht szacowany z marży TMS (koszt HBM + marża TMS/km).
              {noFreightCount > 0 && <span className="ml-2 text-amber-600">+{noFreightCount} bez danych — pominięte.</span>}
            </span>
          </div>
          <button
            onClick={() => setHideEstimated(v => !v)}
            className="shrink-0 text-xs px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 font-semibold rounded-lg transition-colors"
          >
            {hideEstimated ? `Pokaż szacowane (${estimatedCount})` : `Ukryj szacowane (${estimatedCount})`}
          </button>
        </div>
      )}

      {/* ORS summary */}
      {verified.length > 0 && showOrsColumns && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Zweryfikowano</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{verified.length}/{rows.length}</p>
          </div>
          <div className={`card border ${alertCount > 0 ? "border-red-200 bg-red-50" : ""}`}>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Anomalie &gt;25% km</p>
            <p className={`text-2xl font-bold mt-1 ${alertCount > 0 ? "text-red-600" : "text-slate-800"}`}>
              {alertCount}
            </p>
          </div>
          <div className={`card border ${warnCount > 0 ? "border-amber-200 bg-amber-50" : ""}`}>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Ostrzeżenia 10–25%</p>
            <p className={`text-2xl font-bold mt-1 ${warnCount > 0 ? "text-amber-600" : "text-slate-800"}`}>
              {warnCount}
            </p>
          </div>
          <div className={`card border ${Math.abs(kmFleetDiff) > 1000 ? "border-amber-200 bg-amber-50" : ""}`}>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Δ km łącznie (ORS−TMS)</p>
            <p className={`text-2xl font-bold mt-1 ${kmFleetDiff > 500 ? "text-amber-600" : kmFleetDiff < -500 ? "text-blue-600" : "text-emerald-600"}`}>
              {kmFleetDiff > 0 ? "+" : ""}{kmFleetDiff.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} km
            </p>
            <p className="text-xs text-slate-400">
              TMS: {totalKmTms.toLocaleString("pl-PL", {maximumFractionDigits:0})} · ORS: {totalKmOrs.toLocaleString("pl-PL", {maximumFractionDigits:0})}
            </p>
          </div>
        </div>
      )}

      {/* KPI */}
      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card border-l-4 border-emerald-500">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Rentowne ≥15%</p>
              <p className="text-3xl font-bold text-emerald-600 mt-1">{profitable}</p>
            </div>
            <div className="card border-l-4 border-amber-500">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Niska marża 5–15%</p>
              <p className="text-3xl font-bold text-amber-600 mt-1">{lowMargin}</p>
            </div>
            <div className="card border-l-4 border-orange-500">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Próg 0–5%</p>
              <p className="text-3xl font-bold text-orange-600 mt-1">{breakeven}</p>
            </div>
            <div className="card border-l-4 border-red-500">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Strata</p>
              <p className="text-3xl font-bold text-red-600 mt-1">{losses}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Tras</p>
              <p className="text-3xl font-bold text-slate-800 mt-1">{rows.length}</p>
            </div>
            <div className="card">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Łączny fracht</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                {totalFreight.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} EUR
              </p>
            </div>
            <div className="card">
              <p className="text-xs text-slate-500 uppercase tracking-wide">Łączne koszty</p>
              <p className="text-2xl font-bold text-slate-800 mt-1">
                {totalCosts.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} EUR
              </p>
            </div>
            <div className={`card ${totalMargin >= 0 ? "border-l-4 border-emerald-500" : "border-l-4 border-red-500"}`}>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Łączna marża</p>
              <p className={`text-2xl font-bold mt-1 ${totalMargin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {totalMargin.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} EUR
              </p>
              <p className="text-xs text-slate-400">{avgMargin}% średnio</p>
            </div>
          </div>

          {/* Table */}
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Zlecenie</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Trasa</th>
                  <th className="text-left px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Pojazd</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-800"
                    onClick={() => toggleSort("distanceKm")}>
                    Km TMS <SortIcon k="distanceKm" />
                  </th>
                  {showOrsColumns && (
                    <>
                      <th className="text-right px-3 py-3 text-xs font-semibold text-blue-500 uppercase bg-blue-50/50">Km ORS</th>
                      <th className="text-center px-3 py-3 text-xs font-semibold text-blue-500 uppercase bg-blue-50/50">Δ km</th>
                    </>
                  )}
                  <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-800"
                    onClick={() => toggleSort("frachtEur")}>Fracht EUR <SortIcon k="frachtEur" /></th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-800"
                    onClick={() => toggleSort("totalCost")}>Koszty EUR <SortIcon k="totalCost" /></th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-800"
                    onClick={() => toggleSort("marginPct")}>Marża % <SortIcon k="marginPct" /></th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map(r => (
                  <tr key={r.orderNr}
                    className={`hover:bg-slate-50 ${borderMap[r.labelColor] ?? ""}
                      ${r.ors?.status === "alert" ? "bg-red-50/30" : r.ors?.status === "warn" ? "bg-amber-50/20" : ""}`}>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-xs text-slate-700">{r.orderNr}</div>
                      <div className="text-xs text-slate-400 truncate max-w-[130px]">{r.client}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-800">{r.originCountry} → {r.destCountry}</div>
                      <div className="text-xs text-slate-400 truncate max-w-[160px]">{r.originCity} → {r.destCity}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-xs text-slate-700 flex items-center gap-1">
                        {r.vehicle}
                        <span
                          className={`inline-block px-1 py-0 rounded text-[10px] font-bold
                            ${r.euroClass >= 6 ? "bg-emerald-100 text-emerald-700"
                            : r.euroClass === 5 ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"}`}
                          title={`EURO ${r.euroClass} — wpływa na stawkę myto DE/AT/CH`}
                        >
                          E{r.euroClass}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">{r.avgFuelL100} l/100</div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-600">
                      {r.distanceKm.toLocaleString("pl-PL", { maximumFractionDigits: 0 })}
                    </td>
                    {showOrsColumns && (
                      <>
                        <td className="px-3 py-2.5 text-right bg-blue-50/30">
                          {r.ors ? (
                            r.ors.status === "error"
                              ? <span className="text-slate-300 text-xs" title={r.ors.error}>—</span>
                              : <span className={`font-medium ${orsStatusColor(r.ors.status)}`}>
                                  {r.ors.distanceKm.toLocaleString("pl-PL", { maximumFractionDigits: 0 })}
                                </span>
                          ) : (
                            verifying
                              ? <span className="inline-block w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                              : <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center bg-blue-50/30">
                          {r.ors && r.ors.status !== "error" && (
                            <DiffBadge pct={r.ors.diffKmPct} />
                          )}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-800">
                      {r.frachtEur.toLocaleString("pl-PL", { maximumFractionDigits: 0 })}
                      {r.frachtEstimated && (
                        <div className="text-xs text-amber-500 font-normal" title={`Szacowany: koszt HBM + marża TMS ${r.tmsMarzaPerKm} EUR/km`}>
                          ~szacowany
                        </div>
                      )}
                      {r.currency === "PLN" && !r.frachtEstimated && (
                        <div className="text-xs text-slate-400 font-normal">{r.frachtRaw}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-600">
                      {r.totalCost.toLocaleString("pl-PL", { maximumFractionDigits: 0 })}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-bold text-lg ${
                      r.marginPct >= 15 ? "text-emerald-600" :
                      r.marginPct >= 5  ? "text-amber-600"   :
                      r.marginPct >= 0  ? "text-orange-600"  : "text-red-600"}`}>
                      {r.marginPct}%
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colorMap[r.labelColor] ?? ""}`}>
                        {r.label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 text-center">
            Spalanie z Trimble per pojazd · Kurs PLN/EUR: {eurRate} · Paliwo: {fuelPrice} EUR/l
            {verified.length > 0 && ` · ORS: ${verified.length} tras zweryfikowanych`}
          </p>
        </>
      )}

      {!loading && rows.length === 0 && !error && (
        <div className="card text-center py-16">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-slate-600 font-medium">Wgraj plik z trasami aby zobaczyć analizę</p>
          <p className="text-sm text-slate-400 mt-1">
            Format: eksport TMS — kolumny Nr pełny, Km ład. wg. mapy, Fracht z walutą, Ciągnik, Kraj/Miasto zał./roz.
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Po załadowaniu możesz uruchomić <strong>weryfikację ORS HGV</strong> — porówna km z TMS z rzeczywistą trasą ciężarówki
          </p>
        </div>
      )}
    </div>
  );
}
