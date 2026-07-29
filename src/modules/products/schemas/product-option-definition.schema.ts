import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ProductOptionType } from '../enums/product-option-type.enum';

@Schema({ _id: false })
export class ProductOptionDefinition {
  @Prop({ type: String, enum: ProductOptionType, required: true })
  type: ProductOptionType;

  @Prop({ type: [String], required: true, default: [] })
  values: string[];

  @Prop({ type: Number, default: 0 })
  order: number;
}

export const ProductOptionDefinitionSchema = SchemaFactory.createForClass(
  ProductOptionDefinition,
);
