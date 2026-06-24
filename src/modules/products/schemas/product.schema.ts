import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Types } from 'mongoose';
import { Category } from '../../categories/schemas/category.schema';
import { SubCategory } from '../../subcategories/schemas/subcategory.schema';
import { Brand } from '../../brands/schemas/brand.schema';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductUnit } from '../enums/product-unit.enum';

@Schema({ timestamps: true })
export class Product {
  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: Category.name, required: true })
  category: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: SubCategory.name })
  subCategory?: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: Brand.name,  })
  brand?: Types.ObjectId;

  @Prop({ required: true, unique: true, trim: true, i18n: true })
  title: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  slug: string;

  @Prop({ required: true, trim: true, i18n: true })
  description: string;

  @Prop({ trim: true, i18n: true })
  shortDescription?: string;

  @Prop({ required: true, unique: true, trim: true, uppercase: true })
  sku: string;

  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ default: 0, min: 0 })
  priceAfterDiscount: number;

  @Prop({ required: true, min: 0, default: 0 })
  stock: number;

  @Prop({ type: String, enum: ProductUnit, default: ProductUnit.PIECE })
  unit: ProductUnit;

  @Prop({ trim: true, i18n: true })
  material?: string;

  @Prop({ type: Object })
  specifications?: {
    dimensions?: string;
    weight?: string;
    color?: string;
    finish?: string;
    thickness?: string;
  };

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop({ type: String, enum: ProductStatus, default: ProductStatus.ACTIVE })
  status: ProductStatus;

  @Prop({ default: 0 })
  ratingsAverage: number;

  @Prop({ default: 0 })
  ratingsQuantity: number;

  @Prop({ default: false })
  showOnBanner: boolean;

  @Prop({ default: 0 })
  order: number;

  @Prop({ type: String, i18n: true })
  metaTitle?: string;

  @Prop({ type: String, i18n: true })
  metaDescription?: string;

  @Prop({ type: String, i18n: true })
  keywords?: string;
}

export type ProductDocument = HydratedDocument<Product>;
export const ProductSchema = SchemaFactory.createForClass(Product);
