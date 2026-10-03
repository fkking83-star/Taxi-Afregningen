-- Punkt 0.2, før trin 0 (supplement). KUN LÆSNING. Viser kun NAVNE og ANTAL, aldrig værdier eller tokens. Send gerne resultatet til Claude.
-- 1) Hvilke nøgler står i config, og hvor mange rækker hver (forventet: owner_token = 1).
-- 2) Hvilke funktioner i schema public nævner config eller owner_token (dem, der tjekker ejer-koden, og evt. en, der skriver til config).
-- Make bruger service_role og ejer-koden ikke (ejerens oplysning 3/10); denne forespørgsel viser, hvad databasen selv siger.
select 'config-nøgle: ' || n as hvad, count(*)::text as antal
from public.config
group by n
union all
select 'funktion nævner config/owner_token', p.proname
from pg_proc p
join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.prokind = 'f'
  and (pg_get_functiondef(p.oid) ilike '%config%' or pg_get_functiondef(p.oid) ilike '%owner_token%')
order by 1, 2;
