-- Add per-vehicle cost columns from koszty_pojazdow_HBM_ACT.xlsx
ALTER TABLE vehicles
  ADD COLUMN IF NOT EXISTS insurance_eur_mo    numeric(10,2),   -- OC+AC EUR/mies. (z PLN @ kurs 4.25)
  ADD COLUMN IF NOT EXISTS service_cost_km     numeric(8,4),    -- Serwis EUR/km (0.009 nowe, 0.020 stare)
  ADD COLUMN IF NOT EXISTS leasing_brutto_eur_mo numeric(10,2); -- Leasing EUR/mies. brutto (przed /1.23)
