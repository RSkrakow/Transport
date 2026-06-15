// ============================================================
// odsParser.ts — HBM TruckCalc
// Parses "Wypłaty Kierowcy" ODS multi-sheet payroll file
// One sheet per driver; sheet format: 22-col (main) or 13-col
// ============================================================

import * as XLSX from "xlsx";

export interface DriverPayData {
  sheetName: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dailyRate: number;       // stawka dzienna PLN
  daysWorked: number;
  amountWork: number;      // kwota za przepracowane dni PLN
  daysVacation: number;
  amountVacation: number;  // kwota za urlop PLN
  deductions: number;      // obciążenia / mandaty PLN (≤0)
  total: number;           // razem do wypłaty PLN
  month?: string;          // YYYY-MM
}

export interface DriversSummary {
  drivers: DriverPayData[];
  totalGross: number;      // suma kwota_pracy + kwota_urlop PLN
  totalDeductions: number; // suma obciążeń PLN
  totalPayout: number;     // suma razem PLN
  driverCount: number;
  month?: string;
}

// ── Helpers ──────────────────────────────────────────────────

function cellVal(ws: XLSX.WorkSheet, r: number, c: number): unknown {
  const addr = XLSX.utils.encode_cell({ r, c });
  const cell = ws[addr];
  return cell ? cell.v : undefined;
}

function numAt(ws: XLSX.WorkSheet, r: number, c: number): number {
  const v = cellVal(ws, r, c);
  if (typeof v === "number" && !isNaN(v)) return v;
  return 0;
}

function strAt(ws: XLSX.WorkSheet, r: number, c: number): string {
  const v = cellVal(ws, r, c);
  return v != null ? String(v).trim() : "";
}

/** Find next numeric value in a row starting at column c */
function nextNum(ws: XLSX.WorkSheet, r: number, cStart: number, maxC = 25): number {
  for (let c = cStart; c <= maxC; c++) {
    const v = cellVal(ws, r, c);
    if (typeof v === "number" && !isNaN(v) && v !== 0) return v;
  }
  return 0;
}

/** Find all numeric values in a row */
function rowNums(ws: XLSX.WorkSheet, r: number, maxC = 25): number[] {
  const out: number[] = [];
  for (let c = 0; c <= maxC; c++) {
    const v = cellVal(ws, r, c);
    if (typeof v === "number" && !isNaN(v)) out.push(v);
  }
  return out;
}

// ── Sheet parser ──────────────────────────────────────────────

function parseDriverSheet(
  ws: XLSX.WorkSheet,
  sheetName: string
): DriverPayData | null {
  let firstName = "";
  let lastName = "";
  let dailyRate = 0;
  let daysWorked = 0;
  let amountWork = 0;
  let daysVacation = 0;
  let amountVacation = 0;
  let deductions = 0;
  let total = 0;

  // Scan rows 0-22
  for (let r = 0; r <= 22; r++) {
    for (let c = 0; c <= 22; c++) {
      const s = strAt(ws, r, c);

      // Imię / Nazwisko
      if (s === "IMIĘ:") {
        firstName = strAt(ws, r, c + 1);
      }
      if (s === "NAZWISKO:") {
        lastName = strAt(ws, r, c + 1);
      }

      // Stawka dzienna
      if (s.includes("PRZEPRACOWANY DZIEŃ") && s.includes("STAWKA")) {
        if (dailyRate === 0) dailyRate = nextNum(ws, r, c + 1);
      }

      // Dni pracy + kwota
      if (s.includes("PRZEPRACOWANYCH DNI")) {
        const nums = rowNums(ws, r);
        // Filter out stawka (large values like 460) — look for days first
        const filtered = nums.filter((n) => n >= 0);
        if (filtered.length >= 2) {
          daysWorked = Math.round(filtered[0]);
          amountWork = filtered[1];
        }
      }

      // Urlop
      if (s.includes("URLOPIE WYPOCZYNKOWYM")) {
        const nums = rowNums(ws, r).filter((n) => n >= 0);
        if (nums.length >= 2) {
          daysVacation = Math.round(nums[0]);
          amountVacation = nums[1];
        }
      }

      // RAZEM — total payout (next positive numeric after "RAZEM:")
      if (s === "RAZEM:") {
        const candidate = nextNum(ws, r, c + 1);
        if (candidate > 0 && candidate > total) total = candidate;
      }

      // Obciążenia / mandaty
      if (s.includes("OBCIĄŻENIA") || (s.includes("MANDATY") && c < 15)) {
        if (deductions === 0) {
          const d = nextNum(ws, r, c + 1);
          if (d !== 0) deductions = d;
        }
      }
    }
  }

  // Empty slot — no payout
  if (total === 0 && amountWork === 0 && amountVacation === 0) return null;

  // Fallback name from sheet name
  if (!firstName && !lastName) {
    const parts = sheetName.replace(/_+/g, " ").trim().split(" ");
    firstName = parts[0] ?? sheetName;
    lastName = parts.slice(1).join(" ");
  }

  return {
    sheetName,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`.trim(),
    dailyRate,
    daysWorked,
    amountWork,
    daysVacation,
    amountVacation,
    deductions,
    total,
  };
}

// ── Public API ────────────────────────────────────────────────

/**
 * Parse ODS driver payroll file.
 * @param buffer  ArrayBuffer from FileReader
 * @param month   Optional "YYYY-MM" label to tag data
 */
export function parseDriversODS(
  buffer: ArrayBuffer,
  month?: string
): DriversSummary {
  const wb = XLSX.read(buffer, { type: "array" });
  const drivers: DriverPayData[] = [];

  for (const sheetName of wb.SheetNames) {
    // Skip aggregate and placeholder sheets
    if (
      sheetName === "RAZEM" ||
      sheetName.toLowerCase().includes("pusty") ||
      sheetName.toLowerCase().startsWith("arkusz")
    ) {
      continue;
    }

    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const driver = parseDriverSheet(ws, sheetName);
    if (!driver) continue;

    if (month) driver.month = month;
    drivers.push(driver);
  }

  // Sort alphabetically by full name
  drivers.sort((a, b) => a.fullName.localeCompare(b.fullName, "pl"));

  const totalGross = drivers.reduce(
    (s, d) => s + d.amountWork + d.amountVacation,
    0
  );
  const totalDeductions = drivers.reduce((s, d) => s + d.deductions, 0);
  const totalPayout = drivers.reduce((s, d) => s + d.total, 0);

  return {
    drivers,
    totalGross,
    totalDeductions,
    totalPayout,
    driverCount: drivers.length,
    month,
  };
}
