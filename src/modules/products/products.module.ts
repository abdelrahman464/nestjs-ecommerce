import { Module } from '@nestjs/common';
import { createI18nMongooseModule } from '../../common/utils/mongoose-i18n-schema.util';
import { BrandsModule } from '../brands/brands.module';
import { CategoriesModule } from '../categories/categories.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductRepository } from './repository/products.repository';
import { Product, ProductSchema } from './schemas/product.schema';

@Module({
  imports: [
    createI18nMongooseModule(Product.name, ProductSchema),
    CategoriesModule,
    BrandsModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService, ProductRepository],
  exports: [ProductsService, ProductRepository],
})
export class ProductsModule {}
