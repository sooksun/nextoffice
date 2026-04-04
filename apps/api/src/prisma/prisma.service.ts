import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

// Prisma v7 uses a factory pattern; we cast to any to allow extension
const PrismaBase = PrismaClient as any;

@Injectable()
export class PrismaService extends PrismaBase implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const dbUrl = process.env.DATABASE_URL || 'mysql://root:@localhost:3306/nextoffice_db';
    const adapter = new PrismaMariaDb(dbUrl);
    super({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

// Merge PrismaClient instance type so TypeScript sees all model delegates
export interface PrismaService extends InstanceType<typeof PrismaClient> {}
