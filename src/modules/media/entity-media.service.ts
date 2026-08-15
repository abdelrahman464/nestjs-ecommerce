import { HttpStatus, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { MAX_GALLERY_IMAGES } from './media.constants';
import {
  EntityMediaStore,
  MediaLeanDoc,
} from './entity-media.store';
import { MediaService } from './media.service';

export type SingleImageFields = {
  urlField: string;
  publicIdField: string;
};

export type GalleryImageFields = {
  urlsField: string;
  publicIdsField: string;
  max?: number;
};

/**
 * Attach / detach media on any catalog document.
 * Persistence goes through EntityMediaStore (the entity repository).
 * Acquire before persist, release after persist.
 */
@Injectable()
export class EntityMediaService {
  constructor(private readonly media: MediaService) {}

  async replaceSingle(
    store: EntityMediaStore,
    id: Types.ObjectId,
    file: Express.Multer.File,
    fields: SingleImageFields,
    notFoundKey: string,
  ): Promise<void> {
    const doc = await this.load(
      store,
      id,
      `+${fields.publicIdField}`,
      notFoundKey,
    );
    const previousId = this.asString(doc[fields.publicIdField]);
    const acquired = await this.media.acquire(file);
    if (previousId === acquired.publicId) {
      await this.media.release(acquired.publicId);
      return;
    }

    await store.setFields(id, {
      [fields.urlField]: acquired.url,
      [fields.publicIdField]: acquired.publicId,
    });

    if (previousId && previousId !== acquired.publicId) {
      await this.media.release(previousId);
    }
  }

  async clearSingle(
    store: EntityMediaStore,
    id: Types.ObjectId,
    fields: SingleImageFields,
    notFoundKey: string,
  ): Promise<void> {
    const doc = await this.load(
      store,
      id,
      `+${fields.publicIdField}`,
      notFoundKey,
    );
    const publicId = this.asString(doc[fields.publicIdField]);
    if (!publicId) return;

    await store.unsetFields(id, [fields.urlField, fields.publicIdField]);
    await this.media.release(publicId);
  }

  async destroySingleStored(
    store: EntityMediaStore,
    id: Types.ObjectId,
    fields: SingleImageFields,
  ): Promise<void> {
    const doc = await store.findById(id, `+${fields.publicIdField}`);
    if (!doc) return;

    const publicId = this.asString(doc[fields.publicIdField]);
    if (!publicId) return;
    await this.media.release(publicId);
  }

  async appendToGallery(
    store: EntityMediaStore,
    id: Types.ObjectId,
    file: Express.Multer.File,
    fields: GalleryImageFields,
    notFoundKey: string,
  ): Promise<void> {
    const doc = await this.load(
      store,
      id,
      `+${fields.publicIdsField}`,
      notFoundKey,
    );
    const max = fields.max ?? MAX_GALLERY_IMAGES;
    const images = [...this.asStringArray(doc[fields.urlsField])];
    const publicIds = [...this.asStringArray(doc[fields.publicIdsField])];

    if (images.length >= max) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'file.tooManyImages',
        { max },
      );
    }

    const acquired = await this.media.acquire(file);
    if (images.includes(acquired.url)) {
      await this.media.release(acquired.publicId);
      return;
    }

    images.push(acquired.url);
    publicIds.push(acquired.publicId);
    await store.setFields(id, {
      [fields.urlsField]: images,
      [fields.publicIdsField]: publicIds,
    });
  }

  async appendManyToGallery(
    store: EntityMediaStore,
    id: Types.ObjectId,
    files: Express.Multer.File[],
    fields: GalleryImageFields,
    notFoundKey: string,
  ): Promise<void> {
    if (!files?.length) {
      throw new I18nHttpException(HttpStatus.BAD_REQUEST, 'file.empty');
    }
    for (const file of files) {
      await this.appendToGallery(store, id, file, fields, notFoundKey);
    }
  }

  async removeFromGallery(
    store: EntityMediaStore,
    id: Types.ObjectId,
    url: string,
    fields: GalleryImageFields,
    notFoundKey: string,
  ): Promise<void> {
    const trimmed = url?.trim();
    if (!trimmed) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'file.imageUrlRequired',
      );
    }

    const doc = await this.load(
      store,
      id,
      `+${fields.publicIdsField}`,
      notFoundKey,
    );
    const images = [...this.asStringArray(doc[fields.urlsField])];
    const publicIds = [...this.asStringArray(doc[fields.publicIdsField])];

    const index = images.indexOf(trimmed);
    if (index === -1) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'file.imageNotFound');
    }

    images.splice(index, 1);
    const [removedPublicId] = publicIds.splice(index, 1);

    await store.setFields(id, {
      [fields.urlsField]: images,
      [fields.publicIdsField]: publicIds,
    });

    await this.media.release(removedPublicId);
  }

  async destroyGalleryStored(
    store: EntityMediaStore,
    id: Types.ObjectId,
    fields: GalleryImageFields,
  ): Promise<void> {
    const doc = await store.findById(id, `+${fields.publicIdsField}`);
    if (!doc) return;

    await this.media.releaseMany(
      this.asStringArray(doc[fields.publicIdsField]).filter(Boolean),
    );
  }

  private async load(
    store: EntityMediaStore,
    id: Types.ObjectId,
    extraSelect: string,
    notFoundKey: string,
  ): Promise<MediaLeanDoc> {
    const doc = await store.findById(id, extraSelect);
    if (!doc || doc.deletedAt) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, notFoundKey, {
        id: id.toString(),
      });
    }
    return doc;
  }

  private asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value : undefined;
  }

  private asStringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((v): v is string => typeof v === 'string')
      : [];
  }
}
