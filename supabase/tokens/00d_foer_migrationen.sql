-- Punkt 0.2, før migrationen. KUN LÆSNING. Viser, hvad migrationen vil røre, så vi kan se, at den ikke overskriver noget, jeg ikke har set:
--  1) de nuværende definitioner af hent_kvittering og hent_ture (migrationen erstatter begge);
--  2) funktioner, der bruger "on conflict" sammen med config (ville knække, når primærnøglen på config.n erstattes af en unik nøgle på (n, v));
--  3) config's nøgler og eventuelle fremmednøgler, der peger på config.
-- Der står ingen tokens i funktionsdefinitionerne. Send gerne resultatet til Claude.
select 'definition' as art, p.proname::text as navn, pg_get_functiondef(p.oid) as indhold
from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.proname in ('hent_kvittering', 'hent_ture')
union all
select 'on conflict + config', p.proname::text, null
from pg_proc p join pg_namespace s on s.oid = p.pronamespace
where s.nspname = 'public' and p.prokind = 'f'
  and pg_get_functiondef(p.oid) ilike '%on conflict%' and pg_get_functiondef(p.oid) ilike '%config%'
union all
select 'config-nøgle', conname::text, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.config'::regclass
union all
select 'fremmednøgle til config', conname::text, conrelid::regclass::text from pg_constraint where confrelid = 'public.config'::regclass
order by 1, 2;
