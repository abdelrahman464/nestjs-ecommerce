import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CryptoService } from '../../common/security/crypto.service';
import { EntityMediaService } from './entity-media.service';
import { MediaService } from './media.service';
import { MediaAsset, MediaAssetSchema } from './schemas/media-asset.schema';
import { CloudinaryStorage } from './storage/cloudinary.storage';
import { OBJECT_STORAGE } from './storage/object-storage';

/**
 * Media bounded context.
 * - No public dump endpoint (upload only while attaching to a resource).
 * - OBJECT_STORAGE is the only Cloudinary coupling.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MediaAsset.name, schema: MediaAssetSchema },
    ]),
  ],
  providers: [
    CryptoService,
    CloudinaryStorage,
    { provide: OBJECT_STORAGE, useExisting: CloudinaryStorage },
    MediaService,
    EntityMediaService,
  ],
  exports: [MediaService, EntityMediaService],
})
export class MediaModule {}
