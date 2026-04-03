import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { OcrService } from './ocr.service';

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
    private readonly config: ConfigService,
    private readonly ocrService: OcrService,
  ) {}

  async classifyDocument(
    extractedText: string,
    fileMeta: { mimeType: string; originalFileName?: string },
  ): Promise<ClassificationResult> {
    // Layer 1: Heuristic check
    const heuristicScore = this.heuristicCheck(extractedText);
    if (heuristicScore >= 0.9) {
      return {
        isOfficialDocument: true,
        classificationLabel: 'official_letter',
        classificationConfidence: heuristicScore,
        reasoningSummary: 'Heuristic: Thai official document structure detected',
      };
    }

    // Layer 2: LLM Classifier
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
    const apiKey = this.config.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return { isOfficialDocument: null, classificationLabel: 'unknown', classificationConfidence: 0 };
    }

    const prompt = `You are an expert Thai government document classifier.
Analyze the following extracted text and determine if it is an official Thai government letter (หนังสือราชการ).

Text:
${extractedText.substring(0, 3000)}

Respond ONLY with valid JSON in this exact format:
{
  "is_official_document": true/false/null,
  "confidence": 0.0-1.0,
  "document_subtype": "request_letter|circular|announcement|report|other",
  "reasoning_summary": "brief explanation in English"
}`;

    try {
      const res = await axios.post(
        'https://api.anthropic.com/v1/messages',
        {
          model: this.config.get('CLAUDE_MODEL', 'claude-sonnet-4-6'),
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        },
        {
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json',
          },
        },
      );

      const rawText = res.data?.content?.[0]?.text || '{}';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch?.[0] || '{}');

      const confidence = parsed.confidence || 0;
      let label: ClassificationResult['classificationLabel'] = 'unknown';
      if (parsed.is_official_document === true) {
        label = confidence >= 0.85 ? 'official_letter' : 'possibly_official';
      } else if (parsed.is_official_document === false) {
        label = 'non_official';
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
