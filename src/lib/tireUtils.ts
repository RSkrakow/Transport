// ============================================================
// tireUtils.ts — HBM TruckCalc
// Definicje pozycji opon, kalkulacja statusu, parsowanie DOT
// Ciągnik 4×2 (6 opon) + Naczepa 3-osiowa mega (12 opon)
// ============================================================

export type TireStatus = "ok" | "warning" | "critical" | "no-data";
export type ActionNeeded = "ok" | "monitor" | "rotate" | "repair" | "replace";

// ── Typy Supabase ─────────────────────────────────────────────
export interface Tire {
  id: string;
  vehicle_reg: string;
  position: string;
  brand: string | null;
  model: string | null;
  size: string | null;
  dot: string | null;
  installed_date: string | null;
  installed_km: number | null;
  is_retreaded: boolean;
  status: "active" | "removed" | "warehouse";
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface TireInspection {
  id: string;
  vehicle_reg: string;
  inspection_date: string;
  inspector_name: string | null;
  odometer_km: number | null;
  notes: string | null;
  created_at: string;
}

export interface TireReading {
  id: string;
  inspection_id: string;
  vehicle_reg: string;
  position: string;
  tread_outer_mm: number | null;
  tread_center_mm: number | null;
  tread_inner_mm: number | null;
  pressure_bar: number | null;
  damage_notes: string | null;
  action_needed: ActionNeeded | null;
  created_at: string;
}

export interface TireWarehouseItem {
  id: string;
  brand: string;
  model: string | null;
  size: string;
  dot: string | null;
  condition: "nowa" | "uzywana" | "bieznikowana";
  tread_mm: number | null;
  quantity: number;
  location: string | null;
  price_pln: number | null;
  notes: string | null;
  created_at: string;
}

// ── Definicja pozycji opony ───────────────────────────────────
export interface TirePositionDef {
  id: string;        // klucz w bazie, np. "1L", "2LZ", "N1LZ"
  label: string;     // etykieta UI, np. "1L", "2LZ", "1LZ"
  axle: number;      // 1, 2 lub 3
  side: "L" | "P";  // Lewy / Prawy
  twin: "Z" | "W" | null;  // Zewnętrzny / Wewnętrzny / null dla pojedynczych
  isTwin: boolean;
  // SVG layout
  svgX: number;
  svgY: number;
  tireW: number;
  tireH: number;
}

// ── Ciągnik 4×2 — 6 opon ─────────────────────────────────────
// Oś 1: 1L, 1P (pojedyncze, szerokie, skrętne) — pod kabiną
// Oś 2: 2LZ, 2LW, 2PW, 2PZ (bliźniaki, napędowe) — tył
//
// SVG viewBox: "0 0 300 490"  (przód = góra)
export const CIAGNIK_POSITIONS: TirePositionDef[] = [
  // Oś 1 — przednia skrętna (pojedyncze)
  { id: "1L",  label: "1L",  axle: 1, side: "L", twin: null, isTwin: false, svgX: 10,  svgY: 148, tireW: 30, tireH: 72 },
  { id: "1P",  label: "1P",  axle: 1, side: "P", twin: null, isTwin: false, svgX: 260, svgY: 148, tireW: 30, tireH: 72 },
  // Oś 2 — tylna napędowa (bliźniaki)
  { id: "2LZ", label: "2LZ", axle: 2, side: "L", twin: "Z",  isTwin: true,  svgX: 6,   svgY: 393, tireW: 24, tireH: 68 },
  { id: "2LW", label: "2LW", axle: 2, side: "L", twin: "W",  isTwin: true,  svgX: 34,  svgY: 393, tireW: 24, tireH: 68 },
  { id: "2PW", label: "2PW", axle: 2, side: "P", twin: "W",  isTwin: true,  svgX: 242, svgY: 393, tireW: 24, tireH: 68 },
  { id: "2PZ", label: "2PZ", axle: 2, side: "P", twin: "Z",  isTwin: true,  svgX: 270, svgY: 393, tireW: 24, tireH: 68 },
];

// ── Naczepa 3-osiowa mega — 12 opon ──────────────────────────
// 3 osie × 4 bliźniaki (LZ, LW, PW, PZ)
// Prefiks "N" w id odróżnia od opon ciągnika w bazie
//
// SVG viewBox: "0 0 300 490"  (przód = góra)
export const NACZEPA_POSITIONS: TirePositionDef[] = [
  // Oś 1
  { id: "N1LZ", label: "1LZ", axle: 1, side: "L", twin: "Z", isTwin: true, svgX: 6,   svgY: 228, tireW: 24, tireH: 68 },
  { id: "N1LW", label: "1LW", axle: 1, side: "L", twin: "W", isTwin: true, svgX: 34,  svgY: 228, tireW: 24, tireH: 68 },
  { id: "N1PW", label: "1PW", axle: 1, side: "P", twin: "W", isTwin: true, svgX: 242, svgY: 228, tireW: 24, tireH: 68 },
  { id: "N1PZ", label: "1PZ", axle: 1, side: "P", twin: "Z", isTwin: true, svgX: 270, svgY: 228, tireW: 24, tireH: 68 },
  // Oś 2
  { id: "N2LZ", label: "2LZ", axle: 2, side: "L", twin: "Z", isTwin: true, svgX: 6,   svgY: 313, tireW: 24, tireH: 68 },
  { id: "N2LW", label: "2LW", axle: 2, side: "L", twin: "W", isTwin: true, svgX: 34,  svgY: 313, tireW: 24, tireH: 68 },
  { id: "N2PW", label: "2PW", axle: 2, side: "P", twin: "W", isTwin: true, svgX: 242, svgY: 313, tireW: 24, tireH: 68 },
  { id: "N2PZ", label: "2PZ", axle: 2, side: "P", twin: "Z", isTwin: true, svgX: 270, svgY: 313, tireW: 24, tireH: 68 },
  // Oś 3
  { id: "N3LZ", label: "3LZ", axle: 3, side: "L", twin: "Z", isTwin: true, svgX: 6,   svgY: 398, tireW: 24, tireH: 68 },
  { id: "N3LW", label: "3LW", axle: 3, side: "L", twin: "W", isTwin: true, svgX: 34,  svgY: 398, tireW: 24, tireH: 68 },
  { id: "N3PW", label: "3PW", axle: 3, side: "P", twin: "W", isTwin: true, svgX: 242, svgY: 398, tireW: 24, tireH: 68 },
  { id: "N3PZ", label: "3PZ", axle: 3, side: "P", twin: "Z", isTwin: true, svgX: 270, svgY: 398, tireW: 24, tireH: 68 },
];

// ── Progi statusu ─────────────────────────────────────────────
const TREAD_CRITICAL_MM = 2.0;   // wymiana natychmiastowa
const TREAD_WARNING_MM  = 4.0;   // planuj wymianę
const DOT_CRITICAL_YR   = 6;     // > 6 lat → wymiana
const DOT_WARNING_YR    = 4;     // > 4 lat → obserwuj
const PRESS_REF_BAR     = 8.5;   // ciśnienie referencyjne [bar]
const PRESS_CRIT_PCT    = 0.20;  // ±20% → critical
const PRESS_WARN_PCT    = 0.10;  // ±10% → warning

// ── Oblicz status opony ───────────────────────────────────────
export interface TireStatusInput {
  treadMm?: number | null;       // min z 3 pomiarów bieżnika
  pressureBar?: number | null;
  dotCode?: string | null;        // WWRR np. "1524"
}

export function calcTireStatus(input: TireStatusInput): TireStatus {
  const { treadMm, pressureBar, dotCode } = input;
  if (treadMm == null && pressureBar == null && !dotCode) return "no-data";

  // Bieżnik
  if (treadMm != null) {
    if (treadMm < TREAD_CRITICAL_MM) return "critical";
    if (treadMm < TREAD_WARNING_MM)  return "warning";
  }

  // Ciśnienie
  if (pressureBar != null && pressureBar > 0) {
    const diff = Math.abs(pressureBar - PRESS_REF_BAR) / PRESS_REF_BAR;
    if (diff > PRESS_CRIT_PCT) return "critical";
    if (diff > PRESS_WARN_PCT) return "warning";
  }

  // Wiek DOT
  if (dotCode && dotCode.length >= 4) {
    const ageYrs = dotAgeYears(dotCode);
    if (ageYrs != null) {
      if (ageYrs > DOT_CRITICAL_YR) return "critical";
      if (ageYrs > DOT_WARNING_YR)  return "warning";
    }
  }

  return "ok";
}

// ── Kolory statusu ────────────────────────────────────────────
export const STATUS_COLORS: Record<TireStatus, {
  fill: string; stroke: string; text: string; bg: string; border: string; label: string;
}> = {
  ok:      { fill: "#15803d", stroke: "#14532d", text: "#ffffff", bg: "bg-green-700",  border: "border-green-800",  label: "OK" },
  warning: { fill: "#b45309", stroke: "#78350f", text: "#ffffff", bg: "bg-amber-600",  border: "border-amber-700",  label: "Uwaga" },
  critical:{ fill: "#b91c1c", stroke: "#7f1d1d", text: "#ffffff", bg: "bg-red-700",    border: "border-red-800",    label: "Krytyczny" },
  "no-data":{ fill: "#475569", stroke: "#1e293b", text: "#94a3b8", bg: "bg-slate-600", border: "border-slate-700",  label: "Brak danych" },
};

// ── Parsuj DOT → czytelna data produkcji ─────────────────────
export function parseDOT(dot: string | null | undefined): string {
  if (!dot || dot.length < 4) return "—";
  const week = dot.substring(0, 2);
  const ys   = parseInt(dot.substring(2, 4));
  const year = ys + (ys < 50 ? 2000 : 1900);
  return `T${week}/${year}`;
}

// ── Wiek opony w latach ───────────────────────────────────────
export function dotAgeYears(dot: string | null | undefined): number | null {
  if (!dot || dot.length < 4) return null;
  const week = parseInt(dot.substring(0, 2));
  const ys   = parseInt(dot.substring(2, 4));
  const year = ys + (ys < 50 ? 2000 : 1900);
  const mfg  = new Date(year, 0, 1 + (week - 1) * 7);
  return (Date.now() - mfg.getTime()) / (365.25 * 86400000);
}

// ── Min bieżnik z 3 pomiarów ──────────────────────────────────
export function minTread(r: TireReading): number | null {
  const vals = [r.tread_outer_mm, r.tread_center_mm, r.tread_inner_mm].filter(v => v != null) as number[];
  return vals.length ? Math.min(...vals) : null;
}

// ── Etykieta osi ─────────────────────────────────────────────
export function axleLabel(axle: number, vehicleType: "ciagnik" | "naczepa"): string {
  if (vehicleType === "ciagnik") return axle === 1 ? "Oś 1 — skrętna" : "Oś 2 — napędowa";
  return `Oś ${axle}`;
}

// ── Pozycja by id ─────────────────────────────────────────────
export function findPosition(
  id: string,
  positions: TirePositionDef[],
): TirePositionDef | undefined {
  return positions.find(p => p.id === id);
}
