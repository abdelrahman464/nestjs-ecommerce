import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { CategoryRepository } from './repository/categories.repository';
import { Category, CategorySchema } from './schemas/category.schema';
import { createI18nMongooseModule } from '../../common/utils/mongoose-i18n-schema.util';

@Module({
  imports: [createI18nMongooseModule(Category.name, CategorySchema)],
  controllers: [CategoriesController],
  providers: [CategoriesService, CategoryRepository],
  exports: [CategoriesService, CategoryRepository],
})
export class CategoriesModule {}
