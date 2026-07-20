"use client";

import { useState } from "react";
import { useSettings, type AppSettings } from "@/lib/settings-context";

// ─── Helpers ─────────────────────────────────────────────────
type Method = "per_dobe" | "per_km";

function MethodToggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: Method;
  onChange: (v: Method) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
      <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5 ml-4 shrink-0">
        <button
          onClick={() => onChange("per_dobe")}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            value === "per_dobe"
              ? "bg-white shadow text-blue-700"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Per dobę
        </button>
        <button
          onClick={() => onChange("per_km")}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            value === "per_km"
              ? "bg-white shadow text-slate-800"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          Per km
        </button>
      </div>
    </div>
  );
}

function NumberField({
  label,
  description,
  value,
  unit,
  step,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  unit?: string;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <div className="flex-1 pr-4">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="number"
          className="w-28 border border-slate-200 rounded-lg px-3 py-1.5 text-sm text-right font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
          value={value}
          step={step ?? 0.01}
          onChange={e => onChange(Number(e.target.value))}
        />
        {unit && <span className="text-xs text-slate-400 w-16">{unit}</span>}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────
export default function KonfiguracjaPage() {
  const { settings, loading, save } = useSettings();
  const [local, setLocal] = useState<AppSettings | null>(null);
  const [saved, setSaved] = useState(false);

  const current = local ?? settings;

  const update = (patch: Partial<AppSettings>) => {
    setLocal(prev => ({ ...(prev ?? settings), ...patch }));
  };

  const handleSave = async () => {
    if (!local) return;
    await save(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  if (loading) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        Ładowanie parametrów...
      </div>
    );
  }

  // Obliczenia podglądowe dla kosztów ogólnych
  const overheadPln = current.overheadMonthlyPln ?? 30000;
  const rate = current.plnEurRate ?? 4.25;
  const activeCount = current.activeVehiclesCount ?? 60;
  const monthlyEur = rate > 0 ? overheadPln / rate : 0;
  const dailyEurPerTruck = activeCount > 0 ? (monthlyEur / (activeCount * 30)) : 0;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">⚙️ Konfiguracja</h1>
          <p className="text-sm text-slate-500 mt-1">
            Globalne parametry kalkulatora — stosowane we wszystkich analizach
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={!local}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
            saved
              ? "bg-emerald-600 text-white"
              : local
              ? "bg-blue-600 hover:bg-blue-700 text-white shadow"
              : "bg-slate-200 text-slate-400 cursor-not-allowed"
          }`}
        >
          {saved ? "✓ Zapisano!" : "Zapisz zmiany"}
        </button>
      </div>

      {/* ── METODY ALOKACJI ──────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">📐</span>
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              Metody alokacji kosztów stałych
            </h2>
            <p className="text-xs text-slate-400">
              <strong className="text-slate-600">Per dobę</strong> — koszt stały ÷ 30 × dni trasy (rekomendowane dla TIR).<br />
              <strong className="text-slate-600">Per km</strong> — koszt stały ÷ avg_km/mies. × km trasy.
            </p>
          </div>
        </div>

        <MethodToggle
          label="Leasing ciągnika"
          description="Rata leasingowa ciągnika alokowana na trasę"
          value={current.leasingMethod}
          onChange={v => update({ leasingMethod: v })}
        />
        <MethodToggle
          label="Leasing naczepy"
          description="Rata leasingowa naczepy alokowana na trasę"
          value={current.trailerLeasingMethod}
          onChange={v => update({ trailerLeasingMethod: v })}
        />
        <MethodToggle
          label="Ubezpieczenie OC+AC"
          description="Składka ubezpieczeniowa alokowana na trasę"
          value={current.insuranceMethod}
          onChange={v => update({ insuranceMethod: v })}
        />
      </div>

      {/* ── KOSZTY OGÓLNE I BANKOWE ────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🏛️</span>
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              Koszty ogólnozakładowe i bankowe
            </h2>
            <p className="text-xs text-slate-400">
              Koszty stałe zarządu, księgowości, prowizji i odsetek bankowych rozliczane po dniu na aktywne ciągniki
            </p>
          </div>
        </div>

        <NumberField
          label="Koszty ogólne (PLN/miesiąc)"
          description="Miesięczna kwota kosztów bankowych i zarządczych firmy"
          value={current.overheadMonthlyPln ?? 30000}
          unit="PLN/mies."
          step={1000}
          onChange={v => update({ overheadMonthlyPln: v })}
        />

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 flex items-center justify-between">
          <div>
            <span className="font-semibold text-slate-800">Alokacja dobowa na pojazd:</span>
            <span className="ml-2 font-mono text-blue-700 font-bold text-sm">
              {dailyEurPerTruck.toFixed(2)} EUR / dobę
            </span>
            <span className="text-slate-400 ml-1">
              (~{(dailyEurPerTruck * rate).toFixed(2)} PLN / dobę)
            </span>
          </div>
          <div className="text-right text-slate-400">
            Dla <strong>{activeCount}</strong> aktywnych aut i kursu <strong>{rate}</strong> PLN/EUR
          </div>
        </div>
      </div>

      {/* ── STAWKI FLOTOWE ───────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">⛽</span>
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              Stawki domyślne flotowe
            </h2>
            <p className="text-xs text-slate-400">
              Używane gdy brak danych per-pojazd. Aktualizuj regularnie.
            </p>
          </div>
        </div>

        <NumberField
          label="Cena ON"
          description="Domyślna cena oleju napędowego netto"
          value={current.fuelPriceEurL}
          unit="EUR/l"
          onChange={v => update({ fuelPriceEurL: v })}
        />
        <NumberField
          label="Kurs PLN/EUR"
          description="Do przeliczania faktur i stawek z PLN na EUR"
          value={current.plnEurRate}
          unit="PLN/EUR"
          onChange={v => update({ plnEurRate: v })}
        />
        <NumberField
          label="Spalanie flotowe"
          description="Średnie spalanie floty — z Trimble FMS"
          value={current.avgFuelL100}
          unit="l/100km"
          step={0.1}
          onChange={v => update({ avgFuelL100: v })}
        />
        <NumberField
          label="Koszt kierowcy"
          description="Koszt netto za dobę pracy (agencja pracy)"
          value={current.driverDailyCost}
          unit="EUR/dobę"
          step={1}
          onChange={v => update({ driverDailyCost: v })}
        />
        <NumberField
          label="AdBlue"
          description="Zużycie AdBlue jako % zużycia ON"
          value={current.adblueRatePct}
          unit="% paliwa"
          step={0.1}
          onChange={v => update({ adblueRatePct: v })}
        />
        <NumberField
          label="Bieg jałowy"
          description="Straty paliwa na biegu jałowym (z Trimble FMS)"
          value={current.idleFuelPct}
          unit="% paliwa"
          step={0.1}
          onChange={v => update({ idleFuelPct: v })}
        />
      </div>

      {/* ── PROGI RENTOWNOŚCI ────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-lg">🎯</span>
          <div>
            <h2 className="text-base font-semibold text-slate-800">
              Progi rentowności
            </h2>
            <p className="text-xs text-slate-400">
              Ustawienia kolorów wskaźników marży w aplikacji.
            </p>
          </div>
        </div>

        <NumberField
          label="Próg dobrej marży (%)"
          description="Marża ≥ tego progu = Rentowna (zielony)"
          value={current.marginGoodPct}
          unit="%"
          step={1}
          onChange={v => update({ marginGoodPct: v })}
        />
        <NumberField
          label="Próg niskiej marży (%)"
          description="Marża między niskim a dobrym = Niska marża (żółty)"
          value={current.marginLowPct}
          unit="%"
          step={1}
          onChange={v => update({ marginLowPct: v })}
        />
      </div>
    </div>
  );
}
