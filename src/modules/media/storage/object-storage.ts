export type PutImageInput = {
  buffer: Buffer;
  mime: string;
  /** Content-addressed id, e.g. nest-ecommerce/assets/{sha256} */
  publicId: string;
};

export type StoredObject = {
  publicId: string;
  url: string;
  bytes: number;
  mime: string;
  width?: number;
  height?: number;
};

/**
 * Port (hexagonal): domain never imports Cloudinary.
 * Swap to S3/R2 later by providing another adapter on OBJECT_STORAGE.
 */
export interface ObjectStorage {
  putImage(input: PutImageInput): Promise<StoredObject>;
  delete(publicId: string): Promise<boolean>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
