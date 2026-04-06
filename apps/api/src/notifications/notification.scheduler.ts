import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationScheduler {
  private readonly logger = new Logger(NotificationScheduler.name);

  constructor(private readonly notificationSvc: NotificationService) {}

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
}
