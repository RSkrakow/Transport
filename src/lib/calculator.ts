// ============================================================
// TruckCalc HBM — Core Calculation Engine
// All monetary values in EUR
// Based on fleet analysis: 67 tractors, 5,180,419 km, 2024-2025
// ============================================================

export interface RouteInput {
  originCountry: string;           // ISO-2
  destCountry: string;             // ISO-2
  distanceKm: number;              // km ładowne (loaded km) — for revenue/km display
  emptyKm?: number;                // km puste (deadhead/empty run) — added to cost base
  fuelPriceEurL: number;           // default 1.25
  vehicleReg?: string;
  avgFuelL100?: number;            // override; default fleet avg 27.80
  freightEur: number;
  transitCountries?: string[];     // incl. origin & dest for toll calc
  overrideTollEur?: number;        // from ORS real-route calculation (replaces matrix)
  leasingEurMo?: number;           // vehicle-specific netto EUR/mo (tractor)
  trailerLeasingEurMo?: number;    // naczepa leasing EUR/mo (from fleet pairing or avg)
  insuranceEurMo?: number;         // OC+AC EUR/mo per vehicle (from Supabase)
  serviceCostKmOverride?: number;  // EUR/km override per vehicle (from Supabase)
  avgKmPerMonthActual?: number;    // DEPRECATED
  routeDays?: number;              // actual route duration in days (from TMS dates or ceil(km/570))
  vehicleYearProduced?: number;    // for service cost tier
  avoidHighways?: boolean;
  perDobeShareFactor?: number;     // default 1.0 (pełna dniówka)
  overheadMonthlyPln?: number;     // opcjonalny override miesięczny koszów ogólnych w PLN
  plnEurRate?: number;             // opcjonalny kurs PLN/EUR
  activeVehiclesCount?: number;    // opcjonalny override liczby aktywnych pojazdów
}

export interface CalcSettings {
  leasingMethod: "per_dobe" | "per_km";
  trailerLeasingMethod: "per_dobe" | "per_km";
  insuranceMethod: "per_dobe" | "per_km";
  avgFuelL100: number;
  driverDailyCost: number;
  adblueRatePct: number;
  idleFuelPct: number;
  avgKmPerMonth: number;
  marginGoodPct: number;
  marginLowPct: number;
  overheadMonthlyPln?: number;
  plnEurRate?: number;
  activeVehiclesCount?: number;
}

export interface CostBreakdown {
  fuel: number;
  adblue: number;
  toll: number;
  insurance: number;
  driver: number;
  leasing: number;        // tractor leasing
  trailerLeasing: number; // naczepa leasing
  service: number;
  idle: number;
  overhead: number;       // Koszty ogólne i bankowe
  total: number;
  marginEur: number;
  marginPct: number;
  minProfitableFreight: number;
  // per-km summary
  costPerKm: number;
  revenuePerKm: number;
  // route info
  routeDays: number;      // doby trasy użyte w kalkulacji
  euroClass: number;
}

// ─── Fleet constants (from our data analysis) ────────────────
export const FLEET = {
  avgFuelL100:             27.80,   // Trimble FMS, 55 vehicles
  driverCostEurMoGross:     4_700,  // EUR brutto (agencja pracy + VAT 23%)
  driverCostEurMoNet:       3_821,  // EUR netto
  driverCostPerKmFlat:      0.39,   // EUR/km flat fallback
  driverWorkDaysPerMonth:   21,     // dni robocze TIR/mies.
  driverDailyCostNet:        181.95, // 3821 / 21 = 181.95 EUR/dobę
  driverKmPerDay:            570,    // śr. km/dobę HBM
  serviceCostNewKm:          0.009,  // MAN TGX 2023-2024
  serviceCostOldKm:          0.020,  // MAN TGX 2018-2019, DAF XF 2019
  leasingNewEurMo:          733.33,  // ciągnik ≥2022
  leasingOldEurMo:          520.83,  // ciągnik <2022
  trailerLeasingNewEurMo:   458.33,  // naczepa ≥2020
  trailerLeasingOldEurMo:   333.33,  // naczepa <2020
  avgKmPerMonth:           11_667,  // 140k km/yr fleet default
  idleFuelPct:             0.021,   // 2.1% idle losses
  adblueRatePct:           0.035,   // AdBlue = 3.5% of diesel volume
  insuranceEurMo:          188.0,   // EUR/mies. fleet avg OC+AC
  overheadMonthlyPln:      30_000,  // Koszty ogólne i bankowe domyślne w PLN
  plnEurRate:              4.25,    // Kurs przeliczeniowy PLN/EUR
  activeVehiclesCount:     60,      // Domyślna liczba aktywnych pojazdów
} as const;

// ─── Toll matrix EUR/100km ───────────────────────────────────
export const TOLL_MATRIX: Record<string, number> = {
  PL: 13.00,
  DE: 32.00,
  FR: 30.00,
  IT: 22.50,
  ES: 10.50,
  AT: 16.20,
  CZ: 20.00,
  HU: 6.50,
  NL: 12.00,
  BE: 13.50,
  LU: 9.00,
  CH: 32.00,
  SI: 15.00,
  HR: 14.00,
  SK: 8.50,
};

export function profitabilityLabel(marginPct: number) {
  if (marginPct >= 15) return { label: "Rentowna (Dobra marża)", color: "emerald" };
  if (marginPct >= 5)  return { label: "Niska marża", color: "amber" };
  if (marginPct >= 0)  return { label: "Na granicy progu", color: "orange" };
  return { label: "Deficytowa (Strata)", color: "red" };
}

// ─── Main Calculation Engine ────────────────────────────────
export function calculateRouteCost(input: RouteInput, settings?: Partial<CalcSettings>): CostBreakdown {
  const totalKm = input.distanceKm + (input.emptyKm ?? 0);

  // 1. Doby trasy
  const routeDays = input.routeDays && input.routeDays > 0
    ? input.routeDays
    : Math.max(1, Math.ceil(totalKm / FLEET.driverKmPerDay));

  const perDobeFactor = input.perDobeShareFactor ?? 1.0;

  // 2. Spalanie i paliwo
  const avgFuel = input.avgFuelL100 ?? settings?.avgFuelL100 ?? FLEET.avgFuelL100;
  const fuelLitersTotal = (totalKm / 100) * avgFuel;
  const fuelCostNet = fuelLitersTotal * input.fuelPriceEurL;

  // AdBlue i Idle
  const adbluePct = (settings?.adblueRatePct ?? (FLEET.adblueRatePct * 100)) / 100;
  const adblueCost = fuelCostNet * adbluePct;

  const idlePct = (settings?.idleFuelPct ?? (FLEET.idleFuelPct * 100)) / 100;
  const idleCost = fuelCostNet * idlePct;

  const fuelCost = fuelCostNet + adblueCost + idleCost;

  // 3. Opłaty drogowe (Toll)
  let tollCost = 0;
  if (input.overrideTollEur !== undefined) {
    tollCost = input.overrideTollEur;
  } else {
    const countries = input.transitCountries ?? [input.originCountry, input.destCountry];
    const uniqueCountries = Array.from(new Set(countries));
    const distPerCountry = totalKm / Math.max(1, uniqueCountries.length);

    tollCost = uniqueCountries.reduce((sum, c) => {
      const rate100 = TOLL_MATRIX[c] ?? 12.00;
      return sum + (distPerCountry / 100) * rate100;
    }, 0);
  }

  // 4. Koszt kierowcy
  const driverDaily = settings?.driverDailyCost ?? FLEET.driverDailyCostNet;
  const driverCost = driverDaily * routeDays * perDobeFactor;

  // 5. Serwis
  let serviceRateKm = FLEET.serviceCostNewKm;
  if (input.serviceCostKmOverride !== undefined) {
    serviceRateKm = input.serviceCostKmOverride;
  } else if (input.vehicleYearProduced && input.vehicleYearProduced < 2022) {
    serviceRateKm = FLEET.serviceCostOldKm;
  }
  const serviceCost = totalKm * serviceRateKm;

  // 6. Leasing ciągnika
  const leasingMo = input.leasingEurMo ?? (
    input.vehicleYearProduced && input.vehicleYearProduced < 2022
      ? FLEET.leasingOldEurMo
      : FLEET.leasingNewEurMo
  );

  const leasingMethod = settings?.leasingMethod ?? "per_dobe";
  const leasingCost = leasingMethod === "per_dobe"
    ? (leasingMo / 30) * routeDays * perDobeFactor
    : (leasingMo / (settings?.avgKmPerMonth ?? FLEET.avgKmPerMonth)) * totalKm;

  // 7. Leasing naczepy
  const trailerLeasingMo = input.trailerLeasingEurMo ?? FLEET.trailerLeasingNewEurMo;
  const trailerLeasingMethod = settings?.trailerLeasingMethod ?? "per_dobe";
  const trailerLeasingCost = trailerLeasingMethod === "per_dobe"
    ? (trailerLeasingMo / 30) * routeDays * perDobeFactor
    : (trailerLeasingMo / (settings?.avgKmPerMonth ?? FLEET.avgKmPerMonth)) * totalKm;

  // 8. Ubezpieczenie OC+AC
  const insuranceMo = input.insuranceEurMo ?? FLEET.insuranceEurMo;
  const insuranceMethod = settings?.insuranceMethod ?? "per_dobe";
  const insuranceCost = insuranceMethod === "per_dobe"
    ? (insuranceMo / 30) * routeDays * perDobeFactor
    : (insuranceMo / (settings?.avgKmPerMonth ?? FLEET.avgKmPerMonth)) * totalKm;

  // 9. Koszty ogólne i bankowe (Overhead) — podział po dniu per aktywny ciągnik
  const overheadMonthlyPln = input.overheadMonthlyPln ?? settings?.overheadMonthlyPln ?? FLEET.overheadMonthlyPln;
  const plnEurRate = input.plnEurRate ?? settings?.plnEurRate ?? FLEET.plnEurRate;
  const activeVehiclesCount = input.activeVehiclesCount ?? settings?.activeVehiclesCount ?? FLEET.activeVehiclesCount;

  const overheadMonthlyEur = overheadMonthlyPln / Math.max(1, plnEurRate);
  const dailyOverheadEurPerTruck = overheadMonthlyEur / (Math.max(1, activeVehiclesCount) * 30);
  const overheadCost = dailyOverheadEurPerTruck * routeDays * perDobeFactor;

  // 10. Podsumowanie finansowe
  const totalCost = fuelCost + tollCost + driverCost + serviceCost + leasingCost + trailerLeasingCost + insuranceCost + overheadCost;

  const marginEur = input.freightEur - totalCost;
  const marginPct = input.freightEur > 0 ? (marginEur / input.freightEur) * 100 : 0;
  const minProfitableFreight = totalCost;

  const costPerKm = totalKm > 0 ? totalCost / totalKm : 0;
  const revenuePerKm = input.distanceKm > 0 ? input.freightEur / input.distanceKm : 0;

  return {
    fuel: Math.round(fuelCost * 100) / 100,
    adblue: Math.round(adblueCost * 100) / 100,
    toll: Math.round(tollCost * 100) / 100,
    insurance: Math.round(insuranceCost * 100) / 100,
    driver: Math.round(driverCost * 100) / 100,
    leasing: Math.round(leasingCost * 100) / 100,
    trailerLeasing: Math.round(trailerLeasingCost * 100) / 100,
    service: Math.round(serviceCost * 100) / 100,
    idle: Math.round(idleCost * 100) / 100,
    overhead: Math.round(overheadCost * 100) / 100,
    total: Math.round(totalCost * 100) / 100,
    marginEur: Math.round(marginEur * 100) / 100,
    marginPct: Math.round(marginPct * 10) / 10,
    minProfitableFreight: Math.round(minProfitableFreight * 100) / 100,
    costPerKm: Math.round(costPerKm * 1000) / 1000,
    revenuePerKm: Math.round(revenuePerKm * 1000) / 1000,
    routeDays,
    euroClass: 6,
  };
}

// ─── Exported Aliases & Helpers ──────────────────────────────
export const calculateRoute = calculateRouteCost;

export function euroClass(year?: number | null): number {
  if (!year) return 6;
  if (year >= 2014) return 6;
  if (year >= 2009) return 5;
  if (year >= 2006) return 4;
  return 3;
}

export function countryName(iso: string): string {
  const map: Record<string, string> = {
    PL: "Polska", DE: "Niemcy", FR: "Francja", IT: "Włochy",
    ES: "Hiszpania", AT: "Austria", CZ: "Czechy", HU: "Węgry",
    NL: "Holandia", BE: "Belgia", LU: "Luksemburg", CH: "Szwajcaria",
    SI: "Słowenia", HR: "Chorwacja", SK: "Słowacja", RO: "Rumunia",
    BG: "Bułgaria", PT: "Portugalia", SE: "Szwecja", DK: "Dania",
    GB: "Wielka Brytania",
  };
  return map[iso] ?? iso;
}

export const COUNTRY_OPTIONS = Object.entries({
  PL: "Polska", DE: "Niemcy", FR: "Francja", IT: "Włochy",
  ES: "Hiszpania", AT: "Austria", CZ: "Czechy", HU: "Węgry",
  NL: "Holandia", BE: "Belgia", LU: "Luksemburg", CH: "Szwajcaria",
  SI: "Słowenia", HR: "Chorwacja", SK: "Słowacja", RO: "Rumunia",
  BG: "Bułgaria", PT: "Portugalia", SE: "Szwecja", DK: "Dania",
}).map(([iso, name]) => ({ iso, name }));

