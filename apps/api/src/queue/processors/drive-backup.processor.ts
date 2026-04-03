import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { QUEUE_FILE_INTAKE } from '../queue.constants';

@Processor(QUEUE_FILE_INTAKE)
export class DriveBackupProcessor {
  private readonly logger = new Logger(DriveBackupProcessor.name);

  constructor(private readonly prisma: PrismaService) {}

  @Process('intake.store.file')
  async handleStoreFile(job: Job<{ documentIntakeId: string }>) {
    const intakeId = BigInt(job.data.documentIntakeId);
    this.logger.log(`Store file for intake ${intakeId}`);
    await this.prisma.documentIntake.update({
      where: { id: intakeId },
      data: { uploadStatus: 'stored' },
    });
  }

  @Process('intake.backup.drive')
  async handleBackupDrive(job: Job<{ documentIntakeId: string }>) {
    const intakeId = BigInt(job.data.documentIntakeId);
    this.logger.log(`Google Drive backup for intake ${intakeId}`);
    await this.prisma.documentIntake.update({
      where: { id: intakeId },
      data: { uploadStatus: 'backed_up' },
    });
  }
}
