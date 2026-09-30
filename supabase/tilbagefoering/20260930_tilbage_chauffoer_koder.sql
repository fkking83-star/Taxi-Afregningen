-- NØDPLAN: åbner den gamle kode igen for én chauffør (eller alle med 'alle'). Den nye kode forbliver gyldig ved siden af.
-- Virker med det samme. Bruges, hvis trin 5 (sluk gammel chauffør-kode) gav problemer. Ikke en migration.
do $$
declare
  v_navn text := 'Fuad';   -- ← RET KUN DENNE LINJE: chaufførens navn, eller 'alle'
  r record;
  v_nuvaerende text;
  v_antal int := 0;
begin
  for r in select navn, token from sikkerhed_backup.tokens_gamle_20260930
           where art = 'chauffør' and (v_navn = 'alle' or navn = v_navn)
  loop
    v_antal := v_antal + 1;
    select token into v_nuvaerende from public.satser where chauffor = r.navn;
    if v_nuvaerende is distinct from r.token then
      if v_nuvaerende is not null and not exists (select 1 from public.chauffor_tokens where token = v_nuvaerende) then
        insert into public.chauffor_tokens (chauffor, token) values (r.navn, v_nuvaerende);   -- det nye link forbliver gyldigt
      end if;
      update public.satser set token = r.token where chauffor = r.navn;
    end if;
  end loop;
  if v_antal = 0 then
    raise exception 'Ingen kopi fundet for % — intet ændret', v_navn;
  end if;
end $$;

select chauffor, (token is not null) as har_token from public.satser order by chauffor;
