// Env the modules under test expect at import time. jwt.ts throws without its
// secrets; prisma.ts reads DATABASE_URL. None of these tests touch a real DB or
// verify real tokens — they mock Prisma and only need the modules to load.
process.env.JWT_SECRET ||= 'test-jwt-secret'
process.env.JWT_REFRESH_SECRET ||= 'test-jwt-refresh-secret'
process.env.DATABASE_URL ||= 'postgresql://localhost:5432/wasil_test'
process.env.NODE_ENV = 'test'
