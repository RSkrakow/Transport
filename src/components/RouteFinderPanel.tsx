"use client";

import { useState } from "react";

interface CountrySegment {
  iso2: string;
  name: string;
  distanceKm: number;
  tollEurPer100km: number;
  tollEur: number;
}

interface RouteResult {
  from: string;
  to: string;
  distanceKm: number;
  durationH: number;
  countries: CountrySegment[];
  totalTollEur: number;
  source: "ors" | "estimate";
  error?: string;
}

interface Props {
  onRouteCalculated?: (distanceKm: number, tollEur: number, countries: string[]) => void;
}

const FLAG: Record<string, string> = {
  PL: "🇵🇱", DE: "🇩🇪", FR: "🇫🇷", IT: "🇮🇹", ES: "🇪🇸",
  AT: "🇦🇹", CZ: "🇨🇿", HU: "🇭🇺", NL: "🇳🇱", BE: "🇧🇪",
  LU: "🇱🇺", CH: "🇨🇭", SI: "🇸🇮", HR: "🇭🇷", SK: "🇸🇰",
  RO: "🇷🇴", BG: "🇧🇬", PT: "🇵🇹", SE: "🇸🇪", DK: "🇩🇰",
  GB: "🇬🇧", UA: "🇺🇦",
};

export default function RouteFinderPanel({ onRouteCalculated }: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo]     = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState<RouteResult | null>(null);
  const [error, setError]     = useState<string | null>(null);

  async function handleCalculate() {
    if (!from.trim() || !to.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: from.trim(), to: to.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Błąd serwera");
      } else {
        setResult(data);
        if (onRouteCalculated && data.distanceKm) {
          onRouteCalculated(
            data.distanceKm,
            data.totalTollEur,
            data.countries.map((c: CountrySegment) => c.iso2)
          );
        }
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleCalculate();
  }

  const hasOrs   = result?.source === "ors";
  const hasCountries = result && result.countries.length > 0;

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">🗺️</span>
        <h3 className="font-bold text-slate-800">Kalkulator trasy HGV</h3>
        <span className="ml-auto text-xs text-slate-400">
          Myto per kraj · Real routing
        </span>
      </div>

      {/* Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Miasto wyjazdu</label>
          <input
            type="text"
            className="input-field"
            placeholder="np. Warszawa, Wrocław, Katowice"
            value={from}
            onChange={e => setFrom(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div>
          <label className="label">Miasto docelowe</label>
          <input
            type="text"
            className="input-field"
            placeholder="np. Hamburg, Milano, Lyon"
            value={to}
            onChange={e => setTo(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>

      <button
        onClick={handleCalculate}
        disabled={loading || !from.trim() || !to.trim()}
        className="btn-primary w-full sm:w-auto flex items-center gap-2 justify-center"
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Obliczam trasę…
          </>
        ) : (
          "Oblicz trasę i myto"
        )}
      </button>

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
          ✗ {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-3">
          {/* Summary bar */}
          <div className={`rounded-lg border px-4 py-3 flex items-center justify-between flex-wrap gap-3 ${
            hasOrs ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
          }`}>
            <div>
              <p className="text-sm font-semibold text-slate-700">
                {result.from} → {result.to}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {hasOrs
                  ? "✓ Trasa HGV z OpenRouteService"
                  : "⚠ Szacunek (brak klucza ORS lub błąd API)"}
              </p>
              {result.error && (
                <p className="text-xs text-amber-700 mt-0.5">{result.error}</p>
              )}
            </div>
            <div className="flex gap-6 text-right">
              <div>
                <p className="text-xs text-slate-500">Dystans</p>
                <p className="text-xl font-bold text-slate-800">
                  {result.distanceKm.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} km
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Czas jazdy</p>
                <p className="text-xl font-bold text-slate-700">
                  {Math.floor(result.durationH)}h{" "}
                  {Math.round((result.durationH % 1) * 60)}m
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Myto łącznie</p>
                <p className="text-xl font-bold text-blue-700">
                  {result.totalTollEur > 0
                    ? `${result.totalTollEur.toFixed(2)} EUR`
                    : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Country breakdown */}
          {hasCountries && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Rozbicie opłat drogowych per kraj
                </p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-4 py-2 text-xs font-semibold text-slate-500">Kraj</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500">Km</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500">Stawka/100km</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-slate-500">Myto EUR</th>
                    <th className="px-4 py-2 text-xs font-semibold text-slate-500">Udział</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {result.countries.map((c) => {
                    const pct = (c.distanceKm / result.distanceKm) * 100;
                    return (
                      <tr key={c.iso2} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-medium text-slate-800">
                          <span className="mr-2">{FLAG[c.iso2] ?? "🏳️"}</span>
                          {c.name}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-600">
                          {c.distanceKm.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} km
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-500 text-xs">
                          {c.tollEurPer100km.toFixed(2)} €/100
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-blue-700">
                          {c.tollEur.toFixed(2)} €
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-slate-200 rounded-full h-1.5">
                              <div
                                className="bg-blue-500 h-1.5 rounded-full"
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-400 w-8 text-right">
                              {pct.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t-2 border-slate-200 font-bold">
                    <td className="px-4 py-2.5 text-slate-800">SUMA</td>
                    <td className="px-4 py-2.5 text-right text-slate-800">
                      {result.distanceKm.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} km
                    </td>
                    <td />
                    <td className="px-4 py-2.5 text-right text-blue-800 text-base">
                      {result.totalTollEur.toFixed(2)} €
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* If ORS returned no country data but has distance */}
          {result && !hasCountries && result.distanceKm > 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 rounded px-3 py-2">
              ℹ️ Brak rozbicia per kraj — skonfiguruj klucz ORS_API_KEY w .env.local
              aby uzyskać rzeczywiste myto per kraj.
              Rejestracja bezpłatna: <strong>openrouteservice.org</strong>
            </div>
          )}

          {/* Apply to calculator button */}
          {onRouteCalculated && result.distanceKm > 0 && (
            <button
              onClick={() =>
                onRouteCalculated(
                  result.distanceKm,
                  result.totalTollEur,
                  result.countries.map(c => c.iso2)
                )
              }
              className="w-full py-2 rounded-lg border-2 border-blue-600 text-blue-600 text-sm font-semibold
                         hover:bg-blue-600 hover:text-white transition-colors"
            >
              ← Użyj tej trasy w kalkulatorze
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-slate-400">
        Routing: OpenRouteService HGV · Geocoding: Nominatim/OSM ·
        Stawki myto: HBM Audyt 2025 (aktualizuj z faktur DKV/UTA)
      </p>
    </div>
  );
}
