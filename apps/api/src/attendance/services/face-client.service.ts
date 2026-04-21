import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class FaceClientService {
  private readonly logger = new Logger(FaceClientService.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get('FACE_SERVICE_URL', 'http://localhost:8500');
  }

  async registerFace(userId: number, imageBase64: string): Promise<{
    success: boolean;
    faceId: string | null;
    confidence: number;
    message: string;
  }> {
    try {
      const res = await axios.post(`${this.baseUrl}/faces/register`, {
        user_id: String(userId),
        image_base64: imageBase64,
      }, { timeout: 30000 });
      return {
        success: res.data.success,
        faceId: res.data.face_id,
        confidence: res.data.confidence,
        message: res.data.message,
      };
    } catch (err) {
      this.logger.error(`Face register failed: ${err.message}`);
      return { success: false, faceId: null, confidence: 0, message: 'Face service unavailable' };
    }
  }

  async verifyFace(userId: number, imageBase64: string): Promise<{
    matched: boolean;
    similarity: number;
    confidence: number;
    message: string;
  }> {
    try {
      const res = await axios.post(`${this.baseUrl}/faces/verify`, {
        user_id: String(userId),
        image_base64: imageBase64,
      }, { timeout: 15000 });
      return {
        matched: res.data.matched,
        similarity: res.data.similarity,
        confidence: res.data.confidence,
        message: res.data.message,
      };
    } catch (err) {
      const detail = err.response?.data?.detail ?? err.message;
      this.logger.error(`Face verify failed: ${detail}`);
      return { matched: false, similarity: 0, confidence: 0, message: 'Face service unavailable' };
    }
  }

  async deleteFace(userId: number): Promise<boolean> {
    try {
      const res = await axios.delete(`${this.baseUrl}/faces/${userId}`, { timeout: 5000 });
      return res.data?.deleted === true;
    } catch (err) {
      this.logger.warn(`Face delete failed for user ${userId}: ${err.message}`);
      return false;
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.baseUrl}/health`, { timeout: 5000 });
      return res.data?.status === 'ok';
    } catch {
      return false;
    }
  }

  // ── V2: Enrollment ────────────────────────────────────────────────────────

  async enrollFrame(
    userId: number,
    orgId: number,
    imageBase64: string,
    templateNo: number,
    livenessCheck = false,
  ): Promise<{
    success: boolean;
    pointId?: string;
    quality?: Record<string, unknown>;
    liveness?: Record<string, unknown>;
    reason?: string;
    reasons?: string[];
  }> {
    try {
      const res = await axios.post(`${this.baseUrl}/enrollment/upload-frame`, {
        user_id: String(userId),
        org_id: String(orgId),
        image_base64: imageBase64,
        template_no: templateNo,
        liveness_check: livenessCheck,
      }, { timeout: 30000 });
      return {
        success: res.data.success,
        pointId: res.data.point_id,
        quality: res.data.quality,
        liveness: res.data.liveness,
        reason: res.data.reason,
        reasons: res.data.reasons,
      };
    } catch (err) {
      this.logger.error(`Enroll frame failed: ${err.message}`);
      return { success: false, reason: 'Face service unavailable' };
    }
  }

  async deactivatePersonTemplates(orgId: number, userId: number): Promise<boolean> {
    try {
      await axios.delete(`${this.baseUrl}/enrollment/persons/${orgId}/${userId}`, { timeout: 10000 });
      return true;
    } catch (err) {
      this.logger.warn(`Deactivate person failed: ${err.message}`);
      return false;
    }
  }

  // ── V2: Scan ──────────────────────────────────────────────────────────────

  async scanVerify(
    orgId: number,
    frames: string[],
    config: Record<string, unknown> = {},
    livenessCheck = false,
  ): Promise<{
    decision: 'accepted' | 'review' | 'rejected';
    reasonCodes: string[];
    top1UserId: string | null;
    top1Score: number | null;
    top2UserId: string | null;
    top2Score: number | null;
    scoreMargin: number | null;
    qualityScore: number | null;
    livenessScore: number | null;
  }> {
    try {
      const res = await axios.post(`${this.baseUrl}/scan/verify`, {
        org_id: String(orgId),
        frames,
        liveness_check: livenessCheck,
        config,
      }, { timeout: 20000 });
      const d = res.data;
      return {
        decision: d.decision,
        reasonCodes: d.reason_codes ?? [],
        top1UserId: d.top1_user_id ?? null,
        top1Score: d.top1_score ?? null,
        top2UserId: d.top2_user_id ?? null,
        top2Score: d.top2_score ?? null,
        scoreMargin: d.score_margin ?? null,
        qualityScore: d.quality_score ?? null,
        livenessScore: d.liveness_score ?? null,
      };
    } catch (err) {
      this.logger.error(`Scan verify failed: ${err.message}`);
      return {
        decision: 'rejected',
        reasonCodes: ['FACE_SERVICE_UNAVAILABLE'],
        top1UserId: null, top1Score: null, top2UserId: null, top2Score: null,
        scoreMargin: null, qualityScore: null, livenessScore: null,
      };
    }
  }
}
