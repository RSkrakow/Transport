"use client";

import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/lib/supabase";

type ImportType = "wydatki" | "kartoteka_pojazdow" | "kartoteka_kierowcow" | "faktury";

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
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });

      let res: ImportResult;

      switch (importType) {
        case "kartoteka_pojazdow":
          res = await importVehicles(rows, file.name);
          break;
        case "wydatki":
        default:
          res = { imported: 0, skipped: rows.length, errors: ["Parser wydatki.xls — wkrótce dostępny"] };
          break;
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
            <option value="wydatki">Wydatki (faktury kosztowe)</option>
            <option value="kartoteka_kierowcow">Kartoteka kierowców</option>
            <option value="faktury">Faktury wystawione (przychody)</option>
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
          <li><strong>Kartoteka pojazdów:</strong> rejestracja, marka, model, rok, licznik, spalanie, leasing</li>
          <li><strong>Wydatki:</strong> data, pojazd, kategoria, kwota PLN/EUR, kurs, dostawca</li>
          <li><strong>Kierowcy:</strong> imię, nazwisko, naczepa, data zatrudnienia</li>
          <li><strong>Faktury:</strong> nr, klient, trasa, kwota, data</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Vehicle importer ─────────────────────────────────────────
async function importVehicles(
  rows: Record<string, unknown>[],
  _filename: string
): Promise<ImportResult> {
  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  const validRows = rows
    .map((row, i) => {
      // Try to find reg column flexibly
      const reg = String(
        row["Rejestracja"] ?? row["Nr rejestracyjny"] ?? row["reg"] ?? ""
      ).trim().toUpperCase().replace(/\s+/g, "");

      if (!reg) { skipped++; return null; }

      return {
        reg,
        brand: String(row["Marka"] ?? row["brand"] ?? "").trim() || null,
        model: String(row["Model"] ?? row["model"] ?? "").trim() || null,
        vehicle_type: "ciągnik",
        year_produced: numOrNull(row["Rok"] ?? row["year_produced"]),
        odometer_km: numOrNull(row["Licznik"] ?? row["Przebieg"] ?? row["odometer_km"]),
        avg_fuel_l100: numOrNull(row["Spalanie"] ?? row["avg_fuel_l100"]),
        leasing_eur_mo: numOrNull(row["Leasing EUR"] ?? row["leasing_eur_mo"]),
        is_active: true,
        _idx: i,
      };
    })
    .filter(Boolean) as NonNullable<ReturnType<typeof validRows[0]>>[];

  // Upsert in batches of 50
  for (let i = 0; i < validRows.length; i += 50) {
    const batch = validRows.slice(i, i + 50);
    const { error } = await supabase
      .from("vehicles")
      .upsert(batch, { onConflict: "reg" });

    if (error) {
      errors.push(`Batch ${i / 50 + 1}: ${error.message}`);
      skipped += batch.length;
    } else {
      imported += batch.length;
    }
  }

  return { imported, skipped, errors };
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}
