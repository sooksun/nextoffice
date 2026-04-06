import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';

// คำสำคัญ → กลุ่มงาน (เพิ่มคำที่เกี่ยวข้องกับการพัฒนาครู/อบรม)
const KEYWORD_GROUP_MAP: { keywords: string[]; groupCode: string; groupName: string }[] = [
  {
    keywords: [
      'หลักสูตร', 'การเรียน', 'สอน', 'นักเรียน', 'วัดผล', 'ประเมินผล', 'วิชาการ',
      'ห้องสมุด', 'สื่อการสอน', 'นิเทศ', 'แนะแนว', 'ผลสัมฤทธิ์', 'ทักษะ',
      'การศึกษา', 'เรียนรู้', 'สาระ', 'กลุ่มสาระ', 'ชั้นเรียน', 'นักศึกษา',
    ],
    groupCode: 'academic',
    groupName: 'กลุ่มงานวิชาการ',
  },
  {
    keywords: [
      'งบประมาณ', 'การเงิน', 'พัสดุ', 'จัดซื้อ', 'จัดจ้าง', 'ใบสำคัญ',
      'เบิกจ่าย', 'เงินอุดหนุน', 'บัญชี', 'ตรวจสอบ', 'ทรัพย์สิน', 'ระดม',
      'เงิน', 'ค่าใช้จ่าย', 'สัญญา', 'ราคา', 'ประกวดราคา',
    ],
    groupCode: 'budget',
    groupName: 'กลุ่มงานงบประมาณ',
  },
  {
    keywords: [
      'บุคลากร', 'ข้าราชการ', 'ครู', 'แต่งตั้ง', 'โยกย้าย', 'ลา', 'เลื่อน',
      'วินัย', 'บำเหน็จ', 'บำนาญ', 'พัฒนาครู', 'ฝึกอบรม', 'อัตรากำลัง',
      'อบรม', 'สัมมนา', 'ประชุมเชิงปฏิบัติการ', 'workshop', 'เชิงปฏิบัติการ',
      'พัฒนา', 'ศักยภาพ', 'สมรรถนะ', 'คุณภาพครู', 'วิทยฐานะ', 'ชำนาญการ',
      'คศ.', 'ครูผู้ช่วย', 'ผู้บริหาร', 'ผู้อำนวยการ',
    ],
    groupCode: 'personnel',
    groupName: 'กลุ่มงานบุคลากร',
  },
  {
    keywords: [
      'สารบรรณ', 'ธุรการ', 'อาคาร', 'สถานที่', 'ประชาสัมพันธ์', 'ประชุม',
      'ปฏิทิน', 'กีฬา', 'อนามัย', 'โภชนาการ', 'ยาเสพติด', 'ชุมชน',
      'ทัศนศึกษา', 'กิจกรรม', 'โครงการ', 'งาน', 'แจ้ง', 'เชิญ', 'เชิญชวน',
    ],
    groupCode: 'general',
    groupName: 'กลุ่มงานทั่วไป',
  },
];

// บทบาทผู้ใช้ → ลำดับความสำคัญ (น้อย = สูงกว่า)
const ROLE_PRIORITY: Record<string, number> = {
  DIRECTOR: 1,
  VICE_DIRECTOR: 2,
  HEAD_TEACHER: 3,
  CLERK: 4,
  TEACHER: 5,
};

export interface RoutingSuggestion {
  workGroupCode: string;
  workGroupName: string;
  confidence: number;
  isDefault: boolean; // true = ไม่มีกลุ่มงานตรง ใช้ fallback
  defaultAction?: string; // คำแนะนำเมื่อ isDefault=true
  suggestedUsers: {
    userId: number;
    fullName: string;
    workFunctionName: string;
    role: string;
    matchReason?: string; // เหตุผลที่แนะนำคนนี้
  }[];
}

@Injectable()
export class SmartRoutingService {
  private readonly logger = new Logger(SmartRoutingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications: NotificationService,
  ) {}

  /** วิเคราะห์หัวเรื่อง + เนื้อหา แล้วแนะนำกลุ่มงาน + ผู้รับผิดชอบ */
  async suggest(organizationId: number, title: string, bodyText?: string): Promise<RoutingSuggestion> {
    const searchText = `${title} ${bodyText ?? ''}`;
    const searchLower = searchText.toLowerCase();

    // 1. Score each group by keyword matching
    const scores = KEYWORD_GROUP_MAP.map(({ keywords, groupCode, groupName }) => {
      let score = 0;
      for (const kw of keywords) {
        if (searchLower.includes(kw.toLowerCase())) score += 1;
      }
      return { groupCode, groupName, score };
    });

    const sorted = [...scores].sort((a, b) => b.score - a.score);
    const best = sorted[0];
    const totalScore = scores.reduce((s, x) => s + x.score, 0);
    const confidence = totalScore > 0 && best.score > 0 ? best.score / totalScore : 0;

    // 2. ค้นหา staff ทั้งหมดในองค์กร (ใช้สำหรับ name-matching + fallback)
    const allStaff = await this.prisma.user.findMany({
      where: { organizationId: BigInt(organizationId), isActive: true },
      select: { id: true, fullName: true, roleCode: true, positionTitle: true },
      orderBy: { roleCode: 'asc' },
    });

    // 3. Name matching — หาชื่อคนที่ปรากฏในเนื้อหาเอกสาร
    const mentionedUserIds = new Set<number>();
    for (const staff of allStaff) {
      // ตัดคำนำหน้า แล้วเทียบกับชื่อในเนื้อหา
      const nameParts = staff.fullName.replace(/^(นาย|นาง|นางสาว|ดร\.|ผอ\.|รอง\s*ผอ\.)\s*/, '').trim();
      if (nameParts.length >= 4 && searchText.includes(nameParts)) {
        mentionedUserIds.add(Number(staff.id));
      }
    }

    // 4. หา WorkGroup และ StaffAssignment ถ้า keyword match
    let workGroupCode = best?.score > 0 ? best.groupCode : 'general';
    let workGroupName = best?.score > 0 ? best.groupName : 'กลุ่มงานทั่วไป';
    let isDefault = best?.score === 0;

    const currentYear = await this.prisma.academicYear.findFirst({ where: { isCurrent: true } });

    // ค้นหา WorkGroup จาก DB (ถ้ามี seed)
    const workGroup = await this.prisma.workGroup.findFirst({
      where: {
        code: workGroupCode,
        OR: [{ organizationId: BigInt(organizationId) }, { organizationId: null }],
      },
    });

    let assignedStaff: typeof allStaff = [];

    if (workGroup) {
      // มี seed data → ใช้ StaffAssignment
      const assignments = await this.prisma.staffAssignment.findMany({
        where: {
          organizationId: BigInt(organizationId),
          workFunction: { workGroupId: workGroup.id },
          isActive: true,
          role: { in: ['head', 'responsible'] },
          ...(currentYear ? { academicYearId: currentYear.id } : {}),
        },
        include: {
          user: { select: { id: true, fullName: true, roleCode: true } },
          workFunction: { select: { name: true } },
        },
        orderBy: { role: 'asc' },
        take: 5,
      });

      if (assignments.length > 0) {
        return {
          workGroupCode,
          workGroupName: workGroup.name,
          confidence,
          isDefault,
          suggestedUsers: assignments.map((a) => ({
            userId: Number(a.user.id),
            fullName: a.user.fullName,
            workFunctionName: a.workFunction.name,
            role: a.role,
            matchReason: mentionedUserIds.has(Number(a.user.id)) ? 'ระบุชื่อในเอกสาร' : undefined,
          })),
        };
      }
    }

    // 5. Fallback: ไม่มี seed / ไม่มี assignment → ใช้ role hierarchy
    // จัดลำดับ: คนที่ถูกระบุชื่อในเอกสารก่อน จากนั้น role priority
    const staffWithPriority = allStaff.map((s) => ({
      ...s,
      nameMentioned: mentionedUserIds.has(Number(s.id)),
      rolePriority: ROLE_PRIORITY[s.roleCode] ?? 10,
    }));

    // กรองตาม groupCode mapping ถ้าไม่มี assignment
    const roleFilter = this.getRoleFilterForGroup(workGroupCode);
    let candidates = staffWithPriority.filter((s) => roleFilter.includes(s.roleCode));

    if (candidates.length === 0) {
      // ถ้าไม่มีเลยให้ใช้ DIRECTOR + CLERK
      candidates = staffWithPriority.filter((s) => ['DIRECTOR', 'CLERK', 'VICE_DIRECTOR'].includes(s.roleCode));
    }

    // เรียงลำดับ: ระบุชื่อในเอกสารก่อน → role priority
    candidates.sort((a, b) => {
      if (a.nameMentioned !== b.nameMentioned) return a.nameMentioned ? -1 : 1;
      return a.rolePriority - b.rolePriority;
    });

    const topCandidates = candidates.slice(0, 3);

    // 6. ถ้าไม่มีใครเลย → broadcast ให้ทุกคนทราบ
    if (topCandidates.length === 0) {
      isDefault = true;
      workGroupCode = 'general';
      workGroupName = 'กลุ่มงานทั่วไป';
    }

    return {
      workGroupCode,
      workGroupName,
      confidence: isDefault ? 0 : confidence,
      isDefault,
      defaultAction: isDefault
        ? 'ประชาสัมพันธ์ให้ครูทุกคนทราบ เก็บไว้ 1 สัปดาห์แล้วจัดเก็บ'
        : undefined,
      suggestedUsers: topCandidates.map((s) => ({
        userId: Number(s.id),
        fullName: s.fullName,
        workFunctionName: s.positionTitle || s.roleCode,
        role: s.rolePriority <= 2 ? 'head' : 'responsible',
        matchReason: s.nameMentioned ? 'ระบุชื่อในเอกสาร' : `บทบาท: ${s.roleCode}`,
      })),
    };
  }

  /** บทบาทที่เหมาะกับแต่ละกลุ่มงาน */
  private getRoleFilterForGroup(groupCode: string): string[] {
    switch (groupCode) {
      case 'academic':   return ['VICE_DIRECTOR', 'HEAD_TEACHER', 'TEACHER'];
      case 'budget':     return ['VICE_DIRECTOR', 'HEAD_TEACHER', 'TEACHER'];
      case 'personnel':  return ['DIRECTOR', 'VICE_DIRECTOR', 'HEAD_TEACHER'];
      case 'general':    return ['CLERK', 'DIRECTOR', 'VICE_DIRECTOR'];
      default:           return ['DIRECTOR', 'VICE_DIRECTOR', 'CLERK'];
    }
  }

  /** ใช้เมื่อหนังสือถูกสร้างใหม่ — อัปเดต InboundCase ด้วยข้อมูล routing */
  async applyRoutingToCase(caseId: number) {
    const c = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(caseId) },
    });
    if (!c) return { found: false, suggestion: null };

    // ดึง extractedText จาก DocumentAiResult ถ้ามี เพื่อใช้ name matching
    let extractedText = c.description ?? '';
    try {
      const aiResult = await this.prisma.documentAiResult.findFirst({
        where: { documentIntake: { inboundCases: { some: { id: BigInt(caseId) } } } } as any,
        select: { extractedText: true },
      });
      if (aiResult?.extractedText) extractedText += ' ' + aiResult.extractedText;
    } catch { /* ถ้า query ซับซ้อนเกินไป ใช้แค่ description */ }

    const suggestion = await this.suggest(Number(c.organizationId), c.title, extractedText);

    // กรณี fallback broadcast: ไม่ต้องบันทึก assignee — แค่ return คำแนะนำ
    if (suggestion.isDefault && suggestion.suggestedUsers.length === 0) {
      return { found: true, suggestion };
    }

    // Set the top responsible user as default assignee (if not already assigned)
    if (!c.assignedToUserId && suggestion.suggestedUsers.length > 0) {
      const topUser = suggestion.suggestedUsers[0];
      await this.prisma.inboundCase.update({
        where: { id: BigInt(caseId) },
        data: { assignedToUserId: BigInt(topUser.userId) },
      });
      this.logger.log(`Smart routing: case #${caseId} → ${topUser.fullName} (${suggestion.workGroupCode}, confidence=${suggestion.confidence.toFixed(2)})`);

      await this.prisma.caseActivity.create({
        data: {
          inboundCaseId: BigInt(caseId),
          action: 'routing_applied',
          detail: JSON.stringify({
            workGroupCode: suggestion.workGroupCode,
            workGroupName: suggestion.workGroupName,
            confidence: suggestion.confidence,
            isDefault: suggestion.isDefault,
            assignedUserId: topUser.userId,
            assignedUserName: topUser.fullName,
          }),
        },
      });

      if (this.notifications) {
        this.notifications.notifyNewCaseAssigned(caseId, topUser.userId).catch((e) =>
          this.logger.warn(`notify failed: ${e.message}`),
        );
      }
    }

    return { found: true, suggestion };
  }
}
