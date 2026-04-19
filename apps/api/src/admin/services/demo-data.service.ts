import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const DEMO_CASES = [
  {
    title: 'หนังสือแจ้งผลการประเมินโรงเรียน ประจำปี 2569',
    description: 'สพฐ. แจ้งผลการประเมินคุณภาพสถานศึกษา ขอให้โรงเรียนดำเนินการตามแผนพัฒนาคุณภาพการศึกษา',
    urgencyLevel: 'normal',
    status: 'new',
    senderOrg: 'สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน (สพฐ.)',
  },
  {
    title: 'หนังสือเชิญประชุมคณะกรรมการสถานศึกษา ครั้งที่ 1/2569',
    description: 'ขอเชิญประชุมคณะกรรมการสถานศึกษาขั้นพื้นฐาน เพื่อพิจารณาแผนการดำเนินงานปีการศึกษา 2569',
    urgencyLevel: 'urgent',
    status: 'registered',
    senderOrg: 'สพป.เชียงราย เขต 3',
    registryNo: '001',
  },
  {
    title: 'หนังสือขอรับการสนับสนุนงบประมาณโครงการอาหารกลางวัน',
    description: 'ขอรับการสนับสนุนงบประมาณจัดการอาหารกลางวันนักเรียน ภาคเรียนที่ 1 ปีการศึกษา 2569',
    urgencyLevel: 'urgent',
    status: 'assigned',
    senderOrg: 'สพป.เชียงราย เขต 3',
    registryNo: '002',
    directorNote: 'มอบหมายงานงบประมาณดำเนินการ ติดต่อประสานกับ สพป. ภายใน 15 วัน',
    assignDept: 'budget',
  },
  {
    title: 'หนังสือให้จัดทำรายงานผลการพัฒนาคุณภาพการศึกษา SAR 2569',
    description: 'ขอให้จัดทำรายงานการประเมินตนเองของสถานศึกษา (SAR) ส่งภายในวันที่ 31 มีนาคม 2570',
    urgencyLevel: 'very_urgent',
    status: 'in_progress',
    senderOrg: 'สำนักงานรับรองมาตรฐานและประเมินคุณภาพการศึกษา (สมศ.)',
    registryNo: '003',
    directorNote: 'มอบหมายฝ่ายวิชาการเป็นหลัก ร่วมกับทุกฝ่าย ส่งภายใน 30 มีนาคม 2570',
    dueDate: new Date('2027-03-30'),
    assignDept: 'academic',
  },
  {
    title: 'หนังสือประสานงานการจัดงานวันเกียรติยศนักเรียน ปี 2569',
    description: 'ประสานงานการจัดงานมอบใบประกาศนักเรียนดีเด่น ร่วมกับเครือข่ายโรงเรียนในสังกัด',
    urgencyLevel: 'normal',
    status: 'completed',
    senderOrg: 'เครือข่ายโรงเรียนแม่ฟ้าหลวง',
    registryNo: '004',
    directorNote: 'มอบหมายกลุ่มงานทั่วไปประสานงาน',
    assignDept: 'general',
  },
];

@Injectable()
export class DemoDataService {
  private readonly logger = new Logger(DemoDataService.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(organizationId: number) {
    const orgId = BigInt(organizationId);

    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      include: { activeAcademicYear: true },
    });
    if (!org) throw new NotFoundException(`Organization #${organizationId} not found`);

    const users = await this.prisma.user.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, fullName: true, roleCode: true, department: true },
    });

    const director = users.find((u) => u.roleCode === 'DIRECTOR');
    const clerk = users.find((u) => u.roleCode === 'CLERK');
    const academicHead = users.find((u) => u.roleCode === 'HEAD_TEACHER' && u.department === 'academic');
    const budgetHead = users.find((u) => u.roleCode === 'HEAD_TEACHER' && u.department === 'budget');
    const generalHead = users.find((u) => u.roleCode === 'HEAD_TEACHER' && u.department === 'general');
    const teachers = users.filter((u) => u.roleCode === 'TEACHER');

    if (!director || !clerk) {
      throw new NotFoundException('ไม่พบผู้อำนวยการหรือธุรการ กรุณา seed ข้อมูลบุคลากรก่อน (npm run seed:school)');
    }

    const academicYearId = org.activeAcademicYear?.id ?? null;
    const created: string[] = [];

    for (const demo of DEMO_CASES) {
      const existing = await this.prisma.inboundCase.findFirst({
        where: { organizationId: orgId, title: demo.title },
      });
      if (existing) {
        created.push(`ข้าม (มีอยู่แล้ว): ${demo.title}`);
        continue;
      }

      const sourceDoc = await this.prisma.document.create({
        data: {
          title: demo.title,
          sourceType: 'demo',
          documentType: 'official',
          issuingAuthority: demo.senderOrg,
          status: 'active',
        },
      });

      const registrationNo = (demo as any).registryNo
        ? `${(demo as any).registryNo}/2569`
        : null;

      const inboundCase = await this.prisma.inboundCase.create({
        data: {
          organizationId: orgId,
          academicYearId: academicYearId ?? undefined,
          title: demo.title,
          description: demo.description,
          urgencyLevel: demo.urgencyLevel,
          status: demo.status,
          registrationNo,
          registeredAt: registrationNo ? new Date() : null,
          registeredByUserId: registrationNo ? clerk.id : null,
          directorNote: (demo as any).directorNote ?? null,
          dueDate: (demo as any).dueDate ?? null,
          sourceDocumentId: sourceDoc.id,
        },
      });

      // ─── DocumentRegistry ─────────────────────────────────────────────
      if ((demo as any).registryNo) {
        await this.prisma.documentRegistry.create({
          data: {
            organizationId: orgId,
            academicYearId: academicYearId ?? undefined,
            inboundCaseId: inboundCase.id,
            registryType: 'inbound',
            registryNo: (demo as any).registryNo,
            subject: demo.title,
            fromOrg: demo.senderOrg,
            urgencyLevel: demo.urgencyLevel,
          },
        });
      }

      // ─── Assignment + Activities ───────────────────────────────────────
      const assignee = this.pickAssignee((demo as any).assignDept, { academicHead, budgetHead, generalHead, teachers });

      if (['assigned', 'in_progress', 'completed'].includes(demo.status) && assignee) {
        await this.prisma.caseAssignment.create({
          data: {
            inboundCaseId: inboundCase.id,
            assignedToUserId: assignee.id,
            assignedByUserId: director.id,
            role: 'responsible',
            status: demo.status === 'completed' ? 'completed'
              : demo.status === 'in_progress' ? 'in_progress'
              : 'pending',
            note: (demo as any).directorNote ?? null,
            dueDate: (demo as any).dueDate ?? null,
            completedAt: demo.status === 'completed' ? new Date() : null,
          },
        });

        await this.prisma.inboundCase.update({
          where: { id: inboundCase.id },
          data: { assignedToUserId: assignee.id },
        });

        const activities = [
          { userId: clerk.id, action: 'register', detail: `{"registrationNo":"${registrationNo}"}` },
          { userId: director.id, action: 'assign', detail: `{"assignee":"${assignee.fullName}"}` },
          ...(demo.status === 'in_progress' || demo.status === 'completed'
            ? [{ userId: assignee.id, action: 'comment', detail: '{"text":"รับทราบและเริ่มดำเนินการตามคำสั่ง"}' }]
            : []),
          ...(demo.status === 'completed'
            ? [{ userId: assignee.id, action: 'complete', detail: '{"text":"ดำเนินการเสร็จสิ้น"}' }]
            : []),
        ];
        await this.prisma.caseActivity.createMany({
          data: activities.map((a) => ({ ...a, inboundCaseId: inboundCase.id })),
        });

        if (demo.status === 'assigned') {
          await this.prisma.caseEndorsement.create({
            data: {
              inboundCaseId: inboundCase.id,
              authorUserId: director.id,
              roleCode: 'DIRECTOR',
              stepOrder: 1,
              noteText: (demo as any).directorNote ?? 'เกษียณหนังสือโดย ผอ.',
              routingPath: 'direct',
            },
          });
        }
      } else if (demo.status === 'registered') {
        await this.prisma.caseActivity.create({
          data: {
            inboundCaseId: inboundCase.id,
            userId: clerk.id,
            action: 'register',
            detail: `{"registrationNo":"${registrationNo}"}`,
          },
        });
      }

      created.push(`[${demo.status}]: ${demo.title}`);
      this.logger.log(`Created demo case [${demo.status}]: ${demo.title}`);
    }

    const skipped = created.filter((s) => s.startsWith('ข้าม')).length;
    const createdCount = created.length - skipped;

    return {
      success: true,
      organizationId,
      organizationName: org.name,
      items: created,
      summary: {
        total: DEMO_CASES.length,
        created: createdCount,
        skipped,
        byStatus: {
          new: created.filter((s) => s.includes('[new]')).length,
          registered: created.filter((s) => s.includes('[registered]')).length,
          assigned: created.filter((s) => s.includes('[assigned]')).length,
          inProgress: created.filter((s) => s.includes('[in_progress]')).length,
          completed: created.filter((s) => s.includes('[completed]')).length,
        },
      },
      message: `สร้าง demo data สำเร็จ ${createdCount} รายการ${skipped > 0 ? ` (ข้าม ${skipped} รายการที่มีอยู่แล้ว)` : ''}`,
    };
  }

  private pickAssignee(
    dept: string | undefined,
    users: { academicHead: any; budgetHead: any; generalHead: any; teachers: any[] },
  ) {
    if (dept === 'academic') return users.academicHead ?? users.teachers[0];
    if (dept === 'budget') return users.budgetHead ?? users.teachers[1];
    if (dept === 'general') return users.generalHead ?? users.teachers[2];
    return users.teachers[0];
  }
}
