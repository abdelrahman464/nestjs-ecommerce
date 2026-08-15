import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * Registry of stored originals. Not the catalog entity — products/categories
 * still denormalize `url` for fast reads. This collection owns lifecycle:
 * hash (dedup) + refCount (delete from Cloudinary only when unused).
 */
@Schema({ timestamps: true, collection: 'media_assets' })
export class MediaAsset {
  @Prop({ required: true, unique: true, index: true })
  hash: string;

  @Prop({ required: true, unique: true })
  publicId: string;

  @Prop({ required: true })
  url: string;

  @Prop({ required: true, min: 0 })
  bytes: number;

  @Prop({ required: true })
  mime: string;

  @Prop()
  width?: number;

  @Prop()
  height?: number;

  /** How many catalog fields currently point at this original. */
  @Prop({ required: true, default: 0, min: 0 })
  refCount: number;
}

export type MediaAssetDocument = HydratedDocument<MediaAsset>;
export const MediaAssetSchema = SchemaFactory.createForClass(MediaAsset);
