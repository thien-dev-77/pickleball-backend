import { databaseUrl } from './database-url';

describe('databaseUrl', () => {
  it('keeps an explicit DATABASE_URL', () => {
    expect(databaseUrl({ DATABASE_URL: 'postgresql://example/test' })).toBe(
      'postgresql://example/test',
    );
  });

  it('rejects missing DATABASE_URL even when legacy DB variables exist', () => {
    expect(() =>
      databaseUrl({
        DB_HOST: 'db.example.test',
        DB_PORT: '5432',
        DB_DATABASE: 'postgres',
        DB_USERNAME: 'user.name',
        DB_PASSWORD: 'secret@value',
      }),
    ).toThrow('Thiếu DATABASE_URL');
  });

  it('rejects an empty DATABASE_URL', () => {
    expect(() => databaseUrl({ DATABASE_URL: '   ' })).toThrow(
      'Thiếu DATABASE_URL',
    );
  });
});
