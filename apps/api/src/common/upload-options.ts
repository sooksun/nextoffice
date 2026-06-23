import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';

const MB = 1024 * 1024;

/** OCR/AI pipeline inputs — scanned documents are PDF or images only. */
export const INTAKE_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

/** Plain attachments (store-only) — documents that are kept, not AI-processed. */
export const ATTACHMENT_MIMES = [
  ...INTAKE_MIMES,
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

/** Signature images. */
export const SIGNATURE_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];

/** Default size caps (kept in sync with the reverse-proxy `client_max_body_size`). */
export const MAX_DOCUMENT_BYTES = 25 * MB;
export const MAX_SIGNATURE_BYTES = 2 * MB;

function makeFileFilter(allowed: string[]): NonNullable<MulterOptions['fileFilter']> {
  return (_req, file, cb) => {
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
      return;
    }
    // Reject before Multer buffers the body — surfaces as a clean 400.
    cb(
      new BadRequestException(
        `ชนิดไฟล์ไม่รองรับ (${file.mimetype || 'unknown'}) — รองรับเฉพาะ: ${allowed.join(', ')}`,
      ),
      false,
    );
  };
}

/**
 * Build Multer options for a single-file upload with a hard size cap and a
 * MIME allow-list. `limits.fileSize` makes Multer abort the stream once the
 * cap is exceeded, so an oversized body is never fully read into memory.
 */
export function singleFileUpload(allowed: string[], maxBytes: number): MulterOptions {
  return {
    limits: {
      fileSize: maxBytes,
      files: 1,
      fields: 20,
    },
    fileFilter: makeFileFilter(allowed),
  };
}

/** PDF/image upload for the OCR pipeline (intake, knowledge import). */
export const intakeUploadOptions: MulterOptions = singleFileUpload(INTAKE_MIMES, MAX_DOCUMENT_BYTES);

/** Broader attachment upload (store-only) — documents kept without AI processing. */
export const attachmentUploadOptions: MulterOptions = singleFileUpload(ATTACHMENT_MIMES, MAX_DOCUMENT_BYTES);

/** Signature image upload — small images only. */
export const signatureUploadOptions: MulterOptions = singleFileUpload(SIGNATURE_MIMES, MAX_SIGNATURE_BYTES);
