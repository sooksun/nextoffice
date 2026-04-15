import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as Minio from 'minio';

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private client: Minio.Client;
  private bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = config.get('MINIO_BUCKET', 'nextoffice');
    this.client = new Minio.Client({
      endPoint: config.get('MINIO_ENDPOINT', 'localhost'),
      port: config.get<number>('MINIO_PORT', 9000),
      useSSL: config.get('MINIO_USE_SSL', 'false') === 'true',
      accessKey: config.get('MINIO_ACCESS_KEY', 'minioadmin'),
      secretKey: config.get('MINIO_SECRET_KEY', 'minioadmin'),
    });
    this.ensureBucket();
  }

  private async ensureBucket() {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket, 'ap-southeast-1');
        this.logger.log(`Created MinIO bucket: ${this.bucket}`);
      }
    } catch (err) {
      this.logger.warn(`MinIO not available: ${err.message}`);
    }
  }

  async saveBuffer(objectPath: string, buffer: Buffer, contentType: string): Promise<string> {
    try {
      await this.client.putObject(this.bucket, objectPath, buffer, buffer.length, {
        'Content-Type': contentType,
      });
      return `${this.bucket}/${objectPath}`;
    } catch (err) {
      this.logger.error(`Failed to save to MinIO: ${err.message}`);
      throw err;
    }
  }

  async getBuffer(objectPath: string): Promise<Buffer> {
    const stream = await this.client.getObject(this.bucket, objectPath);
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  async presignedUrl(objectPath: string, expirySeconds = 3600): Promise<string> {
    try {
      return await this.client.presignedGetObject(this.bucket, objectPath, expirySeconds);
    } catch (err) {
      this.logger.error(`Failed to generate presigned URL: ${err.message}`);
      throw err;
    }
  }

  async deleteFile(objectPath: string): Promise<void> {
    try {
      await this.client.removeObject(this.bucket, objectPath);
    } catch (err) {
      this.logger.warn(`Failed to delete from MinIO (${objectPath}): ${err.message}`);
      throw err;
    }
  }

  computeSha256(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  buildStoragePath(
    sourceChannel: string,
    mimeType: string,
    intakeId: string,
  ): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const ext = mimeType.includes('pdf') ? 'pdf' : 'jpg';
    return `${sourceChannel}/${year}/${month}/${intakeId}.${ext}`;
  }

  /**
   * Build standard filename per Thai saraban regulation (ฉบับที่ 4):
   * Format: {buddhistYear}_{orgCode}_{sequence}.{ext}
   * Example: 2568_SKN_0001.pdf
   */
  buildStandardFileName(opts: {
    orgCode: string;
    registrationNo: string;
    mimeType?: string;
  }): string {
    const ext = opts.mimeType?.includes('pdf') ? 'pdf' : 'pdf';
    // registrationNo format: "001/2568" → extract seq and year
    const parts = opts.registrationNo.split('/');
    const seq = parts[0] ?? '0001';
    const year = parts[1] ?? String(new Date().getFullYear() + 543);
    const code = opts.orgCode || 'ORG';
    return `${year}_${code}_${seq.padStart(4, '0')}.${ext}`;
  }
}
