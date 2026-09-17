import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { databaseUrl, DatabaseEnvironment } from './database-url';

export function databaseConnection(environment: DatabaseEnvironment) {
  const url = databaseUrl(environment);
  const parsed = new URL(url);
  if (
    parsed.searchParams.get('sslmode') !== 'verify-full' ||
    parsed.searchParams.get('sslrootcert') !== 'certs/supabase-ca.crt'
  ) {
    return { url };
  }

  // A static file reference lets Vercel trace the bundled public CA.
  const ca = readFileSync(join(process.cwd(), 'certs/supabase-ca.crt'), 'utf8');
  // pg's URL SSL parameters would otherwise overwrite the explicit CA options.
  parsed.searchParams.delete('sslmode');
  parsed.searchParams.delete('sslrootcert');
  return {
    url: parsed.toString(),
    ssl: { ca, rejectUnauthorized: true },
  };
}
