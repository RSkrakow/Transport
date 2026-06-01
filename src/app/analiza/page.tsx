"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";
import { calculateRoute, profitabilityLabel, FLEET } from "@/lib/calculator";

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
  currency: string;
  avgFuelL100: number;
  marginEur: number;
  marginPct: number;
  costPerKm: number;
  revenuePerKm: number;
  totalCost: number;
  label: string;
  labelColor: string;
}

function parseFracht(s: string): { amount: number; currency: string } {
  if (!s) return { amount: 0, currency: "EUR" };
  const str = String(s).replace(/\s/g, "");
  const m = str.match(/([\d,.]+)([A-Z]{3})/);
  if (!m) return { amount: 0, currency: "EUR" };
  const num = parseFloat(m[1].replace(",", "."));
  return { amount: isNaN(num) ? 0 : num, currency: m[2] };
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

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFilename(file.name);
    setLoading(true);
    setRows([]);
    setError(null);
    setDebug(null);

    try {
      // 1. Fetch vehicle data
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

      // 2. Read file
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];

      // 3. Read as raw 2D array
      const all = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as string[][];

      // 4. Find header row (contains "Nr" and "kraj")
      let hIdx = 0;
      for (let i = 0; i < Math.min(5, all.length); i++) {
        const joined = all[i].join("|").toLowerCase();
        if (joined.includes("nr") && joined.includes("kraj")) { hIdx = i; break; }
      }

      const headers = all[hIdx].map(h => String(h).trim());
      const dataRows = all.slice(hIdx + 1).filter(r => r.some(c => String(c).trim() !== ""));

      setDebug(`Znaleziono ${dataRows.length} wierszy danych, nagłówek: wiersz ${hIdx}. Kolumny: ${headers.filter(h=>h).slice(0,8).join(", ")}…`);

      // 5. Helper to get value by partial column name match
      function get(row: string[], ...keys: string[]): string {
        for (const key of keys) {
          const idx = headers.findIndex(h => h.toLowerCase().includes(key.toLowerCase()));
          if (idx >= 0 && row[idx] != null && String(row[idx]).trim() !== "") {
            return String(row[idx]).trim();
          }
        }
        return "";
      }

      const currentEurRate = eurRate;
      const currentFuelPrice = fuelPrice;

      // 6. Compute profitability per row
      const computed: RouteRow[] = dataRows
        .map((row): RouteRow | null => {
          const orderNr = get(row, "Nr pełny", "Nr pe", "Nr ");
          if (!orderNr) return null;

          const distanceKm = parseFloat(get(row, "km ład", "km wg", "Km") || "0");
          if (distanceKm < 10) return null;

          const frachtRaw = get(row, "fracht z wal", "fracht");
          const { amount: frachtAmount, currency } = parseFracht(frachtRaw);
          const frachtEur = currency === "PLN" ? frachtAmount / currentEurRate : frachtAmount;

          const vehicle = get(row, "ciągnik", "ciagnik", "pojazd").toUpperCase();
          const originCountry = get(row, "zał. kraj", "zal. kraj", "kraj za").toUpperCase() || "PL";
          const destCountry = get(row, "roz. kraj", "kraj ro").toUpperCase() || "PL";

          const avgFuelL100 = fuelMap[vehicle] ?? FLEET.avgFuelL100;
          const vehicleYear = yearMap[vehicle];
          const leasingEurMo = leasingMap[vehicle];

          const breakdown = calculateRoute({
            originCountry,
            destCountry,
            distanceKm,
            fuelPriceEurL: currentFuelPrice,
            freightEur: frachtEur,
            transitCountries: [originCountry, destCountry],
            avgFuelL100,
            vehicleYearProduced: vehicleYear,
            leasingEurMo,
          });

          const { label, color } = profitabilityLabel(breakdown.marginPct);

          return {
            orderNr,
            client: get(row, "zleceniodawca", "klient"),
            vehicle: vehicle || "—",
            originCountry,
            destCountry,
            originCity: get(row, "zał. miasto", "zal. miasto"),
            destCity: get(row, "roz. miasto"),
            distanceKm,
            frachtRaw,
            frachtEur: Math.round(frachtEur * 100) / 100,
            currency,
            avgFuelL100,
            marginEur: breakdown.marginEur,
            marginPct: breakdown.marginPct,
            costPerKm: breakdown.costPerKm,
            revenuePerKm: breakdown.revenuePerKm,
            totalCost: breakdown.total,
            label,
            labelColor: color,
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

  function toggleSort(key: keyof RouteRow) {
    if (sortKey === key) setSortDesc(!sortDesc);
    else { setSortKey(key); setSortDesc(key === "marginPct" ? false : true); }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey]; const bv = b[sortKey];
    if (typeof av === "number" && typeof bv === "number")
      return sortDesc ? bv - av : av - bv;
    return String(av).localeCompare(String(bv));
  });

  const SortIcon = ({ k }: { k: keyof RouteRow }) =>
    sortKey === k ? <span className="ml-1">{sortDesc ? "↓" : "↑"}</span> : null;

  const profitable  = rows.filter(r => r.marginPct >= 15).length;
  const lowMargin   = rows.filter(r => r.marginPct >= 5 && r.marginPct < 15).length;
  const breakeven   = rows.filter(r => r.marginPct >= 0 && r.marginPct < 5).length;
  const losses      = rows.filter(r => r.marginPct < 0).length;
  const totalFreight = rows.reduce((s, r) => s + r.frachtEur, 0);
  const totalCosts   = rows.reduce((s, r) => s + r.totalCost, 0);
  const totalMargin  = totalFreight - totalCosts;
  const avgMargin    = rows.length > 0
    ? Math.round(rows.reduce((s, r) => s + r.marginPct, 0) / rows.length * 10) / 10 : 0;

  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    orange: "bg-orange-100 text-orange-800",
    red: "bg-red-100 text-red-800",
  };
  const borderMap: Record<string, string> = {
    emerald: "border-l-4 border-emerald-400",
    amber: "border-l-4 border-amber-400",
    orange: "border-l-4 border-orange-400",
    red: "border-l-4 border-red-400",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Analiza rentowności tras</h1>
        <p className="text-sm text-slate-500 mt-1">
          Wgraj plik z trasami (eksport TMS) — kalkulator wyliczy koszty i marżę dla każdej trasy
        </p>
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
                    onClick={() => toggleSort("distanceKm")}>Km <SortIcon k="distanceKm" /></th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-800"
                    onClick={() => toggleSort("frachtEur")}>Fracht EUR <SortIcon k="frachtEur" /></th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-800"
                    onClick={() => toggleSort("totalCost")}>Koszty EUR <SortIcon k="totalCost" /></th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-800"
                    onClick={() => toggleSort("marginEur")}>Marża EUR <SortIcon k="marginEur" /></th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-slate-500 uppercase cursor-pointer hover:text-slate-800"
                    onClick={() => toggleSort("marginPct")}>Marża % <SortIcon k="marginPct" /></th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-slate-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map(r => (
                  <tr key={r.orderNr} className={`hover:bg-slate-50 ${borderMap[r.labelColor] ?? ""}`}>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-xs text-slate-700">{r.orderNr}</div>
                      <div className="text-xs text-slate-400 truncate max-w-[130px]">{r.client}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-800">{r.originCountry} → {r.destCountry}</div>
                      <div className="text-xs text-slate-400 truncate max-w-[150px]">{r.originCity} → {r.destCity}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-mono text-xs text-slate-700">{r.vehicle}</div>
                      <div className="text-xs text-slate-400">{r.avgFuelL100} l/100</div>
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-600">
                      {r.distanceKm.toLocaleString("pl-PL", { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-800">
                      {r.frachtEur.toLocaleString("pl-PL", { maximumFractionDigits: 0 })}
                      {r.currency === "PLN" && <div className="text-xs text-slate-400 font-normal">{r.frachtRaw}</div>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-600">
                      {r.totalCost.toLocaleString("pl-PL", { maximumFractionDigits: 0 })}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-semibold ${r.marginEur >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                      {r.marginEur.toLocaleString("pl-PL", { maximumFractionDigits: 0 })}
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
            Spalanie pobrane z Trimble per pojazd · Kurs PLN/EUR: {eurRate} · Paliwo: {fuelPrice} EUR/l
          </p>
        </>
      )}

      {!loading && rows.length === 0 && !error && (
        <div className="card text-center py-16">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-slate-600 font-medium">Wgraj plik z trasami aby zobaczyć analizę</p>
          <p className="text-sm text-slate-400 mt-1">
            Format: eksport TMS — kolumny Nr pełny, Km ład. wg. mapy, Fracht z walutą, Ciągnik, Kraj zał./roz.
          </p>
        </div>
      )}
    </div>
  );
}
