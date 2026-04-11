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

  async checkHealth(): Promise<boolean> {
    try {
      const res = await axios.get(`${this.baseUrl}/health`, { timeout: 5000 });
      return res.data?.status === 'ok';
    } catch {
      return false;
    }
  }
}
