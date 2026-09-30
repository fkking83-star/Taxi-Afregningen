-- Punkt 0.2, før trin 0. KUN LÆSNING. Viser antal ejer-koder og hvilke chauffører der har en token, men aldrig selve tokens.
-- Forventet: ejer_koder = 1, hver chauffør "har token", ingen dubletter. Send gerne resultatet til Claude (der står ingen koder i det).
select 'ejer_koder' as hvad, count(*)::text as vaerdi from public.config where n = 'owner_token'
union all
select 'chauffør ' || chauffor, case when token is null then 'INGEN token' else 'har token (' || length(token) || ' tegn)' end from public.satser
union all
select 'token brugt af flere chauffører', count(*)::text from (select token from public.satser where token is not null group by token having count(*) > 1) d
order by 1;
