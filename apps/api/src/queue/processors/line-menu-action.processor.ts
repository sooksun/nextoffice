import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiApiService } from '../../gemini/gemini-api.service';
import { LineMessagingService } from '../../line/services/line-messaging.service';
import { LineSessionService } from '../../line/services/line-session.service';
import { PolicyRagService } from '../../rag/services/policy-rag.service';
import { HorizonRagService } from '../../rag/services/horizon-rag.service';
import { QUEUE_LINE_EVENTS } from '../queue.constants';

export type MenuActionCode =
  | 'summarize'
  | 'translate'
  | 'extract_key'
  | 'draft_reply'
  | 'create_memo'
  | 'assign_task'
  | 'save_reference'
  | 'freeform';

const TEXT_TO_ACTION: Record<string, MenuActionCode> = {
  'สรุปเอกสาร': 'summarize',
  'แปลเอกสาร': 'translate',
  'ดึงสาระสำคัญ': 'extract_key',
  'ร่างข้อความตอบ': 'draft_reply',
  'ร่างตอบ': 'draft_reply',
  'สร้างบันทึกเสนอ': 'create_memo',
  'มอบหมายงาน': 'assign_task',
  'เก็บเป็นเอกสารอ้างอิง': 'save_reference',
};

@Processor(QUEUE_LINE_EVENTS)
export class LineMenuActionProcessor {
  private readonly logger = new Logger(LineMenuActionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: LineMessagingService,
    private readonly sessions: LineSessionService,
    private readonly policyRag: PolicyRagService,
    private readonly horizonRag: HorizonRagService,
    private readonly gemini: GeminiApiService,
  ) {}

  @Process('line.menu.action')
  async handle(job: Job<{ lineEventId: string }>) {
    const eventId = BigInt(job.data.lineEventId);
    this.logger.log(`Processing line.menu.action for event ${eventId}`);

    const event = await this.prisma.lineEvent.findUnique({ where: { id: eventId } });
    if (!event) return;

    const payload = JSON.parse(event.rawPayloadJson);
    const replyToken: string = payload.replyToken;
    const text: string = payload.message?.text?.trim() || '';

    if (!replyToken || !text) return;

    const actionCode: MenuActionCode = TEXT_TO_ACTION[text] ?? 'freeform';

    // Resolve LINE user from DB
    const lineUser = await this.prisma.lineUser.findUnique({
      where: { lineUserId: event.lineUserId },
    });

    // Pull document context from the user's active conversation session
    let docExtractedText = '';
    let docSubject = text;
    let sessionId: bigint | null = null;

    if (lineUser) {
      const session = await this.sessions.getActiveSession(lineUser.id);
      if (session) {
        sessionId = session.id;

        if (session.documentIntakeId) {
          const intake = await this.prisma.documentIntake.findUnique({
            where: { id: session.documentIntakeId },
            include: { aiResult: true },
          });

          if (intake?.aiResult) {
            docExtractedText = intake.aiResult.extractedText || '';
            docSubject =
              intake.aiResult.subjectText ||
              intake.aiResult.summaryText?.substring(0, 200) ||
              docExtractedText.substring(0, 200) ||
              text;
          }
        }
      }
    }

    // save_reference: no LLM needed — just tag the intake and confirm
    if (actionCode === 'save_reference') {
      await this.handleSaveReference(sessionId, replyToken, eventId, event.lineUserId);
      return;
    }

    // RAG: search both Policy and Horizon stores with document subject as query
    const [policyResults, horizonResults] = await Promise.all([
      this.policyRag.search(docSubject, 3),
      this.horizonRag.search(docSubject, 3),
    ]);

    const ragContext = [
      ...policyResults.map((p) => `[นโยบาย] ${p.title}: ${p.summary || ''}`),
      ...horizonResults.map((h) => `[แนวโน้ม] ${h.title}: ${h.summary || ''}`),
    ]
      .filter(Boolean)
      .join('\n');

    // Build action-specific prompt and call Claude
    const prompt = this.buildPrompt(actionCode, text, docExtractedText, docSubject, ragContext);
    let aiReply = '';
    try {
      aiReply = await this.callGemini(prompt);
    } catch (err) {
      this.logger.error(`Claude call failed: ${err.message}`);
      aiReply = 'ขออภัย ระบบ AI ไม่สามารถประมวลผลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง';
    }

    // Persist what the user did in this session
    if (sessionId) {
      await this.sessions.recordAction(sessionId, actionCode, text);
    }

    await this.prisma.lineEvent.update({
      where: { id: eventId },
      data: { receiveStatus: 'processed', processedAt: new Date() },
    });

    const totalRagHits = policyResults.length + horizonResults.length;
    await this.messaging.replyOrPush(
      replyToken,
      event.lineUserId,
      this.messaging.buildRagActionReply(actionCode, aiReply, totalRagHits),
    );
  }

  // ─── helpers ──────────────────────────────────────────────────────────────

  private async handleSaveReference(
    sessionId: bigint | null,
    replyToken: string,
    eventId: bigint,
    lineUserId: string,
  ) {
    if (sessionId) {
      await this.sessions.recordAction(sessionId, 'save_reference', 'เก็บเป็นเอกสารอ้างอิง');

      const session = await this.prisma.lineConversationSession.findUnique({
        where: { id: sessionId },
      });
      if (session?.documentIntakeId) {
        await this.prisma.documentIntake.update({
          where: { id: session.documentIntakeId },
          data: { aiStatus: 'reference_saved' },
        });
      }
    }

    await this.prisma.lineEvent.update({
      where: { id: eventId },
      data: { receiveStatus: 'processed', processedAt: new Date() },
    });

    await this.messaging.replyOrPush(replyToken, lineUserId, [
      this.messaging.buildTextMessage('✅ บันทึกเอกสารเป็นเอกสารอ้างอิงเรียบร้อยแล้ว'),
    ]);
  }

  private buildPrompt(
    action: MenuActionCode,
    userText: string,
    docText: string,
    subject: string,
    ragContext: string,
  ): string {
    const docSection = docText
      ? `\n\n--- เนื้อหาเอกสาร ---\n${docText.substring(0, 1500)}\n---`
      : '';
    const ragSection = ragContext
      ? `\n\n--- ข้อมูลอ้างอิง (RAG) ---\n${ragContext}\n---`
      : '';
    const base = docSection + ragSection;

    const prompts: Record<MenuActionCode, string> = {
      summarize:
        `คุณเป็นผู้ช่วยสรุปเอกสารราชการไทย ` +
        `สรุปเอกสารต่อไปนี้เป็นภาษาไทยให้กระชับ ชัดเจน ไม่เกิน 200 คำ${base}`,

      translate:
        `คุณเป็นนักแปลเอกสาร ` +
        `แปลเอกสารต่อไปนี้เป็นภาษาไทยให้ถูกต้องและเป็นธรรมชาติ${base}`,

      extract_key:
        `คุณเป็นผู้ช่วยวิเคราะห์เอกสารราชการ ` +
        `ดึงสาระสำคัญจากเอกสารนี้เป็นข้อๆ ภาษาไทย ` +
        `ระบุ: ประเด็นหลัก, การดำเนินการที่ต้องทำ, กำหนดเวลา${base}`,

      draft_reply:
        `คุณเป็นผู้เชี่ยวชาญด้านการเขียนหนังสือราชการไทย ` +
        `ร่างหนังสือตอบกลับอย่างเป็นทางการ สำหรับเรื่อง: ${subject}${base}`,

      create_memo:
        `คุณเป็นผู้เชี่ยวชาญด้านการเขียนบันทึกข้อความราชการไทย ` +
        `ร่างบันทึกข้อความเสนอ (internal memo) สำหรับเรื่อง: ${subject}${base}`,

      assign_task:
        `คุณเป็นที่ปรึกษาการบริหารงาน ` +
        `วิเคราะห์เอกสารและเสนอแนะการมอบหมายงาน ` +
        `ระบุ: ผู้รับผิดชอบ, งานที่ต้องทำ, กำหนดเวลาที่แนะนำ${base}`,

      freeform:
        `ตอบคำถาม/คำขอต่อไปนี้เป็นภาษาไทย: ${userText}${base}`,

      save_reference: '',
    };

    return prompts[action];
  }

  private async callGemini(prompt: string): Promise<string> {
    if (!this.gemini.getApiKey()) throw new Error('GEMINI_API_KEY not configured');
    return (
      (await this.gemini.generateText({
        user: prompt,
        maxOutputTokens: 1024,
        temperature: 0.4,
      })) || ''
    );
  }
}
