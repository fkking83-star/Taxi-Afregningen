// Bygger databasen fra bunden ud fra supabase/migrations/ (i navne-rækkefølge) i en rigtig Postgres (PGlite).
// Det, Supabase selv leverer (roller og storage-skemaet), oprettes som minimale stubbe først.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'fs';

export const MIGRATIONER = new URL('../../supabase/migrations/', import.meta.url);

export async function supabaseStubbe(db) {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean default false, allowed_mime_types text[]);
    create table storage.objects(bucket_id text, name text, created_at timestamptz default now());
  `);
}

// Returnerer { db, koerte: [filnavne], fejl: {fil, besked} | null }
export async function bygFraMigrationer({ til } = {}) {
  const db = new PGlite();
  await supabaseStubbe(db);
  const koerte = [];
  for (const fil of readdirSync(MIGRATIONER).filter(f => f.endsWith('.sql')).sort()) {
    if (til && fil > til) break;
    try { await db.exec(readFileSync(new URL(fil, MIGRATIONER), 'utf8')); koerte.push(fil); }
    catch (e) { return { db, koerte, fejl: { fil, besked: e.message } }; }
  }
  return { db, koerte, fejl: null };
}
