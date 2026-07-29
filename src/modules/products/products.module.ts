import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createI18nMongooseModule } from '../../common/utils/mongoose-i18n-schema.util';
import { BrandsModule } from '../brands/brands.module';
import { CategoriesModule } from '../categories/categories.module';
import { ProductVariantsController } from './product-variants.controller';
import { ProductVariantsService } from './product-variants.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductVariantRepository } from './repository/product-variants.repository';
import { ProductRepository } from './repository/products.repository';
import { Product, ProductSchema } from './schemas/product.schema';
import {
  ProductVariant,
  ProductVariantSchema,
} from './schemas/product-variant.schema';

@Module({
  imports: [
    createI18nMongooseModule(Product.name, ProductSchema),
    MongooseModule.forFeature([
      { name: ProductVariant.name, schema: ProductVariantSchema },
    ]),
    CategoriesModule,
    BrandsModule,
  ],
  controllers: [ProductsController, ProductVariantsController],
  providers: [
    ProductsService,
    ProductRepository,
    ProductVariantsService,
    ProductVariantRepository,
  ],
  exports: [
    ProductsService,
    ProductRepository,
    ProductVariantsService,
    ProductVariantRepository,
  ],
})
export class ProductsModule {}
