import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationService } from './notification.service';
import { QueueDispatcherService } from '../queue/services/queue-dispatcher.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationScheduler {
  private readonly logger = new Logger(NotificationScheduler.name);

  constructor(
    private readonly notificationSvc: NotificationService,
    private readonly prisma: PrismaService,
    @Optional() private readonly dispatcher: QueueDispatcherService,
  ) {}

  /** ทุก 30 นาที — ตรวจหนังสือด่วนที่สุดยังไม่ลงรับ */
  @Cron('0 */30 * * * *')
  async checkMostUrgent() {
    this.logger.debug('Cron: checkMostUrgent');
    await this.notificationSvc.alertMostUrgentUnregistered();
  }

  /** 07:30 ทุกวันทำการ — V2: ส่ง executive snapshot ให้ ผอ. */
  @Cron('0 30 7 * * 1-5')
  async executiveSnapshot() {
    this.logger.debug('Cron: executiveSnapshot');
    await this.notificationSvc.sendExecutiveSnapshot();
  }

  /** 08:30 ทุกวันทำการ — เตือน deadline ใกล้ + แจ้งเช็คระบบ */
  @Cron('0 30 8 * * 1-5')
  async morningReminder() {
    this.logger.debug('Cron: morningReminder');
    await Promise.all([
      this.notificationSvc.alertDeadlineApproaching(),
      this.notificationSvc.sendDailyCheckReminder(),
    ]);
  }

  /** 13:00 ทุกวันทำการ — เตือนเช็คระบบบ่าย */
  @Cron('0 0 13 * * 1-5')
  async afternoonReminder() {
    this.logger.debug('Cron: afternoonReminder');
    await this.notificationSvc.sendDailyCheckReminder();
  }

  /** ทุกวันจันทร์ 09:00 — รายงานงานค้างประจำสัปดาห์ */
  @Cron('0 0 9 * * 1')
  async weeklyReport() {
    this.logger.debug('Cron: weeklyReport');
    await this.notificationSvc.sendWeeklyOverdueReport();
  }

  /** ทุกวันจันทร์ 09:30 — เตือนเอกสารครบกำหนดเก็บรักษา */
  @Cron('0 30 9 * * 1')
  async retentionAlert() {
    this.logger.debug('Cron: retentionAlert');
    await this.notificationSvc.alertRetentionExpiring();
  }

  /** ทุกวัน 02:00 — backup เอกสารที่ยังไม่ได้ backup ไป Google Drive */
  @Cron('0 0 2 * * *')
  async dailyBackup() {
    if (!this.dispatcher) return;
    this.logger.debug('Cron: dailyBackup');
    const pending = await this.prisma.documentIntake.findMany({
      where: {
        uploadStatus: { notIn: ['backed_up', 'backup_failed'] },
        storagePath: { not: null },
      },
      select: { id: true },
      take: 50,
    });
    for (const intake of pending) {
      await this.dispatcher.dispatchDriveBackup(intake.id);
    }
    if (pending.length > 0) {
      this.logger.log(`Dispatched backup for ${pending.length} intakes`);
    }
  }
}
