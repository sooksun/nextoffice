import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CaseWorkflowService } from '../../cases/services/case-workflow.service';
import { LineMessagingService } from './line-messaging.service';

@Injectable()
export class LineWorkflowService {
  private readonly logger = new Logger(LineWorkflowService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: CaseWorkflowService,
    private readonly messaging: LineMessagingService,
  ) {}

  async handleRegister(lineUserId: string, caseId: number, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) {
      await this.replyNotLinked(replyToken);
      return;
    }

    try {
      const result = await this.workflow.register(caseId, Number(user.id));
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(
          `ลงรับหนังสือสำเร็จ\n\n` +
          `เลขรับ: ${result.registrationNo}\n` +
          `เรื่อง: ${result.title}\n` +
          `โดย: ${user.fullName}`,
        ),
      ]);
    } catch (err) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(err.message || 'เกิดข้อผิดพลาดในการลงรับ'),
      ]);
    }
  }

  async handleShowStaffList(lineUserId: string, caseId: number, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) {
      await this.replyNotLinked(replyToken);
      return;
    }

    // Only DIRECTOR / VICE_DIRECTOR / ADMIN can assign
    if (!['DIRECTOR', 'VICE_DIRECTOR', 'ADMIN'].includes(user.roleCode)) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage('เฉพาะผู้อำนวยการ/รอง ผอ. เท่านั้นที่สามารถมอบหมายงานได้'),
      ]);
      return;
    }

    // Get staff from same organization
    const staff = await this.prisma.user.findMany({
      where: {
        organizationId: user.organizationId,
        isActive: true,
        id: { not: user.id },
      },
      select: { id: true, fullName: true, positionTitle: true, department: true, roleCode: true },
      orderBy: { fullName: 'asc' },
    });

    const staffList = staff.map((s) => ({
      userId: Number(s.id),
      fullName: s.fullName,
      positionTitle: s.positionTitle || s.roleCode,
      department: s.department || '-',
    }));

    const messages = this.messaging.buildStaffListForAssign(caseId, staffList);
    await this.messaging.reply(replyToken, messages);
  }

  async handleAssignTo(
    lineUserId: string,
    caseId: number,
    targetUserId: number,
    replyToken: string,
  ): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) {
      await this.replyNotLinked(replyToken);
      return;
    }

    if (!['DIRECTOR', 'VICE_DIRECTOR', 'ADMIN'].includes(user.roleCode)) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage('เฉพาะผู้อำนวยการ/รอง ผอ. เท่านั้นที่สามารถมอบหมายงานได้'),
      ]);
      return;
    }

    try {
      // Auto-register if still new/analyzing
      const c = await this.prisma.inboundCase.findUnique({ where: { id: BigInt(caseId) } });
      if (c && (c.status === 'new' || c.status === 'analyzing')) {
        await this.workflow.register(caseId, Number(user.id));
      }

      const result = await this.workflow.assign(
        caseId,
        Number(user.id),
        [{ userId: targetUserId, role: 'responsible' }],
      );

      // Reload case after assign to get updated fields
      const updatedCase = await this.prisma.inboundCase.findUnique({ where: { id: BigInt(caseId) } });

      // Push notification to assigned user
      const targetUser = await this.prisma.user.findUnique({
        where: { id: BigInt(targetUserId) },
        include: { lineUser: true },
      });

      if (targetUser?.lineUser) {
        const notifyMessages = this.messaging.buildAssignmentNotification({
          caseTitle: c.title,
          registrationNo: updatedCase?.registrationNo || '-',
          directorNote: updatedCase?.directorNote || '',
          dueDate: c.dueDate ? c.dueDate.toLocaleDateString('th-TH') : '-',
          assignedByName: user.fullName,
          assignmentId: result.assignments[0]?.id,
        });
        await this.messaging.push(targetUser.lineUser.lineUserId, notifyMessages);
      }

      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(
          `มอบหมายงานสำเร็จ\n\n` +
          `เรื่อง: ${c.title}\n` +
          `มอบหมายให้: ${targetUser?.fullName || `User #${targetUserId}`}\n` +
          `สถานะ: รอดำเนินการ`,
        ),
      ]);
    } catch (err) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(err.message || 'เกิดข้อผิดพลาดในการมอบหมาย'),
      ]);
    }
  }

  async handleAcceptAssignment(lineUserId: string, assignmentId: number, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) {
      await this.replyNotLinked(replyToken);
      return;
    }

    try {
      await this.workflow.updateAssignmentStatus(assignmentId, 'accepted', Number(user.id));
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(`รับทราบงาน #${assignmentId} เรียบร้อยแล้ว`),
      ]);
    } catch (err) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(err.message || 'เกิดข้อผิดพลาด'),
      ]);
    }
  }

  async handleCompleteAssignment(lineUserId: string, assignmentId: number, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) {
      await this.replyNotLinked(replyToken);
      return;
    }

    try {
      await this.workflow.updateAssignmentStatus(assignmentId, 'completed', Number(user.id));

      // Notify ผอ./ผู้สั่งการ
      const assignment = await this.prisma.caseAssignment.findUnique({
        where: { id: BigInt(assignmentId) },
        include: {
          inboundCase: true,
          assignedBy: { include: { lineUser: true } },
        },
      });
      if (assignment?.assignedBy?.lineUser) {
        const notifyMessages = this.messaging.buildCompletionNotification({
          caseTitle: assignment.inboundCase.title,
          completedByName: user.fullName,
          assignmentId,
        });
        await this.messaging.push(assignment.assignedBy.lineUser.lineUserId, notifyMessages);
      }

      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(
          `งาน #${assignmentId} เสร็จสิ้น\n` +
          `แจ้งผู้สั่งการเรียบร้อยแล้ว`,
        ),
      ]);
    } catch (err) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(err.message || 'เกิดข้อผิดพลาด'),
      ]);
    }
  }

  async handleMyTasks(lineUserId: string, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) {
      await this.replyNotLinked(replyToken);
      return;
    }

    const assignments = await this.prisma.caseAssignment.findMany({
      where: {
        assignedToUserId: user.id,
        status: { not: 'completed' },
      },
      include: { inboundCase: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const tasks = assignments.map((a) => ({
      assignmentId: Number(a.id),
      caseTitle: a.inboundCase.title,
      registrationNo: a.inboundCase.registrationNo || '-',
      dueDate: a.dueDate ? a.dueDate.toLocaleDateString('th-TH') : '-',
      status: a.status,
    }));

    const messages = this.messaging.buildMyTasksList(tasks);
    await this.messaging.reply(replyToken, messages);
  }

  // ─── Helpers ───

  private async findLinkedUser(lineUserId: string) {
    const lineUser = await this.prisma.lineUser.findUnique({
      where: { lineUserId },
      include: { user: true },
    });
    return lineUser?.user || null;
  }

  private async replyNotLinked(replyToken: string) {
    await this.messaging.reply(replyToken, [
      this.messaging.buildTextMessage(
        'บัญชี LINE ยังไม่ผูกกับระบบ\nกรุณาพิมพ์ "ผูกบัญชี XXXXXX" (รหัส 6 หลักจาก Admin)',
      ),
    ]);
  }
}
