-- ================================================================================================
-- SUPPLEMENT TIL SIKKERHEDSKOPIEN (sikkerhed_backup.rettigheder_20260929). IKKE KØRT.
-- Hvorfor: kopien blev taget 29/9 21:24, efter at tabellernes rettigheder allerede var fjernet
-- (en tidligere version af lukningen uden kopi). Den indeholder derfor kun sekvenserne (12 rækker),
-- og tilbageføringen kan ikke åbne tabellerne igen. Her tilføjes anons rettigheder, som de stod
-- live 29/9-2026 (information_schema.role_table_grants).
-- Ændrer INGEN rettigheder og ingen data, kun indholdet af kopien. Kan køres flere gange.
-- ================================================================================================
insert into sikkerhed_backup.rettigheder_20260929 (objekt, type, grantee, privilegie)
select o.objekt, o.type, 'anon', p
from (values
  ('chauffør Afregning', 'r', array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']),
  ('config',             'r', array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']),
  ('fejlede_uploads',    'r', array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']),
  ('satser',             'r', array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']),
  ('slutrapporter',      'r', array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']),
  ('v_advarsler',        'v', array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']),
  ('v_afregning',        'v', array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']),
  ('v_data',             'v', array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']),
  ('v_dato_tjek',        'v', array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']),
  ('v_dubletter',        'v', array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']),
  ('v_lonseddel',        'v', array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'])
) as o(objekt, type, rettigheder)
cross join lateral unnest(o.rettigheder) as p
where not exists (select 1 from sikkerhed_backup.rettigheder_20260929 b
                  where b.objekt = o.objekt and b.grantee = 'anon' and b.privilegie = p);
