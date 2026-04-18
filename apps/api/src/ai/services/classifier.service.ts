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
    if (heuristicScore >= 0.7) {
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
      { pattern: /ที่\s+\w+\/\d+/, weight: 0.25 },
      { pattern: /เรื่อง\s+.+/, weight: 0.2 },
      { pattern: /เรียน\s+.+/, weight: 0.2 },
      { pattern: /ด้วย\s+.+/, weight: 0.15 },
      { pattern: /จึงเรียนมาเพื่อ|จึงเรียน|ขอแสดงความนับถือ/, weight: 0.2 },
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
        })) || '{}';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] || '{}');

      const confidence = parsed.confidence || 0;
      let label: ClassificationResult['classificationLabel'] = 'unknown';
      if (parsed.is_official_document === true) {
        label = confidence >= 0.75 ? 'official_letter' : 'possibly_official';
      } else if (parsed.is_official_document === false) {
        label = confidence >= 0.85 ? 'non_official' : 'possibly_official';
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
      return { isOfficialDocument: null, classificationLabel: 'unknown', classificationConfidence: 0 };
    }
  }
}
