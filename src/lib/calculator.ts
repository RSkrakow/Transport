// ============================================================
// TruckCalc HBM — Core Calculation Engine
// All monetary values in EUR
// Based on fleet analysis: 67 tractors, 5,180,419 km, 2024-2025
// ============================================================

export interface RouteInput {
  originCountry: string;           // ISO-2
  destCountry: string;             // ISO-2
  distanceKm: number;
  fuelPriceEurL: number;           // default 1.25
  vehicleReg?: string;
  avgFuelL100?: number;            // override; default fleet avg 29.62
  freightEur: number;
  transitCountries?: string[];     // incl. origin & dest for toll calc
  leasingEurMo?: number;           // vehicle-specific if known
  vehicleYearProduced?: number;    // for service cost tier
  avoidHighways?: boolean;
}

export interface CostBreakdown {
  fuel: number;
  adblue: number;
  toll: number;
  driver: number;
  leasing: number;
  service: number;
  idle: number;
  total: number;
  marginEur: number;
  marginPct: number;
  minProfitableFreight: number;
  // per-km summary
  costPerKm: number;
  revenuePerKm: number;
}

// ─── Fleet constants (from our data analysis) ────────────────
export const FLEET = {
  avgFuelL100:       29.62,   // Trimble FMS, 67 tractors
  driverCostPerKm:   0.643,   // 3,328,285 EUR / 5,180,419 km
  serviceCostNewKm:  0.009,   // MAN TGX 2023-2024
  serviceCostOldKm:  0.020,   // MAN TGX 2018-2019, DAF XF 2019
  leasingNewEurMo:   733.33,  // ~8,800 EUR/yr
  leasingOldEurMo:   520.83,  // ~6,250 EUR/yr
  avgKmPerMonth:     11_667,  // 140k km/yr
  idleFuelPct:       0.0922,  // 9.22% of fuel cost = idle losses
  adblueRatePct:     0.035,   // AdBlue = 3.5% of diesel volume
} as const;

// ─── Toll matrix EUR/100km (seeded from wydatki.xls + market) ─
export const TOLL_MATRIX: Record<string, number> = {
  PL:  4.20,
  DE: 18.50,
  FR: 20.00,
  IT: 22.50,
  ES: 10.50,
  AT: 16.20,
  CZ:  8.00,
  HU:  6.50,
  NL: 12.00,
  BE: 13.50,
  LU:  9.00,
  CH: 32.00,
  SI: 15.00,
  HR: 14.00,
  SK:  8.50,
  RO:  5.50,
  BG:  4.00,
  PT: 14.00,
  SE: 10.00,
  DK: 11.00,
};

// ─── Main calculation ─────────────────────────────────────────
export function calculateRoute(input: RouteInput): CostBreakdown {
  const {
    distanceKm,
    fuelPriceEurL,
    freightEur,
    transitCountries,
    originCountry,
    destCountry,
    leasingEurMo,
    vehicleYearProduced,
  } = input;

  const fuelL100 = input.avgFuelL100 ?? FLEET.avgFuelL100;

  // 1. FUEL — l/100km × distance
  const fuelLiters = (fuelL100 / 100) * distanceKm;
  const fuelCost   = fuelLiters * fuelPriceEurL;

  // 2. ADBLUE — 3.5% of diesel volume × ~0.35 EUR/l (avg market)
  const adblue = fuelLiters * FLEET.adblueRatePct * 0.35;

  // 3. IDLE FUEL LOSSES — 9.22% of fuel cost (from our data)
  const idle = fuelCost * FLEET.idleFuelPct;

  // 4. TOLLS — average toll across countries on route
  const countries = transitCountries && transitCountries.length > 0
    ? transitCountries
    : [originCountry, destCountry];

  const uniqueCountries = Array.from(new Set(countries));
  const tollRates = uniqueCountries.map(c => TOLL_MATRIX[c] ?? 8.0);
  const avgToll   = tollRates.reduce((a, b) => a + b, 0) / tollRates.length;
  const tollCost  = (avgToll / 100) * distanceKm;

  // 5. DRIVER — EUR/km (includes wages, social, per diems averaged)
  const driverCost = FLEET.driverCostPerKm * distanceKm;

  // 6. SERVICE — new vs old vehicle tier
  const isNewVehicle = vehicleYearProduced ? vehicleYearProduced >= 2022 : false;
  const serviceCostKm = isNewVehicle
    ? FLEET.serviceCostNewKm
    : FLEET.serviceCostOldKm;
  const serviceCost = serviceCostKm * distanceKm;

  // 7. LEASING — pro-rata per km
  const leasingMo = leasingEurMo
    ?? (isNewVehicle ? FLEET.leasingNewEurMo : FLEET.leasingOldEurMo);
  const leasingPerKm = leasingMo / FLEET.avgKmPerMonth;
  const leasingCost  = leasingPerKm * distanceKm;

  // ─── Totals ───────────────────────────────────────────────
  const total = fuelCost + adblue + idle + tollCost + driverCost + serviceCost + leasingCost;

  const marginEur = freightEur - total;
  const marginPct = freightEur > 0 ? (marginEur / freightEur) * 100 : 0;

  // Break-even freight = total costs / (1 - desired margin buffer 0%)
  const minProfitableFreight = total;

  const costPerKm    = total / distanceKm;
  const revenuePerKm = freightEur / distanceKm;

  return {
    fuel:    round2(fuelCost),
    adblue:  round2(adblue),
    idle:    round2(idle),
    toll:    round2(tollCost),
    driver:  round2(driverCost),
    service: round2(serviceCost),
    leasing: round2(leasingCost),
    total:   round2(total),
    marginEur:             round2(marginEur),
    marginPct:             round2(marginPct),
    minProfitableFreight:  round2(minProfitableFreight),
    costPerKm:             round2(costPerKm),
    revenuePerKm:          round2(revenuePerKm),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── Helpers ──────────────────────────────────────────────────
export function profitabilityLabel(marginPct: number): {
  label: string;
  color: string;
} {
  if (marginPct >= 15) return { label: "Rentowna", color: "emerald" };
  if (marginPct >= 5)  return { label: "Niska marża", color: "amber" };
  if (marginPct >= 0)  return { label: "Próg rentowności", color: "orange" };
  return { label: "STRATA", color: "red" };
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
