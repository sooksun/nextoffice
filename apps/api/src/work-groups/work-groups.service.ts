import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const WORK_GROUP_SEED = [
  {
    code: 'academic',
    name: 'กลุ่มบริหารงานวิชาการ',
    description: 'งานด้านหลักสูตร การเรียนการสอน วัดผล ประเมินผล และประกันคุณภาพ',
    sortOrder: 1,
    functions: [
      { code: 'AC01', name: 'งานพัฒนาหลักสูตรสถานศึกษา', sortOrder: 1 },
      { code: 'AC02', name: 'งานพัฒนากระบวนการเรียนรู้', sortOrder: 2 },
      { code: 'AC03', name: 'งานวัดผลประเมินผลและเทียบโอนผลการเรียน', sortOrder: 3 },
      { code: 'AC04', name: 'งานวิจัยเพื่อพัฒนาคุณภาพการศึกษา', sortOrder: 4 },
      { code: 'AC05', name: 'งานพัฒนาสื่อนวัตกรรมและเทคโนโลยีทางการศึกษา', sortOrder: 5 },
      { code: 'AC06', name: 'งานพัฒนาแหล่งการเรียนรู้', sortOrder: 6 },
      { code: 'AC07', name: 'งานนิเทศการศึกษา', sortOrder: 7 },
      { code: 'AC08', name: 'งานแนะแนวการศึกษา', sortOrder: 8 },
      { code: 'AC09', name: 'งานพัฒนาระบบประกันคุณภาพภายในสถานศึกษา', sortOrder: 9 },
      { code: 'AC10', name: 'งานส่งเสริมความรู้ด้านวิชาการแก่ชุมชน', sortOrder: 10 },
      { code: 'AC11', name: 'งานประสานความร่วมมือในการพัฒนาวิชาการกับสถานศึกษาอื่น', sortOrder: 11 },
      { code: 'AC12', name: 'งานส่งเสริมและสนับสนุนงานวิชาการแก่บุคคลและองค์กรภายนอก', sortOrder: 12 },
      { code: 'AC13', name: 'งานรับนักเรียนและทะเบียนนักเรียน', sortOrder: 13 },
      { code: 'AC14', name: 'งานกิจกรรมพัฒนาผู้เรียน', sortOrder: 14 },
      { code: 'AC15', name: 'งานห้องสมุดและศูนย์สื่อการเรียนรู้', sortOrder: 15 },
      { code: 'AC16', name: 'งานเทคโนโลยีสารสนเทศเพื่อการศึกษา', sortOrder: 16 },
      { code: 'AC17', name: 'งานจัดการศึกษาสำหรับนักเรียนที่มีความต้องการพิเศษ', sortOrder: 17 },
      { code: 'AC18', name: 'งานประสานหลักสูตรสถานศึกษาขั้นพื้นฐาน', sortOrder: 18 },
      { code: 'AC19', name: 'งานส่งเสริมทักษะอาชีพ', sortOrder: 19 },
      { code: 'AC20', name: 'งานพัฒนาระบบข้อมูลผลสัมฤทธิ์ทางการเรียน', sortOrder: 20 },
    ],
  },
  {
    code: 'budget',
    name: 'กลุ่มบริหารงานงบประมาณ',
    description: 'งานด้านการเงิน การบัญชี พัสดุ และการระดมทรัพยากร',
    sortOrder: 2,
    functions: [
      { code: 'BU01', name: 'งานบริหารการเงิน', sortOrder: 1 },
      { code: 'BU02', name: 'งานบริหารการบัญชี', sortOrder: 2 },
      { code: 'BU03', name: 'งานบริหารพัสดุและสินทรัพย์', sortOrder: 3 },
      { code: 'BU04', name: 'งานระดมทรัพยากรและการลงทุนเพื่อการศึกษา', sortOrder: 4 },
      { code: 'BU05', name: 'งานจัดทำและเสนอของบประมาณ', sortOrder: 5 },
      { code: 'BU06', name: 'งานตรวจสอบติดตามและประเมินผลการใช้เงิน', sortOrder: 6 },
      { code: 'BU07', name: 'งานจัดหาผลประโยชน์จากทรัพย์สินของสถานศึกษา', sortOrder: 7 },
      { code: 'BU08', name: 'งานบริหารและพัฒนาระบบข้อมูลสารสนเทศทางการเงิน', sortOrder: 8 },
      { code: 'BU09', name: 'งานตรวจสอบภายใน', sortOrder: 9 },
      { code: 'BU10', name: 'งานบริหารสัญญา', sortOrder: 10 },
      { code: 'BU11', name: 'งานจัดซื้อจัดจ้างตาม พ.ร.บ.จัดซื้อจัดจ้างฯ 2560', sortOrder: 11 },
      { code: 'BU12', name: 'งานจัดทำรายงานการเงินประจำปี', sortOrder: 12 },
      { code: 'BU13', name: 'งานบริหารความเสี่ยงทางการเงิน', sortOrder: 13 },
      { code: 'BU14', name: 'งานควบคุมงบประมาณและรายจ่าย', sortOrder: 14 },
      { code: 'BU15', name: 'งานบริหารเงินทุนการศึกษา', sortOrder: 15 },
    ],
  },
  {
    code: 'personnel',
    name: 'กลุ่มบริหารงานบุคคล',
    description: 'งานด้านการวางแผนกำลังคน สรรหา บรรจุแต่งตั้ง พัฒนา และวินัย',
    sortOrder: 3,
    functions: [
      { code: 'PE01', name: 'งานวางแผนอัตรากำลังและกำหนดตำแหน่ง', sortOrder: 1 },
      { code: 'PE02', name: 'งานสรรหาและบรรจุแต่งตั้ง', sortOrder: 2 },
      { code: 'PE03', name: 'งานเสริมสร้างประสิทธิภาพในการปฏิบัติราชการ', sortOrder: 3 },
      { code: 'PE04', name: 'งานวินัยและรักษาวินัย', sortOrder: 4 },
      { code: 'PE05', name: 'งานออกจากราชการ', sortOrder: 5 },
      { code: 'PE06', name: 'งานทะเบียนประวัติและบำเหน็จบำนาญ', sortOrder: 6 },
      { code: 'PE07', name: 'งานพัฒนาบุคลากรและฝึกอบรม', sortOrder: 7 },
      { code: 'PE08', name: 'งานประเมินผลการปฏิบัติงาน', sortOrder: 8 },
      { code: 'PE09', name: 'งานเลื่อนขั้นเงินเดือนและค่าตอบแทน', sortOrder: 9 },
      { code: 'PE10', name: 'งานสวัสดิการและสิทธิประโยชน์ข้าราชการครู', sortOrder: 10 },
      { code: 'PE11', name: 'งานส่งเสริมจรรยาบรรณวิชาชีพและคุณธรรม', sortOrder: 11 },
      { code: 'PE12', name: 'งานขอรับใบอนุญาตประกอบวิชาชีพ', sortOrder: 12 },
      { code: 'PE13', name: 'งานจัดทำข้อมูลระบบ HRMS/KRS', sortOrder: 13 },
      { code: 'PE14', name: 'งานขอเครื่องราชอิสริยาภรณ์', sortOrder: 14 },
      { code: 'PE15', name: 'งานลาทุกประเภท', sortOrder: 15 },
      { code: 'PE16', name: 'งานตรวจสอบคุณสมบัติบุคลากร', sortOrder: 16 },
      { code: 'PE17', name: 'งานจัดทำคำสั่งและประกาศเกี่ยวกับบุคลากร', sortOrder: 17 },
    ],
  },
  {
    code: 'general',
    name: 'กลุ่มบริหารงานทั่วไป',
    description: 'งานด้านสารบรรณ ธุรการ อาคารสถานที่ และงานสนับสนุนทั่วไป',
    sortOrder: 4,
    functions: [
      { code: 'GE01', name: 'งานบริหารงานสารบรรณ', sortOrder: 1 },
      { code: 'GE02', name: 'งานประชาสัมพันธ์', sortOrder: 2 },
      { code: 'GE03', name: 'งานดูแลอาคารสถานที่และสภาพแวดล้อม', sortOrder: 3 },
      { code: 'GE04', name: 'งานจัดทำสำมะโนผู้เรียน', sortOrder: 4 },
      { code: 'GE05', name: 'งานระบบดูแลช่วยเหลือนักเรียน', sortOrder: 5 },
      { code: 'GE06', name: 'งานป้องกันและแก้ไขปัญหายาเสพติดในสถานศึกษา', sortOrder: 6 },
      { code: 'GE07', name: 'งานส่งเสริมคุณธรรมจริยธรรมและค่านิยมที่พึงประสงค์', sortOrder: 7 },
      { code: 'GE08', name: 'งานส่งเสริมและสนับสนุนกิจกรรมนักเรียน', sortOrder: 8 },
      { code: 'GE09', name: 'งานจัดกิจกรรมวันสำคัญและพิธีการ', sortOrder: 9 },
      { code: 'GE10', name: 'งานประสานและส่งเสริมความสัมพันธ์ชุมชน', sortOrder: 10 },
      { code: 'GE11', name: 'งานอนามัยโรงเรียนและพยาบาล', sortOrder: 11 },
      { code: 'GE12', name: 'งานโภชนาการและอาหารกลางวัน', sortOrder: 12 },
      { code: 'GE13', name: 'งานรักษาความปลอดภัย', sortOrder: 13 },
      { code: 'GE14', name: 'งานยานพาหนะ', sortOrder: 14 },
      { code: 'GE15', name: 'งานปฏิคมและต้อนรับ', sortOrder: 15 },
      { code: 'GE16', name: 'งานจัดทำข้อมูล DMC/EMIS', sortOrder: 16 },
      { code: 'GE17', name: 'งานกองทุนเงินให้กู้ยืมเพื่อการศึกษา (กยศ.)', sortOrder: 17 },
      { code: 'GE18', name: 'งานจัดการความรู้ (KM) ของสถานศึกษา', sortOrder: 18 },
      { code: 'GE19', name: 'งานส่งเสริมสนับสนุนการจัดการศึกษาปฐมวัย', sortOrder: 19 },
      { code: 'GE20', name: 'งานบริหารสำนักงาน', sortOrder: 20 },
      { code: 'GE21', name: 'งานเลขานุการผู้บริหาร', sortOrder: 21 },
      { code: 'GE22', name: 'งานส่งเสริมกิจกรรมกีฬาและนันทนาการ', sortOrder: 22 },
    ],
  },
];

@Injectable()
export class WorkGroupsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(organizationId?: number) {
    const where = organizationId
      ? { OR: [{ organizationId: BigInt(organizationId) }, { organizationId: null }] }
      : { organizationId: null };

    const groups = await this.prisma.workGroup.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
      include: {
        functions: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
      },
    });
    return groups.map((g) => this.serialize(g));
  }

  async findOne(id: number) {
    const g = await this.prisma.workGroup.findUnique({
      where: { id: BigInt(id) },
      include: {
        functions: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        staffMembers: {
          select: { id: true, fullName: true, roleCode: true, positionTitle: true },
        },
      },
    });
    return g ? this.serialize(g) : null;
  }

  async getStaffAssignments(organizationId: number, academicYearId?: number) {
    const where: any = { organizationId: BigInt(organizationId), isActive: true };
    if (academicYearId) where.academicYearId = BigInt(academicYearId);

    const assignments = await this.prisma.staffAssignment.findMany({
      where,
      orderBy: [{ workFunction: { workGroup: { sortOrder: 'asc' } } }, { workFunction: { sortOrder: 'asc' } }],
      include: {
        user: { select: { id: true, fullName: true, roleCode: true, positionTitle: true } },
        workFunction: { include: { workGroup: true } },
        academicYear: { select: { id: true, year: true, name: true } },
      },
    });
    return assignments.map((a) => ({
      id: Number(a.id),
      role: a.role,
      semester: a.semester,
      appointmentOrderNo: a.appointmentOrderNo,
      effectiveDate: a.effectiveDate,
      user: a.user ? { ...a.user, id: Number(a.user.id) } : null,
      workFunction: {
        id: Number(a.workFunction.id),
        code: a.workFunction.code,
        name: a.workFunction.name,
        workGroup: {
          id: Number(a.workFunction.workGroup.id),
          code: a.workFunction.workGroup.code,
          name: a.workFunction.workGroup.name,
        },
      },
      academicYear: a.academicYear ? { ...a.academicYear, id: Number(a.academicYear.id) } : null,
    }));
  }

  async assignStaff(dto: {
    organizationId: number;
    userId: number;
    workFunctionId: number;
    role?: string;
    academicYearId: number;
    semester?: number;
    appointmentOrderNo?: string;
  }) {
    const assignment = await this.prisma.staffAssignment.create({
      data: {
        organizationId: BigInt(dto.organizationId),
        userId: BigInt(dto.userId),
        workFunctionId: BigInt(dto.workFunctionId),
        role: dto.role ?? 'responsible',
        academicYearId: BigInt(dto.academicYearId),
        semester: dto.semester ?? 0,
        appointmentOrderNo: dto.appointmentOrderNo,
      },
    });
    return { id: Number(assignment.id) };
  }

  async removeStaffAssignment(id: number) {
    await this.prisma.staffAssignment.update({
      where: { id: BigInt(id) },
      data: { isActive: false },
    });
    return { success: true };
  }

  /** Seed shared template (organizationId = null) — idempotent */
  async seedTemplate() {
    let created = 0;
    for (const group of WORK_GROUP_SEED) {
      const existing = await this.prisma.workGroup.findFirst({
        where: { organizationId: null, code: group.code },
      });
      let wg = existing;
      if (!wg) {
        wg = await this.prisma.workGroup.create({
          data: {
            code: group.code,
            name: group.name,
            description: group.description,
            sortOrder: group.sortOrder,
          },
        });
        created++;
      }
      for (const fn of group.functions) {
        const existingFn = await this.prisma.workFunction.findFirst({
          where: { workGroupId: wg.id, code: fn.code },
        });
        if (!existingFn) {
          await this.prisma.workFunction.create({
            data: {
              workGroupId: wg.id,
              code: fn.code,
              name: fn.name,
              sortOrder: fn.sortOrder,
            },
          });
          created++;
        }
      }
    }
    return { seeded: created, total: WORK_GROUP_SEED.reduce((s, g) => s + 1 + g.functions.length, 0) };
  }

  private serialize(g: any): any {
    return {
      ...g,
      id: Number(g.id),
      organizationId: g.organizationId ? Number(g.organizationId) : null,
      functions: g.functions?.map((f: any) => ({
        ...f,
        id: Number(f.id),
        workGroupId: Number(f.workGroupId),
      })),
      staffMembers: g.staffMembers?.map((u: any) => ({ ...u, id: Number(u.id) })),
    };
  }
}
