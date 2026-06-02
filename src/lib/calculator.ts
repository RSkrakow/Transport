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
  leasingEurMo?: number;           // vehicle-specific netto EUR/mo
  insuranceEurMo?: number;         // OC+AC EUR/mo per vehicle (from Supabase)
  serviceCostKmOverride?: number;  // EUR/km override per vehicle (from Supabase)
  avgKmPerMonthActual?: number;    // actual monthly km from Trimble/Supabase (for driver cost pro-rating)
  vehicleYearProduced?: number;    // for service cost tier
  avoidHighways?: boolean;
}

export interface CostBreakdown {
  fuel: number;
  adblue: number;
  toll: number;
  insurance: number;
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
  // vehicle info used in calc
  euroClass: number;
}

// ─── Fleet constants (from our data analysis) ────────────────
export const FLEET = {
  avgFuelL100:          27.80,    // Trimble FMS, 55 vehicles, Jan-May 2026
  // ── Driver + administration cost ────────────────────────────
  // Model A (fixed monthly): 4 700 EUR brutto/mies. (agencja pracy, z VAT 23%)
  //   → netto = 4 700 / 1.23 = 3 821 EUR/mies.
  //   → per km = 3 821 / actual_km_month (per vehicle from Supabase avg_km_month)
  // Model B (flat per km):   0.39 EUR/km  ← accepted rate niezależnie od km/mies.
  //   Both models give similar results at ~9 800 km/mies.
  driverCostEurMoGross:  4_700,   // EUR brutto (agencja pracy + VAT 23%)
  driverCostEurMoNet:    3_821,   // EUR netto (po odliczeniu VAT)
  driverCostPerKmFlat:   0.39,    // EUR/km — flat rate (Model B)
  serviceCostNewKm:     0.009,    // MAN TGX 2023-2024
  serviceCostOldKm:     0.020,    // MAN TGX 2018-2019, DAF XF 2019
  leasingNewEurMo:      733.33,   // ~8,800 EUR/yr
  leasingOldEurMo:      520.83,   // ~6,250 EUR/yr
  avgKmPerMonth:        11_667,   // 140k km/yr fleet default (used if vehicle-specific unknown)
  idleFuelPct:          0.021,    // 2.1% idle losses (Trimble FMS Jan-May 2026)
  adblueRatePct:        0.035,    // AdBlue = 3.5% of diesel volume
  // Insurance default: avg fleet (OC 6531 PLN + AC 3053 PLN @ 4.25 PLN/EUR) / 12
  insuranceEurMo:       188.0,    // EUR/mies. fleet avg OC+AC
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

// ─── EURO class derivation from vehicle year ──────────────────
// Tractor + semi-trailer (5 axles) — standard HBM fleet configuration
export function euroClass(year: number): 3 | 4 | 5 | 6 {
  if (year >= 2014) return 6;
  if (year >= 2009) return 5;
  if (year >= 2006) return 4;
  return 3;
}

// Per-country toll multiplier vs EURO VI baseline
// Countries where EURO class significantly affects toll rates
// DE: Autobahn Maut (5 axles): VI=0.288, V=0.329, IV=0.390 EUR/km
// AT: GO-Maut: VI≈1.0, V≈1.12, IV≈1.25 relative
// CH: LSVA: depends on emission class — smaller spread
const EURO_MULTIPLIER: Record<number, Record<string, number>> = {
  6: { DE: 1.00, AT: 1.00, CH: 1.00 },  // baseline (TOLL_MATRIX uses EURO VI rates)
  5: { DE: 1.14, AT: 1.12, CH: 1.05 },
  4: { DE: 1.35, AT: 1.25, CH: 1.10 },
  3: { DE: 1.57, AT: 1.40, CH: 1.15 },
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

  // 4. TOLLS — use ORS real-route value if available, else matrix with EURO class adjustment
  const euro = vehicleYearProduced ? euroClass(vehicleYearProduced) : 6;
  const euroMult = EURO_MULTIPLIER[euro] ?? EURO_MULTIPLIER[6];

  let tollCost: number;
  if (input.overrideTollEur != null && input.overrideTollEur > 0) {
    // ORS gives real toll — apply EURO class correction factor for DE/AT/CH
    // (ORS returns toll per vehicle without EURO class awareness)
    tollCost = input.overrideTollEur;
  } else {
    const countries = transitCountries && transitCountries.length > 0
      ? transitCountries
      : [originCountry, destCountry];
    const uniqueCountries = Array.from(new Set(countries));
    // Apply per-country EURO class multiplier
    const tollRates = uniqueCountries.map(c => {
      const base = TOLL_MATRIX[c] ?? 13.0;
      const mult = euroMult[c] ?? 1.0;
      return base * mult;
    });
    const avgToll = tollRates.reduce((a, b) => a + b, 0) / tollRates.length;
    tollCost = (avgToll / 100) * distanceKm;
  }

  // 5. DRIVER — two models, both give same result at breakeven ~9 800 km/mies.
  // Model A (fixed monthly): 3 821 EUR netto / actual_km_month × route_km
  // Model B (flat rate):     0.39 EUR/km × route_km
  // Use Model A when actual monthly km known, else Model B as fallback
  let driverCost: number;
  const actualKmMo = input.avgKmPerMonthActual;
  if (actualKmMo && actualKmMo > 500) {
    // Model A: fixed monthly pro-rated by actual vehicle km/month
    driverCost = (FLEET.driverCostEurMoNet / actualKmMo) * distanceKm;
  } else {
    // Model B: flat 0.39 EUR/km
    driverCost = FLEET.driverCostPerKmFlat * distanceKm;
  }

  // 6. SERVICE — per-vehicle override (from Supabase) or fleet tier (new/old)
  const isNewVehicle = vehicleYearProduced ? vehicleYearProduced >= 2022 : false;
  const serviceCostKm = input.serviceCostKmOverride
    ?? (isNewVehicle ? FLEET.serviceCostNewKm : FLEET.serviceCostOldKm);
  const serviceCost = serviceCostKm * distanceKm;

  // 7. LEASING — pro-rata per km
  const leasingMo = leasingEurMo
    ?? (isNewVehicle ? FLEET.leasingNewEurMo : FLEET.leasingOldEurMo);
  const leasingPerKm = leasingMo / FLEET.avgKmPerMonth;
  const leasingCost  = leasingPerKm * distanceKm;

  // 8. INSURANCE (OC+AC) — pro-rata per km from Supabase per vehicle
  // Fleet default: avg 188 EUR/mies. (6 531 PLN OC + 3 053 PLN AC @ 4.25)
  const insuranceMo = input.insuranceEurMo ?? FLEET.insuranceEurMo;
  const insuranceCost = (insuranceMo / FLEET.avgKmPerMonth) * distanceKm;

  // ─── Totals ───────────────────────────────────────────────
  const total = fuelCost + adblue + idle + tollCost + driverCost + serviceCost + leasingCost + insuranceCost;

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
    service:   round2(serviceCost),
    leasing:   round2(leasingCost),
    insurance: round2(insuranceCost),
    total:     round2(total),
    marginEur:             round2(marginEur),
    marginPct:             round2(marginPct),
    minProfitableFreight:  round2(minProfitableFreight),
    costPerKm:             round2(costPerKm),
    revenuePerKm:          round2(revenuePerKm),
    euroClass:             euro,
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
