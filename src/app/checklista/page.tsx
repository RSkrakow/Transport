"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// ─── Typy ───────────────────────────────────────────────────────────────────
type ChecklistType = "initial" | "arrival";
type ItemStatus = "ok" | "brak" | "uszkodzone" | null;

interface EquipmentItem {
  id: string;
  name: string;
  requiredQty: string;
  category: string;
}

interface ChecklistItem extends EquipmentItem {
  status: ItemStatus;
  notes: string;
}

interface SavedChecklist {
  id: string;
  created_at: string;
  vehicle_reg: string;
  checklist_type: ChecklistType;
  driver_name: string | null;
  mechanic_name: string | null;
  km_reading: number | null;
  items: ChecklistItem[];
  overall_status: "complete" | "incomplete";
  notes: string | null;
}

// ─── Definicja wyposażenia ───────────────────────────────────────────────────
const EQUIPMENT: EquipmentItem[] = [
  // Zabezpieczenie ładunku
  { id: "pasy_6m",      category: "Zabezpieczenie ładunku", name: "Pasy spinające 6 m (LC 2500 daN)",        requiredQty: "8 szt." },
  { id: "pasy_3m",      category: "Zabezpieczenie ładunku", name: "Pasy spinające 3 m (LC 2500 daN)",        requiredQty: "4 szt." },
  { id: "pasy_8m",      category: "Zabezpieczenie ładunku", name: "Pasy spinające 8 m (LC 5000 daN)",        requiredQty: "2 szt." },
  { id: "belki",        category: "Zabezpieczenie ładunku", name: "Belki rozporowe aluminiowe (naczepa)",    requiredQty: "6 szt." },
  { id: "narozniki_pl", category: "Zabezpieczenie ładunku", name: "Narożniki ochronne plastikowe",           requiredQty: "20 szt." },
  { id: "maty",         category: "Zabezpieczenie ładunku", name: "Maty antypoślizgowe pod ładunek",         requiredQty: "4 szt." },
  { id: "haki",         category: "Zabezpieczenie ładunku", name: "Haki załadunkowe (do szyn naczepy)",      requiredQty: "8 szt." },
  // BHP / obowiązkowe
  { id: "gasnica_2",    category: "Wyposażenie obowiązkowe — BHP", name: "Gaśnica proszkowa 2 kg (ważna)",  requiredQty: "1 szt." },
  { id: "gasnica_6",    category: "Wyposażenie obowiązkowe — BHP", name: "Gaśnica 6 kg — ciągnik (ADR)",    requiredQty: "1 szt." },
  { id: "apteczka",     category: "Wyposażenie obowiązkowe — BHP", name: "Apteczka pierwszej pomocy",        requiredQty: "1 kpl." },
  { id: "trojkat",      category: "Wyposażenie obowiązkowe — BHP", name: "Trójkąt ostrzegawczy odblaskowy", requiredQty: "2 szt." },
  { id: "kamizelka",    category: "Wyposażenie obowiązkowe — BHP", name: "Kamizelka odblaskowa EN471",       requiredQty: "3 szt." },
  { id: "latarka",      category: "Wyposażenie obowiązkowe — BHP", name: "Latarka z zapasowymi bateriami",   requiredQty: "1 kpl." },
  { id: "rekawice",     category: "Wyposażenie obowiązkowe — BHP", name: "Rękawice ochronne",                requiredQty: "1 para" },
  // Narzędzia
  { id: "kliny",        category: "Narzędzia i akcesoria", name: "Kliny pod koła (gumowe/stalowe)",          requiredQty: "2 szt." },
  { id: "drabinka",     category: "Narzędzia i akcesoria", name: "Drabinka inspekcyjna",                      requiredQty: "1 szt." },
  { id: "klucz_kol",   category: "Narzędzia i akcesoria", name: "Klucz do kół (krzyżak + nasadki)",          requiredQty: "1 kpl." },
  { id: "lewarek",      category: "Narzędzia i akcesoria", name: "Lewarek hydrauliczny 20 t",                 requiredQty: "1 szt." },
  { id: "lancuchy",     category: "Narzędzia i akcesoria", name: "Łańcuchy śnieżne (rozmiar naczepy)",        requiredQty: "2 szt." },
  { id: "mlot_opon",   category: "Narzędzia i akcesoria", name: "Młotek do opon",                            requiredQty: "1 szt." },
  { id: "miernik",      category: "Narzędzia i akcesoria", name: "Miernik ciśnienia opon",                    requiredQty: "1 szt." },
  { id: "lina",         category: "Narzędzia i akcesoria", name: "Lina holownicza 5 t",                       requiredQty: "1 szt." },
  { id: "kable",        category: "Narzędzia i akcesoria", name: "Kable rozruchowe 600 A",                    requiredQty: "1 kpl." },
  // Dokumentacja
  { id: "dokumenty",   category: "Dokumentacja i inne", name: "Dokumenty pojazdu (dowód rej., OC, przeg.)", requiredQty: "1 kpl." },
  { id: "plomby",       category: "Dokumentacja i inne", name: "Plomby do naczepy / TIR (zapas)",            requiredQty: "10 szt." },
  { id: "folie",        category: "Dokumentacja i inne", name: "Folie stretch / taśmy do zabezp. palet",     requiredQty: "2 szt." },
  { id: "czyściwo",    category: "Dokumentacja i inne", name: "Czyściwo / szmaty techniczne",                requiredQty: "1 kpl." },
];

const CATEGORIES = Array.from(new Set(EQUIPMENT.map((e) => e.category)));

// ─── Kolory statusów ─────────────────────────────────────────────────────────
const STATUS_BTN: Record<string, string> = {
  ok:         "bg-green-100 text-green-800 border-green-300",
  brak:       "bg-red-100 text-red-800 border-red-300",
  uszkodzone: "bg-yellow-100 text-yellow-800 border-yellow-300",
};
const STATUS_LABEL: Record<string, string> = {
  ok: "✓ OK", brak: "✗ Brak", uszkodzone: "⚠ Uszkodz.",
};

// ─── Helpers ────────────────────────────────────────────────────────────────
function initItems(): ChecklistItem[] {
  return EQUIPMENT.map((e) => ({ ...e, status: null, notes: "" }));
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// KOMPONENT GŁÓWNY
// ═══════════════════════════════════════════════════════════════════════════
export default function ChecklistaPage() {
  const [type, setType] = useState<ChecklistType>("initial");
  const [vehicleReg, setVehicleReg]   = useState("");
  const [driverName, setDriverName]   = useState("");
  const [mechanicName, setMechanicName] = useState("");
  const [kmReading, setKmReading]     = useState("");
  const [checkDate, setCheckDate]     = useState(todayStr());
  const [items, setItems]             = useState<ChecklistItem[]>(initItems());
  const [notes, setNotes]             = useState("");
  const [saving, setSaving]           = useState(false);
  const [msg, setMsg]                 = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [history, setHistory]         = useState<SavedChecklist[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [printMode, setPrintMode]     = useState(false);
  const [savedId, setSavedId]         = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  // ── statystyki ──────────────────────────────────────────────────────────
  const total   = items.length;
  const okCount = items.filter((i) => i.status === "ok").length;
  const brakCount = items.filter((i) => i.status === "brak").length;
  const uszCount  = items.filter((i) => i.status === "uszkodzone").length;
  const unchecked = items.filter((i) => i.status === null).length;
  const isComplete = brakCount === 0 && uszCount === 0 && unchecked === 0;

  // ── historia ────────────────────────────────────────────────────────────
  const loadHistory = useCallback(async (reg: string) => {
    if (!reg.trim()) { setHistory([]); return; }
    setLoadingHistory(true);
    const { data } = await supabase
      .from("equipment_checklists")
      .select("*")
      .ilike("vehicle_reg", reg.trim())
      .order("created_at", { ascending: false })
      .limit(10);
    setHistory((data as SavedChecklist[]) ?? []);
    setLoadingHistory(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => loadHistory(vehicleReg), 600);
    return () => clearTimeout(t);
  }, [vehicleReg, loadHistory]);

  // ── zmiana statusu pozycji ────────────────────────────────────────────
  function cycleStatus(id: string) {
    const order: (ItemStatus)[] = [null, "ok", "brak", "uszkodzone"];
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const idx = order.indexOf(it.status);
        return { ...it, status: order[(idx + 1) % order.length] };
      })
    );
  }

  function setItemStatus(id: string, st: ItemStatus) {
    setItems((prev) => prev.map((it) => (it.id !== id ? it : { ...it, status: st })));
  }

  function setItemNotes(id: string, val: string) {
    setItems((prev) => prev.map((it) => (it.id !== id ? it : { ...it, notes: val })));
  }

  function markAll(st: ItemStatus) {
    setItems((prev) => prev.map((it) => ({ ...it, status: st })));
  }

  // ── zapis ─────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!vehicleReg.trim()) { setMsg({ type: "err", text: "Podaj nr rejestracyjny" }); return; }
    setSaving(true); setMsg(null);
    try {
      const payload = {
        vehicle_reg:    vehicleReg.trim().toUpperCase(),
        checklist_type: type,
        driver_name:    driverName || null,
        mechanic_name:  mechanicName || null,
        km_reading:     kmReading ? parseInt(kmReading) : null,
        items,
        overall_status: isComplete ? "complete" : "incomplete",
        notes: notes || null,
      };
      const { data, error } = await supabase
        .from("equipment_checklists")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;
      setSavedId(data.id);
      setMsg({ type: "ok", text: "✓ Zapisano pomyślnie" });
      loadHistory(vehicleReg);
    } catch (e: unknown) {
      setMsg({ type: "err", text: `Błąd: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setSaving(false);
    }
  }

  // ── drukowanie ────────────────────────────────────────────────────────
  function handlePrint() {
    setPrintMode(true);
    setTimeout(() => window.print(), 200);
  }

  useEffect(() => {
    function afterPrint() { setPrintMode(false); }
    window.addEventListener("afterprint", afterPrint);
    return () => window.removeEventListener("afterprint", afterPrint);
  }, []);

  // ── wczytaj zapisaną ─────────────────────────────────────────────────
  function loadSaved(c: SavedChecklist) {
    setType(c.checklist_type);
    setVehicleReg(c.vehicle_reg);
    setDriverName(c.driver_name ?? "");
    setMechanicName(c.mechanic_name ?? "");
    setKmReading(c.km_reading?.toString() ?? "");
    setCheckDate(c.created_at.slice(0, 10));
    setItems(c.items.length ? c.items : initItems());
    setNotes(c.notes ?? "");
    setSavedId(c.id);
    setMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════
  return (
    <>
      {/* ── PRINT STYLES ── */}
      <style jsx global>{`
        @media print {
          body > * { display: none !important; }
          body > main { display: block !important; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .print-section { page-break-inside: avoid; }
          @page { size: A4; margin: 12mm; }
        }
        .print-only { display: none; }
      `}</style>

      <div ref={printRef}>
        {/* ── NAGŁÓWEK STRONY ── */}
        <div className="no-print mb-6">
          <h1 className="text-2xl font-bold text-[#1F3864]">
            📋 Checklista wyposażenia pojazdu
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Pierwsze wyposażenie · Weryfikacja przyjazdu na bazę · Protokół przekazania
          </p>
        </div>

        {/* ── PRINT HEADER ── */}
        <div className="print-only mb-6 border-b-2 border-[#1F3864] pb-4">
          <div className="flex justify-between items-start">
            <div>
              <div className="text-xl font-bold text-[#1F3864]">B&M Investgroup</div>
              <div className="text-sm text-slate-500">System zarządzania flotą — HBM Audyt</div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold">
                {type === "initial" ? "PROTOKÓŁ PIERWSZE WYPOSAŻENIE" : "PROTOKÓŁ WERYFIKACJI PRZYJAZDU"}
              </div>
              <div className="text-sm text-slate-500">Nr: {savedId?.slice(0, 8).toUpperCase() ?? "—"}</div>
            </div>
          </div>
        </div>

        {/* ── SELEKTOR TRYBU ── */}
        <div className="no-print flex gap-3 mb-6">
          {(["initial", "arrival"] as ChecklistType[]).map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-5 py-2.5 rounded-lg font-semibold text-sm border-2 transition-all ${
                type === t
                  ? "bg-[#1F3864] text-white border-[#1F3864]"
                  : "bg-white text-slate-600 border-slate-200 hover:border-[#1F3864]"
              }`}
            >
              {t === "initial" ? "🏁 Pierwsze wyposażenie" : "🔍 Weryfikacja przyjazdu na bazę"}
            </button>
          ))}
        </div>

        {/* ── FORMULARZ NAGŁÓWKA ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Nr rejestracyjny *</label>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono uppercase
                           focus:outline-none focus:ring-2 focus:ring-[#1F3864]"
                value={vehicleReg}
                onChange={(e) => setVehicleReg(e.target.value.toUpperCase())}
                placeholder="np. WA12345"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Kierowca</label>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-[#1F3864]"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="Imię i nazwisko"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Mechanik / kontrolujący</label>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-[#1F3864]"
                value={mechanicName}
                onChange={(e) => setMechanicName(e.target.value)}
                placeholder="Imię i nazwisko"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">
                {type === "arrival" ? "Stan licznika (km)" : "Data wydania"}
              </label>
              {type === "arrival" ? (
                <input
                  type="number"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-[#1F3864]"
                  value={kmReading}
                  onChange={(e) => setKmReading(e.target.value)}
                  placeholder="np. 245000"
                />
              ) : (
                <input
                  type="date"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-[#1F3864]"
                  value={checkDate}
                  onChange={(e) => setCheckDate(e.target.value)}
                />
              )}
            </div>
            {type === "arrival" && (
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Data przyjazdu</label>
                <input
                  type="date"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:ring-2 focus:ring-[#1F3864]"
                  value={checkDate}
                  onChange={(e) => setCheckDate(e.target.value)}
                />
              </div>
            )}
            <div className={type === "arrival" ? "" : "col-span-2"}>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Uwagi ogólne</label>
              <input
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-[#1F3864]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Opcjonalne uwagi..."
              />
            </div>
          </div>
        </div>

        {/* ── SKRÓTY ── */}
        <div className="no-print flex items-center gap-3 mb-4">
          <span className="text-xs text-slate-500 font-medium">Zaznacz wszystkie jako:</span>
          <button onClick={() => markAll("ok")}
            className="px-3 py-1 rounded-md text-xs font-semibold bg-green-100 text-green-800 border border-green-300 hover:bg-green-200">
            ✓ Wszystkie OK
          </button>
          <button onClick={() => markAll(null)}
            className="px-3 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-300 hover:bg-slate-200">
            ↺ Wyczyść
          </button>
          <span className="ml-auto text-xs text-slate-400">
            Kliknij pozycję lub przyciski status aby oznaczyć
          </span>
        </div>

        {/* ── LISTA WYPOSAŻENIA ── */}
        <div className="space-y-4 mb-6">
          {CATEGORIES.map((cat) => {
            const catItems = items.filter((i) => i.category === cat);
            return (
              <div key={cat} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden print-section">
                {/* Nagłówek kategorii */}
                <div className="bg-[#1F3864] px-4 py-2.5">
                  <h2 className="text-white font-bold text-sm tracking-wide">{cat.toUpperCase()}</h2>
                </div>

                {/* Wiersze pozycji */}
                <div className="divide-y divide-slate-100">
                  {catItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                        idx % 2 === 0 ? "bg-white" : "bg-slate-50"
                      }`}
                    >
                      {/* Lp */}
                      <span className="text-xs text-slate-400 w-6 shrink-0 text-right">
                        {EQUIPMENT.findIndex((e) => e.id === item.id) + 1}.
                      </span>

                      {/* Nazwa */}
                      <span className="flex-1 text-sm text-slate-800 min-w-0">{item.name}</span>

                      {/* Ilość */}
                      <span className="text-xs font-semibold text-slate-500 w-16 text-center shrink-0">
                        {item.requiredQty}
                      </span>

                      {/* Przyciski statusu */}
                      <div className="flex gap-1.5 shrink-0 no-print">
                        {(["ok", "brak", "uszkodzone"] as ItemStatus[]).map((s) => (
                          <button
                            key={s!}
                            onClick={() => setItemStatus(item.id, item.status === s ? null : s)}
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-all ${
                              item.status === s
                                ? STATUS_BTN[s!] + " shadow-sm"
                                : "bg-white text-slate-400 border-slate-200 hover:border-slate-400"
                            }`}
                          >
                            {STATUS_LABEL[s!]}
                          </button>
                        ))}
                      </div>

                      {/* Status w druku */}
                      <div className="print-only w-24 text-center">
                        {item.status ? (
                          <span className={`text-xs font-bold ${
                            item.status === "ok" ? "text-green-700" :
                            item.status === "brak" ? "text-red-700" : "text-yellow-700"
                          }`}>
                            {STATUS_LABEL[item.status]}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </div>

                      {/* Uwagi do pozycji */}
                      <input
                        className="no-print w-32 xl:w-44 border border-slate-200 rounded px-2 py-1 text-xs
                                   text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#1F3864]"
                        placeholder="uwagi..."
                        value={item.notes}
                        onChange={(e) => setItemNotes(item.id, e.target.value)}
                      />
                      {item.notes && (
                        <span className="print-only text-xs text-slate-500 italic">{item.notes}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── PODSUMOWANIE ── */}
        <div className={`rounded-xl p-4 mb-6 border-2 print-section ${
          unchecked > 0   ? "bg-slate-50 border-slate-200" :
          isComplete      ? "bg-green-50 border-green-300" :
                            "bg-orange-50 border-orange-300"
        }`}>
          <div className="flex flex-wrap items-center gap-4">
            <div className="text-sm font-bold text-slate-700">
              STATUS:{" "}
              <span className={
                unchecked > 0 ? "text-slate-500" :
                isComplete ? "text-green-700" : "text-orange-700"
              }>
                {unchecked > 0 ? `Niekompletna (brak ${unchecked} oz.)` :
                 isComplete ? "✓ KOMPLETNE" : "⚠ NIEKOMPLETNE"}
              </span>
            </div>
            <div className="flex gap-3 text-xs font-semibold ml-auto flex-wrap">
              <span className="text-green-700 bg-green-100 px-3 py-1 rounded-full">✓ OK: {okCount}</span>
              <span className="text-red-700 bg-red-100 px-3 py-1 rounded-full">✗ Brak: {brakCount}</span>
              <span className="text-yellow-700 bg-yellow-100 px-3 py-1 rounded-full">⚠ Uszkodz.: {uszCount}</span>
              <span className="text-slate-500 bg-slate-100 px-3 py-1 rounded-full">? Nieocenione: {unchecked}</span>
            </div>
          </div>
        </div>

        {/* ── PODPISY (druk) ── */}
        <div className="print-only grid grid-cols-3 gap-8 mt-8 pt-6 border-t border-slate-300">
          {[["Podpis kierowcy", driverName], ["Podpis mechanika", mechanicName], ["Data i pieczęć"]].map(([lbl, val], i) => (
            <div key={i} className="text-center">
              <div className="h-14 border-b border-slate-400 mb-2" />
              <div className="text-xs text-slate-600 font-semibold">{lbl}</div>
              {val && <div className="text-xs text-slate-400">{val}</div>}
            </div>
          ))}
        </div>

        {/* ── PRZYCISKI AKCJI ── */}
        <div className="no-print flex flex-wrap items-center gap-3 mb-10">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-[#1F3864] text-white rounded-lg font-semibold text-sm
                       hover:bg-blue-900 disabled:opacity-50 transition-colors shadow"
          >
            {saving ? "Zapisywanie…" : "💾 Zapisz do bazy"}
          </button>
          <button
            onClick={handlePrint}
            className="px-6 py-2.5 bg-white text-[#1F3864] border-2 border-[#1F3864] rounded-lg font-semibold text-sm
                       hover:bg-blue-50 transition-colors shadow"
          >
            🖨️ Generuj dokument / Drukuj
          </button>
          <button
            onClick={() => { setItems(initItems()); setMsg(null); setSavedId(null); }}
            className="px-4 py-2.5 bg-white text-slate-500 border border-slate-300 rounded-lg text-sm hover:bg-slate-50"
          >
            ↺ Nowa checklista
          </button>

          {msg && (
            <span className={`text-sm font-medium px-3 py-1 rounded-lg ${
              msg.type === "ok" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
            }`}>
              {msg.text}
            </span>
          )}
        </div>

        {/* ── HISTORIA ── */}
        {vehicleReg.trim().length >= 2 && (
          <div className="no-print">
            <h2 className="text-lg font-bold text-slate-700 mb-3">
              Historia checklisty — {vehicleReg.toUpperCase()}
            </h2>
            {loadingHistory ? (
              <div className="text-sm text-slate-400">Ładowanie…</div>
            ) : history.length === 0 ? (
              <div className="text-sm text-slate-400 bg-slate-50 rounded-lg p-4">
                Brak zapisanych checklisty dla tego pojazdu.
              </div>
            ) : (
              <div className="space-y-2">
                {history.map((c) => {
                  const cOk   = (c.items as ChecklistItem[]).filter((i) => i.status === "ok").length;
                  const cBrak = (c.items as ChecklistItem[]).filter((i) => i.status === "brak").length;
                  const cUsz  = (c.items as ChecklistItem[]).filter((i) => i.status === "uszkodzone").length;
                  return (
                    <div
                      key={c.id}
                      className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap
                                 items-center gap-3 cursor-pointer hover:border-[#1F3864] transition-colors"
                      onClick={() => loadSaved(c)}
                    >
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        c.checklist_type === "initial"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-purple-100 text-purple-700"
                      }`}>
                        {c.checklist_type === "initial" ? "Pierwsze wys." : "Weryfikacja"}
                      </span>
                      <span className="text-sm font-semibold text-slate-700">{fmtDate(c.created_at)}</span>
                      {c.driver_name && (
                        <span className="text-sm text-slate-500">👤 {c.driver_name}</span>
                      )}
                      {c.km_reading && (
                        <span className="text-sm text-slate-500">
                          🛞 {c.km_reading.toLocaleString("pl-PL")} km
                        </span>
                      )}
                      <span className="ml-auto flex gap-2 text-xs font-semibold">
                        <span className="text-green-700 bg-green-100 px-2 py-0.5 rounded-full">✓ {cOk}</span>
                        {cBrak > 0 && <span className="text-red-700 bg-red-100 px-2 py-0.5 rounded-full">✗ {cBrak}</span>}
                        {cUsz > 0 && <span className="text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">⚠ {cUsz}</span>}
                      </span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        c.overall_status === "complete"
                          ? "bg-green-100 text-green-700"
                          : "bg-orange-100 text-orange-700"
                      }`}>
                        {c.overall_status === "complete" ? "KOMPLETNE" : "NIEKOMPLETNE"}
                      </span>
                      <span className="text-xs text-slate-400 hover:text-[#1F3864]">← wczytaj</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
