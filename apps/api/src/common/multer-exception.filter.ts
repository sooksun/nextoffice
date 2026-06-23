import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { MulterError } from 'multer';
import { Response } from 'express';

/**
 * Translate Multer errors (raised before the route handler runs) into clean
 * HTTP responses instead of generic 500s. Size-limit hits return 413.
 */
@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(err: MulterError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const isTooLarge = err.code === 'LIMIT_FILE_SIZE';
    const status = isTooLarge ? HttpStatus.PAYLOAD_TOO_LARGE : HttpStatus.BAD_REQUEST;
    const message = isTooLarge
      ? 'ไฟล์มีขนาดใหญ่เกินกำหนด'
      : `อัปโหลดไฟล์ไม่สำเร็จ: ${err.message}`;
    res.status(status).json({ statusCode: status, error: err.code, message });
  }
}
