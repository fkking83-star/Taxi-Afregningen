-- Punkt 0.2, trin 6. Sletter kopien af de GAMLE tokens (sikkerhed_backup.tokens_gamle_20260930) — ENDELIGT.
-- Bagefter kan tilbageføringen ikke åbne de slettede gamle links igen (den stopper med en tydelig besked, uden at ændre noget).
-- Kør den i dele, så de gamle koder ikke ligger længere end nødvendigt:
--   'ejer'     lige efter trin 3 (sluk gammel ejer-kode), når det nye dashboard-link er set virke — senest samme dag.
--   '<navn>'   for en chauffør, når trin 5 er kørt for ham, og han har bekræftet sit nye link.
--   'alle'     til sidst (kræver, at alle gamle koder er slukket); tabellen fjernes, når den er tom.
-- Scriptet SLETTER INTET, hvis den gamle kode stadig kan bruges (ejer: den findes stadig i config; chauffør: den er stadig chaufførens token).
-- Der vises kun antal, aldrig tokens.
do $$
declare
  v_hvem text := 'ejer';   -- ← RET KUN DENNE LINJE: 'ejer', en chaufførs navn, eller 'alle'
  r record;
  v_ejer int := 0;
  v_chauf int := 0;
  v_aaben text;
begin
  if to_regclass('sikkerhed_backup.tokens_gamle_20260930') is null then
    raise exception 'Kopien findes ikke (den er allerede slettet) — intet ændret';
  end if;

  -- 1) Hvad ville blive slettet, og er det slukket?
  if v_hvem in ('ejer', 'alle') then
    if exists (select 1 from sikkerhed_backup.tokens_gamle_20260930 b join public.config c on c.n = 'owner_token' and c.v = b.token where b.art = 'ejer') then
      raise exception 'Den gamle ejer-kode er ikke slukket (trin 3) — intet slettet';
    end if;
    if not exists (select 1 from public.config where n = 'owner_token') then
      raise exception 'Der er ingen ejer-kode i config — intet slettet';
    end if;
  end if;

  select string_agg(b.navn, ', ' order by b.navn) into v_aaben
  from sikkerhed_backup.tokens_gamle_20260930 b
  where b.art = 'chauffør' and b.token is not null and (v_hvem = 'alle' or b.navn = v_hvem)
    and exists (select 1 from public.satser s where s.chauffor = b.navn and s.token = b.token);
  if v_aaben is not null then
    raise exception 'Den gamle kode virker stadig for: % (kør trin 5 først) — intet slettet', v_aaben;
  end if;

  if v_hvem not in ('ejer', 'alle') and not exists (select 1 from sikkerhed_backup.tokens_gamle_20260930 where art = 'chauffør' and navn = v_hvem) then
    raise exception 'Ingen kopi fundet for % — intet ændret', v_hvem;
  end if;

  -- 2) Slet
  if v_hvem in ('ejer', 'alle') then
    delete from sikkerhed_backup.tokens_gamle_20260930 where art = 'ejer';
    get diagnostics v_ejer = row_count;
  end if;
  delete from sikkerhed_backup.tokens_gamle_20260930 where art = 'chauffør' and (v_hvem = 'alle' or navn = v_hvem);
  get diagnostics v_chauf = row_count;

  if v_hvem = 'alle' or not exists (select 1 from sikkerhed_backup.tokens_gamle_20260930) then
    drop table sikkerhed_backup.tokens_gamle_20260930;
  end if;
  raise notice 'Slettet fra kopien: % ejer-række(r), % chauffør-række(r)', v_ejer, v_chauf;
end $$;

select case when to_regclass('sikkerhed_backup.tokens_gamle_20260930') is null then 'kopien er slettet helt'
            else 'kopien findes stadig (rest vises ved næste kørsel af trin 0-tjek)' end as status;
