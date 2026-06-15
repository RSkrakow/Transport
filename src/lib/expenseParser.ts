// ============================================================
// expenseParser.ts — HBM TruckCalc
// Parses "Kartoteka Wydatków" XLS (client-side, XLSX.js)
// Groups costs per vehicle / month / category in EUR
// ============================================================

import * as XLSX from "xlsx";

// ── Category mapping (from Kartoteka "rodzaj" column) ────────
export type ExpenseCategory =
  | "fuel"        // ON
  | "toll"        // Autostrady
  | "leasing"     // Leasing
  | "insurance"   // Ubezpieczenie
  | "adblue"      // AdBlue
  | "parts"       // Części
  | "service"     // Koszt usług / Koszt usług serwis
  | "tires"       // Ogumienie
  | "tax"         // Podatek od środków transportu
  | "other";      // Inne / uncategorized

const CATEGORY_MAP: Record<string, ExpenseCategory> = {
  "on":                   "fuel",
  "diesel":               "fuel",
  "paliwo":               "fuel",
  "autostrady":           "toll",
  "myto":                 "toll",
  "leasing":              "leasing",
  "ubezpieczenie":        "insurance",
  "oc":                   "insurance",
  "ac":                   "insurance",
  "adblue":               "adblue",
  "ad blue":              "adblue",
  "części":               "parts",
  "czesci":               "parts",
  "koszt usług":          "service",
  "koszt uslug":          "service",
  "koszt usług serwis":   "service",
  "serwis":               "service",
  "ogumienie":            "tires",
  "opony":                "tires",
  "podatek od środków":   "tax",
  "podatek":              "tax",
  "inne":                 "other",
};

function mapCategory(raw: string): ExpenseCategory {
  if (!raw) return "other";
  const lower = raw.toLowerCase().trim();
  for (const [key, cat] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(key)) return cat;
  }
  return "other";
}

// ── Column indices in Kartoteka XLS ──────────────────────────
const COL = {
  vehicleReg:   2,   // nr_rejestracyjny
  dateSerial:   3,   // data_wydatku (Excel serial)
  name:         4,   // nazwa wydatku
  category:     5,   // rodzaj (category label)
  qty:          6,   // ilość
  netPln:       7,   // netto (PLN or EUR depending on waluta)
  currency:     8,   // waluta ("EUR" | "PLN")
  euroVal:      17,  // euro — value already in EUR (may be 0 or missing)
  exchangeRate: 18,  // kurs PLN→EUR (e.g. 4.25)
} as const;

// ── Date helpers ──────────────────────────────────────────────
/** Excel serial → "YYYY-MM" */
function serialToYearMonth(serial: number): string {
  const date = new Date((serial - 25569) * 86400 * 1000);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Any date cell → "YYYY-MM" or "" */
function toYearMonth(raw: unknown): string {
  if (raw == null || raw === "") return "";
  // Excel serial number
  const n = typeof raw === "number" ? raw : parseFloat(String(raw));
  if (!isNaN(n) && n > 40000) return serialToYearMonth(n);
  // String format "DD-MM-YYYY ..." or "YYYY-MM-..."
  const s = String(raw);
  const dmy = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}`;
  const iso = s.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  return "";
}

// ── Per-entry result ──────────────────────────────────────────
export interface ExpenseEntry {
  vehicleReg: string;
  yearMonth:  string;   // "YYYY-MM"
  category:   ExpenseCategory;
  categoryRaw: string;
  nameRaw:    string;
  amountEur:  number;
}

// ── Aggregate: vehicle → month → category → total EUR ────────
export type ExpenseMap = Map<
  string,                         // vehicleReg
  Map<
    string,                       // "YYYY-MM"
    Record<ExpenseCategory, number>
  >
>;

function emptyCategories(): Record<ExpenseCategory, number> {
  return {
    fuel: 0, toll: 0, leasing: 0, insurance: 0,
    adblue: 0, parts: 0, service: 0, tires: 0, tax: 0, other: 0,
  };
}

/** Normalize vehicle reg: uppercase, trim, remove spaces/dashes for comparison */
export function normalizeReg(reg: string): string {
  return reg.toUpperCase().replace(/[\s\-]/g, "").trim();
}

// ── Main parse function ───────────────────────────────────────
export interface ParseExpenseResult {
  entries:    ExpenseEntry[];
  expenseMap: ExpenseMap;
  months:     string[];      // sorted unique "YYYY-MM"
  vehicles:   string[];      // sorted unique reg numbers
  totalEur:   number;
  warnings:   string[];
}

export function parseKartotekaXLS(file: ArrayBuffer, plnEurFallback = 4.25): ParseExpenseResult {
  const wb = XLSX.read(file, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const entries: ExpenseEntry[] = [];
  const warnings: string[] = [];
  const expenseMap: ExpenseMap = new Map();

  // Find header row — look for "nr_rejestracyjny" or "rejestracyjny"
  let dataStartRow = 1;
  for (let i = 0; i < Math.min(5, raw.length); i++) {
    const rowStr = raw[i].map(c => String(c).toLowerCase()).join(" ");
    if (rowStr.includes("rejestracyjny") || rowStr.includes("rodzaj") || rowStr.includes("wydatek")) {
      dataStartRow = i + 1;
      break;
    }
  }

  for (let ri = dataStartRow; ri < raw.length; ri++) {
    const row = raw[ri];
    if (!row || row.length < 8) continue;

    const regRaw = String(row[COL.vehicleReg] ?? "").trim();
    if (!regRaw || regRaw.toLowerCase() === "brak" || regRaw === "") continue;

    const dateRaw = row[COL.dateSerial];
    const yearMonth = toYearMonth(dateRaw);
    if (!yearMonth) {
      warnings.push(`Wiersz ${ri + 1}: brak daty — pominięto`);
      continue;
    }

    const categoryRaw = String(row[COL.category] ?? "").trim();
    const nameRaw     = String(row[COL.name]     ?? "").trim();
    const category    = mapCategory(categoryRaw || nameRaw);

    const currency = String(row[COL.currency] ?? "").toUpperCase().trim();
    const netRaw   = parseFloat(String(row[COL.netPln] ?? "0").replace(",", ".")) || 0;
    const euroRaw  = parseFloat(String(row[COL.euroVal] ?? "0").replace(",", ".")) || 0;
    const kurs     = parseFloat(String(row[COL.exchangeRate] ?? "0").replace(",", ".")) || 0;

    let amountEur: number;
    if (euroRaw > 0) {
      // Column 17 already contains EUR value — use it directly
      amountEur = euroRaw;
    } else if (currency === "EUR") {
      amountEur = netRaw;
    } else {
      // PLN → EUR
      const rate = kurs > 0 ? kurs : plnEurFallback;
      amountEur = netRaw / rate;
    }

    if (amountEur <= 0) continue;

    const vehicleReg = normalizeReg(regRaw);
    const entry: ExpenseEntry = {
      vehicleReg,
      yearMonth,
      category,
      categoryRaw,
      nameRaw,
      amountEur: Math.round(amountEur * 100) / 100,
    };
    entries.push(entry);

    // Build aggregate map
    if (!expenseMap.has(vehicleReg)) expenseMap.set(vehicleReg, new Map());
    const vMap = expenseMap.get(vehicleReg)!;
    if (!vMap.has(yearMonth)) vMap.set(yearMonth, emptyCategories());
    const cats = vMap.get(yearMonth)!;
    cats[category] = Math.round((cats[category] + amountEur) * 100) / 100;
  }

  // Collect sorted unique months and vehicles
  const monthSet = new Set<string>();
  const vehicleSet = new Set<string>();
  for (const entry of entries) {
    monthSet.add(entry.yearMonth);
    vehicleSet.add(entry.vehicleReg);
  }
  const months   = Array.from(monthSet).sort();
  const vehicles = Array.from(vehicleSet).sort();
  const totalEur = Math.round(entries.reduce((s, e) => s + e.amountEur, 0) * 100) / 100;

  return { entries, expenseMap, months, vehicles, totalEur, warnings };
}

// ── Helper: get total cost for vehicle/month ──────────────────
export function getMonthTotal(
  expenseMap: ExpenseMap,
  vehicleReg: string,
  yearMonth: string,
): number {
  const vMap = expenseMap.get(normalizeReg(vehicleReg));
  if (!vMap) return 0;
  const cats = vMap.get(yearMonth);
  if (!cats) return 0;
  return Object.values(cats).reduce((s, v) => s + v, 0);
}

/** Get total for a specific category, all months */
export function getCategoryTotal(
  expenseMap: ExpenseMap,
  vehicleReg: string,
  category: ExpenseCategory,
): number {
  const vMap = expenseMap.get(normalizeReg(vehicleReg));
  if (!vMap) return 0;
  let total = 0;
  for (const cats of vMap.values()) total += cats[category] ?? 0;
  return Math.round(total * 100) / 100;
}

/** Returns months with any costs for a vehicle */
export function getActiveMonths(expenseMap: ExpenseMap, vehicleReg: string): string[] {
  const vMap = expenseMap.get(normalizeReg(vehicleReg));
  if (!vMap) return [];
  return Array.from(vMap.keys()).filter(m => {
    const cats = vMap.get(m)!;
    return Object.values(cats).some(v => v > 0);
  }).sort();
}
