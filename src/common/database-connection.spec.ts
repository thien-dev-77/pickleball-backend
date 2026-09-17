import { X509Certificate } from 'node:crypto';
import { databaseConnection } from './database-connection';

describe('databaseConnection', () => {
  it('preserves URLs without the bundled verified CA', () => {
    const url = 'postgresql://user:password@localhost:5432/database';
    expect(databaseConnection({ DATABASE_URL: url })).toEqual({ url });
  });

  it('loads the bundled CA and preserves credentials and other query parameters', () => {
    const connection = databaseConnection({
      DATABASE_URL:
        'postgresql://user:pass%40word@db.example.test:5432/postgres?sslmode=verify-full&sslrootcert=certs%2Fsupabase-ca.crt&application_name=pickleball',
    });
    const url = new URL(connection.url);
    expect(url.password).toBe('pass%40word');
    expect(url.searchParams.get('application_name')).toBe('pickleball');
    expect(url.searchParams.has('sslrootcert')).toBe(false);
    expect(url.searchParams.has('sslmode')).toBe(false);
    expect(connection.ssl?.rejectUnauthorized).toBe(true);
    expect(new X509Certificate(connection.ssl!.ca).subject).toContain(
      'Supabase',
    );
  });

  it('preserves custom certificate paths and other SSL modes', () => {
    const url =
      'postgresql://user:password@db.example.test/database?sslmode=verify-full&sslrootcert=/custom/ca.crt';
    expect(databaseConnection({ DATABASE_URL: url })).toEqual({ url });
  });
});
