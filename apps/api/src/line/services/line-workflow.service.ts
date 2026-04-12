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

    if (user.roleCode === 'ADMIN') {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage('บัญชีนี้เป็น Admin ของระบบ ไม่สามารถลงรับหนังสือได้\nกรุณาใช้บัญชีผู้ใช้งานปกติ (เจ้าหน้าที่/ผู้อำนวยการ)'),
      ]);
      return;
    }

    try {
      const result = await this.workflow.register(caseId, Number(user.id));

      // ดึง "ที่หนังสือ" จาก DocumentAiResult ผ่าน intake link ใน description
      let documentNo: string | null = null;
      let issuingAuthority: string | null = null;
      const intakeMatch = result.description?.match(/intake:(\d+)/);
      if (intakeMatch) {
        const aiResult = await this.prisma.documentAiResult.findUnique({
          where: { documentIntakeId: BigInt(intakeMatch[1]) },
          select: { documentNo: true, issuingAuthority: true },
        });
        documentNo = aiResult?.documentNo || null;
        issuingAuthority = aiResult?.issuingAuthority || null;
      }

      const lines = [
        `ลงรับหนังสือสำเร็จ ✓`,
        ``,
        `เลขรับ: ${result.registrationNo}`,
      ];
      if (documentNo) lines.push(`ที่: ${documentNo}`);
      if (issuingAuthority) lines.push(`จาก: ${issuingAuthority}`);
      lines.push(`เรื่อง: ${result.title}`);
      lines.push(`โดย: ${user.fullName}`);

      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(lines.join('\n')),
      ]);

      // แจ้ง ผอ./รองผอ. ให้มอบหมายงาน (fire-and-forget)
      this.notifyDirectorsForAssignment(
        result,
        caseId,
        documentNo,
        issuingAuthority,
        user.fullName,
      ).catch((e) => this.logger.warn(`notifyDirectors failed: ${e.message}`));

    } catch (err) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(err.message || 'เกิดข้อผิดพลาดในการลงรับ'),
      ]);
    }
  }

  /** Push Flex message to DIRECTOR/VICE_DIRECTOR after registration */
  private async notifyDirectorsForAssignment(
    result: any,
    caseId: number,
    documentNo: string | null,
    issuingAuthority: string | null,
    registeredBy: string,
  ): Promise<void> {
    const caseData = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(caseId) },
      include: {
        organization: {
          include: {
            users: {
              where: { roleCode: { in: ['DIRECTOR', 'VICE_DIRECTOR'] }, isActive: true },
              include: { lineUser: { select: { lineUserId: true } } },
            },
          },
        },
      },
    });
    if (!caseData) return;

    const directors = caseData.organization.users.filter(
      (u) => u.lineUser?.lineUserId,
    );
    if (directors.length === 0) return;

    const urgencyIcon: Record<string, string> = {
      most_urgent: '🚨 ด่วนที่สุด',
      very_urgent: '⚡ ด่วนที่สุด',
      urgent: '⏰ ด่วน',
      normal: '📋 ทั่วไป',
    };
    const urgencyLabel = urgencyIcon[caseData.urgencyLevel] ?? '📋 ทั่วไป';
    const urgencyColor = caseData.urgencyLevel === 'most_urgent' ? '#dc2626'
      : caseData.urgencyLevel === 'very_urgent' ? '#ea580c'
      : caseData.urgencyLevel === 'urgent' ? '#ca8a04'
      : '#1a73e8';

    const bodyContents: any[] = [
      { type: 'text', text: urgencyLabel, size: 'sm', color: urgencyColor, weight: 'bold' },
      { type: 'separator', margin: 'sm' },
      { type: 'box', layout: 'vertical', margin: 'sm', spacing: 'xs', contents: [
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: 'เลขรับ', size: 'xs', color: '#888888', flex: 2 },
          { type: 'text', text: result.registrationNo ?? '-', size: 'xs', color: '#333333', flex: 3, weight: 'bold' },
        ]},
        ...(documentNo ? [{ type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: 'ที่หนังสือ', size: 'xs', color: '#888888', flex: 2 },
          { type: 'text', text: documentNo, size: 'xs', color: '#333333', flex: 3 },
        ]}] : []),
        ...(issuingAuthority ? [{ type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: 'จาก', size: 'xs', color: '#888888', flex: 2 },
          { type: 'text', text: issuingAuthority.substring(0, 40), size: 'xs', color: '#333333', flex: 3, wrap: true },
        ]}] : []),
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: 'เรื่อง', size: 'xs', color: '#888888', flex: 2 },
          { type: 'text', text: result.title.substring(0, 60), size: 'xs', color: '#333333', flex: 3, wrap: true },
        ]},
        { type: 'box', layout: 'horizontal', contents: [
          { type: 'text', text: 'ลงรับโดย', size: 'xs', color: '#888888', flex: 2 },
          { type: 'text', text: registeredBy, size: 'xs', color: '#333333', flex: 3 },
        ]},
      ]},
    ];

    const quickReply = {
      items: [
        {
          type: 'action',
          action: { type: 'message', label: '🔑 ดึงสารสำคัญ', text: `ดึงสาระสำคัญ #${caseId}` },
        },
        {
          type: 'action',
          action: { type: 'message', label: '✉ ร่างหนังสือตอบ', text: `ร่างตอบ #${caseId}` },
        },
        {
          type: 'action',
          action: { type: 'message', label: '📋 เสนอ ผอ.', text: `มอบหมาย #${caseId}` },
        },
      ],
    };

    const flexMessage = {
      type: 'flex',
      altText: `📋 ลงรับแล้ว: ${result.title.substring(0, 40)} — กรุณาเสนอผู้อำนวยการ`,
      contents: {
        type: 'bubble',
        size: 'kilo',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: '#1a73e8',
          contents: [
            { type: 'text', text: '📋 ลงรับแล้ว — กรุณาเสนอผู้อำนวยการ', weight: 'bold', size: 'sm', color: '#ffffff' },
          ],
          paddingAll: 'md',
        },
        body: {
          type: 'box', layout: 'vertical', spacing: 'sm', paddingAll: 'md',
          contents: bodyContents,
        },
        footer: {
          type: 'box', layout: 'horizontal', spacing: 'sm', paddingAll: 'md',
          contents: [
            {
              type: 'button', style: 'primary', height: 'sm', flex: 1,
              action: { type: 'message', label: '📌 เสนอ ผอ.', text: `มอบหมาย #${caseId}` },
            },
            {
              type: 'button', style: 'secondary', height: 'sm', flex: 1,
              action: { type: 'message', label: 'ดูรายละเอียด', text: `ดูเรื่อง #${caseId}` },
            },
          ],
        },
      },
    };

    const followUpMessage = {
      type: 'text',
      text: 'ต้องการดำเนินการอะไรต่อ?',
      quickReply,
    };

    for (const director of directors) {
      await this.messaging.push(director.lineUser.lineUserId, [flexMessage, followUpMessage]);
      this.logger.log(`Notified ${director.fullName} (${director.roleCode}) for assignment of case #${caseId}`);
    }
  }

  async handleShowStaffList(lineUserId: string, caseId: number, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) {
      await this.replyNotLinked(replyToken);
      return;
    }

    // DIRECTOR / VICE_DIRECTOR / CLERK / ADMIN can propose to director
    if (!['DIRECTOR', 'VICE_DIRECTOR', 'CLERK', 'ADMIN'].includes(user.roleCode)) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage('เฉพาะผู้อำนวยการ/รอง ผอ./ธุรการ เท่านั้นที่สามารถเสนอผู้อำนวยการได้'),
      ]);
      return;
    }

    // Get case for smart routing
    const inboundCase = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(caseId) },
      select: { title: true, description: true },
    });

    // Smart routing: suggest work group from case title
    const suggestedGroupCode = inboundCase
      ? this.suggestWorkGroupCode(inboundCase.title + ' ' + (inboundCase.description ?? ''))
      : null;

    // Find staff — prefer filtered by suggested work group, fallback to all staff
    let staff = [];
    if (suggestedGroupCode && user.organizationId) {
      // Get users assigned to this work group via StaffAssignment
      const assignments = await this.prisma.staffAssignment.findMany({
        where: {
          organizationId: user.organizationId,
          workFunction: { workGroup: { code: suggestedGroupCode } },
          isActive: true,
        },
        include: { user: { select: { id: true, fullName: true, positionTitle: true, roleCode: true } } },
        distinct: ['userId'],
      });
      staff = assignments.map((a) => a.user).filter((u) => u.id !== user.id);
    }

    // Fallback: all active users in org (if no smart routing result)
    if (staff.length === 0) {
      staff = await this.prisma.user.findMany({
        where: { organizationId: user.organizationId, isActive: true, id: { not: user.id } },
        select: { id: true, fullName: true, positionTitle: true, roleCode: true },
        orderBy: { fullName: 'asc' },
      });
    }

    const groupLabel = suggestedGroupCode
      ? `\n(AI แนะนำ: ${this.groupCodeToThai(suggestedGroupCode)})`
      : '';

    const staffList = staff.map((s) => ({
      userId: Number(s.id),
      fullName: s.fullName,
      positionTitle: s.positionTitle || s.roleCode,
      department: suggestedGroupCode ? this.groupCodeToThai(suggestedGroupCode) : '-',
    }));

    const messages = this.messaging.buildStaffListForAssign(caseId, staffList, groupLabel);
    await this.messaging.reply(replyToken, messages);
  }

  async handleAssignTo(
    lineUserId: string,
    caseId: number,
    targetUserIds: number[],
    replyToken: string,
  ): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) {
      await this.replyNotLinked(replyToken);
      return;
    }

    if (!['DIRECTOR', 'VICE_DIRECTOR', 'CLERK', 'ADMIN'].includes(user.roleCode)) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage('เฉพาะผู้อำนวยการ/รอง ผอ./ธุรการ เท่านั้นที่สามารถเสนอผู้อำนวยการได้'),
      ]);
      return;
    }

    try {
      // Auto-register if still new/analyzing
      const c = await this.prisma.inboundCase.findUnique({ where: { id: BigInt(caseId) } });
      if (c && (c.status === 'new' || c.status === 'analyzing')) {
        await this.workflow.register(caseId, Number(user.id));
      }

      // Build assignments for all target users
      const assignments = targetUserIds.map((uid, i) => ({
        userId: uid,
        role: i === 0 ? 'responsible' : 'informed',
      }));

      const result = await this.workflow.assign(
        caseId,
        Number(user.id),
        assignments,
      );

      // Reload case after assign
      const updatedCase = await this.prisma.inboundCase.findUnique({ where: { id: BigInt(caseId) } });

      // Notify all assigned users via LINE
      const targetUsers = await this.prisma.user.findMany({
        where: { id: { in: targetUserIds.map((id) => BigInt(id)) } },
        include: { lineUser: true },
      });

      const assigneeNames: string[] = [];
      for (const tu of targetUsers) {
        assigneeNames.push(tu.fullName);
        if (tu.lineUser) {
          const assignmentRecord = result.assignments?.find(
            (a: any) => Number(a.assignedToUserId) === Number(tu.id),
          );
          const notifyMessages = this.messaging.buildAssignmentNotification({
            caseTitle: c.title,
            registrationNo: updatedCase?.registrationNo || '-',
            directorNote: updatedCase?.directorNote || '',
            dueDate: c.dueDate ? c.dueDate.toLocaleDateString('th-TH') : '-',
            assignedByName: user.fullName,
            assignmentId: assignmentRecord?.id,
          });
          await this.messaging.push(tu.lineUser.lineUserId, notifyMessages);
        }
      }

      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(
          `✅ เสนอผู้อำนวยการโรงเรียนสำเร็จ\n\n` +
          `เรื่อง: ${c.title}\n` +
          `เลขรับ: ${updatedCase?.registrationNo || '-'}\n` +
          `มอบหมายให้: ${assigneeNames.join(', ') || '-'} (${targetUserIds.length} คน)\n\n` +
          `📌 แจ้ง ผอ./รอง ผอ. ทาง LINE แล้ว\n` +
          `⏳ สถานะ: รอ ผอ. ลงนามเกษียณ`,
        ),
      ]);
    } catch (err) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(err.message || 'เกิดข้อผิดพลาดในการเสนอ'),
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

  async handleDirectorSign(lineUserId: string, caseId: number, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) { await this.replyNotLinked(replyToken); return; }

    if (!['DIRECTOR', 'VICE_DIRECTOR', 'ADMIN'].includes(user.roleCode)) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage('เฉพาะผู้อำนวยการ/รอง ผอ. เท่านั้นที่สามารถลงนามได้'),
      ]);
      return;
    }

    try {
      const c = await this.prisma.inboundCase.findUnique({
        where: { id: BigInt(caseId) },
        select: { title: true, directorNote: true, directorStampStatus: true },
      });
      if (!c) throw new Error('ไม่พบเอกสาร');
      if (c.directorStampStatus !== 'pending') throw new Error('เอกสารนี้ไม่ได้อยู่ในสถานะรอลงนาม');

      await this.workflow.applyDirectorStampAsync(
        caseId,
        Number(user.id),
        c.directorNote || 'ทราบ',
        undefined,
      );

      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(
          `ลงนามเกษียณหนังสือสำเร็จ ✓\n\n` +
          `เรื่อง: ${c.title}\n` +
          `คำสั่ง: ${(c.directorNote || 'ทราบ').substring(0, 80)}\n` +
          `โดย: ${user.fullName}\n\n` +
          `ระบบประทับตราและลายเซ็นอิเล็กทรอนิกส์เรียบร้อยแล้ว`,
        ),
      ]);
    } catch (err) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(err.message || 'เกิดข้อผิดพลาดในการลงนาม'),
      ]);
    }
  }

  async handleReport(lineUserId: string, caseId: number, reportText: string, replyToken: string): Promise<void> {
    const user = await this.findLinkedUser(lineUserId);
    if (!user) { await this.replyNotLinked(replyToken); return; }

    try {
      const assignment = await this.prisma.caseAssignment.findFirst({
        where: {
          inboundCase: { id: BigInt(caseId) },
          assignedToUserId: user.id,
        },
        include: { inboundCase: true },
      });
      if (!assignment) throw new Error('ไม่พบงานที่มอบหมายให้คุณสำหรับเรื่อง #' + caseId);

      if (assignment.status === 'pending' || assignment.status === 'accepted') {
        await this.prisma.caseAssignment.update({
          where: { id: assignment.id },
          data: { status: 'in_progress' },
        });
      }

      await this.prisma.caseActivity.create({
        data: {
          inboundCaseId: BigInt(caseId),
          userId: user.id,
          action: 'report',
          detail: JSON.stringify({ reportText, reportedBy: user.fullName }),
        },
      });

      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(
          `บันทึกรายงานสำเร็จ ✓\n\n` +
          `เรื่อง: ${assignment.inboundCase.title}\n` +
          `รายงาน: ${reportText.substring(0, 100)}\n` +
          `โดย: ${user.fullName}`,
        ),
      ]);

      const assigner = await this.prisma.user.findUnique({
        where: { id: assignment.assignedByUserId },
        include: { lineUser: true },
      });
      if (assigner?.lineUser) {
        await this.messaging.push(assigner.lineUser.lineUserId, [
          this.messaging.buildTextMessage(
            `📝 รายงานผลจาก ${user.fullName}\n\n` +
            `เรื่อง: ${assignment.inboundCase.title}\n` +
            `รายงาน: ${reportText.substring(0, 100)}`,
          ),
        ]);
      }
    } catch (err) {
      await this.messaging.reply(replyToken, [
        this.messaging.buildTextMessage(err.message || 'เกิดข้อผิดพลาด'),
      ]);
    }
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

  private suggestWorkGroupCode(text: string): string | null {
    const lower = text.toLowerCase();
    const KEYWORD_GROUP_MAP = [
      { keywords: ['หลักสูตร', 'การเรียน', 'สอน', 'นักเรียน', 'วัดผล', 'ประเมินผล', 'วิชาการ', 'ห้องสมุด', 'สื่อการสอน', 'นิเทศ', 'แนะแนว', 'ผลสัมฤทธิ์', 'ทักษะ'], groupCode: 'academic' },
      { keywords: ['งบประมาณ', 'การเงิน', 'พัสดุ', 'จัดซื้อ', 'จัดจ้าง', 'ใบสำคัญ', 'เบิกจ่าย', 'เงินอุดหนุน', 'บัญชี', 'ตรวจสอบ', 'ทรัพย์สิน'], groupCode: 'budget' },
      { keywords: ['บุคลากร', 'ข้าราชการ', 'ครู', 'แต่งตั้ง', 'โยกย้าย', 'ลา', 'เลื่อน', 'วินัย', 'บำเหน็จ', 'บำนาญ', 'พัฒนาครู', 'ฝึกอบรม', 'อัตรากำลัง'], groupCode: 'personnel' },
      { keywords: ['สารบรรณ', 'ธุรการ', 'อาคาร', 'สถานที่', 'ประชาสัมพันธ์', 'ประชุม', 'ปฏิทิน', 'กีฬา', 'อนามัย', 'โภชนาการ', 'ยาเสพติด', 'ชุมชน', 'กิจกรรม'], groupCode: 'general' },
    ];

    const scores = KEYWORD_GROUP_MAP.map(({ keywords, groupCode }) => ({
      groupCode,
      score: keywords.filter((kw) => lower.includes(kw)).length,
    }));
    const best = scores.sort((a, b) => b.score - a.score)[0];
    return best && best.score > 0 ? best.groupCode : null;
  }

  private groupCodeToThai(code: string): string {
    const map: Record<string, string> = {
      academic: 'กลุ่มงานวิชาการ',
      budget: 'กลุ่มงานงบประมาณ',
      personnel: 'กลุ่มงานบุคคล',
      general: 'กลุ่มงานทั่วไป',
    };
    return map[code] || code;
  }
}
