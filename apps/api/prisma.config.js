const { defineConfig } = require('@prisma/config');

module.exports = defineConfig({
  datasource: {
    url: process.env.DATABASE_URL || 'mysql://root:@localhost:3306/nextoffice_db',
  },
});
