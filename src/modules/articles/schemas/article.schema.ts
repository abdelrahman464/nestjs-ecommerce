import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { User } from '../../users/schemas/user.schema';

@Schema({ timestamps: true })
export class Article {
  @Prop({ required: true, unique: true, trim: true, i18n: true })
  title: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ required: true, trim: true, i18n: true })
  content: string;

  @Prop({ trim: true, i18n: true })
  excerpt?: string;

  @Prop({ trim: true })
  coverImage?: string;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: User.name })
  author?: Types.ObjectId;

  @Prop({ default: false })
  isPublished: boolean;

  @Prop({ type: Date })
  publishedAt?: Date;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: String, i18n: true })
  metaTitle?: string;

  @Prop({ type: String, i18n: true })
  metaDescription?: string;

  @Prop({ type: String, i18n: true })
  keywords?: string;
}

export type ArticleDocument = HydratedDocument<Article>;
export const ArticleSchema = SchemaFactory.createForClass(Article);

ArticleSchema.index({ isPublished: 1, publishedAt: -1 });
ArticleSchema.index({ 'title.de': 1 });
