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
  overrideTollEur?: number;        // from ORS real-route calculation (replaces matrix)
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
  avgFuelL100:          27.80,    // Trimble FMS, 55 vehicles, Jan-May 2026
  // Driver cost: agencja pracy 4 700 EUR brutto/kierowcę/mies. (faktura + 23% VAT)
  // Netto = 4 700 / 1.23 = 3 821 EUR/mies. (VAT odliczany)
  // Per km = 3 821 / 11 667 = 0.3275 EUR/km
  driverCostEurMoGross: 4_700,    // EUR brutto (z VAT 23%) — faktura agencji pracy
  driverCostEurMoNet:   3_821,    // EUR netto (po odliczeniu VAT 23%)
  driverCostPerKm:      0.3275,   // 3 821 EUR / 11 667 km/mies.
  serviceCostNewKm:     0.009,    // MAN TGX 2023-2024
  serviceCostOldKm:     0.020,    // MAN TGX 2018-2019, DAF XF 2019
  leasingNewEurMo:      733.33,   // ~8,800 EUR/yr
  leasingOldEurMo:      520.83,   // ~6,250 EUR/yr
  avgKmPerMonth:        11_667,   // 140k km/yr
  idleFuelPct:          0.021,    // 2.1% idle losses (Trimble FMS Jan-May 2026)
  adblueRatePct:        0.035,    // AdBlue = 3.5% of diesel volume
} as const;

// ─── Toll matrix EUR/100km (calibrated from real TMS fleet data 2025-2026) ─
// Source: actual DKV/viaTOLL invoices cross-referenced with TMS route segments
// PL: ViaTOLL HGV avg 0.13 EUR/km (was 0.042 — grossly underestimated)
// DE: Autobahn Maut EURO VI ~0.30-0.34 EUR/km avg (was 0.185)
// CZ: Czech toll HGV avg ~0.20 EUR/km (was 0.08)
// FR: Autoroutes HGV avg ~0.30 EUR/km (small sample — may be adjusted)
export const TOLL_MATRIX: Record<string, number> = {
  PL: 13.00,
  DE: 30.00,
  FR: 30.00,
  IT: 27.00,
  ES: 14.00,
  AT: 22.00,
  CZ: 20.00,
  HU: 12.00,
  NL: 14.00,
  BE: 15.00,
  LU: 11.00,
  CH: 38.00,
  SI: 18.00,
  HR: 18.00,
  SK: 14.00,
  RO:  8.00,
  BG:  6.00,
  PT: 18.00,
  SE: 12.00,
  DK: 13.00,
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

  // 4. TOLLS — use ORS real-route value if available, else matrix average
  let tollCost: number;
  if (input.overrideTollEur != null && input.overrideTollEur > 0) {
    tollCost = input.overrideTollEur;
  } else {
    const countries = transitCountries && transitCountries.length > 0
      ? transitCountries
      : [originCountry, destCountry];
    const uniqueCountries = Array.from(new Set(countries));
    const tollRates = uniqueCountries.map(c => TOLL_MATRIX[c] ?? 8.0);
    const avgToll   = tollRates.reduce((a, b) => a + b, 0) / tollRates.length;
    tollCost = (avgToll / 100) * distanceKm;
  }

  // 5. DRIVER — agencja pracy: 4 700 EUR brutto/mies. → 3 821 EUR netto/mies. → 0.3275 EUR/km
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
