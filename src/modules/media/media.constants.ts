import { createParseFilePipe } from '../../common/files/file-validation.factory';
import { FileType } from '../../common/files/types/file.types';

/** One original per unique file: nest-ecommerce/assets/{sha256} */
export const MEDIA_PUBLIC_ID_PREFIX = 'nest-ecommerce/assets';

export const MAX_GALLERY_IMAGES = 10;

export const IMAGE_MIME_TYPES: FileType[] = ['jpeg', 'png', 'jpg', 'webp'];

export const IMAGE_UPLOAD_PIPE = createParseFilePipe('3MB', IMAGE_MIME_TYPES);
