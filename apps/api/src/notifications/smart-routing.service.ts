import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';

// Map document subject keywords → work group code
const KEYWORD_GROUP_MAP: { keywords: string[]; groupCode: string }[] = [
  { keywords: ['หลักสูตร', 'การเรียน', 'สอน', 'นักเรียน', 'วัดผล', 'ประเมินผล', 'วิชาการ', 'ห้องสมุด', 'สื่อการสอน', 'นิเทศ', 'แนะแนว', 'โครงการพัฒนา', 'ผลสัมฤทธิ์', 'ทักษะ'], groupCode: 'academic' },
  { keywords: ['งบประมาณ', 'การเงิน', 'พัสดุ', 'จัดซื้อ', 'จัดจ้าง', 'ใบสำคัญ', 'เบิกจ่าย', 'เงินอุดหนุน', 'บัญชี', 'ตรวจสอบ', 'ทรัพย์สิน', 'ระดม'], groupCode: 'budget' },
  { keywords: ['บุคลากร', 'ข้าราชการ', 'ครู', 'แต่งตั้ง', 'โยกย้าย', 'ลา', 'เลื่อน', 'วินัย', 'บำเหน็จ', 'บำนาญ', 'ประเมินผล', 'พัฒนาครู', 'ฝึกอบรม', 'อัตรากำลัง'], groupCode: 'personnel' },
  { keywords: ['สารบรรณ', 'ธุรการ', 'อาคาร', 'สถานที่', 'ประชาสัมพันธ์', 'ประชุม', 'ปฏิทิน', 'กีฬา', 'อนามัย', 'โภชนาการ', 'ยาเสพติด', 'ชุมชน', 'ทัศนศึกษา', 'กิจกรรม'], groupCode: 'general' },
];

export interface RoutingSuggestion {
  workGroupCode: string;
  workGroupName: string;
  confidence: number; // 0-1
  suggestedUsers: {
    userId: number;
    fullName: string;
    workFunctionName: string;
    role: string;
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
  async suggest(organizationId: number, title: string, bodyText?: string): Promise<RoutingSuggestion | null> {
    const searchText = `${title} ${bodyText ?? ''}`.toLowerCase();

    // Score each group
    const scores: { groupCode: string; score: number }[] = KEYWORD_GROUP_MAP.map(({ keywords, groupCode }) => {
      let score = 0;
      for (const kw of keywords) {
        if (searchText.includes(kw)) score += 1;
      }
      return { groupCode, score };
    });

    const best = scores.sort((a, b) => b.score - a.score)[0];
    if (!best || best.score === 0) return null;

    const totalScore = scores.reduce((s, x) => s + x.score, 0);
    const confidence = totalScore > 0 ? best.score / totalScore : 0;

    // Find the WorkGroup for this org
    const workGroup = await this.prisma.workGroup.findFirst({
      where: {
        code: best.groupCode,
        OR: [{ organizationId: BigInt(organizationId) }, { organizationId: null }],
      },
    });
    if (!workGroup) return null;

    // Get current academic year
    const currentYear = await this.prisma.academicYear.findFirst({ where: { isCurrent: true } });

    // Find active staff assignments in this group
    const assignments = await this.prisma.staffAssignment.findMany({
      where: {
        organizationId: BigInt(organizationId),
        workFunction: { workGroupId: workGroup.id },
        isActive: true,
        role: { in: ['head', 'responsible'] },
        ...(currentYear ? { academicYearId: currentYear.id } : {}),
      },
      include: {
        user: { select: { id: true, fullName: true } },
        workFunction: { select: { name: true } },
      },
      orderBy: { role: 'asc' }, // head first
      take: 5,
    });

    return {
      workGroupCode: best.groupCode,
      workGroupName: workGroup.name,
      confidence,
      suggestedUsers: assignments.map((a) => ({
        userId: Number(a.user.id),
        fullName: a.user.fullName,
        workFunctionName: a.workFunction.name,
        role: a.role,
      })),
    };
  }

  /** ใช้เมื่อหนังสือถูกสร้างใหม่ — อัปเดต InboundCase ด้วยข้อมูล routing */
  async applyRoutingToCase(caseId: number) {
    const c = await this.prisma.inboundCase.findUnique({
      where: { id: BigInt(caseId) },
    });
    if (!c) return { found: false, suggestion: null };

    const suggestion = await this.suggest(Number(c.organizationId), c.title, c.description ?? '');
    if (!suggestion || !suggestion.suggestedUsers.length) {
      return { found: false, suggestion: null, reason: 'no_match' };
    }

    // Set the top responsible user as default assignee (if not already assigned)
    if (!c.assignedToUserId) {
      const topUser = suggestion.suggestedUsers[0];
      await this.prisma.inboundCase.update({
        where: { id: BigInt(caseId) },
        data: { assignedToUserId: BigInt(topUser.userId) },
      });
      this.logger.log(`Smart routing: case #${caseId} → ${topUser.fullName} (${suggestion.workGroupCode}, confidence=${suggestion.confidence.toFixed(2)})`);

      // Audit: log routing_applied activity
      await this.prisma.caseActivity.create({
        data: {
          inboundCaseId: BigInt(caseId),
          action: 'routing_applied',
          detail: JSON.stringify({
            workGroupCode: suggestion.workGroupCode,
            workGroupName: suggestion.workGroupName,
            confidence: suggestion.confidence,
            assignedUserId: topUser.userId,
            assignedUserName: topUser.fullName,
            workFunctionName: topUser.workFunctionName,
          }),
        },
      });

      // Notify the assigned user via LINE (non-blocking)
      if (this.notifications) {
        this.notifications.notifyNewCaseAssigned(caseId, topUser.userId).catch((e) =>
          this.logger.warn(`notify failed: ${e.message}`),
        );
      }
    }

    return { found: true, suggestion };
  }
}
