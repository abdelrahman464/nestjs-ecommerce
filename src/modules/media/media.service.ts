import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { isDuplicateKeyError } from '../../common/utils/mongo-error.util';
import { MEDIA_PUBLIC_ID_PREFIX } from './media.constants';
import { MediaAsset, MediaAssetDocument } from './schemas/media-asset.schema';
import { CryptoService } from '../../common/security/crypto.service';
import { OBJECT_STORAGE, ObjectStorage } from './storage/object-storage';

export type AcquiredAsset = {
  url: string;
  publicId: string;
  reused: boolean;
};

/**
 * Asset lifecycle. Catalog modules call acquire/release — never Cloudinary.
 *
 * Resource rules:
 * 1. Hash first. Identical bytes → increment refCount, skip upload.
 * 2. Store one original (content-addressed public_id). Thumbs = URL transforms.
 * 3. Destroy remote object only when refCount hits 0.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @InjectModel(MediaAsset.name)
    private readonly assetModel: Model<MediaAssetDocument>,
    private readonly cryptoService: CryptoService,
  ) {}

  async acquire(file: Express.Multer.File): Promise<AcquiredAsset> {
    if (!file?.buffer?.length) {
      throw new I18nHttpException(HttpStatus.BAD_REQUEST, 'file.empty');
    }

    const hash = this.cryptoService.createSha256Hash(file.buffer);
    const existing = await this.assetModel.findOne({ hash }).exec();
    if (existing) {
      existing.refCount += 1;
      await existing.save();
      this.logger.debug(
        `media reuse hash=${hash.slice(0, 8)} refs=${existing.refCount}`,
      );
      return {
        url: existing.url,
        publicId: existing.publicId,
        reused: true,
      };
    }

    const publicId = `${MEDIA_PUBLIC_ID_PREFIX}/${hash}`;
    const stored = await this.storage.putImage({
      buffer: file.buffer,
      mime: file.mimetype,
      publicId,
    });

    try {
      await this.assetModel.create({
        hash,
        publicId: stored.publicId,
        url: stored.url,
        bytes: stored.bytes,
        mime: stored.mime,
        width: stored.width,
        height: stored.height,
        refCount: 1,
      });
    } catch (err) {
      // Concurrent first-upload of the same bytes — the winner's row exists.
      if (isDuplicateKeyError(err)) {
        const raced = await this.assetModel.findOne({ hash }).exec();
        if (raced) {
          raced.refCount += 1;
          await raced.save();
          return {
            url: raced.url,
            publicId: raced.publicId,
            reused: true,
          };
        }
      }
      throw err;
    }

    this.logger.debug(`media stored publicId=${stored.publicId}`);
    return { url: stored.url, publicId: stored.publicId, reused: false };
  }

  async release(publicId: string | undefined): Promise<void> {
    if (!publicId?.trim()) return;

    const updated = await this.assetModel
      .findOneAndUpdate(
        { publicId },
        { $inc: { refCount: -1 } },
        { new: true },
      )
      .exec();

    if (!updated) {
      // Legacy row (uploaded before the registry) — still delete remote.
      await this.storage.delete(publicId);
      return;
    }

    if (updated.refCount > 0) return;

    await this.storage.delete(updated.publicId);
    await this.assetModel.deleteOne({ _id: updated._id }).exec();
  }

  async releaseMany(publicIds: string[]): Promise<void> {
    const unique = [...new Set(publicIds.filter(Boolean))];
    await Promise.all(unique.map((id) => this.release(id)));
  }
}
