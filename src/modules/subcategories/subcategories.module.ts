import { Module } from '@nestjs/common';
import { createI18nMongooseModule } from '../../common/utils/mongoose-i18n-schema.util';
import { CategoriesModule } from '../categories/categories.module';
import { SubCategoriesController } from './subcategories.controller';
import { SubCategoriesService } from './subcategories.service';
import { SubCategoryRepository } from './repository/subcategory.repository';
import {
  SubCategory,
  SubCategorySchema,
} from './schemas/subcategory.schema';

@Module({
  imports: [
    createI18nMongooseModule(SubCategory.name, SubCategorySchema),
    CategoriesModule,
  ],
  controllers: [SubCategoriesController],
  providers: [SubCategoriesService, SubCategoryRepository],
})
export class SubCategoriesModule {}
