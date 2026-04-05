import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UploadedFile,
  UseInterceptors,
  ParseIntPipe,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { IntakeService } from '../services/intake.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('intake')
@Controller('intake')
export class IntakeController {
  constructor(private readonly svc: IntakeService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload file from LIFF/web (image or PDF)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        organizationId: { type: 'number' },
        sourceChannel: { type: 'string', default: 'liff_upload' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body('organizationId') organizationId?: string,
    @Body('sourceChannel') sourceChannel?: string,
  ) {
    return this.svc.createFromUpload(
      file,
      organizationId ? Number(organizationId) : undefined,
      sourceChannel || 'liff_upload',
    );
  }

  @Post('web-upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Upload + OCR + Classify + Extract ทันที (synchronous)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async webUpload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    if (!file) {
      throw new BadRequestException('กรุณาเลือกไฟล์');
    }
    return this.svc.webUploadAndAnalyze(
      file,
      user.organizationId ? Number(user.organizationId) : undefined,
      Number(user.id),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document intake status' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findById(id);
  }

  @Get(':id/result')
  @ApiOperation({ summary: 'Get AI analysis result for intake' })
  getResult(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getResult(id);
  }

  @Get()
  @ApiOperation({ summary: 'List all document intakes with filters' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'sourceChannel', required: false })
  @ApiQuery({ name: 'classificationLabel', required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listIntakes(@Query() query: any) {
    return this.svc.listIntakes(query);
  }
}
