/**
 * Shared render model for outbound DOCX + PDF.
 * One source of truth for field stripping, signer, date, and letter-type recipients.
 */

export const OUTBOUND_RENDER_INCLUDE = {
  organization: { select: { name: true, address: true, phone: true, orgCode: true } },
  approvedBy: { select: { fullName: true, positionTitle: true } },
  createdBy: { select: { fullName: true, positionTitle: true } },
  relatedInboundCase: {
    select: {
      assignedTo: { select: { fullName: true, positionTitle: true } },
    },
  },
} as const;

export type OutboundPerson = {
  fullName: string | null;
  positionTitle: string | null;
};

export type OutboundOrgSnapshot = {
  name: string | null;
  address: string | null;
  phone: string | null;
  orgCode: string | null;
};

/** Document shape after load with OUTBOUND_RENDER_INCLUDE */
export type OutboundRenderSource = {
  id: bigint;
  organizationId: bigint;
  letterType: string | null;
  documentNo: string | null;
  documentDate: Date | null;
  subject: string;
  bodyText: string | null;
  recipientName: string | null;
  recipientOrg: string | null;
  organization: OutboundOrgSnapshot | null;
  approvedBy: OutboundPerson | null;
  createdBy: OutboundPerson | null;
  relatedInboundCase: {
    assignedTo: OutboundPerson | null;
  } | null;
};

export type OutboundRenderModel = {
  id: number;
  organizationId: number;
  letterType: string;
  documentNo: string | null;
  dateStr: string;
  /** Bare subject for templates that prepend "เรื่อง" */
  subject: string;
  /** Subject for PDF display (never empty) */
  subjectDisplay: string;
  /** เรียน … (name preferred) */
  recipientName: string | undefined;
  /** ถึง … for stamp letters: org preferred */
  recipientStamp: string | undefined;
  /** Default line: name ?? org (never empty for PDF) */
  recipientDisplay: string;
  body: string;
  bodyOrUndefined: string | undefined;
  signer: OutboundPerson | null;
  org: OutboundOrgSnapshot | null;
};

export function stripFieldPrefix(
  text: string | null | undefined,
  prefixRegexSource: string,
): string | null {
  if (!text) return null;
  const re = new RegExp(`^\\s*${prefixRegexSource}[\\s:：]+`, 'i');
  const cleaned = String(text).replace(re, '').trim();
  return cleaned || null;
}

export function formatThaiDate(date: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    const buddhistYear = date.getFullYear() + 543;
    const thaiMonths = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
    ];
    return `${date.getDate()} ${thaiMonths[date.getMonth()]} ${buddhistYear}`;
  }
}

/**
 * internal_memo: assignee signs (not director who assigned).
 * other types: approver, else creator.
 */
export function getOutboundSigner(doc: OutboundRenderSource): OutboundPerson | null {
  const assignee = doc.relatedInboundCase?.assignedTo ?? null;
  if (doc.letterType === 'internal_memo') {
    return assignee ?? doc.approvedBy ?? doc.createdBy ?? null;
  }
  return doc.approvedBy ?? doc.createdBy ?? null;
}

export function toOutboundRenderModel(doc: OutboundRenderSource): OutboundRenderModel {
  const recipientName =
    stripFieldPrefix(doc.recipientName, '(?:เรียน|ถึง)') ?? undefined;
  const recipientOrg = stripFieldPrefix(doc.recipientOrg, 'ถึง') ?? undefined;
  const subjectBare = stripFieldPrefix(doc.subject, 'เรื่อง') ?? '';
  const dateSource = doc.documentDate ?? new Date();

  return {
    id: Number(doc.id),
    organizationId: Number(doc.organizationId),
    letterType: doc.letterType ?? 'external_letter',
    documentNo: doc.documentNo,
    dateStr: formatThaiDate(dateSource),
    subject: subjectBare,
    subjectDisplay: subjectBare || '-',
    recipientName,
    recipientStamp: recipientOrg ?? recipientName,
    recipientDisplay: recipientName ?? recipientOrg ?? '-',
    body: doc.bodyText?.trim() || '-',
    bodyOrUndefined: doc.bodyText ?? undefined,
    signer: getOutboundSigner(doc),
    org: doc.organization,
  };
}
