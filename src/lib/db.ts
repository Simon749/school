import { PrismaClient } from '@prisma/client';

// Singleton pattern to avoid exhausting DB connections during Next.js
// dev-mode hot reloading. See AGENTS.md §47 — Redis/cache is not a source
// of truth; this file is just the PostgreSQL connection, no caching here.

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
