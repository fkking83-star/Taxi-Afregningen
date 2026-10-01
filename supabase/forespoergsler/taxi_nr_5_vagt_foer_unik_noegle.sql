-- taxi_nr, til trin 1.1: VAGT, der står FØRST i migrationen, før den unikke nøgle oprettes. Kræver kolonnerne kilde og taxi_nr på slutrapporter.
-- Ændrer INGENTING. Stopper med en tydelig fejl, hvis samme bon (kilde + taxi_nr + nummer) stadig ligger mere end én gang, uanset chauffør.
-- Så kan den unikke nøgle (kilde, taxi_nr, slutrapport_nr) aldrig oprettes oven på samme bon hos to chauffører.
-- Rækker uden taxi_nr tæller ikke med (nøglen gælder kun, hvor taxi_nr er udfyldt). Mellemrum omkring nummeret ignoreres.
do $$
declare
  v_antal int;
  v_eksempler text;
begin
  select count(*),
         string_agg('nr ' || nr || ' i ' || taxi_nr || ' hos ' || chauffoerer, '; ' order by taxi_nr, nr)
    into v_antal, v_eksempler
  from (
    select s.kilde, s.taxi_nr, btrim(s.slutrapport_nr) as nr,
           string_agg(coalesce(s.chauffor, '(ingen)'), ', ' order by s.chauffor) as chauffoerer
    from public.slutrapporter s
    where s.taxi_nr is not null
    group by s.kilde, s.taxi_nr, btrim(s.slutrapport_nr)
    having count(*) > 1
    order by s.taxi_nr, btrim(s.slutrapport_nr)
    limit 10
  ) d;
  if v_antal > 0 then
    raise exception 'STOP: samme bon ligger flere gange i samme bil (% fundet, fx: %). Kør supabase/forespoergsler/taxi_nr_4_samme_bon_hos_flere_chauffoerer.sql, ret eller slet rækkerne, og kør migrationen igen. Intet er ændret.',
      v_antal, v_eksempler;
  end if;
end $$;
