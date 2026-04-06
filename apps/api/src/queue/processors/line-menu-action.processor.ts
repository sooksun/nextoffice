import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiApiService } from '../../gemini/gemini-api.service';
import { LineMessagingService } from '../../line/services/line-messaging.service';
import { LineSessionService } from '../../line/services/line-session.service';
import { PolicyRagService } from '../../rag/services/policy-rag.service';
import { HorizonRagService } from '../../rag/services/horizon-rag.service';
import { SystemPromptsService } from '../../system-prompts/system-prompts.service';
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

/** จับข้อความอิสระที่ผู้ใช้พิมพ์ (ไม่ตรงปุ่ม Quick Reply) */
function resolveMenuAction(trimmedText: string): MenuActionCode {
  const exact = TEXT_TO_ACTION[trimmedText];
  if (exact) return exact;
  const t = trimmedText;
  if (t.startsWith('สรุป')) return 'summarize';
  if (t.startsWith('แปล')) return 'translate';
  if (/ดึงสาระ|สาระสำคัญ/.test(t) && /ดึง|ขอ|เอา/.test(t)) return 'extract_key';
  return 'freeform';
}

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
    private readonly prompts: SystemPromptsService,
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

    const actionCode: MenuActionCode = resolveMenuAction(text);

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

    const needsDocBody =
      actionCode === 'summarize' ||
      actionCode === 'translate' ||
      actionCode === 'extract_key';

    let aiReply = '';
    if (needsDocBody && !docExtractedText.trim()) {
      aiReply =
        'ยังไม่มีเนื้อหาเอกสารในเซสชันนี้ กรุณาส่งไฟล์แล้วรอให้บอทวิเคราะห์จนมีข้อความสรุปหนังสือราชการก่อน จากนั้นค่อยกดปุ่มสรุป/แปล/ดึงสาระสำคัญ หรือพิมพ์ "สรุป..." อีกครั้ง';
    } else {
      try {
        const prompt = await this.buildPrompt(actionCode, text, docExtractedText, docSubject, ragContext);
        aiReply = await this.callGemini(prompt, actionCode);
      } catch (err) {
        this.logger.error(`Gemini call failed: ${err.message}`);
        aiReply = 'ขออภัย ระบบ AI ไม่สามารถประมวลผลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง';
      }
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

  private async buildPrompt(
    action: MenuActionCode,
    userText: string,
    docText: string,
    subject: string,
    ragContext: string,
  ): Promise<string> {
    if (action === 'save_reference') return '';

    const docSection = docText
      ? `\n\n--- เนื้อหาเอกสาร ---\n${docText.substring(0, 1500)}\n---`
      : '';
    const ragSection = ragContext
      ? `\n\n--- ข้อมูลอ้างอิง (RAG) ---\n${ragContext}\n---`
      : '';

    const promptKey = action === 'extract_key' ? 'action.extract_key' : `action.${action}`;
    const p = await this.prompts.get(promptKey);

    return p.promptText
      .replace('{{user_text}}', userText)
      .replace('{{subject}}', subject)
      .replace('{{doc_section}}', docSection)
      .replace('{{rag_section}}', ragSection);
  }

  private async callGemini(prompt: string, action: MenuActionCode): Promise<string> {
    if (!this.gemini.getApiKey()) throw new Error('GEMINI_API_KEY not configured');
    const promptKey = action === 'extract_key' ? 'action.extract_key' : `action.${action}`;
    const p = await this.prompts.get(promptKey);
    return (
      (await this.gemini.generateText({
        user: prompt,
        maxOutputTokens: p.maxTokens,
        temperature: p.temperature,
      })) || ''
    );
  }
}
