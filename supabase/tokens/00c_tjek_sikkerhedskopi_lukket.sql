-- Punkt 0.2, supplement. KUN LÆSNING. Viser, om kopien af de gamle tokens kan nås af anon/authenticated (skal alle være false),
-- og hvilke skemaer API'et udstiller (sikkerhed_backup må IKKE stå på listen). Viser aldrig tokens. Send gerne resultatet til Claude.
-- Kør den efter trin 0 (kopien skal findes for at tabellen kan tjekkes).
select 'rolle ' || r.rolname as hvad,
       'bruge skemaet: ' || has_schema_privilege(r.rolname, 'sikkerhed_backup', 'usage')::text
       || ' · læse kopien: ' || case when to_regclass('sikkerhed_backup.tokens_gamle_20260930') is null then '(kopien findes ikke)'
            else has_table_privilege(r.rolname, 'sikkerhed_backup.tokens_gamle_20260930', 'select')::text end as vaerdi
from pg_roles r
where r.rolname in ('anon', 'authenticated', 'service_role')
union all
select 'API udstiller (authenticator)', coalesce((select c from pg_roles a, unnest(a.rolconfig) c where a.rolname = 'authenticator' and c like 'pgrst.db_schemas%' limit 1), '(ingen indstilling fundet)')
order by 1;
