// prisma.config.ts — Prisma v7 datasource configuration
// defineConfig() is intentionally NOT used here because 'prisma/config'
// sub-path export fails in some module-resolution environments.
// A plain export default is equivalent (defineConfig is a pass-through).

try { require('dotenv/config'); } catch {}

export default {
  migrate: {
    adapter: () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { PrismaMariaDb } = require('@prisma/adapter-mariadb');
      const url = process.env.DATABASE_URL || 'mysql://root:@localhost:3306/nextoffice_db';
      return new PrismaMariaDb(url);
    },
  },
};
