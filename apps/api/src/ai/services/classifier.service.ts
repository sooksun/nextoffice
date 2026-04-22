import { Injectable, Logger } from '@nestjs/common';
import { OcrService } from './ocr.service';
import { GeminiApiService } from '../../gemini/gemini-api.service';
import { SystemPromptsService } from '../../system-prompts/system-prompts.service';

export interface ClassificationResult {
  isOfficialDocument: boolean | null;
  classificationLabel: 'official_letter' | 'possibly_official' | 'non_official' | 'unknown';
  classificationConfidence: number;
  documentSubtype?: string;
  reasoningSummary?: string;
}

@Injectable()
export class ClassifierService {
  private readonly logger = new Logger(ClassifierService.name);

  constructor(
    private readonly ocrService: OcrService,
    private readonly gemini: GeminiApiService,
    private readonly prompts: SystemPromptsService,
  ) {}

  async classifyDocument(
    extractedText: string,
    fileMeta: { mimeType: string; originalFileName?: string },
  ): Promise<ClassificationResult> {
    const heuristicScore = this.heuristicCheck(extractedText);
    if (heuristicScore >= 0.6) {
      return {
        isOfficialDocument: true,
        classificationLabel: 'official_letter',
        classificationConfidence: heuristicScore,
        reasoningSummary: 'Heuristic: Thai official document structure detected',
      };
    }
    return this.llmClassify(extractedText, fileMeta);
  }

  private heuristicCheck(text: string): number {
    const indicators = [
      // Document number: "ที่ ศธ 0200/ว123", "ที่ กสศ./1234", "ที่ พิเศษ/...", "ที่ .../..."
      { pattern: /ที่\s*[\u0E00-\u0E7Fa-zA-Z.\s]+\/[\u0E00-\u0E7F\w\s]*\d+/, weight: 0.25 },
      { pattern: /เรื่อง\s+.+/, weight: 0.2 },
      { pattern: /เรียน\s+.+/, weight: 0.2 },
      { pattern: /จึงเรียนมาเพื่อ|จึงเรียน(?!มา)|ขอแสดงความนับถือ|ด้วยความนับถือ/, weight: 0.2 },
      // Government agency indicators (expanded)
      { pattern: /กระทรวง|สำนักงาน|กรม(?:การ|ส่งเสริม|พัฒนา|ควบคุม|สรรพ|ท่อง)?|สพฐ\.|สพป\.|สพม\.|กสศ\.|กพฐ\.|โรงเรียน|เทศบาล|องค์การบริหาร|อำเภอ|จังหวัด/, weight: 0.15 },
      // Thai Buddhist-era date: "๒๐ มีนาคม ๒๕๖๙" or "20 มีนาคม 2569"
      { pattern: /\d{1,2}\s+(มกราคม|กุมภาพันธ์|มีนาคม|เมษายน|พฤษภาคม|มิถุนายน|กรกฎาคม|สิงหาคม|กันยายน|ตุลาคม|พฤศจิกายน|ธันวาคม)\s+\d{4}/, weight: 0.1 },
      // Government position titles
      { pattern: /ผู้อำนวยการ|อธิบดี|ปลัด(?:กระทรวง|เทศบาล)?|ผู้ว่าราชการ|นายกเทศมนตรี|นายกองค์การ|รองผู้อำนวยการ|ผู้ช่วยผู้อำนวยการ|ศึกษาธิการ/, weight: 0.1 },
      // Thai official document header keywords
      { pattern: /บันทึกข้อความ/, weight: 0.25 },
      { pattern: /^ประกาศ[\s\u0E00-\u0E7F]/m, weight: 0.2 },
      { pattern: /^คำสั่ง[\s\u0E00-\u0E7F]/m, weight: 0.2 },
      // "ด้วย" at start of paragraph — nearly universal in Thai official docs
      { pattern: /(?:^|\n)\s*ด้วย[^ด]/, weight: 0.15 },
    ];
    let score = 0;
    for (const { pattern, weight } of indicators) {
      if (pattern.test(text)) score += weight;
    }
    return Math.min(score, 1);
  }

  private async llmClassify(
    extractedText: string,
    fileMeta: { mimeType: string },
  ): Promise<ClassificationResult> {
    if (!this.gemini.getApiKey()) {
      return { isOfficialDocument: null, classificationLabel: 'unknown', classificationConfidence: 0 };
    }

    const p = await this.prompts.get('classify.llm');
    const prompt = p.promptText.replace('{{extracted_text}}', extractedText.substring(0, 3000));

    try {
      const rawText =
        (await this.gemini.generateText({
          user: prompt,
          maxOutputTokens: p.maxTokens,
          temperature: p.temperature,
          disableThinking: true, // JSON task
        })) || '{}';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] || '{}');

      const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0;
      // Normalize LLM boolean — may come as string "true"/"false"
      const isOfficialRaw = parsed.is_official_document;
      const isOfficialBool =
        isOfficialRaw === true || isOfficialRaw === 'true'
          ? true
          : isOfficialRaw === false || isOfficialRaw === 'false'
          ? false
          : null;

      let label: ClassificationResult['classificationLabel'] = 'unknown';
      if (isOfficialBool === true) {
        label = confidence >= 0.75 ? 'official_letter' : 'possibly_official';
      } else if (isOfficialBool === false) {
        label = confidence >= 0.85 ? 'non_official' : 'possibly_official';
      } else {
        // LLM returned ambiguous/null — lenient: treat as possibly_official
        label = 'possibly_official';
      }

      return {
        isOfficialDocument: label === 'official_letter' || label === 'possibly_official',
        classificationLabel: label,
        classificationConfidence: confidence,
        documentSubtype: parsed.document_subtype,
        reasoningSummary: parsed.reasoning_summary,
      };
    } catch (err) {
      this.logger.error(`LLM classification failed: ${err.message}`);
      // On error, default to possibly_official (lenient — false negative is worse than false positive)
      return { isOfficialDocument: true, classificationLabel: 'possibly_official', classificationConfidence: 0.3 };
    }
  }
}
