import { Module } from '@nestjs/common';
import { OutboundController } from './outbound.controller';
import { OutboundService } from './outbound.service';
import { QueueModule } from '../queue/queue.module';
import { DigitalSignatureModule } from '../digital-signature/digital-signature.module';
import { IntakeModule } from '../intake/intake.module';
import { TemplatesModule } from '../templates/templates.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [QueueModule, DigitalSignatureModule, IntakeModule, TemplatesModule, AuthModule],
  controllers: [OutboundController],
  providers: [OutboundService],
  exports: [OutboundService],
})
export class OutboundModule {}
