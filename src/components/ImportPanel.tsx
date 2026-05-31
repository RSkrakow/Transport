"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type ImportType =
  | "wydatki"
  | "kartoteka_pojazdow"
  | "kartoteka_kierowcow"
  | "faktury"
  | "rejestr_transportow";

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export default function ImportPanel() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importType, setImportType] = useState<ImportType>("wydatki");
  const [status, setStatus] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [filename, setFilename] = useState<string>("");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    setStatus("processing");
    setResult(null);

    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];

      let res: ImportResult;

      switch (importType) {
        case "kartoteka_pojazdow":
          res = await importVehicles(
            XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null }),
            file.name
          );
          break;
        case "wydatki":
          res = await importKoszty(
            XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null }),
            file.name
          );
          break;
        case "faktury":
          res = await importFaktury(
            XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null }),
            file.name
          );
          break;
        case "kartoteka_kierowcow":
          res = await importKierowcy(
            XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null }),
            file.name
          );
          break;
        case "rejestr_transportow":
          // Skip first row (group headers), use row index 1 as column headers
          res = await importRejestr(
            XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
              defval: null,
              range: 1, // start from row index 1 (second row) as header
            }),
            file.name
          );
          break;
        default:
          res = { imported: 0, skipped: 0, errors: ["Nieznany typ importu"] };
      }

      // Log the import
      await supabase.from("import_log").insert({
        filename: file.name,
        file_type: importType,
        rows_imported: res.imported,
        rows_skipped: res.skipped,
        status: res.errors.length === 0 ? "success" : "error",
        error_msg: res.errors.slice(0, 3).join("; ") || null,
      });

      setResult(res);
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setResult({ imported: 0, skipped: 0, errors: [String(err)] });
    }

    // reset input
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="card max-w-2xl">
      <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
        <span>📥</span> Import danych XLS/XLSX
      </h2>

      <div className="space-y-4">
        {/* Type selector */}
        <div>
          <label className="label">Typ pliku</label>
          <select
            className="input-field"
            value={importType}
            onChange={e => setImportType(e.target.value as ImportType)}
          >
            <option value="kartoteka_pojazdow">Kartoteka pojazdów</option>
            <option value="wydatki">Wydatki / Koszty (faktury kosztowe)</option>
            <option value="kartoteka_kierowcow">Kartoteka kierowców</option>
            <option value="faktury">Faktury wystawione (przychody)</option>
            <option value="rejestr_transportow">Rejestr transportów (zlecenia)</option>
          </select>
        </div>

        {/* File picker */}
        <div>
          <label className="label">Plik XLS / XLSX / CSV</label>
          <input
            ref={fileRef}
            type="file"
            accept=".xls,.xlsx,.csv"
            onChange={handleFile}
            disabled={status === "processing"}
            className="block w-full text-sm text-slate-500
              file:mr-4 file:py-2 file:px-4 file:rounded-lg
              file:border-0 file:text-sm file:font-semibold
              file:bg-blue-50 file:text-blue-700
              hover:file:bg-blue-100 cursor-pointer"
          />
        </div>

        {/* Status */}
        {status === "processing" && (
          <div className="flex items-center gap-2 text-blue-600 text-sm">
            <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Przetwarzam {filename}…
          </div>
        )}

        {status === "done" && result && (
          <div className={`rounded-lg p-4 text-sm ${result.errors.length === 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
            <p className="font-semibold mb-1">
              {result.errors.length === 0 ? "✓ Import zakończony pomyślnie" : "⚠ Import z ostrzeżeniami"}
            </p>
            <p>Zaimportowano: <strong>{result.imported}</strong> rekordów</p>
            <p>Pominięto: <strong>{result.skipped}</strong> rekordów</p>
            {result.errors.map((e, i) => (
              <p key={i} className="mt-1 text-xs opacity-80">⚠ {e}</p>
            ))}
          </div>
        )}

        {status === "error" && result && (
          <div className="rounded-lg p-4 bg-red-50 text-red-800 text-sm">
            <p className="font-semibold">✗ Błąd importu</p>
            {result.errors.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-6 border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">
          Obsługiwane formaty
        </p>
        <ul className="text-xs text-slate-500 space-y-1">
          <li><strong>Kartoteka pojazdów:</strong> Rejestracja, Marka, Model, Rok, Licznik, Spalanie, Leasing EUR</li>
          <li><strong>Wydatki / Koszty:</strong> Status, Numer, Data wystawienia, Sprzedawca, Netto PLN, Brutto PLN, Waluta, Transport</li>
          <li><strong>Kierowcy:</strong> Nazwisko, Imię, Samochód, Nr rej. Naczepy, Data zatrudnienia, Kraj</li>
          <li><strong>Faktury przychodowe:</strong> Status płatności, Numer, Data, Kontrahent, Netto PLN, Brutto PLN, Transport</li>
          <li><strong>Rejestr transportów:</strong> Stan, Nr pełny, Ciągnik, Naczepa, Kierowca, Fracht, Zał./Roz. kraj, Km, Marża</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function dateOrNull(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  // SheetJS with cellDates:true returns JS Date objects
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return v.toISOString().split("T")[0];
  }
  // Fallback: numeric Excel serial
  const n = Number(v);
  if (!isNaN(n) && n > 1000) {
    // Excel serial to JS date: days since 1900-01-01, minus 2 for the 1900 leap year bug
    const d = new Date((n - 25569) * 86400 * 1000);
    if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
  }
  // Try parsing as string
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
}

/** Parse "1480,00 EUR" → { amount: 1480, currency: "EUR" } */
function parseFracht(v: unknown): { amount: number | null; currency: string | null } {
  if (!v) return { amount: null, currency: null };
  const s = String(v).trim();
  const m = s.match(/([\d\s.,]+)\s*([A-Z]{3})/);
  if (!m) return { amount: null, currency: null };
  const num = parseFloat(m[1].replace(/\s/g, "").replace(",", "."));
  return { amount: isNaN(num) ? null : num, currency: m[2] };
}

async function upsertBatches<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  conflictCol: string
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  let imported = 0, skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: conflictCol });
    if (error) {
      errors.push(`Batch ${Math.floor(i / 50) + 1}: ${error.message}`);
      skipped += batch.length;
    } else {
      imported += batch.length;
    }
  }
  return { imported, skipped, errors };
}

// ─── Vehicle importer ─────────────────────────────────────────

interface VehicleRow {
  reg: string;
  brand: string | null;
  model: string | null;
  vehicle_type: string;
  year_produced: number | null;
  odometer_km: number | null;
  avg_fuel_l100: number | null;
  leasing_eur_mo: number | null;
  is_active: boolean;
  _idx: number;
}

async function importVehicles(
  rows: Record<string, unknown>[],
  _filename: string
): Promise<ImportResult> {
  let skipped = 0;

  const validRows: VehicleRow[] = rows
    .map((row, i): VehicleRow | null => {
      const reg = String(
        row["Rejestracja"] ?? row["Nr rejestracyjny"] ?? row["reg"] ?? ""
      ).trim().toUpperCase().replace(/\s+/g, "");

      if (!reg) { skipped++; return null; }

      return {
        reg,
        brand: strOrNull(row["Marka"] ?? row["brand"]),
        model: strOrNull(row["Model"] ?? row["model"]),
        vehicle_type: "ciągnik",
        year_produced: numOrNull(row["Rok"] ?? row["year_produced"]),
        odometer_km: numOrNull(row["Licznik"] ?? row["Przebieg"] ?? row["odometer_km"]),
        avg_fuel_l100: numOrNull(row["Spalanie"] ?? row["avg_fuel_l100"]),
        leasing_eur_mo: numOrNull(row["Leasing EUR"] ?? row["leasing_eur_mo"]),
        is_active: true,
        _idx: i,
      };
    })
    .filter((r): r is VehicleRow => r !== null);

  const res = await upsertBatches("vehicles", validRows as unknown as Record<string, unknown>[], "reg");
  return { ...res, skipped: res.skipped + skipped };
}

// ─── Koszty / Wydatki importer ────────────────────────────────

interface ExpenseRow {
  invoice_number: string | null;
  invoice_date: string | null;
  vendor: string | null;
  expense_type: string | null;
  status: string | null;
  netto_pln: number | null;
  brutto_pln: number | null;
  netto_eur: number | null;
  brutto_eur: number | null;
  currency: string | null;
  vehicle_ref: string | null;
  payment_due: string | null;
  vat_id: string | null;
}

async function importKoszty(
  rows: Record<string, unknown>[],
  _filename: string
): Promise<ImportResult> {
  let skipped = 0;

  const validRows: ExpenseRow[] = rows
    .map((row): ExpenseRow | null => {
      // Skip header-like rows or empty rows
      const nr = strOrNull(row["Numer"] ?? row["Nr"] ?? row["numer"]);
      const vendor = strOrNull(row["Sprzedawca"] ?? row["Dostawca"] ?? row["vendor"]);
      if (!nr && !vendor) { skipped++; return null; }

      // Amounts are stored as negative in TMS — take abs value
      const nettoPln = numOrNull(row["Netto PLN"] ?? row["Netto\nPLN"]);
      const bruttoPln = numOrNull(row["Brutto PLN"] ?? row["Brutto\nPLN"]);
      const nettoWal = numOrNull(row["Netto w walucie"] ?? row["Netto\nw walucie"]);
      const bruttoWal = numOrNull(row["Brutto w walucie"] ?? row["Brutto\nw walucie"]);
      const waluta = strOrNull(row["Waluta"] ?? row["waluta"]);

      // Determine if amounts are EUR or PLN based on currency
      const isEur = waluta === "EUR";

      return {
        invoice_number: nr,
        invoice_date: dateOrNull(row["Data wystawienia"] ?? row["Data"]),
        vendor,
        expense_type: strOrNull(row["Typ"] ?? row["typ"]),
        status: strOrNull(row["Status"] ?? row["status"]),
        netto_pln: nettoPln !== null ? Math.abs(nettoPln) : null,
        brutto_pln: bruttoPln !== null ? Math.abs(bruttoPln) : null,
        netto_eur: isEur && nettoWal !== null ? Math.abs(nettoWal) : null,
        brutto_eur: isEur && bruttoWal !== null ? Math.abs(bruttoWal) : null,
        currency: waluta,
        vehicle_ref: strOrNull(row["Transport"] ?? row["Pojazd"] ?? row["vehicle_ref"]),
        payment_due: dateOrNull(row["Termin płatności"] ?? row["Termin"]),
        vat_id: strOrNull(row["NIP"] ?? row["nip"]),
      };
    })
    .filter((r): r is ExpenseRow => r !== null);

  const res = await upsertBatches(
    "expense_records",
    validRows as unknown as Record<string, unknown>[],
    "invoice_number"
  );
  return { ...res, skipped: res.skipped + skipped };
}

// ─── Faktury przychodowe importer ─────────────────────────────

interface RevenueRow {
  invoice_number: string | null;
  invoice_date: string | null;
  client: string | null;
  status_platnosci: string | null;
  invoice_type: string | null;
  netto_pln: number | null;
  brutto_pln: number | null;
  netto_eur: number | null;
  brutto_eur: number | null;
  currency: string | null;
  transport_ref: string | null;
  wystawil: string | null;
}

async function importFaktury(
  rows: Record<string, unknown>[],
  _filename: string
): Promise<ImportResult> {
  let skipped = 0;

  const validRows: RevenueRow[] = rows
    .map((row): RevenueRow | null => {
      const nr = strOrNull(row["Numer"] ?? row["Nr"] ?? row["numer"]);
      const client = strOrNull(row["Kontrahent"] ?? row["Klient"] ?? row["client"]);
      if (!nr && !client) { skipped++; return null; }

      const nettoPln = numOrNull(row["Netto PLN"] ?? row["Netto\nPLN"]);
      const bruttoPln = numOrNull(row["Brutto PLN"] ?? row["Brutto\nPLN"]);
      const nettoWal = numOrNull(row["Netto w walucie"] ?? row["Netto\nw walucie"]);
      const bruttoWal = numOrNull(row["Brutto w walucie"] ?? row["Brutto\nw walucie"]);
      const waluta = strOrNull(row["Waluta"] ?? row["waluta"]);
      const isEur = waluta === "EUR";

      return {
        invoice_number: nr,
        invoice_date: dateOrNull(row["Data wystawienia"] ?? row["Data"]),
        client,
        status_platnosci: strOrNull(row["Status płatności"] ?? row["Status"]),
        invoice_type: strOrNull(row["Typ"] ?? row["typ"]),
        netto_pln: nettoPln !== null ? Math.abs(nettoPln) : null,
        brutto_pln: bruttoPln !== null ? Math.abs(bruttoPln) : null,
        netto_eur: isEur && nettoWal !== null ? Math.abs(nettoWal) : null,
        brutto_eur: isEur && bruttoWal !== null ? Math.abs(bruttoWal) : null,
        currency: waluta,
        transport_ref: strOrNull(row["Transport"] ?? row["Nr zlecenia"]),
        wystawil: strOrNull(row["Wystawił"] ?? row["Wystawil"]),
      };
    })
    .filter((r): r is RevenueRow => r !== null);

  const res = await upsertBatches(
    "revenue_records",
    validRows as unknown as Record<string, unknown>[],
    "invoice_number"
  );
  return { ...res, skipped: res.skipped + skipped };
}

// ─── Kartoteka kierowców importer ─────────────────────────────

interface DriverRow {
  last_name: string;
  first_name: string | null;
  vehicle_reg: string | null;
  trailer_reg: string | null;
  is_driver: boolean;
  hire_date: string | null;
  termination_date: string | null;
  country: string | null;
  country_code: string | null;
  email: string | null;
}

async function importKierowcy(
  rows: Record<string, unknown>[],
  _filename: string
): Promise<ImportResult> {
  let skipped = 0;

  const validRows: DriverRow[] = rows
    .map((row): DriverRow | null => {
      const lastName = strOrNull(row["Nazwisko"] ?? row["last_name"]);
      if (!lastName) { skipped++; return null; }

      const isDriverVal = row["Kierowca"] ?? row["is_driver"];
      const isDriver =
        isDriverVal === 1 ||
        isDriverVal === "1" ||
        isDriverVal === true ||
        String(isDriverVal).toLowerCase() === "tak";

      return {
        last_name: lastName,
        first_name: strOrNull(row["Imię"] ?? row["Imie"] ?? row["first_name"]),
        vehicle_reg: strOrNull(row["Samochód"] ?? row["Samochod"] ?? row["vehicle_reg"]),
        trailer_reg: strOrNull(row["Nr rej. Naczepy"] ?? row["Naczepa"] ?? row["trailer_reg"]),
        is_driver: isDriver,
        hire_date: dateOrNull(row["Data zatrudnienia"] ?? row["hire_date"]),
        termination_date: dateOrNull(row["Data zwolnienia"] ?? row["termination_date"]),
        country: strOrNull(row["Kraj"] ?? row["country"]),
        country_code: strOrNull(row["Symbol kraju"] ?? row["country_code"]),
        email: strOrNull(row["Email"] ?? row["email"]),
      };
    })
    .filter((r): r is DriverRow => r !== null);

  // drivers table uses (last_name, first_name, hire_date) as unique key
  // Use insert with ignoreDuplicates to avoid errors on re-import
  let imported = 0;
  const errors: string[] = [];

  for (let i = 0; i < validRows.length; i += 50) {
    const batch = validRows.slice(i, i + 50);
    const { error } = await supabase
      .from("drivers")
      .upsert(batch as unknown as Record<string, unknown>[], {
        onConflict: "last_name,first_name,hire_date",
        ignoreDuplicates: true,
      });
    if (error) {
      errors.push(`Batch ${Math.floor(i / 50) + 1}: ${error.message}`);
      skipped += batch.length;
    } else {
      imported += batch.length;
    }
  }

  return { imported, skipped, errors };
}

// ─── Rejestr transportów importer ─────────────────────────────

interface RouteHistoryRow {
  order_number: string | null;
  order_ref: string | null;
  status: string | null;
  client: string | null;
  vehicle_reg: string | null;
  trailer_reg: string | null;
  driver_name: string | null;
  fracht_eur: number | null;
  fracht_currency: string | null;
  origin_country: string | null;
  dest_country: string | null;
  origin_city: string | null;
  dest_city: string | null;
  distance_km: number | null;
  margin_eur_km: number | null;
  pickup_date: string | null;
  delivery_date: string | null;
}

async function importRejestr(
  rows: Record<string, unknown>[],
  _filename: string
): Promise<ImportResult> {
  let skipped = 0;

  const validRows: RouteHistoryRow[] = rows
    .map((row): RouteHistoryRow | null => {
      // "Nr pełny" is the order number — primary identifier
      const orderNr = strOrNull(row["Nr pełny"] ?? row["Nr pelny"] ?? row["Nr"]);
      if (!orderNr) { skipped++; return null; }

      const frachtRaw = row["Fracht z walutą"] ?? row["Fracht z waluta"] ?? row["Fracht"];
      const { amount: frachtEur, currency: frachtCurrency } = parseFracht(frachtRaw);

      return {
        order_number: orderNr,
        order_ref: strOrNull(row["Ref. zleceniodawcy"] ?? row["Ref"]),
        status: strOrNull(row["Stan"] ?? row["Status"]),
        client: strOrNull(row["Zleceniodawca"] ?? row["Klient"]),
        vehicle_reg: strOrNull(row["Ciągnik"] ?? row["Ciagnik"] ?? row["Pojazd"]),
        trailer_reg: strOrNull(row["Naczepa"]),
        driver_name: strOrNull(row["Kierowca 1"] ?? row["Kierowca"]),
        fracht_eur: frachtEur,
        fracht_currency: frachtCurrency,
        origin_country: strOrNull(row["Zał. kraj"] ?? row["Zal. kraj"] ?? row["Kraj załadunku"]),
        dest_country: strOrNull(row["Roz. kraj"] ?? row["Kraj rozładunku"]),
        origin_city: strOrNull(row["Zał. miasto"] ?? row["Zal. miasto"] ?? row["Miasto załadunku"]),
        dest_city: strOrNull(row["Roz. miasto"] ?? row["Miasto rozładunku"]),
        distance_km: numOrNull(row["Km ład. wg. mapy"] ?? row["Km wg mapy"] ?? row["Km"]),
        margin_eur_km: numOrNull(row["Marża EUR na 1 KM z mapy"] ?? row["Marza EUR na 1 KM z mapy"]),
        pickup_date: dateOrNull(row["Podjęcie"] ?? row["Podjecie"] ?? row["Data załadunku"]),
        delivery_date: dateOrNull(row["Dostarczenie"] ?? row["Data rozładunku"]),
      };
    })
    .filter((r): r is RouteHistoryRow => r !== null);

  const res = await upsertBatches(
    "route_history",
    validRows as unknown as Record<string, unknown>[],
    "order_number"
  );
  return { ...res, skipped: res.skipped + skipped };
}
