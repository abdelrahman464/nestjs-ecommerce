import { Exclude, Expose, Type } from 'class-transformer';
import { Types } from 'mongoose';
import { ProductStatus } from '../enums/product-status.enum';
import { ProductUnit } from '../enums/product-unit.enum';

@Exclude()
export class ProductVariantResponseDto {
  @Expose()
  _id: Types.ObjectId;

  @Expose()
  product: Types.ObjectId;

  @Expose()
  sku: string;

  @Expose()
  barcode: string;

  @Expose()
  options: Record<string, string>;

  @Expose()
  price: number;

  @Expose()
  priceAfterDiscount: number;

  @Expose()
  stock: number;

  @Expose()
  unit: ProductUnit;

  @Expose()
  status: ProductStatus;

  @Expose()
  isDefault: boolean;

  @Expose()
  order: number;

  @Expose()
  @Type(() => Date)
  createdAt: Date;

  @Expose()
  @Type(() => Date)
  updatedAt: Date;
}
