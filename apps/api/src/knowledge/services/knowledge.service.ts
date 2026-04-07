import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateKnowledgeDto } from '../dto/create-knowledge.dto';

// ─── ข้อมูลนโยบาย สพฐ. สำหรับ seed ───────────────────────────────────────
const OBEC_POLICIES = [
  {
    title: 'นโยบายและจุดเน้นการดำเนินงาน สพฐ. ปีงบประมาณ พ.ศ. 2568',
    issuingAuthority: 'สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน (สพฐ.)',
    policyType: 'annual_policy',
    jurisdictionLevel: 'national',
    mandatoryLevel: 'mandatory',
    complianceRiskLevel: 'high',
    summary: 'นโยบาย สพฐ. ปี 2568 มุ่งเน้น 3 ด้านหลัก: ความปลอดภัย คุณภาพการศึกษา และโอกาสการเข้าถึง',
    clauses: [
      { code: 'น.1', text: 'สถานศึกษาต้องจัดทำแผนป้องกันและแก้ไขปัญหายาเสพติดในโรงเรียน', obligation: 'mandatory', action: 'จัดทำแผนงาน' },
      { code: 'น.2', text: 'ทุกโรงเรียนต้องรายงานผลการดำเนินงานตามนโยบายรายไตรมาส', obligation: 'mandatory', action: 'รายงานผล' },
      { code: 'น.3', text: 'ส่งเสริมการจัดการเรียนการสอนแบบ Active Learning ไม่น้อยกว่าร้อยละ 80', obligation: 'recommended', action: 'ปรับการเรียนการสอน' },
    ],
  },
  {
    title: 'ระเบียบสำนักนายกรัฐมนตรีว่าด้วยงานสารบรรณ พ.ศ. 2526 และที่แก้ไขเพิ่มเติม',
    issuingAuthority: 'สำนักนายกรัฐมนตรี',
    policyType: 'regulation',
    jurisdictionLevel: 'national',
    mandatoryLevel: 'mandatory',
    complianceRiskLevel: 'high',
    summary: 'กำหนดหลักเกณฑ์และวิธีการรับ-ส่งหนังสือราชการ การลงทะเบียน การเก็บรักษา และการทำลายหนังสือ',
    clauses: [
      { code: 'ม.6', text: 'หนังสือภายนอกให้ลงรับในทะเบียนรับหนังสือ กำหนดเลขรับตามลำดับและปี', obligation: 'mandatory', action: 'ลงทะเบียนรับ' },
      { code: 'ม.10', text: 'หนังสือด่วนที่สุดต้องดำเนินการทันที หนังสือด่วนมากภายใน 3 ชั่วโมง', obligation: 'mandatory', action: 'เร่งรัดการดำเนินการ' },
      { code: 'ม.22', text: 'หนังสือราชการต้องเก็บรักษาไม่น้อยกว่า 10 ปี ยกเว้นที่มีกฎหมายกำหนดไว้เป็นอย่างอื่น', obligation: 'mandatory', action: 'จัดเก็บเอกสาร' },
    ],
  },
  {
    title: 'นโยบายการพัฒนาทักษะดิจิทัลเพื่อการศึกษา (Digital Education Policy) 2567-2570',
    issuingAuthority: 'กระทรวงศึกษาธิการ',
    policyType: 'digital_policy',
    jurisdictionLevel: 'national',
    mandatoryLevel: 'mandatory',
    complianceRiskLevel: 'medium',
    summary: 'นโยบายส่งเสริมการใช้เทคโนโลยีดิจิทัลในการจัดการเรียนการสอน และการบริหารจัดการสถานศึกษา',
    clauses: [
      { code: 'ด.1', text: 'สถานศึกษาต้องจัดให้มีอินเทอร์เน็ตความเร็วสูงสำหรับนักเรียนและครูทุกห้องเรียน', obligation: 'mandatory', action: 'จัดหาโครงสร้างพื้นฐาน' },
      { code: 'ด.2', text: 'ครูทุกคนต้องผ่านการอบรมทักษะดิจิทัลอย่างน้อย 20 ชั่วโมงต่อปีการศึกษา', obligation: 'mandatory', action: 'จัดการอบรม' },
      { code: 'ด.3', text: 'สนับสนุนการใช้ AI เพื่อช่วยในการจัดการเรียนการสอนและลดภาระงานครู', obligation: 'recommended', action: 'นำ AI มาใช้' },
    ],
  },
  {
    title: 'แนวปฏิบัติการป้องกันและแก้ไขปัญหายาเสพติดในสถานศึกษา สพฐ. 2568',
    issuingAuthority: 'สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน (สพฐ.)',
    policyType: 'operational_guideline',
    jurisdictionLevel: 'national',
    mandatoryLevel: 'mandatory',
    complianceRiskLevel: 'high',
    summary: 'กำหนดแนวปฏิบัติสำหรับสถานศึกษาในการป้องกัน เฝ้าระวัง และแก้ไขปัญหายาเสพติดในโรงเรียน',
    clauses: [
      { code: 'ย.1', text: 'โรงเรียนต้องแต่งตั้งคณะกรรมการป้องกันและแก้ไขปัญหายาเสพติดประจำสถานศึกษา', obligation: 'mandatory', action: 'แต่งตั้งคณะกรรมการ' },
      { code: 'ย.2', text: 'จัดกิจกรรมป้องกันยาเสพติดอย่างน้อยภาคเรียนละ 1 ครั้ง', obligation: 'mandatory', action: 'จัดกิจกรรม' },
      { code: 'ย.3', text: 'รายงานผลการดำเนินงานป้องกันยาเสพติดผ่านระบบ NISPA ทุกภาคเรียน', obligation: 'mandatory', action: 'รายงานผล' },
    ],
  },
  {
    title: 'นโยบายความปลอดภัยในสถานศึกษา (MOE Safety Center)',
    issuingAuthority: 'กระทรวงศึกษาธิการ',
    policyType: 'safety_policy',
    jurisdictionLevel: 'national',
    mandatoryLevel: 'mandatory',
    complianceRiskLevel: 'high',
    summary: 'มาตรการดูแลความปลอดภัยของนักเรียนทั้ง 4 มิติ: ความปลอดภัยจากภัยพิบัติ ภัยจากบุคคล อุบัติเหตุ และสุขภาพ',
    clauses: [
      { code: 'ป.1', text: 'สถานศึกษาต้องลงทะเบียนในระบบ MOE Safety Center และรายงานเหตุการณ์ไม่ปลอดภัยทุกกรณี', obligation: 'mandatory', action: 'ลงทะเบียนระบบ' },
      { code: 'ป.2', text: 'จัดทำแผนรับมือสาธารณภัยและซ้อมแผนอพยพอย่างน้อยปีละ 1 ครั้ง', obligation: 'mandatory', action: 'จัดทำแผน' },
    ],
  },
  {
    title: 'ระเบียบว่าด้วยการลาของข้าราชการ พ.ศ. 2555',
    issuingAuthority: 'สำนักนายกรัฐมนตรี',
    policyType: 'hr_regulation',
    jurisdictionLevel: 'national',
    mandatoryLevel: 'mandatory',
    complianceRiskLevel: 'medium',
    summary: 'กำหนดประเภทการลา วันลา สิทธิการลา และขั้นตอนการขออนุมัติลาสำหรับข้าราชการ',
    clauses: [
      { code: 'ล.5', text: 'ข้าราชการมีสิทธิลาป่วยได้ไม่เกิน 60 วันทำการต่อปี โดยได้รับเงินเดือน', obligation: 'entitlement', action: 'ดำเนินการตามสิทธิ' },
      { code: 'ล.9', text: 'ข้าราชการมีสิทธิลาพักผ่อนประจำปีได้ปีละ 10 วันทำการ', obligation: 'entitlement', action: 'อนุมัติการลา' },
      { code: 'ล.15', text: 'ข้าราชการลาไปศึกษา ฝึกอบรม หรือดูงาน ต้องได้รับอนุมัติจากผู้บังคับบัญชา', obligation: 'mandatory', action: 'ขออนุมัติ' },
    ],
  },
  {
    title: 'นโยบายลดภาระครูและบุคลากรทางการศึกษา สพฐ. 2568',
    issuingAuthority: 'สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน (สพฐ.)',
    policyType: 'operational_policy',
    jurisdictionLevel: 'national',
    mandatoryLevel: 'recommended',
    complianceRiskLevel: 'low',
    summary: 'นโยบายลดภาระงานเอกสาร การประชุม และกิจกรรมที่ไม่จำเป็น เพื่อให้ครูมีเวลาสอนมากขึ้น',
    clauses: [
      { code: 'ลภ.1', text: 'ลดรายงานที่ไม่จำเป็นและซ้ำซ้อน โดยใช้ระบบดิจิทัลแทนเอกสารกระดาษ', obligation: 'recommended', action: 'ปรับระบบงาน' },
      { code: 'ลภ.2', text: 'ประชุมผ่านระบบออนไลน์ได้ ลดการเดินทางไปประชุมที่ไม่จำเป็น', obligation: 'recommended', action: 'จัดประชุมออนไลน์' },
    ],
  },
  {
    title: 'แผนการศึกษาแห่งชาติ พ.ศ. 2560-2579',
    issuingAuthority: 'สำนักงานเลขาธิการสภาการศึกษา (สกศ.)',
    policyType: 'national_plan',
    jurisdictionLevel: 'national',
    mandatoryLevel: 'mandatory',
    complianceRiskLevel: 'high',
    summary: 'กรอบทิศทางการจัดการศึกษาของประเทศ 20 ปี ครอบคลุม 6 ยุทธศาสตร์หลัก',
    clauses: [
      { code: 'แผน.1', text: 'ยุทธศาสตร์ที่ 1: สร้างโอกาส ความเสมอภาค และความเท่าเทียม', obligation: 'strategic', action: 'จัดทำแผนปฏิบัติการ' },
      { code: 'แผน.2', text: 'ยุทธศาสตร์ที่ 2: ยกระดับคุณภาพการศึกษาและการเรียนรู้ให้มีคุณภาพ', obligation: 'strategic', action: 'พัฒนาคุณภาพการศึกษา' },
      { code: 'แผน.4', text: 'ยุทธศาสตร์ที่ 4: สร้างและพัฒนาศักยภาพทรัพยากรมนุษย์ให้มีคุณภาพ', obligation: 'strategic', action: 'พัฒนาครูและบุคลากร' },
    ],
  },
];

// ─── HorizonSources สำหรับ seed ───────────────────────────────────────────
const OBEC_HORIZON_SOURCES = [
  {
    sourceCode: 'OBEC_OFFICIAL',
    sourceName: 'เว็บไซต์ สพฐ. ข่าวประชาสัมพันธ์',
    sourceType: 'website',
    organizationName: 'สพฐ.',
    baseUrl: 'https://www.obec.go.th/news',
    trustLevel: 0.95,
    fetchFrequency: 'daily',
  },
  {
    sourceCode: 'MOE_OFFICIAL',
    sourceName: 'เว็บไซต์ กระทรวงศึกษาธิการ ข่าวและประกาศ',
    sourceType: 'website',
    organizationName: 'ศธ.',
    baseUrl: 'https://www.moe.go.th/news',
    trustLevel: 0.95,
    fetchFrequency: 'daily',
  },
  {
    sourceCode: 'OBEC_POLICY_DOC',
    sourceName: 'เอกสารนโยบายและจุดเน้น สพฐ.',
    sourceType: 'website',
    organizationName: 'สพฐ.',
    baseUrl: 'https://www.obec.go.th/policy',
    trustLevel: 0.98,
    fetchFrequency: 'weekly',
  },
  {
    sourceCode: 'DLICT_OBEC',
    sourceName: 'สำนักพัฒนานวัตกรรมการจัดการศึกษา สพฐ. (DLICT)',
    sourceType: 'website',
    organizationName: 'สพฐ.',
    baseUrl: 'https://dlict.obec.go.th',
    trustLevel: 0.90,
    fetchFrequency: 'weekly',
  },
  {
    sourceCode: 'MOE_SAFETY',
    sourceName: 'MOE Safety Center — ระบบความปลอดภัย ศธ.',
    sourceType: 'website',
    organizationName: 'ศธ.',
    baseUrl: 'https://www.moesafety.go.th',
    trustLevel: 0.92,
    fetchFrequency: 'daily',
  },
];

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(type?: string) {
    const policies = !type || type === 'policy'
      ? await this.prisma.policyItem.findMany({
          include: { document: true, clauses: { take: 3 } },
          orderBy: { id: 'desc' },
        })
      : [];

    const horizons = !type || type === 'horizon'
      ? await this.prisma.horizonItem.findMany({
          include: { document: true, practices: { take: 3 } },
          orderBy: { id: 'desc' },
        })
      : [];

    return {
      policies: policies.map((p) => this.serializePolicy(p)),
      horizons: horizons.map((h) => this.serializeHorizon(h)),
      total: policies.length + horizons.length,
    };
  }

  async create(dto: CreateKnowledgeDto) {
    // First create a Document to hold the knowledge
    const doc = await this.prisma.document.create({
      data: {
        title: dto.title,
        sourceType: 'manual_entry',
        documentType: dto.type === 'policy' ? 'regulation' : 'best_practice',
        issuingAuthority: dto.issuingAuthority,
        summaryText: dto.summary,
        fullText: dto.fullText,
        trustLevel: 0.9,
        freshnessScore: 1.0,
        publishedAt: new Date(),
      },
    });

    if (dto.type === 'policy') {
      const policy = await this.prisma.policyItem.create({
        data: {
          documentId: doc.id,
          policyType: 'regulation',
          issuingAuthority: dto.issuingAuthority || 'ไม่ระบุ',
          mandatoryLevel: dto.mandatoryLevel || 'recommended',
          effectiveStatus: 'active',
          summaryForAction: dto.summary,
        },
      });

      // Create clause if provided
      if (dto.clauseText) {
        await this.prisma.policyClause.create({
          data: {
            policyItemId: policy.id,
            clauseCode: 'ข้อ 1',
            clauseText: dto.clauseText,
            obligationType: 'mandatory',
          },
        });
      }

      return { type: 'policy', id: Number(policy.id), documentId: Number(doc.id) };
    } else {
      const horizon = await this.prisma.horizonItem.create({
        data: {
          documentId: doc.id,
          itemType: 'practice',
          summary: dto.summary,
          evidenceStrength: 'medium',
        },
      });

      return { type: 'horizon', id: Number(horizon.id), documentId: Number(doc.id) };
    }
  }

  async seedObec(): Promise<{ created: number; skipped: number; policies: string[] }> {
    let created = 0;
    let skipped = 0;
    const names: string[] = [];

    for (const p of OBEC_POLICIES) {
      // Check if already exists by title
      const existing = await this.prisma.document.findFirst({
        where: { title: p.title, sourceType: 'obec_seed' },
      });
      if (existing) { skipped++; continue; }

      const doc = await this.prisma.document.create({
        data: {
          title: p.title,
          sourceType: 'obec_seed',
          documentType: 'regulation',
          issuingAuthority: p.issuingAuthority,
          summaryText: p.summary,
          fullText: p.summary,
          trustLevel: 0.95,
          freshnessScore: 1.0,
          publishedAt: new Date(),
          status: 'active',
        },
      });

      const policy = await this.prisma.policyItem.create({
        data: {
          documentId: doc.id,
          policyType: p.policyType,
          issuingAuthority: p.issuingAuthority,
          jurisdictionLevel: p.jurisdictionLevel,
          mandatoryLevel: p.mandatoryLevel,
          complianceRiskLevel: p.complianceRiskLevel,
          effectiveStatus: 'active',
          summaryForAction: p.summary,
        },
      });

      for (const c of p.clauses) {
        await this.prisma.policyClause.create({
          data: {
            policyItemId: policy.id,
            clauseCode: c.code,
            clauseText: c.text,
            obligationType: c.obligation,
            actionRequired: c.action,
          },
        });
      }

      created++;
      names.push(p.title);
      this.logger.log(`Seeded policy: ${p.title}`);
    }

    return { created, skipped, policies: names };
  }

  async seedHorizonSources(): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;

    for (const s of OBEC_HORIZON_SOURCES) {
      const existing = await this.prisma.horizonSource.findUnique({
        where: { sourceCode: s.sourceCode },
      });
      if (existing) { skipped++; continue; }

      await this.prisma.horizonSource.create({ data: s });
      created++;
      this.logger.log(`Seeded HorizonSource: ${s.sourceName}`);
    }

    return { created, skipped };
  }

  async getStats() {
    const [policyCount, clauseCount, horizonSourceCount, horizonDocCount] = await Promise.all([
      this.prisma.policyItem.count(),
      this.prisma.policyClause.count(),
      this.prisma.horizonSource.count(),
      this.prisma.horizonSourceDocument.count(),
    ]);
    return { policyCount, clauseCount, horizonSourceCount, horizonDocCount };
  }

  async delete(type: string, id: number) {
    if (type === 'policy') {
      await this.prisma.policyClause.deleteMany({
        where: { policyItemId: BigInt(id) },
      });
      await this.prisma.policyItem.delete({ where: { id: BigInt(id) } });
    } else {
      await this.prisma.horizonPractice.deleteMany({
        where: { horizonItemId: BigInt(id) },
      });
      await this.prisma.horizonItem.delete({ where: { id: BigInt(id) } });
    }
    return { deleted: true };
  }

  private serializePolicy(item: any) {
    return {
      type: 'policy',
      id: Number(item.id),
      title: item.document?.title || '',
      summary: item.summaryForAction,
      mandatoryLevel: item.mandatoryLevel,
      complianceRiskLevel: item.complianceRiskLevel,
      effectiveStatus: item.effectiveStatus,
      issuingAuthority: item.issuingAuthority,
      clauseCount: item.clauses?.length || 0,
      documentId: item.documentId ? Number(item.documentId) : null,
    };
  }

  private serializeHorizon(item: any) {
    return {
      type: 'horizon',
      id: Number(item.id),
      title: item.document?.title || '',
      summary: item.summary,
      evidenceStrength: item.evidenceStrength,
      practiceCount: item.practices?.length || 0,
      documentId: item.documentId ? Number(item.documentId) : null,
    };
  }
}
