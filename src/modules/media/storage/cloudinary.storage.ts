import { HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  UploadApiErrorResponse,
  UploadApiResponse,
  v2 as cloudinary,
} from 'cloudinary';
import { I18nHttpException } from '../../../common/filters/i18n-http.exception';
import {
  ObjectStorage,
  PutImageInput,
  StoredObject,
} from './object-storage';

/**
 * Cloudinary adapter — store ONE compressed original.
 * No eager thumbs (those are URL transforms on read: f_auto,q_auto,w_800).
 */
@Injectable()
export class CloudinaryStorage implements ObjectStorage, OnModuleInit {
  private readonly logger = new Logger(CloudinaryStorage.name);
  private ready = false;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const cloudName = this.config.get<string>('cloudinary.cloudName') ?? '';
    const apiKey = this.config.get<string>('cloudinary.apiKey') ?? '';
    const apiSecret = this.config.get<string>('cloudinary.apiSecret') ?? '';

    if (!cloudName || !apiKey || !apiSecret) {
      this.logger.warn(
        'Cloudinary not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.',
      );
      return;
    }

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
    this.ready = true;
    this.logger.log(`Object storage ready provider=cloudinary cloud=${cloudName}`);
  }

  async putImage(input: PutImageInput): Promise<StoredObject> {
    this.assertReady();
    try {
      const result = await this.uploadBuffer(input.buffer, input.publicId);
      return {
        publicId: result.public_id,
        url: result.secure_url,
        bytes: result.bytes,
        mime: input.mime,
        width: result.width,
        height: result.height,
      };
    } catch (err) {
      const detail = this.errorDetail(err);
      this.logger.error(`Cloudinary putImage failed: ${detail}`);
      throw new I18nHttpException(HttpStatus.BAD_GATEWAY, 'file.uploadFailed', {
        detail: process.env.NODE_ENV !== 'production' && detail ? `: ${detail}` : '',
      });
    }
  }

  async delete(publicId: string): Promise<boolean> {
    this.assertReady();
    if (!publicId?.trim()) return false;
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: 'image',
        invalidate: true,
      });
      const status = (result as { result?: string })?.result ?? 'unknown';
      this.logger.log(`Cloudinary destroy publicId=${publicId} result=${status}`);
      return status === 'ok';
    } catch (err) {
      this.logger.warn(
        `Cloudinary destroy failed for ${publicId}: ${this.errorDetail(err)}`,
      );
      return false;
    }
  }

  private assertReady(): void {
    if (!this.ready) {
      throw new I18nHttpException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'file.notConfigured',
      );
    }
  }

  private uploadBuffer(
    buffer: Buffer,
    publicId: string,
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: 'image',
          overwrite: false,
          unique_filename: false,
          use_filename: false,
          // Re-encode once at ingest — smaller stored original, no extra derivatives.
          quality: 'auto:good',
        },
        (
          error: UploadApiErrorResponse | undefined,
          result: UploadApiResponse | undefined,
        ) => {
          if (error || !result) {
            reject(error ?? new Error('Empty Cloudinary response'));
            return;
          }
          resolve(result);
        },
      );
      stream.end(buffer);
    });
  }

  private errorDetail(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (
      typeof err === 'object' &&
      err !== null &&
      'message' in err &&
      typeof (err as { message: unknown }).message === 'string'
    ) {
      return (err as { message: string }).message;
    }
    return String(err);
  }
}
