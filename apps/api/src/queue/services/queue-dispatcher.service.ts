import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  QUEUE_LINE_EVENTS,
  QUEUE_FILE_INTAKE,
  QUEUE_AI_PROCESSING,
} from '../queue.constants';

@Injectable()
export class QueueDispatcherService {
  private readonly logger = new Logger(QueueDispatcherService.name);

  constructor(
    @InjectQueue(QUEUE_LINE_EVENTS) private readonly lineEventsQueue: Queue,
    @InjectQueue(QUEUE_FILE_INTAKE) private readonly fileIntakeQueue: Queue,
    @InjectQueue(QUEUE_AI_PROCESSING) private readonly aiQueue: Queue,
  ) {}

  async dispatchLineIntake(lineEventId: bigint) {
    await this.lineEventsQueue.add('line.intake.received', {
      lineEventId: lineEventId.toString(),
    });
    this.logger.log(`Dispatched line.intake.received for event ${lineEventId}`);
  }

  async dispatchLineMenuAction(lineEventId: bigint) {
    await this.lineEventsQueue.add('line.menu.action', {
      lineEventId: lineEventId.toString(),
    });
    this.logger.log(`Dispatched line.menu.action for event ${lineEventId}`);
  }

  async dispatchStoreFile(documentIntakeId: bigint) {
    await this.fileIntakeQueue.add('intake.store.file', {
      documentIntakeId: documentIntakeId.toString(),
    });
  }

  async dispatchDriveBackup(documentIntakeId: bigint) {
    await this.fileIntakeQueue.add('intake.backup.drive', {
      documentIntakeId: documentIntakeId.toString(),
    });
  }

  async dispatchOcr(documentIntakeId: bigint) {
    await this.aiQueue.add('ai.ocr.extract', {
      documentIntakeId: documentIntakeId.toString(),
    });
  }

  async dispatchClassify(documentIntakeId: bigint) {
    await this.aiQueue.add('ai.classify.document', {
      documentIntakeId: documentIntakeId.toString(),
    });
  }

  async dispatchOfficialProcess(documentIntakeId: bigint) {
    await this.aiQueue.add('ai.official.process', {
      documentIntakeId: documentIntakeId.toString(),
    });
  }

  async dispatchNonOfficialClarify(documentIntakeId: bigint) {
    await this.aiQueue.add('ai.nonofficial.clarify', {
      documentIntakeId: documentIntakeId.toString(),
    });
  }

  async dispatchSessionHandleAction(sessionId: bigint, actionCode: string) {
    await this.aiQueue.add('line.session.handle-action', {
      sessionId: sessionId.toString(),
      actionCode,
    });
  }
}
