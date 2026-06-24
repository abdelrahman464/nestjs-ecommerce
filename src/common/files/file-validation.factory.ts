import {
  FileValidator,
  FileTypeValidator,
  HttpStatus,
  MaxFileSizeValidator,
  ParseFilePipe,
  UnprocessableEntityException,
} from '@nestjs/common';
import { FileSignatureValidator } from './validators/file-signature.validator';
import { FileSizeType, FileType } from './types/file.types';
import { lookup } from 'mime-types';
import * as bytes from 'bytes';

const createFileTypeRegex = (fileType: FileType[]): RegExp => {
  // input: ['jpeg', 'gpg']
  // after map -> output: ["image/jpeg",false]
  // after filter -> output: ['image/jpeg']
  const mimeTypes = fileType
    .map((type) => lookup(type))
    .filter((mimeType) => mimeType !== false);
  return new RegExp(`(${mimeTypes.join('|')})`);
};

const createFileValidators = (
  maxSize: FileSizeType,
  fileType: FileType[],
): FileValidator[] => {
  const fileTypeRegex = createFileTypeRegex(fileType);
  return [
    new MaxFileSizeValidator({
      maxSize: bytes(maxSize),
      message: (maxSize: number) => {
        return `File size is too large please upload a smaller file (max size is ${bytes(maxSize)} )`;
      },
    }),
    new FileTypeValidator({
      fileType: fileTypeRegex,
      skipMagicNumbersValidation: true,
    }),
    new FileSignatureValidator(),
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