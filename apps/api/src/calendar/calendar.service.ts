import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const LEAVE_TYPE_LABEL: Record<string, string> = {
  sick: 'ลาป่วย',
  personal: 'ลากิจ',
  vacation: 'ลาพักผ่อน',
  maternity: 'ลาคลอด',
  ordination: 'ลาบวช',
  training: 'ลาศึกษาต่อ',
};

const ATTENDANCE_COLOR: Record<string, string> = {
  checked_out: 'green',
  checked_in: 'blue',
  late: 'yellow',
  absent: 'red',
  leave: 'orange',
  travel: 'purple',
};

const LEAVE_COLOR: Record<string, Record<string, string>> = {
  approved: { sick: 'orange', personal: 'purple', vacation: 'blue', maternity: 'red', ordination: 'gray', training: 'blue' },
  pending: { sick: 'gray', personal: 'gray', vacation: 'gray', maternity: 'gray', ordination: 'gray', training: 'gray' },
};

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getEvents(orgId: bigint, from: Date, to: Date) {
    const [attendance, leaves, travels] = await Promise.all([
      this.getAttendanceEvents(orgId, from, to),
      this.getLeaveEvents(orgId, from, to),
      this.getTravelEvents(orgId, from, to),
    ]);

    return [...attendance, ...leaves, ...travels];
  }

  private async getAttendanceEvents(orgId: bigint, from: Date, to: Date) {
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        organizationId: orgId,
        attendanceDate: { gte: from, lte: to },
        status: { notIn: ['leave', 'travel'] }, // leave/travel handled separately
      },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { attendanceDate: 'asc' },
    });

    return records.map((r) => {
      const date = r.attendanceDate;
      const checkIn = r.checkInAt;
      const checkOut = r.checkOutAt;

      const timeIn = checkIn ? this.formatTime(checkIn) : null;
      const timeOut = checkOut ? this.formatTime(checkOut) : null;

      let title = '';
      if (r.status === 'checked_out' && timeIn && timeOut) {
        title = `เข้า ${timeIn} - ออก ${timeOut}`;
      } else if (r.status === 'checked_in' && timeIn) {
        title = `เข้า ${timeIn}`;
      } else if (r.status === 'late' && timeIn) {
        title = `มาสาย ${timeIn}`;
      } else if (r.status === 'absent') {
        title = 'ขาด';
      } else {
        title = r.status;
      }

      const startDate = checkIn
        ? checkIn.toISOString()
        : new Date(date.getFullYear(), date.getMonth(), date.getDate(), 8, 0).toISOString();
      const endDate = checkOut
        ? checkOut.toISOString()
        : new Date(date.getFullYear(), date.getMonth(), date.getDate(), 16, 30).toISOString();

      return {
        id: Number(r.id),
        startDate,
        endDate,
        title,
        color: ATTENDANCE_COLOR[r.status] ?? 'gray',
        description: r.remark ?? '',
        user: {
          id: r.user.id.toString(),
          name: r.user.fullName,
          picturePath: null,
        },
      };
    });
  }

  private async getLeaveEvents(orgId: bigint, from: Date, to: Date) {
    const leaves = await this.prisma.leaveRequest.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['approved', 'pending'] },
        startDate: { lte: to },
        endDate: { gte: from },
      },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { startDate: 'asc' },
    });

    return leaves.map((l) => {
      const label = LEAVE_TYPE_LABEL[l.leaveType] ?? l.leaveType;
      const statusLabel = l.status === 'pending' ? ' (รออนุมัติ)' : '';

      const start = l.startDate;
      const end = l.endDate;

      return {
        id: Number(l.id) + 1_000_000, // offset to avoid ID collision with attendance
        startDate: new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0).toISOString(),
        endDate: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59).toISOString(),
        title: `${label}${statusLabel} - ${l.user.fullName}`,
        color: LEAVE_COLOR[l.status]?.[l.leaveType] ?? 'gray',
        description: l.reason ?? '',
        user: {
          id: l.user.id.toString(),
          name: l.user.fullName,
          picturePath: null,
        },
      };
    });
  }

  private async getTravelEvents(orgId: bigint, from: Date, to: Date) {
    const travels = await this.prisma.travelRequest.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['approved', 'pending'] },
        travelDate: { gte: from, lte: to },
      },
      include: { user: { select: { id: true, fullName: true } } },
      orderBy: { travelDate: 'asc' },
    });

    return travels.map((t) => {
      const statusLabel = t.status === 'pending' ? ' (รออนุมัติ)' : '';
      const date = t.travelDate;

      const depHour = t.departureTime ? parseInt(t.departureTime.split(':')[0]) : 8;
      const depMin = t.departureTime ? parseInt(t.departureTime.split(':')[1]) : 0;
      const retHour = t.returnTime ? parseInt(t.returnTime.split(':')[0]) : 17;
      const retMin = t.returnTime ? parseInt(t.returnTime.split(':')[1]) : 0;

      return {
        id: Number(t.id) + 2_000_000, // offset to avoid ID collision
        startDate: new Date(date.getFullYear(), date.getMonth(), date.getDate(), depHour, depMin).toISOString(),
        endDate: new Date(date.getFullYear(), date.getMonth(), date.getDate(), retHour, retMin).toISOString(),
        title: `ไปราชการ${statusLabel}: ${t.destination}`,
        color: t.status === 'approved' ? 'blue' : 'gray',
        description: t.purpose ?? '',
        user: {
          id: t.user.id.toString(),
          name: t.user.fullName,
          picturePath: null,
        },
      };
    });
  }

  async getUsers(orgId: bigint) {
    const users = await this.prisma.user.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });

    return users.map((u) => ({
      id: u.id.toString(),
      name: u.fullName,
      picturePath: null,
    }));
  }

  private formatTime(date: Date): string {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
}
