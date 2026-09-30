-- Kørt i live-databasen 30/9-2026 (SQL Editor). Tjekket bagefter: ingen rettigheder for anon/authenticated,
-- RLS til på satser og slutrapporter, lonseddel() lukket, sikkerhedskopi med 84 rettigheder.
-- Fortryd med det samme: supabase/tilbagefoering/20260929100000_luk_direkte_adgang.sql
-- Luk direkte adgang til tabeller og views for den offentlige nøgle (anon) og for authenticated.
--
-- Hvorfor: anon-nøglen står i kildekoden til dashboard.html og kvittering.html, så alle, der
-- har et kvitterings-link, kan se den. Live (tjekket 29/9-2026) har anon bl.a.:
--   - SELECT på satser (alle chaufførers tokens og satser) og UPDATE på satser (ændre satser)
--   - SELECT på v_data, v_lonseddel og v_afregning (alle chaufførers ture og løn)
--   - INSERT/UPDATE/DELETE på slutrapporter (satser og slutrapporter har ikke RLS slået til)
-- Views kører som deres ejer og omgår derfor RLS. De skal lukkes med grants.
--
-- Hvad virker stadig: dashboardet og kvitteringen bruger kun RPC-funktioner (hent_alle, hent_ture,
-- hent_kvittering, ret_slutrapport, opret_slutrapport, hent_billeder, find_slutrapport,
-- hent_aendringer, fortryd_aendring ...). De er security definer og tjekker selv token, så de
-- påvirkes ikke. service_role (Make) påvirkes ikke. Rører IKKE lønberegningen.

begin;

-- 0) Sikkerhedskopi af anon/authenticated's nuværende rettigheder, som tilbageføringen bruger.
--    Ligger i et skema uden for public, så den ikke kan nås via API'et. Gemmes kun ved første kørsel,
--    så en ny kørsel ikke overskriver kopien med den allerede lukkede tilstand.
create schema if not exists sikkerhed_backup;
revoke all on schema sikkerhed_backup from public, anon, authenticated;
create table if not exists sikkerhed_backup.rettigheder_20260929 (
  objekt      text not null,         -- tabel, view eller sekvens i public
  type        text not null,         -- relkind: r = tabel, v = view, S = sekvens ...
  grantee     text not null,         -- anon eller authenticated
  privilegie  text not null,         -- SELECT, INSERT, UPDATE ...
  gemt        timestamptz not null default now()
);
insert into sikkerhed_backup.rettigheder_20260929 (objekt, type, grantee, privilegie)
select c.relname, c.relkind::text, r.rolname, a.privilege_type
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join lateral aclexplode(c.relacl) a
join pg_roles r on r.oid = a.grantee
where n.nspname = 'public'
  and c.relkind in ('r', 'v', 'm', 'S', 'p', 'f')
  and r.rolname in ('anon', 'authenticated')
  and not exists (select 1 from sikkerhed_backup.rettigheder_20260929);

-- 1) Ingen direkte adgang til tabeller, views og sekvenser i public for anon/authenticated.
--    ("all tables" omfatter også views.)
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- 2) Nye tabeller og views får heller ikke adgang automatisk
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;

-- 3) RLS som ekstra lås på de to tabeller, der mangler den. Uden policies betyder det: ingen adgang
--    for anon/authenticated. Tabellens ejer (RPC-funktionerne) og service_role påvirkes ikke.
alter table public.satser enable row level security;
alter table public.slutrapporter enable row level security;

-- 4) lonseddel(p_chauffor, p_maaned) har intet token-tjek og bruges ikke af siderne
revoke execute on function public.lonseddel(text, text) from public, anon, authenticated;

commit;
