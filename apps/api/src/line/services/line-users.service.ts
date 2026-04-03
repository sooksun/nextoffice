import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LineUsersService {
  private readonly logger = new Logger(LineUsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsert(lineUserId: string, channelId: bigint, displayName?: string) {
    return this.prisma.lineUser.upsert({
      where: { lineUserId },
      create: {
        lineChannelId: channelId,
        lineUserId,
        displayName: displayName || null,
        status: 'active',
      },
      update: {
        displayName: displayName || undefined,
      },
    });
  }

  async findByLineUserId(lineUserId: string) {
    return this.prisma.lineUser.findUnique({ where: { lineUserId } });
  }

  async getDefaultChannel() {
    return this.prisma.lineChannel.findFirst({ where: { isActive: true } });
  }
}
