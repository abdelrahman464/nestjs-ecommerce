import {
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Public } from 'src/common/decorators/public.decorator';
import { FileSignatureValidator } from 'src/common/files/validators/file-signature.validator';
import { createParseFilePipe } from 'src/common/files/file-validation.factory';

type File = Express.Multer.File;
@Public()
@Controller('files-upload')
export class FilesUploadController {
  @Post('single')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSingleFile(
    @UploadedFile(
      createParseFilePipe('3MB', [
        'jpeg',
        'png',
        'jpg',
        'webp',
        'pdf',
        'doc',
        'docx',
      ]),
    )
    file: File,
  ) {
    return file;
  }

  @Post('multiple')
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadMultipleFiles(
    @UploadedFiles(createParseFilePipe('3MB', ['jpeg', 'png']))
    files: File[],
  ) {
    return files;
  }
}
