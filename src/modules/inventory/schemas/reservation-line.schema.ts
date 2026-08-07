import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Types } from 'mongoose';
import { Product } from '../../products/schemas/product.schema';
import { ProductVariant } from '../../products/schemas/product-variant.schema';
import { Warehouse } from '../../warehouses/schemas/warehouse.schema';

@Schema({ _id: false })
export class ReservationLine {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: ProductVariant.name,
    required: true,
  })
  variant: Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Product.name,
    required: true,
  })
  product: Types.ObjectId;

  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: Warehouse.name,
    required: true,
  })
  warehouse: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  quantity: number;
}

export const ReservationLineSchema =
  SchemaFactory.createForClass(ReservationLine);
