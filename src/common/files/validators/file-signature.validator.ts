import { FileValidator } from '@nestjs/common/pipes/file/file-validator.interface';
import { lookup } from 'mime-types';
import magicBytes from 'magic-bytes.js';
import { FileType } from '../types/file.types';

/**
 * Trust file *content* (magic bytes), not the client-reported mimetype.
 *
 * Why: Postman / some browsers send `application/octet-stream` for images.
 * Nest's FileTypeValidator then fails even though the file is a real JPEG/PNG.
 *
 * Flow:
 * 1) Read the first bytes → guess real MIME (e.g. image/jpeg)
 * 2) Accept only if that MIME is in the allowed list for this endpoint
 * 3) Overwrite file.mimetype with the detected value (helps Cloudinary / logs)
 */
export class FileSignatureValidator extends FileValidator<{
  allowedTypes: FileType[];
}> {
  private readonly allowedMimes: string[];

  constructor(allowedTypes: FileType[]) {
    super({ allowedTypes });
    this.allowedMimes = allowedTypes
      .map((type) => lookup(type))
      .filter((mime): mime is string => typeof mime === 'string');
  }

  buildErrorMessage(): string {
    return `File type is not allowed. Expected one of: ${this.allowedMimes.join(', ')} (detected from file content, not the upload Content-Type)`;
  }

  isValid(file: Express.Multer.File): boolean {
    try {
      if (!file?.buffer?.length) return false;

      // magic-bytes.js inspects the buffer header (FF D8… = jpeg, 89 50 4E 47 = png, …)
      const detected = magicBytes(file.buffer)
        .map((hit) => hit.mime)
        .filter((mime): mime is string => Boolean(mime));

      if (!detected.length) return false;

      const matched = detected.find((mime) => this.allowedMimes.includes(mime));
      if (!matched) return false;

      // Client said application/octet-stream — rewrite so the rest of the app
      // (Cloudinary, logs) sees the real type.
      file.mimetype = matched;
      return true;
    } catch {
      return false;
    }
  }
}
