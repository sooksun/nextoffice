import { PDFDocument, PDFName, PDFDict } from 'pdf-lib';
import { PdfStampService } from './pdf-stamp.service';

// A guaranteed-valid PNG produced by the same canvas lib the app uses.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createCanvas } = require('@napi-rs/canvas');
function tinyPng(): Buffer {
  const c = createCanvas(4, 4);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 4, 4);
  return c.toBuffer('image/png');
}
const PNG = tinyPng();

function canvasStub(): any {
  return {
    computeEndorsementHeight: () => 50,
    computeDirectorNoteHeight: () => 50,
    renderRegistration: () => PNG,
    renderEndorsement: async () => PNG,
    renderDirectorNote: async () => PNG,
  };
}

function emptySpaceStub(signaturePageIndex: number): any {
  return {
    findStampZones: async (_pdf: Buffer, specs: any[]) => ({
      zones: specs.map(() => ({ x: 10, y: 100, w: 100, h: 50 })),
      signaturePageIndex,
      isImagePdf: false,
    }),
  };
}

async function twoPagePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

/** True if the page's Resources contain at least one XObject (i.e. a drawn image). */
function pageHasImage(page: any): boolean {
  const res = page.node.Resources();
  if (!res) return false;
  const xobj = res.lookup(PDFName.of('XObject'));
  return xobj instanceof PDFDict && xobj.keys().length > 0;
}

const REGISTRATION = { orgName: 'รร.ทดสอบ', registrationNo: '1/2569', registeredAt: new Date() };
const ENDORSEMENT = {
  schoolName: 'รร.ทดสอบ',
  aiSummary: '',
  actionSummary: '',
  authorName: 'ธุรการ',
  stampedAt: new Date(),
};
const DIRECTOR_NOTE = { noteText: 'อนุมัติ', authorName: 'ผอ.', stampedAt: new Date() };
const ZONE = { x: 10, y: 100, w: 100, h: 50 };

describe('PdfStampService — signature-page placement', () => {
  it('applyAllStamps returns the detected signaturePageIndex', async () => {
    const svc = new PdfStampService(emptySpaceStub(1), canvasStub());
    const res = await svc.applyAllStamps(await twoPagePdf(), {
      registration: REGISTRATION,
      endorsement: ENDORSEMENT,
    });
    expect(res.signaturePageIndex).toBe(1);
  });

  it('applyStamp3Only draws the director stamp on the signature page (page 2), not page 1', async () => {
    const svc = new PdfStampService(emptySpaceStub(1), canvasStub());
    const out = await svc.applyStamp3Only(await twoPagePdf(), DIRECTOR_NOTE, ZONE, 1, 1);
    const doc = await PDFDocument.load(out);
    expect(pageHasImage(doc.getPages()[1])).toBe(true); // page 2 got the stamp
    expect(pageHasImage(doc.getPages()[0])).toBe(false); // page 1 did NOT
  });

  it('applyStamp3Only defaults to page 1 when signaturePageIndex is omitted (backward compat)', async () => {
    const svc = new PdfStampService(emptySpaceStub(0), canvasStub());
    const out = await svc.applyStamp3Only(await twoPagePdf(), DIRECTOR_NOTE, ZONE, 1);
    const doc = await PDFDocument.load(out);
    expect(pageHasImage(doc.getPages()[0])).toBe(true);
    expect(pageHasImage(doc.getPages()[1])).toBe(false);
  });
});
