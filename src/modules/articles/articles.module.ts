import { Module } from '@nestjs/common';
import { createI18nMongooseModule } from '../../common/utils/mongoose-i18n-schema.util';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';
import { ArticleRepository } from './repository/articles.repository';
import { Article, ArticleSchema } from './schemas/article.schema';

@Module({
  imports: [createI18nMongooseModule(Article.name, ArticleSchema)],
  controllers: [ArticlesController],
  providers: [ArticlesService, ArticleRepository],
})
export class ArticlesModule {}
