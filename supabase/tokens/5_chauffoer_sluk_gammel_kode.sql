-- Punkt 0.2, trin 5. SLUKKER den gamle kode for ÉN chauffør og gør det nye link til hans faste. Det gamle link holder op med at virke med det samme.
-- Sikring: stopper uden at ændre noget, hvis der ikke er præcis ét nyt link, eller kopien af det gamle mangler.
-- Fortryd med det samme: supabase/tilbagefoering/20260930_tilbage_chauffoer_koder.sql
do $$
declare
  v_navn text := 'Fuad';   -- ← RET KUN DENNE LINJE: chaufførens navn præcis som i satser
  v_ny text;
begin
  if not exists (select 1 from sikkerhed_backup.tokens_gamle_20260930 where art = 'chauffør' and navn = v_navn) then
    raise exception 'Kopien af den gamle kode for % mangler — intet ændret', v_navn;
  end if;
  if (select count(*) from public.chauffor_tokens where chauffor = v_navn) <> 1 then
    raise exception '% har ikke præcis ét nyt link — intet ændret', v_navn;
  end if;
  select token into v_ny from public.chauffor_tokens where chauffor = v_navn;
  update public.satser set token = v_ny where chauffor = v_navn;
  delete from public.chauffor_tokens where chauffor = v_navn;
end $$;

select chauffor, (token is not null) as har_token from public.satser order by chauffor;
