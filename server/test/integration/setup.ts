// Integration tests need a real database. Fail fast (rather than hang on a
// connection attempt) if DATABASE_URL isn't pointed at one.
if (!process.env.DATABASE_URL) {
  throw new Error('Integration tests require DATABASE_URL to point at a throwaway Postgres database')
}
process.env.JWT_SECRET ||= 'itest-jwt-secret'
process.env.JWT_REFRESH_SECRET ||= 'itest-jwt-refresh-secret'
process.env.NODE_ENV = 'test'
