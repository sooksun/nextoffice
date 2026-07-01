import { Injectable, BadRequestException } from '@nestjs/common';
import { LeaveService } from '../../attendance/services/leave.service';
import { TravelService } from '../../attendance/services/travel.service';
import { ExtractedFields } from './document-intent.service';
import {
  DocType,
  DOC_SPECS,
  LEAVE_TYPE_LABEL,
} from '../document/document-spec';
import {
  bangkokTodayIso,
  daysBetweenInclusive,
  toThaiDisplay,
} from '../document/date.util';

/**
 * ข้อมูลที่ระบบมีอยู่แล้วของผู้ใช้ปัจจุบัน — ดึงจาก request.user (JWT) ไม่ใช่จาก LLM.
 * userId/organizationId มาจาก token เท่านั้น (กัน IDOR — AI ห้ามกำหนดเอง).
 */
export interface AutoFillContext {
  userId: number;
  organizationId: number | null;
  fullName: string;
  positionTitle: string | null;
  phone: string | null;
  org: {
    name: string | null;
    address: string | null;
    province: string | null;
    district: string | null;
    phone: string | null;
  } | null;
}

export interface MissingField {
  key: string;
  label: string;
}

export interface FilledField {
  key: string;
  label: string;
  value: string;
}

export interface DocumentDraftResult {
  kind: 'document_draft';
  docType: DocType;
  docLabel: string;
  draftId: number;
  /** หน้าฟอร์มปลายทางพร้อม ?draftId= (frontend redirect ตรง ๆ ได้) */
  formUrl: string;
  missingFields: MissingField[];
  filledFields: FilledField[];
  /** คำเตือนที่ไม่บล็อกการสร้าง draft (เช่น วันลาคงเหลือไม่พอ) */
  warnings: string[];
  /** ข้อความยืนยันสำหรับแสดงใน chat bubble */
  message: string;
}

@Injectable()
export class DocumentDraftService {
  constructor(
    private readonly leaveSvc: LeaveService,
    private readonly travelSvc: TravelService,
  ) {}

  async build(
    docType: DocType,
    fields: ExtractedFields,
    ctx: AutoFillContext,
    now: Date,
  ): Promise<DocumentDraftResult> {
    const orgId = ctx.organizationId;
    if (orgId == null) {
      // ป้องกันเชิงลึก — controller ควร guard ก่อนแล้ว
      throw new BadRequestException('บัญชีนี้ยังไม่ได้ผูกกับหน่วยงาน');
    }
    return docType === 'leave'
      ? this.buildLeave(fields, ctx, orgId, now)
      : this.buildTravel(fields, ctx, orgId, now);
  }

  // ─── Leave ────────────────────────────────────────────────────────────

  private async buildLeave(
    fields: ExtractedFields,
    ctx: AutoFillContext,
    orgId: number,
    now: Date,
  ): Promise<DocumentDraftResult> {
    const spec = DOC_SPECS.leave;
    const today = bangkokTodayIso(now);
    const missing: MissingField[] = [];

    // ── required-from-user fields ──
    const leaveType = fields.leaveType; // canonical | null
    if (!leaveType) missing.push(this.field(spec, 'leaveType'));

    const startMissing = !fields.startDate;
    if (startMissing) missing.push(this.field(spec, 'startDate'));
    const effectiveStart = fields.startDate ?? today;

    // endDate: ถ้าไม่ระบุ → ถือเป็นลาวันเดียว (= วันเริ่ม), ไม่นับว่าขาด
    // ถ้าระบุแต่ก่อนวันเริ่ม → invalid → นับว่าขาด แล้ว clamp เป็นวันเริ่ม
    // clamp เฉพาะเมื่อมี "วันเริ่มจริง" — ถ้า startMissing ยังไม่มีอะไรให้เทียบ
    // (effectiveStart เป็น placeholder today) จึงต้องเก็บ endDate ของผู้ใช้ไว้ ไม่ทิ้ง
    let effectiveEnd = fields.endDate ?? effectiveStart;
    if (!startMissing && fields.endDate && fields.endDate < effectiveStart) {
      missing.push(this.field(spec, 'endDate'));
      effectiveEnd = effectiveStart;
    }

    const totalDays = daysBetweenInclusive(effectiveStart, effectiveEnd);

    // ── system autofill (user-stated value ชนะค่าจากระบบ — E8) ──
    const positionTitle = ctx.positionTitle ?? undefined;
    const contactPhone = fields.contactPhone ?? ctx.phone ?? undefined;
    const contactAddress =
      fields.contactAddress ?? this.composeOrgAddress(ctx.org) ?? undefined;

    const draft = await this.leaveSvc.create(ctx.userId, orgId, {
      leaveType: leaveType ?? '', // placeholder กัน NOT NULL — ถูก flag ใน missing
      startDate: effectiveStart,
      endDate: effectiveEnd,
      totalDays,
      reason: fields.reason ?? undefined,
      contactPhone,
      contactAddress,
      positionTitle,
    });

    // ── summary (เฉพาะค่าที่กรอกได้จริง) ──
    const filled: FilledField[] = [];
    if (leaveType) {
      filled.push({ key: 'leaveType', label: 'ประเภทการลา', value: LEAVE_TYPE_LABEL[leaveType] });
    }
    if (!startMissing) {
      const range =
        effectiveEnd !== effectiveStart
          ? `${toThaiDisplay(effectiveStart)} – ${toThaiDisplay(effectiveEnd)} (${totalDays} วัน)`
          : `${toThaiDisplay(effectiveStart)} (1 วัน)`;
      filled.push({ key: 'dateRange', label: 'ช่วงวันลา', value: range });
    }
    if (fields.reason) filled.push({ key: 'reason', label: 'เหตุผล', value: fields.reason });
    if (positionTitle) filled.push({ key: 'positionTitle', label: 'ตำแหน่ง', value: positionTitle });
    if (contactPhone) filled.push({ key: 'contactPhone', label: 'เบอร์ติดต่อ', value: contactPhone });
    if (contactAddress) {
      filled.push({ key: 'contactAddress', label: 'ที่อยู่ติดต่อ', value: contactAddress });
    }

    // ── warning: วันลาคงเหลือไม่พอ (ไม่บล็อก — เตือนเฉย ๆ ตาม business rule เดิม) ──
    const warnings: string[] = [];
    if (leaveType) {
      try {
        const balances = await this.leaveSvc.getBalance(ctx.userId);
        const bal = balances.find((b) => b.leaveType === leaveType);
        if (bal && bal.remaining < totalDays) {
          warnings.push(
            `${LEAVE_TYPE_LABEL[leaveType]}คงเหลือ ${bal.remaining} วัน แต่คำขอนี้ ${totalDays} วัน อาจไม่เพียงพอ`,
          );
        }
      } catch {
        // เช็ค balance ล้มเหลว — ข้าม (ไม่กระทบการสร้าง draft)
      }
    }

    return this.result('leave', spec, Number(draft.id), missing, filled, warnings);
  }

  // ─── Travel ───────────────────────────────────────────────────────────

  private async buildTravel(
    fields: ExtractedFields,
    ctx: AutoFillContext,
    orgId: number,
    now: Date,
  ): Promise<DocumentDraftResult> {
    const spec = DOC_SPECS.travel;
    const today = bangkokTodayIso(now);
    const missing: MissingField[] = [];

    if (!fields.travelDate) missing.push(this.field(spec, 'travelDate'));
    const travelDate = fields.travelDate ?? today;

    if (!fields.destination) missing.push(this.field(spec, 'destination'));
    if (!fields.purpose) missing.push(this.field(spec, 'purpose'));

    const draft = await this.travelSvc.create(ctx.userId, orgId, {
      travelDate,
      destination: fields.destination ?? '', // placeholder กัน NOT NULL
      purpose: fields.purpose ?? '',
      departureTime: fields.departureTime ?? undefined,
      returnTime: fields.returnTime ?? undefined,
      // ส่งต่อเจตนา "ค้างคืน/ไป-กลับ" ที่ผู้ใช้ระบุ (null = ปล่อย default true)
      returnSameDay: fields.returnSameDay ?? undefined,
    });

    const filled: FilledField[] = [];
    if (fields.travelDate) {
      filled.push({ key: 'travelDate', label: 'วันที่เดินทาง', value: toThaiDisplay(travelDate) });
    }
    if (fields.destination) {
      filled.push({ key: 'destination', label: 'จุดหมาย', value: fields.destination });
    }
    if (fields.purpose) filled.push({ key: 'purpose', label: 'วัตถุประสงค์', value: fields.purpose });
    if (fields.departureTime) {
      filled.push({ key: 'departureTime', label: 'เวลาออก', value: fields.departureTime });
    }
    if (fields.returnTime) filled.push({ key: 'returnTime', label: 'เวลากลับ', value: fields.returnTime });
    if (fields.returnSameDay !== null) {
      filled.push({
        key: 'returnSameDay',
        label: 'การพักค้าง',
        value: fields.returnSameDay ? 'ไป-กลับวันเดียว' : 'ค้างคืน',
      });
    }

    return this.result('travel', spec, Number(draft.id), missing, filled);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  private field(spec: (typeof DOC_SPECS)[DocType], key: string): MissingField {
    const f = spec.fields.find((x) => x.key === key);
    return { key, label: f?.label ?? key };
  }

  private composeOrgAddress(org: AutoFillContext['org']): string | null {
    if (!org) return null;
    if (org.address && org.address.trim()) return org.address.trim();
    const parts = [org.district, org.province].filter((p) => p && p.trim());
    return parts.length ? parts.join(' ') : null;
  }

  private result(
    docType: DocType,
    spec: (typeof DOC_SPECS)[DocType],
    draftId: number,
    missing: MissingField[],
    filled: FilledField[],
    warnings: string[] = [],
  ): DocumentDraftResult {
    // ส่ง key ของฟิลด์ที่ขาดไปด้วย — หน้าฟอร์มต้อง "ข้าม" prefill ฟิลด์เหล่านี้
    // เพราะค่าที่ persist ไว้ (เช่นวันที่ = placeholder วันนี้) ไม่ใช่ค่าจริงที่ผู้ใช้ต้องการ
    const missingQs = missing.length
      ? `&missing=${missing.map((m) => encodeURIComponent(m.key)).join(',')}`
      : '';
    const formUrl = `${spec.formUrl}?draftId=${draftId}${missingQs}`;
    const message =
      missing.length === 0
        ? `ร่าง${spec.label}ให้เรียบร้อยแล้ว ✅ กดเปิดเพื่อตรวจสอบและส่งได้เลย`
        : `ร่าง${spec.label}ให้แล้ว แต่ยังขาดข้อมูล: ${missing
            .map((m) => m.label)
            .join(', ')} — กรุณากรอกเพิ่มในหน้าฟอร์ม`;
    return {
      kind: 'document_draft',
      docType,
      docLabel: spec.label,
      draftId,
      formUrl,
      missingFields: missing,
      filledFields: filled,
      warnings,
      message,
    };
  }
}
