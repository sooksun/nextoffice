import { Injectable, Logger } from '@nestjs/common';
import { FileStorageService } from '../../intake/services/file-storage.service';

@Injectable()
export class StampStorageService {
  private readonly logger = new Logger(StampStorageService.name);

  constructor(private readonly fileStorage: FileStorageService) {}

  getPath(intakeId: number): string {
    return `stamped/${intakeId}/stamped.pdf`;
  }

  async save(intakeId: number, buffer: Buffer): Promise<void> {
    await this.fileStorage.saveBuffer(this.getPath(intakeId), buffer, 'application/pdf');
    this.logger.log(`Stamped PDF saved for intake #${intakeId}`);
  }

  /** Returns null if no stamped PDF exists yet (does not throw). */
  async get(intakeId: number): Promise<Buffer | null> {
    try {
      return await this.fileStorage.getBuffer(this.getPath(intakeId));
    } catch {
      return null;
    }
  }
}
