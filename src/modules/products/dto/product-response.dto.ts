import { Exclude, Expose, Type } from 'class-transformer';
import { Types } from 'mongoose';
import { ProductOptionType } from '../enums/product-option-type.enum';
import { ProductStatus } from '../enums/product-status.enum';

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
  optionDefinitions: unknown;

  @Expose()
  groupBy?: ProductOptionType | null;

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
