import { Exclude, Expose, Type } from 'class-transformer';
import { Types } from 'mongoose';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductUnit } from '../enums/product-unit.enum';

@Exclude()
export class ProductResponseDto {
  @Expose()
  _id: Types.ObjectId;

  @Expose()
  title: unknown;

  @Expose()
  slug: string;

  @Expose()
  description: unknown;

  @Expose()
  shortDescription?: unknown;

  @Expose()
  sku: string;

  @Expose()
  price: number;

  @Expose()
  priceAfterDiscount: number;

  @Expose()
  stock: number;

  @Expose()
  unit: ProductUnit;

  @Expose()
  images: string[];

  @Expose()
  status: ProductStatus;

  @Expose()
  ratingsAverage: number;

  @Expose()
  ratingsQuantity: number;

  @Expose()
  showOnBanner: boolean;

  @Expose()
  order: number;

  @Expose()
  category: unknown;

  @Expose()
  brand?: unknown;

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  updatedAt: Date;
}
