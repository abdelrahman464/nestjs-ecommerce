import { FileValidator } from '@nestjs/common/pipes/file/file-validator.interface';
import magicBytes from 'magic-bytes.js';

export class FileSignatureValidator extends FileValidator {
  constructor() {
    super({});
  }

  buildErrorMessage(file: any): string {
    return `validation field (file type does not match file signature)`;
  }
  isValid(file: any): boolean {
    try {
      const guessedFileSignatures = magicBytes(file.buffer).map(
        (file) => file.mime,
      );
      if (!guessedFileSignatures.length) return false;
      if (!guessedFileSignatures.includes(file.mimetype)) return false;
      return true;
    } catch (error) {
      return false;
    }
  }
}
