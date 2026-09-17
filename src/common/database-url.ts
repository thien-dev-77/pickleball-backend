export type DatabaseEnvironment = Record<string, string | undefined>;

export function databaseUrl(environment: DatabaseEnvironment): string {
  const url = environment.DATABASE_URL?.trim();
  if (!url) {
    throw new Error('Thiếu DATABASE_URL trong backend-nestjs/.env.');
  }
  return url;
}
