-- Punkt 0.5, forespørgsel 4. KUN LÆSNING (ét select, ændrer intet).
-- Opslag på nr 1639 (Faysals manglende bon?) og nr 1112 (står hos både Adan og Fuad) i slutrapporter og i fejlede uploads.
select 'slutrapporter' as kilde, s.id::text as id, s.dato::text as dato, s.chauffor, s.slutrapport_nr as nr,
       s.indkort::text as indkort, s.overfort::text as overfort, s.bro_faerge::text as bro, s.kontant::text as kontant,
       'bekræftet=' || coalesce(s.bekraeftet::text, '?') as status, s.oprettet::text as oprettet
from slutrapporter s
where s.slutrapport_nr in ('1639', '1112')
union all
select 'fejlede_uploads', f.id::text, f.raa_data->>'dato', f.chauffor, f.raa_data->>'slutrapport_nr',
       f.raa_data->>'indkort', f.raa_data->>'overfort', f.raa_data->>'bro_faerge', f.raa_data->>'kontant',
       'status=' || coalesce(f.status, '?') || ' — ' || coalesce(left(f.fejl_besked, 60), ''), f.modtaget::text
from fejlede_uploads f
where f.raa_data->>'slutrapport_nr' in ('1639', '1112') or f.fejl_besked like '%1639%' or f.fejl_besked like '%1112%'
order by 1, 4, 3;
