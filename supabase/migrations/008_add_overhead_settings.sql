-- ============================================================
-- TruckCalc HBM — Migration 005: Add Overhead Costs Setting
-- Dodanie kosztów ogólnozakładowych / bankowych (PLN/miesiąc)
-- ============================================================

INSERT INTO settings (key, value, label, description, type, group_name, options, sort_order) VALUES
  ('overhead_monthly_pln',
   '30000',
   'Koszty ogólne i bankowe (PLN/miesiąc)',
   'Miesięczne koszty ogólne (prowizje bankowe, księgowość, zarząd) alokowane po dniu na aktywne ciągniki',
   'number',
   'Stawki flotowe',
   NULL,
   75)
ON CONFLICT (key) DO NOTHING;
