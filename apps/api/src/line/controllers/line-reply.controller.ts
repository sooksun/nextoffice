import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { LineMessagingService } from '../services/line-messaging.service';

@ApiTags('line')
@Controller('line')
export class LineReplyController {
  constructor(private readonly messaging: LineMessagingService) {}

  @Post('reply/test')
  @ApiOperation({ summary: 'Test reply message (internal use)' })
  @ApiBody({
    schema: {
      example: {
        replyToken: 'xxx',
        messages: [{ type: 'text', text: 'ทดสอบการตอบกลับ' }],
      },
    },
  })
  async testReply(@Body() body: { replyToken: string; messages: any[] }) {
    await this.messaging.reply(body.replyToken, body.messages);
    return { ok: true };
  }

  @Post('push')
  @ApiOperation({ summary: 'Push message to LINE user' })
  @ApiBody({
    schema: {
      example: {
        lineUserId: 'Uxxxxxxxx',
        messages: [{ type: 'text', text: 'มีผลวิเคราะห์เอกสารใหม่' }],
      },
    },
  })
  async pushMessage(@Body() body: { lineUserId: string; messages: any[] }) {
    await this.messaging.push(body.lineUserId, body.messages);
    return { ok: true };
  }
}
