import {
  FileValidator,
  HttpStatus,
  MaxFileSizeValidator,
  ParseFilePipe,
  UnprocessableEntityException,
} from '@nestjs/common';
import * as bytes from 'bytes';
import { FileSizeType, FileType } from './types/file.types';
import { FileSignatureValidator } from './validators/file-signature.validator';

const createFileValidators = (
  maxSize: FileSizeType,
  fileType: FileType[],
): FileValidator[] => {
  return [
    new MaxFileSizeValidator({
      maxSize: bytes(maxSize),
      message: (maxSizeBytes: number) => {
        return `File size is too large please upload a smaller file (max size is ${bytes(maxSizeBytes)} )`;
      },
    }),
    // Intentionally NO Nest FileTypeValidator — it trusts client mimetype
    // (often application/octet-stream). Signature validator is the real gate.
    new FileSignatureValidator(fileType),
  ];
};

export const createParseFilePipe = (
  maxSize: FileSizeType,
  fileType: FileType[],
): ParseFilePipe =>
  new ParseFilePipe({
    validators: createFileValidators(maxSize, fileType),
    errorHttpStatusCode: HttpStatus.UNSUPPORTED_MEDIA_TYPE,
    exceptionFactory: (errors: string) => {
      return new UnprocessableEntityException(errors);
    },
    fileIsRequired: true,
  });
