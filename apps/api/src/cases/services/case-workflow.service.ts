import { Injectable, Logger, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { GoogleCalendarService } from '../../calendar/services/google-calendar.service';
import { NotificationService } from '../../notifications/notification.service';
import { QueueDispatcherService } from '../../queue/services/queue-dispatcher.service';
import { WorkflowLearningService } from '../../projects/services/workflow-learning.service';
import { PdfStampService } from '../../stamps/services/pdf-stamp.service';
import { StampStorageService } from '../../stamps/services/stamp-storage.service';
import { FileStorageService } from '../../intake/services/file-storage.service';
import { PdfSigningService } from '../../digital-signature/pdf-signing.service';

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
    private readonly config: ConfigService,
    @Optional() private readonly notifications: NotificationService,
    @Optional() private readonly dispatcher: QueueDispatcherService,
    @Optional() private readonly workflowLearning: WorkflowLearningService,
    @Optional() private readonly pdfStamp: PdfStampService,
    @Optional() private readonly stampStorage: StampStorageService,
    @Optional() private readonly fileStorage: FileStorageService,
    @Optional() private readonly pdfSigning: PdfSigningService,
  ) {}

  /** Parse intake ID จาก description field (format: "intake:{id}") */
  private parseIntakeId(description: string | null): number | null {
    if (!description) return null;
    const m = description.match(/intake:(\d+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  /** สร้าง description พร้อม link สำหรับ Google Calendar event */
  private buildCalendarDescription(params: {
    caseId: number;
    description?: string | null;
    directorNote?: string | null;
    registrationNo?: string | null;
    note?: string | null;
    intakeId?: number | null;
  }): string {
    const base = this.config.get('PUBLIC_URL', 'https://nextoffice.cnppai.com');
    const caseUrl = `${base}/inbox/${params.caseId}`;
    const fileUrl = params.intakeId ? `${base}/api/files/intake/${params.intakeId}` : null;

    const lines: string[] = [];
    if (params.registrationNo) lines.push(`เลขทะเบียนรับ: ${params.registrationNo}`);
    if (params.directorNote) lines.push(`คำสั่งผู้บริหาร: ${params.directorNote}`);
    if (params.note) lines.push(`หมายเหตุ: ${params.note}`);
    lines.push('');
    lines.push(`🔗 ดูรายละเอียดหนังสือ: ${caseUrl}`);
    if (fileUrl) lines.push(`📎 เอกสารไฟล์ต้นฉบับ: ${fileUrl}`);

    return lines.join('\n');
  }

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

    // V2: Dispatch vault note generation on registration
    if (this.dispatcher) {
      this.dispatcher
        .dispatchVaultNoteGenerate(BigInt(caseId), 'case_registered')
        .catch((e) => this.logger.warn(`Vault dispatch on register failed: ${e.message}`));
    }

    // V2: Learn workflow pattern from this registration
    if (this.workflowLearning) {
      this.workflowLearning
        .learnFromCase(caseId)
        .catch((e) => this.logger.warn(`Workflow learning failed: ${e.message}`));
    }

    return this.serialize(updated);
  }

  async assign(
    caseId: number,
    assignedByUserId: number,
    assignments: { userId: number; role?: string; dueDate?: string; note?: string }[],
    directorNote?: string,
    selectedOptionId?: number,
    callerRoleCode?: string,
    clerkOpinion?: string,
    routingPath?: string,
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

      // สร้าง reminder event รายบุคคลสำหรับครูที่รับมอบหมาย
      const assignmentDue = a.dueDate ? new Date(a.dueDate) : c.dueDate;
      if (assignmentDue) {
        try {
          const user = await this.prisma.user.findUnique({
            where: { id: BigInt(a.userId) },
            select: { googleEmail: true, email: true, fullName: true },
          });
          const userEmail = user?.googleEmail || user?.email;
          if (userEmail) {
            const intakeId = this.parseIntakeId(c.description);
            const reminderId = await this.calendar.createAssignmentReminderEvent({
              summary: `งาน: ${c.title}`,
              description: this.buildCalendarDescription({
                caseId,
                registrationNo: c.registrationNo,
                directorNote,
                note: a.note,
                intakeId,
              }),
              dueDate: assignmentDue,
              attendeeEmail: userEmail,
              assignmentId: Number(assignment.id),
            });
            if (reminderId) {
              await this.prisma.caseAssignment.update({
                where: { id: assignment.id },
                data: { googleCalendarEventId: reminderId },
              });
            }
          }
        } catch (calErr) {
          this.logger.warn(`Assignment reminder creation failed (non-blocking): ${calErr.message}`);
        }
      }

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

    // Create endorsement record for this role step
    const stepOrder =
      callerRoleCode === 'DIRECTOR' ? 3 :
      callerRoleCode === 'VICE_DIRECTOR' ? 2 : 1;
    const endorsementText = clerkOpinion ?? directorNote ?? '';
    if (endorsementText || callerRoleCode) {
      try {
        await this.prisma.caseEndorsement.create({
          data: {
            inboundCaseId: BigInt(caseId),
            authorUserId: BigInt(assignedByUserId),
            roleCode: callerRoleCode ?? 'CLERK',
            stepOrder,
            noteText: endorsementText,
            assignToUserIds: assignments.length
              ? JSON.stringify(assignments.map((a) => a.userId))
              : null,
            routingPath: routingPath ?? 'direct',
          },
        });
      } catch (e) {
        this.logger.warn(`Endorsement create failed (non-blocking): ${e.message}`);
      }
    }

    await this.logActivity(caseId, assignedByUserId, 'assign', {
      assignments: assignments.map((a) => ({
        userId: a.userId,
        role: a.role || 'responsible',
      })),
      directorNote,
      clerkOpinion,
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

        const intakeId = this.parseIntakeId(c.description);
        const eventId = await this.calendar.createDeadlineEvent({
          summary: `[${c.registrationNo || 'ไม่มีเลขรับ'}] ${c.title}`,
          description: this.buildCalendarDescription({
            caseId,
            registrationNo: c.registrationNo,
            directorNote,
            intakeId,
          }),
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

    // Apply all 3 stamps to PDF in a single async pass (never blocks the response)
    this.applyAllStampsAsync(caseId, updated, assignedByUserId, directorNote, clerkOpinion, assignments).catch(
      (e) => this.logger.warn(`PDF stamp generation failed: ${e.message}`),
    );

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

    // Notify status change
    if (this.notifications) {
      this.notifications.notifyStatusChanged(caseId, c.status, newStatus, userId).catch((e) =>
        this.logger.warn(`notify status change failed: ${e.message}`),
      );
    }

    // V2: On completion — dispatch vault note + learn workflow pattern
    if (newStatus === 'completed') {
      if (this.dispatcher) {
        this.dispatcher
          .dispatchVaultNoteGenerate(BigInt(caseId), 'case_completed')
          .catch((e) => this.logger.warn(`Vault dispatch on complete failed: ${e.message}`));
      }
      if (this.workflowLearning) {
        this.workflowLearning
          .learnFromCase(caseId)
          .catch((e) => this.logger.warn(`Workflow learning on complete failed: ${e.message}`));
      }
    }

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

  async getEndorsements(caseId: number): Promise<any[]> {
    const endorsements = await this.prisma.caseEndorsement.findMany({
      where: { inboundCaseId: BigInt(caseId) },
      include: { author: { select: { id: true, fullName: true, roleCode: true } } },
      orderBy: { stepOrder: 'asc' },
    });
    return endorsements.map((e) => ({
      id: Number(e.id),
      inboundCaseId: Number(e.inboundCaseId),
      authorUserId: Number(e.authorUserId),
      roleCode: e.roleCode,
      stepOrder: e.stepOrder,
      noteText: e.noteText,
      assignToUserIds: e.assignToUserIds ? JSON.parse(e.assignToUserIds) : [],
      routingPath: e.routingPath,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      author: { id: Number(e.author.id), fullName: e.author.fullName, roleCode: e.author.roleCode },
    }));
  }

  async updateEndorsement(
    endorsementId: number,
    userId: number,
    noteText: string,
    callerRoleCode: string,
  ): Promise<any> {
    const endorsement = await this.prisma.caseEndorsement.findUnique({
      where: { id: BigInt(endorsementId) },
    });
    if (!endorsement) {
      throw new NotFoundException(`Endorsement #${endorsementId} not found`);
    }
    if (Number(endorsement.authorUserId) !== userId) {
      throw new BadRequestException('ไม่มีสิทธิ์แก้ไขความเห็นของผู้อื่น');
    }
    if (!['DIRECTOR', 'VICE_DIRECTOR', 'CLERK'].includes(callerRoleCode)) {
      throw new BadRequestException('ไม่มีสิทธิ์แก้ไขความเห็น');
    }
    const updated = await this.prisma.caseEndorsement.update({
      where: { id: BigInt(endorsementId) },
      data: { noteText },
    });
    return {
      id: Number(updated.id),
      noteText: updated.noteText,
      updatedAt: updated.updatedAt,
    };
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
    // Resolve Buddhist year: org's active academic year → global current → calculated
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      include: { activeAcademicYear: { select: { year: true } } },
    });

    let buddhistYear: number;
    if (org?.activeAcademicYear?.year) {
      buddhistYear = org.activeAcademicYear.year;
    } else {
      const globalYear = await this.prisma.academicYear.findFirst({
        where: { isCurrent: true },
        select: { year: true },
      });
      buddhistYear = globalYear?.year ?? (new Date().getFullYear() + 543);
    }

    // Atomic upsert keyed by Buddhist year (พ.ศ.) — shared by web and LINE
    const counter = await this.prisma.registrationCounter.upsert({
      where: { organizationId_year_counterType: { organizationId, year: buddhistYear, counterType: 'inbound' } },
      create: { organizationId, year: buddhistYear, counterType: 'inbound', lastSeq: 1 },
      update: { lastSeq: { increment: 1 } },
    });

    return `${String(counter.lastSeq).padStart(3, '0')}/${buddhistYear}`;
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

        if (this.notifications) {
          this.notifications.notifyStatusChanged(caseId, c.status, 'completed').catch((e) =>
            this.logger.warn(`notify auto-complete failed: ${e.message}`),
          );
        }
      }
    }
  }

  /**
   * Apply all 3 stamps to the original PDF in a single pass and save the result.
   * Triggered automatically at the end of assign(). Never throws — failures are logged only.
   */
  private async applyAllStampsAsync(
    caseId: number,
    updatedCase: any,
    assignedByUserId: number,
    directorNote?: string,
    clerkOpinion?: string,
    assignments?: { userId: number; role?: string; dueDate?: string; note?: string }[],
  ): Promise<void> {
    if (!this.pdfStamp || !this.stampStorage || !this.fileStorage) return;

    const intakeId = this.parseIntakeId(updatedCase.description);
    if (!intakeId) return;

    const intake = await this.prisma.documentIntake.findUnique({
      where: { id: BigInt(intakeId) },
      include: { aiResult: { select: { summaryText: true, nextActionJson: true } } },
    });
    if (!intake || !intake.mimeType?.includes('pdf')) return;

    const [org, user, director] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: updatedCase.organizationId },
        select: { name: true },
      }),
      this.prisma.user.findUnique({
        where: { id: BigInt(assignedByUserId) },
        select: { fullName: true, positionTitle: true, signaturePath: true },
      }),
      // ผู้อำนวยการโรงเรียน — ใช้เป็นผู้ลงนามตราที่ 3
      this.prisma.user.findFirst({
        where: { organizationId: updatedCase.organizationId, roleCode: 'DIRECTOR' },
        select: { fullName: true, positionTitle: true, signaturePath: true },
      }),
    ]);

    // Load signature image buffers (silently ignore if missing)
    const [userSigBuf, directorSigBuf] = await Promise.all([
      user?.signaturePath
        ? this.fileStorage.getBuffer(user.signaturePath).catch(() => null)
        : Promise.resolve(null),
      director?.signaturePath
        ? this.fileStorage.getBuffer(director.signaturePath).catch(() => null)
        : Promise.resolve(null),
    ]);

    const now = new Date();
    const pdfBuffer = await this.fileStorage.getBuffer(intake.storagePath);

    // Parse AI analysis data for stamp #2
    const aiSummary = (intake as any).aiResult?.summaryText ?? '';
    let actionSummary = '';
    if ((intake as any).aiResult?.nextActionJson) {
      try {
        const actions: string[] = JSON.parse((intake as any).aiResult.nextActionJson);
        actionSummary = actions.filter(Boolean).slice(0, 2).join(' / ');
      } catch { /* ignore */ }
    }

    // Resolve assignee names
    let assigneeNames: string[] | undefined;
    if (assignments && assignments.length > 0) {
      try {
        const assignees = await this.prisma.user.findMany({
          where: { id: { in: assignments.map((a) => BigInt(a.userId)) } },
          select: { fullName: true },
        });
        assigneeNames = assignees.map((u) => u.fullName).filter(Boolean);
      } catch (e) {
        this.logger.warn(`Assignee name lookup for stamp failed: ${e.message}`);
      }
    }


    const stamped = await this.pdfStamp.applyAllStamps(pdfBuffer, {
      registration: {
        orgName: org?.name ?? '',
        registrationNo: updatedCase.registrationNo ?? '',
        registeredAt: updatedCase.registeredAt ?? now,
      },
      endorsement: {
        schoolName: org?.name ?? '',
        aiSummary,
        actionSummary,
        authorName: user?.fullName ?? 'ธุรการ',
        positionTitle: user?.positionTitle ?? undefined,
        stampedAt: now,
        signatureBuffer: userSigBuf ?? undefined,
        assigneeNames,
      },
      directorNote: directorNote
        ? {
            noteText: directorNote,
            authorName: director?.fullName ?? user?.fullName ?? 'ผู้อำนวยการ',
            positionTitle: director?.positionTitle ?? 'ผู้อำนวยการโรงเรียน',
            stampedAt: now,
            signatureBuffer: directorSigBuf ?? undefined,
            assigneeNames,
          }
        : undefined,
    });

    let finalPdf = stamped;

    // Apply digital signature (PKI)
    if (this.pdfSigning) {
      try {
        finalPdf = await this.pdfSigning.signPdf(stamped, assignedByUserId, 'เสนอความเห็น (Endorsement)');
        this.logger.log(`Digital signature applied for intake #${intakeId}`);
      } catch (e: any) {
        this.logger.warn(`Digital signing failed for intake #${intakeId}: ${e.message}`);
      }
    }

    await this.stampStorage.save(intakeId, finalPdf);
    this.logger.log(`All stamps applied for intake #${intakeId} (case #${caseId})`);
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
