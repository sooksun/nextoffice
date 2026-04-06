import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import {
  QUEUE_LINE_EVENTS,
  QUEUE_FILE_INTAKE,
  QUEUE_AI_PROCESSING,
  QUEUE_HORIZON,
} from '../queue.constants';

@Injectable()
export class QueueDispatcherService {
  private readonly logger = new Logger(QueueDispatcherService.name);

  constructor(
    @InjectQueue(QUEUE_LINE_EVENTS) private readonly lineEventsQueue: Queue,
    @InjectQueue(QUEUE_FILE_INTAKE) private readonly fileIntakeQueue: Queue,
    @InjectQueue(QUEUE_AI_PROCESSING) private readonly aiQueue: Queue,
    @InjectQueue(QUEUE_HORIZON) private readonly horizonQueue: Queue,
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

  // ── Horizon Intelligence Pipeline ──

  async dispatchHorizonFetchAll() {
    await this.horizonQueue.add('horizon.fetch.sources', { all: true });
    this.logger.log('Dispatched horizon.fetch.sources (all)');
  }

  async dispatchHorizonFetchSource(sourceId: bigint) {
    await this.horizonQueue.add('horizon.fetch.sources', {
      sourceId: sourceId.toString(),
    });
    this.logger.log(`Dispatched horizon.fetch.sources for source ${sourceId}`);
  }

  async dispatchHorizonParse(documentId: bigint) {
    await this.horizonQueue.add('horizon.parse.documents', {
      documentId: documentId.toString(),
    });
  }

  async dispatchHorizonExtract(documentId: bigint) {
    await this.horizonQueue.add('horizon.extract.intelligence', {
      documentId: documentId.toString(),
    });
  }

  async dispatchHorizonScore(agendaId?: bigint) {
    await this.horizonQueue.add('horizon.score.agendas', {
      agendaId: agendaId?.toString() ?? null,
    });
  }

  async dispatchHorizonPublish(documentId: bigint) {
    await this.horizonQueue.add('horizon.publish.rag', {
      documentId: documentId.toString(),
    });
  }

  async dispatchHorizonFullPipeline() {
    await this.horizonQueue.add('horizon.fetch.sources', {
      all: true,
      fullPipeline: true,
    });
    this.logger.log('Dispatched horizon full pipeline');
  }

  // ── Knowledge Vault ──

  async dispatchVaultNoteGenerate(caseId: bigint, trigger: string) {
    await this.aiQueue.add('vault.note.generate', {
      caseId: caseId.toString(),
      trigger,
    });
    this.logger.log(`Dispatched vault.note.generate for case ${caseId} (trigger: ${trigger})`);
  }

  async dispatchVaultSync(organizationId: bigint) {
    await this.aiQueue.add('vault.sync.batch', {
      organizationId: organizationId.toString(),
    });
    this.logger.log(`Dispatched vault.sync.batch for org ${organizationId}`);
  }
}
