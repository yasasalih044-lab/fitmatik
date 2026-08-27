-- Fit-matik — Supabase şeması
-- Supabase panelinde SQL Editor'e yapıştırıp çalıştır.

create extension if not exists "pgcrypto";

create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  eaten_at    timestamptz not null default now(),
  source      text not null check (source in ('text','image')),
  raw_input   text,
  image_url   text,
  title       text not null,
  items       jsonb not null default '[]'::jsonb,
  kcal_min    integer not null default 0,
  kcal_max    integer not null default 0,
  kcal_best   integer not null default 0,
  protein_g   numeric,
  carbs_g     numeric,
  fat_g       numeric,
  confidence  text not null default 'low',
  verdict     text not null default '',
  sources     jsonb not null default '[]'::jsonb,
  model       text
);

create index if not exists entries_eaten_at_idx on public.entries (eaten_at desc);

-- Uygulama service_role anahtarıyla sunucu tarafından yazar; RLS açık kalsın,
-- politika yok => anon/authenticated anahtarlarla erişim kapalı, service_role bypass eder.
alter table public.entries enable row level security;

-- Görseller için storage kovası (public okuma).
insert into storage.buckets (id, name, public)
values ('fitmatik', 'fitmatik', true)
on conflict (id) do update set public = true;
