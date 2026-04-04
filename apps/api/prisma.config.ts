import { PrismaMariaDb } from '@prisma/adapter-mariadb';

export default {
  migrate: {
    adapter: () => new PrismaMariaDb(process.env.DATABASE_URL ?? ''),
  },
};
