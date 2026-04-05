import { Injectable, Logger, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleCalendarService } from '../../calendar/services/google-calendar.service';
import { NotificationService } from '../../notifications/notification.service';

const VALID_TRANSITIONS: Record<string, string[]> = {
  new: ['registered'],
  analyzing: ['registered'],
  proposed: ['registered'],
  registered: ['assigned'],
  assigned: ['in_progress'],
  in_progress: ['completed'],
  completed: ['archived'],
};

@Injectable()
export class CaseWorkflowService {
  private readonly logger = new Logger(CaseWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: GoogleCalendarService,
    @Optional() private readonly notifications: NotificationService,
  ) {}

  async register(caseId: number, userId: number): Promise<any> {
    const c = await this.findCaseOrThrow(caseId);
    this.assertTransition(c.status, 'registered');

    const regNo = await this.generateRegistrationNo(c.organizationId);

    const updated = await this.prisma.inboundCase.update({
      where: { id: BigInt(caseId) },
      data: {
        status: 'registered',
        registrationNo: regNo,
        registeredAt: new Date(),
        registeredByUserId: BigInt(userId),
      },
    });

    await this.logActivity(caseId, userId, 'register', {
      registrationNo: regNo,
    });

    this.logger.log(`Case #${caseId} registered as ${regNo} by user #${userId}`);

    // Notify assigned user that case is officially registered
    if (this.notifications) {
      this.notifications.notifyCaseRegistered(caseId).catch((e) =>
        this.logger.warn(`notify register failed: ${e.message}`),
      );
    }

    return this.serialize(updated);
  }

  async assign(
    caseId: number,
    assignedByUserId: number,
    assignments: { userId: number; role?: string; dueDate?: string; note?: string }[],
    directorNote?: string,
    selectedOptionId?: number,
  ): Promise<any> {
    const c = await this.findCaseOrThrow(caseId);
    if (c.status !== 'registered' && c.status !== 'assigned') {
      throw new BadRequestException(
        `ไม่สามารถมอบหมายได้ — สถานะปัจจุบัน: ${c.status} (ต้องเป็น registered หรือ assigned)`,
      );
    }

    const primaryAssignment = assignments.find((a) => a.role === 'responsible') || assignments[0];

    // Create assignments
    const created = [];
    for (const a of assignments) {
      const assignment = await this.prisma.caseAssignment.create({
        data: {
          inboundCaseId: BigInt(caseId),
          assignedToUserId: BigInt(a.userId),
          assignedByUserId: BigInt(assignedByUserId),
          role: a.role || 'responsible',
          dueDate: a.dueDate ? new Date(a.dueDate) : c.dueDate,
          note: a.note,
        },
      });
      created.push(assignment);
    }

    // Update case
    const updateData: any = {
      status: 'assigned',
      assignedToUserId: BigInt(primaryAssignment.userId),
    };
    if (directorNote) updateData.directorNote = directorNote;
    if (selectedOptionId) updateData.selectedOptionId = BigInt(selectedOptionId);

    const updated = await this.prisma.inboundCase.update({
      where: { id: BigInt(caseId) },
      data: updateData,
    });

    await this.logActivity(caseId, assignedByUserId, 'assign', {
      assignments: assignments.map((a) => ({
        userId: a.userId,
        role: a.role || 'responsible',
      })),
      directorNote,
      selectedOptionId,
    });

    this.logger.log(`Case #${caseId} assigned to ${assignments.length} user(s) by user #${assignedByUserId}`);

    // Create Google Calendar event if case has a deadline
    if (c.dueDate) {
      try {
        const attendeeUsers = await this.prisma.user.findMany({
          where: { id: { in: assignments.map((a) => BigInt(a.userId)) } },
          select: { googleEmail: true, email: true },
        });
        const emails = attendeeUsers
          .map((u) => u.googleEmail || u.email)
          .filter(Boolean);

        const eventId = await this.calendar.createDeadlineEvent({
          summary: `[${c.registrationNo || 'ไม่มีเลขรับ'}] ${c.title}`,
          description: `${c.description || ''}\n\nคำสั่ง: ${directorNote || '-'}`,
          dueDate: c.dueDate,
          attendeeEmails: emails,
          caseId,
        });

        if (eventId) {
          await this.prisma.inboundCase.update({
            where: { id: BigInt(caseId) },
            data: { googleCalendarEventId: eventId },
          });
        }
      } catch (calErr) {
        this.logger.warn(`Calendar event creation failed (non-blocking): ${calErr.message}`);
      }
    }

    return {
      case: this.serialize(updated),
      assignments: created.map((a) => ({
        id: Number(a.id),
        assignedToUserId: Number(a.assignedToUserId),
        role: a.role,
        status: a.status,
      })),
    };
  }

  async updateStatus(caseId: number, newStatus: string, userId?: number): Promise<any> {
    const c = await this.findCaseOrThrow(caseId);
    this.assertTransition(c.status, newStatus);

    const updated = await this.prisma.inboundCase.update({
      where: { id: BigInt(caseId) },
      data: { status: newStatus },
    });

    await this.logActivity(caseId, userId, 'update_status', {
      from: c.status,
      to: newStatus,
    });

    this.logger.log(`Case #${caseId} status: ${c.status} → ${newStatus}`);
    return this.serialize(updated);
  }

  async updateAssignmentStatus(
    assignmentId: number,
    newStatus: string,
    userId: number,
  ): Promise<any> {
    const assignment = await this.prisma.caseAssignment.findUnique({
      where: { id: BigInt(assignmentId) },
    });
    if (!assignment) throw new NotFoundException(`Assignment #${assignmentId} not found`);

    const data: any = { status: newStatus };
    if (newStatus === 'completed') data.completedAt = new Date();

    const updated = await this.prisma.caseAssignment.update({
      where: { id: BigInt(assignmentId) },
      data,
    });

    await this.logActivity(Number(assignment.inboundCaseId), userId, 'update_status', {
      assignmentId,
      from: assignment.status,
      to: newStatus,
    });

    // If all responsible assignments are completed, move case to in_progress → completed
    if (newStatus === 'completed') {
      await this.checkAutoComplete(Number(assignment.inboundCaseId));
    }

    return {
      id: Number(updated.id),
      status: updated.status,
      completedAt: updated.completedAt,
    };
  }

  async getActivities(caseId: number): Promise<any[]> {
    const activities = await this.prisma.caseActivity.findMany({
      where: { inboundCaseId: BigInt(caseId) },
      include: { user: { select: { id: true, fullName: true, roleCode: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return activities.map((a) => ({
      id: Number(a.id),
      action: a.action,
      detail: a.detail ? JSON.parse(a.detail) : null,
      user: a.user ? { id: Number(a.user.id), fullName: a.user.fullName, roleCode: a.user.roleCode } : null,
      createdAt: a.createdAt,
    }));
  }

  async getAssignments(caseId: number): Promise<any[]> {
    const assignments = await this.prisma.caseAssignment.findMany({
      where: { inboundCaseId: BigInt(caseId) },
      include: {
        assignedTo: { select: { id: true, fullName: true, roleCode: true, department: true } },
        assignedBy: { select: { id: true, fullName: true, roleCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return assignments.map((a) => ({
      id: Number(a.id),
      role: a.role,
      status: a.status,
      dueDate: a.dueDate,
      note: a.note,
      completedAt: a.completedAt,
      assignedTo: { id: Number(a.assignedTo.id), fullName: a.assignedTo.fullName, roleCode: a.assignedTo.roleCode, department: a.assignedTo.department },
      assignedBy: { id: Number(a.assignedBy.id), fullName: a.assignedBy.fullName, roleCode: a.assignedBy.roleCode },
      createdAt: a.createdAt,
    }));
  }

  // ─── Helpers ───

  private async findCaseOrThrow(caseId: number) {
    const c = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(caseId) },
    });
    if (!c) throw new NotFoundException(`Case #${caseId} not found`);
    return c;
  }

  private assertTransition(current: string, next: string) {
    const allowed = VALID_TRANSITIONS[current];
    if (!allowed || !allowed.includes(next)) {
      throw new BadRequestException(
        `ไม่สามารถเปลี่ยนสถานะจาก "${current}" เป็น "${next}" ได้`,
      );
    }
  }

  private async generateRegistrationNo(organizationId: bigint): Promise<string> {
    const year = new Date().getFullYear() + 543; // พ.ศ.
    const count = await this.prisma.inboundCase.count({
      where: {
        organizationId,
        registrationNo: { not: null },
        registeredAt: {
          gte: new Date(`${new Date().getFullYear()}-01-01`),
        },
      },
    });
    const seq = String(count + 1).padStart(3, '0');
    return `${seq}/${year}`;
  }

  private async logActivity(caseId: number, userId: number | undefined, action: string, detail: any) {
    await this.prisma.caseActivity.create({
      data: {
        inboundCaseId: BigInt(caseId),
        userId: userId ? BigInt(userId) : null,
        action,
        detail: JSON.stringify(detail),
      },
    });
  }

  private async checkAutoComplete(caseId: number) {
    const pending = await this.prisma.caseAssignment.count({
      where: {
        inboundCaseId: BigInt(caseId),
        role: 'responsible',
        status: { not: 'completed' },
      },
    });
    if (pending === 0) {
      const c = await this.prisma.inboundCase.findUnique({ where: { id: BigInt(caseId) } });
      if (c && (c.status === 'assigned' || c.status === 'in_progress')) {
        await this.prisma.inboundCase.update({
          where: { id: BigInt(caseId) },
          data: { status: 'completed' },
        });
        await this.logActivity(caseId, undefined, 'auto_complete', {
          reason: 'all responsible assignments completed',
        });
        this.logger.log(`Case #${caseId} auto-completed (all assignments done)`);
      }
    }
  }

  private serialize(c: any) {
    return {
      ...c,
      id: Number(c.id),
      organizationId: Number(c.organizationId),
      sourceDocumentId: c.sourceDocumentId ? Number(c.sourceDocumentId) : null,
      registeredByUserId: c.registeredByUserId ? Number(c.registeredByUserId) : null,
      assignedToUserId: c.assignedToUserId ? Number(c.assignedToUserId) : null,
      selectedOptionId: c.selectedOptionId ? Number(c.selectedOptionId) : null,
    };
  }
}
