const { PrismaMariaDb } = require('@prisma/adapter-mariadb');

module.exports = {
  migrate: {
    adapter: () => new PrismaMariaDb(process.env.DATABASE_URL || ''),
  },
};
