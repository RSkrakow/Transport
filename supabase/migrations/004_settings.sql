-- ============================================================
-- TruckCalc HBM — Settings table
-- Globalna konfiguracja kalkulatora (metody alokacji, stawki)
-- ============================================================

CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  label       TEXT NOT NULL,
  description TEXT,
  type        TEXT NOT NULL DEFAULT 'text',  -- 'text' | 'number' | 'select'
  group_name  TEXT NOT NULL DEFAULT 'ogolne',
  options     TEXT,  -- JSON array dla type='select'
  sort_order  INTEGER NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated + anon reads
CREATE POLICY "settings_read" ON settings FOR SELECT USING (true);
-- Allow service role writes (from app)
CREATE POLICY "settings_write" ON settings FOR ALL USING (true);

-- Domyślne wartości
INSERT INTO settings (key, value, label, description, type, group_name, options, sort_order) VALUES
  -- Metody alokacji kosztów stałych
  ('leasing_method',
   'per_dobe',
   'Leasing ciągnika',
   'Metoda alokacji kosztu leasingu ciągnika na trasę',
   'select',
   'Metody alokacji',
   '[{"value":"per_dobe","label":"Per dobę (rekomendowane)"},{"value":"per_km","label":"Per km"}]',
   10),

  ('trailer_leasing_method',
   'per_dobe',
   'Leasing naczepy',
   'Metoda alokacji kosztu leasingu naczepy na trasę',
   'select',
   'Metody alokacji',
   '[{"value":"per_dobe","label":"Per dobę (rekomendowane)"},{"value":"per_km","label":"Per km"}]',
   20),

  ('insurance_method',
   'per_dobe',
   'Ubezpieczenie OC+AC',
   'Metoda alokacji kosztu ubezpieczenia na trasę',
   'select',
   'Metody alokacji',
   '[{"value":"per_dobe","label":"Per dobę (rekomendowane)"},{"value":"per_km","label":"Per km"}]',
   30),

  -- Stawki domyślne flotowe
  ('fuel_price_eur_l',
   '1.25',
   'Cena ON (EUR/l)',
   'Domyślna cena oleju napędowego EUR/litr',
   'number',
   'Stawki flotowe',
   NULL,
   40),

  ('pln_eur_rate',
   '4.25',
   'Kurs PLN/EUR',
   'Kurs do przeliczania myto PLN→EUR z TMS',
   'number',
   'Stawki flotowe',
   NULL,
   50),

  ('avg_fuel_l100',
   '27.80',
   'Spalanie flotowe (l/100km)',
   'Średnie spalanie floty — aktualizuj z Trimble FMS',
   'number',
   'Stawki flotowe',
   NULL,
   60),

  ('driver_daily_cost',
   '181.95',
   'Koszt kierowcy (EUR/dobę)',
   'Koszt netto kierowcy za dobę pracy (agencja pracy)',
   'number',
   'Stawki flotowe',
   NULL,
   70),

  ('adblue_rate_pct',
   '3.5',
   'AdBlue (% paliwa)',
   'Zużycie AdBlue jako % zużycia ON',
   'number',
   'Stawki flotowe',
   NULL,
   80),

  ('idle_fuel_pct',
   '2.1',
   'Bieg jałowy (% paliwa)',
   'Straty paliwa na biegu jałowym — z Trimble FMS',
   'number',
   'Stawki flotowe',
   NULL,
   90),

  ('avg_km_per_month',
   '11667',
   'Średnie km/miesiąc floty',
   'Fallback gdy brak danych pojazdu (140 000 km/rok ÷ 12)',
   'number',
   'Stawki flotowe',
   NULL,
   100),

  -- Progi rentowności
  ('margin_good_pct',
   '15',
   'Próg dobrej marży (%)',
   'Marża ≥ tego progu = Rentowna (zielona)',
   'number',
   'Progi rentowności',
   NULL,
   110),

  ('margin_low_pct',
   '5',
   'Próg niskiej marży (%)',
   'Marża między niskim a dobrym = Niska marża (żółta)',
   'number',
   'Progi rentowności',
   NULL,
   120)

ON CONFLICT (key) DO NOTHING;
