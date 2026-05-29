-- ============================================================
-- TruckCalc HBM — Supabase schema
-- Run: supabase db push  OR paste in Supabase SQL editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ─── VEHICLES ────────────────────────────────────────────────
create table if not exists vehicles (
  id               uuid primary key default uuid_generate_v4(),
  reg              text not null unique,        -- nr rejestracyjny
  brand            text,                         -- MAN / DAF / WIELTON / KRONE
  model            text,                         -- TGX / XF / SD / NS-3
  vehicle_type     text default 'ciągnik',       -- 'ciągnik' | 'naczepa'
  year_produced    int,
  odometer_km      int,                          -- stan licznika
  avg_fuel_l100    numeric(5,2) default 29.62,  -- śr. spalanie l/100km (flota: 29.62)
  leasing_eur_mo   numeric(8,2),                 -- rata leasingu EUR/miesiąc
  is_active        boolean default true,
  gps_id           text,                         -- ID w Trimble FMS
  trailer_set      text,                         -- przypisana naczepa
  created_at       timestamptz default now()
);

-- ─── COST RATES (globalne parametry kalkulatora) ─────────────
create table if not exists cost_rates (
  id               uuid primary key default uuid_generate_v4(),
  param_key        text not null unique,
  param_value      numeric(10,4) not null,
  unit             text,
  description      text,
  updated_at       timestamptz default now()
);

-- ─── TOLL MATRIX (opłaty drogowe per kraj, EUR/100km) ────────
create table if not exists toll_matrix (
  id               uuid primary key default uuid_generate_v4(),
  country_iso      char(2) not null unique,      -- PL, DE, FR, IT, CZ, AT, ES...
  country_name     text,
  toll_eur_100km   numeric(6,2) not null,        -- avg opłata EUR/100km dla TIR
  notes            text
);

-- ─── DRIVER COST BY COUNTRY (diety UE, Pakiet Mobilności) ───
create table if not exists driver_country_rates (
  id               uuid primary key default uuid_generate_v4(),
  country_iso      char(2) not null unique,
  country_name     text,
  daily_diet_eur   numeric(6,2) not null,        -- dieta dzienna EUR
  notes            text
);

-- ─── ROUTE HISTORY (historyczne przewozy z TMS) ─────────────
create table if not exists route_history (
  id               uuid primary key default uuid_generate_v4(),
  tms_number       text,                          -- nr zlecenia TMS
  client           text,
  origin_country   char(2),
  origin_zip       text,
  dest_country     char(2),
  dest_zip         text,
  distance_km      int,
  revenue_eur      numeric(10,2),
  vehicle_reg      text references vehicles(reg),
  driver_name      text,
  transport_date   date,
  imported_from    text,                          -- nazwa pliku źródłowego
  created_at       timestamptz default now()
);

-- ─── CALCULATIONS (zapisane kalkulacje) ─────────────────────
create table if not exists route_calculations (
  id               uuid primary key default uuid_generate_v4(),
  -- Input
  origin_country   char(2) not null,
  dest_country     char(2) not null,
  distance_km      int not null,
  vehicle_reg      text,
  freight_eur      numeric(10,2),
  fuel_price_eur   numeric(6,4),
  -- Cost breakdown (EUR)
  cost_fuel        numeric(10,2),
  cost_toll        numeric(10,2),
  cost_driver      numeric(10,2),
  cost_leasing     numeric(10,2),
  cost_service     numeric(10,2),
  cost_total       numeric(10,2),
  -- Results
  margin_eur       numeric(10,2),
  margin_pct       numeric(5,2),
  min_freight_eur  numeric(10,2),               -- próg rentowności
  -- Metadata
  notes            text,
  created_by       text default 'zarząd',
  created_at       timestamptz default now()
);

-- ─── XLS IMPORT LOG ──────────────────────────────────────────
create table if not exists import_log (
  id               uuid primary key default uuid_generate_v4(),
  filename         text not null,
  file_type        text,                         -- 'wydatki' | 'faktury' | 'kartoteka_pojazdow' | ...
  rows_imported    int default 0,
  rows_skipped     int default 0,
  status           text default 'pending',       -- 'pending' | 'success' | 'error'
  error_msg        text,
  imported_at      timestamptz default now()
);

-- ============================================================
-- SEED: Parametry kalkulatora (z naszej analizy danych)
-- ============================================================
insert into cost_rates (param_key, param_value, unit, description) values
  ('fuel_price_eur_l',      1.25,   'EUR/l',         'Aktualna cena ON (aktualizuj co tydzień)'),
  ('avg_fuel_l100_fleet',  29.62,   'l/100km',       'Średnie spalanie floty (Trimble FMS, 67 ciągników)'),
  ('driver_cost_per_km',    0.643,  'EUR/km',        'Koszt kierowcy per km (3 328 285 EUR / 5 180 419 km)'),
  ('service_cost_new_km',   0.009,  'EUR/km',        'Koszt serwisu MAN TGX 2023-2024 per km'),
  ('service_cost_old_km',   0.020,  'EUR/km',        'Koszt serwisu MAN TGX 2018-2019 / DAF XF per km'),
  ('leasing_new_eur_mo',  733.33,   'EUR/miesiąc',   'Leasing nowy MAN TGX 2023 (~8 800 EUR/rok)'),
  ('leasing_old_eur_mo',  520.83,   'EUR/miesiąc',   'Leasing stary MAN TGX 2019 (~6 250 EUR/rok)'),
  ('avg_km_per_month',    11667,    'km/miesiąc',    'Śr. przebieg miesięczny per ciągnik (140k km/rok)'),
  ('idle_fuel_loss_pct',    9.22,   '%',             'Strata biegu jałowego jako % kosztu paliwa (177k/1918k EUR)'),
  ('adblue_pct_fuel',       3.50,   '%',             'AdBlue jako % zużycia ON (typowo 3-4%)'),
  ('exchange_rate_pln_eur', 4.25,   'PLN/EUR',       'Kurs przeliczeniowy (aktualizuj)')
on conflict (param_key) do update set param_value = excluded.param_value;

-- ============================================================
-- SEED: Macierz opłat drogowych per kraj (EUR/100km, TIR)
-- Źródło: wydatki.xls + dane rynkowe 2025
-- ============================================================
insert into toll_matrix (country_iso, country_name, toll_eur_100km, notes) values
  ('PL', 'Polska',         4.20,  'A1/A2/A4 płatne, e-TOLL. Niska opłata vs UE'),
  ('DE', 'Niemcy',        18.50,  'Autobahn maut, 7+ osi, ~0.18-0.21 EUR/km'),
  ('FR', 'Francja',       20.00,  'Autoroutes płatne, ~0.20-0.24 EUR/km dla TIR'),
  ('IT', 'Włochy',        22.50,  'Autostrada — najdrożej w UE, ~0.22-0.26 EUR/km'),
  ('ES', 'Hiszpania',     10.50,  'Mix płatnych/bezpłatnych, tańsze niż FR/IT'),
  ('AT', 'Austria',       16.20,  'ASFINAG maut, odcinki alpejskie'),
  ('CZ', 'Czechy',         8.00,  'Elektroniczny toll, stosunkowo tani'),
  ('HU', 'Węgry',          6.50,  'Winiety elektroniczne'),
  ('NL', 'Holandia',      12.00,  'Mosty i tunele płatne'),
  ('BE', 'Belgia',        13.50,  'Viapass, pełny truck toll'),
  ('LU', 'Luksemburg',     9.00,  'Brak autostradowego toll, tylko akcyza'),
  ('CH', 'Szwajcaria',    32.00,  'LSVA — drogi, płatna od masy'),
  ('SI', 'Słowenia',      15.00,  'DarsGo elektroniczny'),
  ('HR', 'Chorwacja',     14.00,  'HAC autostrady płatne'),
  ('SK', 'Słowacja',       8.50,  'Elektroniczny toll')
on conflict (country_iso) do update
  set toll_eur_100km = excluded.toll_eur_100km;

-- ============================================================
-- SEED: Diety kierowców per kraj (EUR/dobę, Pakiet Mobilności)
-- ============================================================
insert into driver_country_rates (country_iso, country_name, daily_diet_eur) values
  ('PL', 'Polska',       30.00),
  ('DE', 'Niemcy',       49.00),
  ('FR', 'Francja',      52.00),
  ('IT', 'Włochy',       51.00),
  ('ES', 'Hiszpania',    50.00),
  ('AT', 'Austria',      52.00),
  ('CZ', 'Czechy',       41.00),
  ('HU', 'Węgry',        45.00),
  ('NL', 'Holandia',     50.00),
  ('BE', 'Belgia',       50.00),
  ('SK', 'Słowacja',     43.00)
on conflict (country_iso) do update
  set daily_diet_eur = excluded.daily_diet_eur;

-- ============================================================
-- SEED: Wybrane ciągniki z kartoteki_pojazdow.xls (top 20)
-- ============================================================
insert into vehicles (reg, brand, model, vehicle_type, year_produced, odometer_km, avg_fuel_l100, leasing_eur_mo, is_active) values
  ('PZ5H074',  'MAN', 'TGX', 'ciągnik', 2023, 149267,  26.21, 733.33, true),
  ('PZ5H665',  'MAN', 'TGX', 'ciągnik', 2024, 146065,  25.84, 732.00, true),
  ('PZ4U724',  'MAN', 'TGX', 'ciągnik', 2023, 146612,  28.46, 745.42, true),
  ('PNT2656A', 'MAN', 'TGX', 'ciągnik', 2023, 151408,  28.11,1106.75, true),
  ('PZ5H417',  'MAN', 'TGX', 'ciągnik', 2023, 148824,  25.41, 733.33, true),
  ('PZ5H697',  'MAN', 'TGX', 'ciągnik', 2023, 142899,  24.17, 733.58, true),
  ('PY60697',  'MAN', 'TGX', 'ciągnik', 2019, 896112,  30.38, 550.33, true),
  ('PZ4U958',  'MAN', 'TGX', 'ciągnik', 2023, 105752,  25.16, 725.17, true),
  ('PY40355',  'DAF', 'XF',  'ciągnik', 2019, 707901,  27.85, 365.25, true),
  ('PZ5H702',  'MAN', 'TGX', 'ciągnik', 2024, 140794,  23.61, 734.75, true),
  ('WPR2811T', 'MAN', 'TGX', 'ciągnik', 2019, 932157,  null,  409.25, true),
  ('PL4879G',  'MAN', 'TGX', 'ciągnik', 2018, 929277,  null,  497.33, true),
  ('WPR2812T', 'MAN', 'TGX', 'ciągnik', 2019, 923676,  null,  null,   true),
  ('PY49377',  'DAF', 'XF',  'ciągnik', 2019, 667220,  null,  584.58, true),
  ('PY47094',  'DAF', 'XF',  'ciągnik', 2019, 654009,  null,  365.92, true),
  ('DW8VN84',  'DAF', 'XF',  'ciągnik', 2019, 651474,  null,  427.42, true),
  ('PNT1862A', 'MAN', 'TGX', 'ciągnik', 2018, 731270,  null,  312.33, true),
  ('PZ5H360',  'MAN', 'TGX', 'ciągnik', 2023, null,    null,  733.33, true),
  ('PZ5H418',  'MAN', 'TGX', 'ciągnik', 2023, null,    null,  733.33, true),
  ('PY60700',  'MAN', 'TGX', 'ciągnik', 2019, 858988,  null,  548.17, true)
on conflict (reg) do update
  set odometer_km = excluded.odometer_km,
      avg_fuel_l100 = excluded.avg_fuel_l100,
      leasing_eur_mo = excluded.leasing_eur_mo;

-- ─── Indeksy ─────────────────────────────────────────────────
create index if not exists idx_routes_countries on route_history(origin_country, dest_country);
create index if not exists idx_routes_client on route_history(client);
create index if not exists idx_routes_date on route_history(transport_date);
create index if not exists idx_calc_created on route_calculations(created_at desc);
