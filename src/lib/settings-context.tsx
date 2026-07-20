"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { type CalcSettings } from "@/lib/calculator";

// ─── Full app settings (superset of CalcSettings) ────────────
export interface AppSettings extends CalcSettings {
  fuelPriceEurL:         number;
  plnEurRate:            number;
  overheadMonthlyPln:    number;   // Koszty ogólne i bankowe (PLN/miesiąc)
  activeVehiclesCount:   number;   // Liczba aktywnych ciągników (default 60)
  // Budget module settings
  kmTargetMo?:           number;   // min km/month per tractor (default 10 000)
  tollEurPerKm?:         number;   // avg toll EUR/km (default 0.30)
  budgetMarginPct?:      number;   // target margin % (default 10)
}

export const SETTINGS_DEFAULTS: AppSettings = {
  leasingMethod:        "per_dobe",
  trailerLeasingMethod: "per_dobe",
  insuranceMethod:      "per_dobe",
  fuelPriceEurL:        1.25,
  plnEurRate:           4.25,
  avgFuelL100:          27.80,
  driverDailyCost:      181.95,
  adblueRatePct:        3.5,
  idleFuelPct:          2.1,
  avgKmPerMonth:        11_667,
  marginGoodPct:        15,
  marginLowPct:         5,
  overheadMonthlyPln:   30_000,
  activeVehiclesCount:  60,
  kmTargetMo:           10_000,
  tollEurPerKm:         0.30,
  budgetMarginPct:      10,
};

interface SettingsCtx {
  settings:    AppSettings;
  loading:     boolean;
  reload:      () => Promise<void>;
  save:        (updates: Partial<AppSettings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsCtx>({
  settings: SETTINGS_DEFAULTS,
  loading:  true,
  reload:   async () => {},
  save:     async () => {},
});

// ─── Map Supabase rows → AppSettings ─────────────────────────
function rowsToSettings(rows: { key: string; value: string }[], activeVehicles: number): AppSettings {
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  return {
    leasingMethod:        (map.leasing_method         ?? "per_dobe") as AppSettings["leasingMethod"],
    trailerLeasingMethod: (map.trailer_leasing_method ?? "per_dobe") as AppSettings["trailerLeasingMethod"],
    insuranceMethod:      (map.insurance_method       ?? "per_dobe") as AppSettings["insuranceMethod"],
    fuelPriceEurL:        Number(map.fuel_price_eur_l   ?? 1.25),
    plnEurRate:           Number(map.pln_eur_rate        ?? 4.25),
    avgFuelL100:          Number(map.avg_fuel_l100       ?? 27.80),
    driverDailyCost:      Number(map.driver_daily_cost   ?? 181.95),
    adblueRatePct:        Number(map.adblue_rate_pct     ?? 3.5),
    idleFuelPct:          Number(map.idle_fuel_pct       ?? 2.1),
    avgKmPerMonth:        Number(map.avg_km_per_month    ?? 11_667),
    marginGoodPct:        Number(map.margin_good_pct     ?? 15),
    marginLowPct:         Number(map.margin_low_pct      ?? 5),
    overheadMonthlyPln:   Number(map.overhead_monthly_pln ?? 30_000),
    activeVehiclesCount:  activeVehicles > 0 ? activeVehicles : Number(map.active_vehicles_count ?? 60),
    kmTargetMo:           Number(map.km_target_mo        ?? 10_000),
    tollEurPerKm:         Number(map.toll_eur_per_km     ?? 0.30),
    budgetMarginPct:      Number(map.budget_margin_pct  ?? 10),
  };
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(SETTINGS_DEFAULTS);
  const [loading, setLoading]   = useState(true);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const [{ data, error }, { count }] = await Promise.all([
        supabase.from("settings").select("key, value"),
        supabase.from("vehicles").select("*", { count: "exact", head: true }).eq("is_active", true),
      ]);

      const activeVehicles = count && count > 0 ? count : 60;

      if (!error && data && data.length > 0) {
        setSettings(rowsToSettings(data, activeVehicles));
      } else {
        setSettings({ ...SETTINGS_DEFAULTS, activeVehiclesCount: activeVehicles });
      }
    } catch {
      setSettings(SETTINGS_DEFAULTS);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const save = async (updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));

    const keyMap: Record<string, string> = {
      leasingMethod:        "leasing_method",
      trailerLeasingMethod: "trailer_leasing_method",
      insuranceMethod:      "insurance_method",
      fuelPriceEurL:        "fuel_price_eur_l",
      plnEurRate:           "pln_eur_rate",
      avgFuelL100:          "avg_fuel_l100",
      driverDailyCost:      "driver_daily_cost",
      adblueRatePct:        "adblue_rate_pct",
      idleFuelPct:          "idle_fuel_pct",
      avgKmPerMonth:        "avg_km_per_month",
      marginGoodPct:        "margin_good_pct",
      marginLowPct:         "margin_low_pct",
      overheadMonthlyPln:   "overhead_monthly_pln",
      kmTargetMo:           "km_target_mo",
      tollEurPerKm:         "toll_eur_per_km",
      budgetMarginPct:      "budget_margin_pct",
    };

    const upserts = Object.entries(updates)
      .filter(([k]) => k in keyMap)
      .map(([k, v]) => ({
        key:        keyMap[k],
        value:      String(v),
        label:      k,
        updated_at: new Date().toISOString(),
      }));

    if (upserts.length > 0) {
      await supabase.from("settings").upsert(upserts, { onConflict: "key" });
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, loading, reload: fetchSettings, save }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
