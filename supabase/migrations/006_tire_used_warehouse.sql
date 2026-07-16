-- ============================================================
-- TruckCalc HBM — Magazyn opon zużytych (zdjętych z pojazdu + z placu)
-- Uwaga: tabele tires / tire_inspections / tire_readings / tire_warehouse
-- nie były dotąd w żadnej trackowanej migracji (utworzone ręcznie w
-- Supabase). CREATE TABLE IF NOT EXISTS poniżej tylko zabezpiecza świeże
-- środowiska — na produkcji zadziałają wyłącznie sekcje ALTER TABLE.
-- ============================================================

create extension if not exists "uuid-ossp";

-- ─── TIRES (opona aktualnie zamontowana na pozycji) ──────────
create table if not exists tires (
  id               uuid primary key default uuid_generate_v4(),
  vehicle_reg      text not null,
  position         text not null,
  brand            text,
  model            text,
  size             text,
  dot              text,
  installed_date   date,
  installed_km     int,
  is_retreaded     boolean default false,
  status           text default 'active',   -- 'active' | 'removed' | 'warehouse'
  notes            text,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  unique (vehicle_reg, position)
);

-- ─── TIRE_WAREHOUSE (magazyn: nowe + używane + złom) ─────────
create table if not exists tire_warehouse (
  id               uuid primary key default uuid_generate_v4(),
  brand            text not null,
  model            text,
  size             text not null,
  dot              text,
  condition        text default 'nowa',     -- 'nowa' | 'uzywana' | 'bieznikowana'
  tread_mm         numeric(4,1),
  quantity         int default 1,
  location         text,
  price_pln        numeric(10,2),
  notes            text,
  created_at       timestamptz default now()
);

-- ─── Rozszerzenie tire_warehouse o pochodzenie opony ─────────
-- source: 'zakup' (partia kupiona) | 'zdjęcie' (zdjęta z pojazdu) | 'plac' (zastana na placu, spoza systemu)
alter table tire_warehouse add column if not exists source text default 'zakup';
alter table tire_warehouse add column if not exists source_vehicle_reg text;
alter table tire_warehouse add column if not exists source_position text;
alter table tire_warehouse add column if not exists removed_reason text;
alter table tire_warehouse add column if not exists removed_km int;
-- purpose: 'montaz' (do ponownego montażu) | 'bieznikowanie' | 'zlom' | 'nieokreslone'
alter table tire_warehouse add column if not exists purpose text default 'montaz';
-- is_scrap: flaga filtrująca — opony na złom nie pojawiają się w wyborze "z magazynu" przy montażu
alter table tire_warehouse add column if not exists is_scrap boolean not null default false;

create index if not exists idx_tire_warehouse_scrap on tire_warehouse(is_scrap);
create index if not exists idx_tires_vehicle on tires(vehicle_reg);
