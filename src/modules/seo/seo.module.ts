import { Module } from '@nestjs/common';
import { ArticlesModule } from '../articles/articles.module';
import { BrandsModule } from '../brands/brands.module';
import { CategoriesModule } from '../categories/categories.module';
import { ProductsModule } from '../products/products.module';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';

@Module({
  imports: [ProductsModule, CategoriesModule, BrandsModule, ArticlesModule],
  controllers: [SeoController],
  providers: [SeoService],
})
export class SeoModule {}