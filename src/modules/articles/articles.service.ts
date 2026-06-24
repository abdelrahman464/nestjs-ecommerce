import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { generateUniqueSlug } from '../../common/utils/slug.util';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { ArticleRepository } from './repository/articles.repository';
import { Article, ArticleDocument } from './schemas/article.schema';

@Injectable()
export class ArticlesService {
  constructor(
    private readonly articleRepository: ArticleRepository,
    @InjectModel(Article.name) private articleModel: Model<ArticleDocument>,
  ) {}

  async findAll(
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<ArticleDocument>> {
    return this.articleRepository.findAll(queryParams);
  }

  async findOne(id: Types.ObjectId): Promise<ArticleDocument> {
    const article = await this.articleRepository.findById(id);
    if (!article) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'article.notFound', {
        id: id.toString(),
      });
    }
    return article;
  }

  async findBySlug(slug: string): Promise<ArticleDocument> {
    const article = await this.articleRepository.findBySlug(slug);
    if (!article) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'article.notFoundBySlug',
        { slug },
      );
    }
    return article;
  }

  async create(
    dto: CreateArticleDto,
    authorId?: string,
  ): Promise<ArticleDocument> {
    const titleExists = await this.articleRepository.findByEnglishTitle(
      dto.title['en'],
    );
    if (titleExists) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'article.titleAlreadyExists',
        { title: dto.title['en'] },
      );
    }

    const slug = await generateUniqueSlug(dto.title['en'], this.articleModel);
    const createPayload: CreateArticleDto & {
      author?: Types.ObjectId;
      slug: string;
      publishedAt?: string;
    } = {
      ...dto,
      slug,
    };

    if (authorId) {
      createPayload.author = new Types.ObjectId(authorId);
    }

    if (dto.isPublished && !dto.publishedAt) {
      createPayload.publishedAt = new Date().toISOString();
    }

    const article = await this.articleRepository.createArticle(createPayload);
    if (!article) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'article.createFailed',
      );
    }
    return article;
  }

  async update(
    id: Types.ObjectId,
    dto: UpdateArticleDto,
  ): Promise<ArticleDocument> {
    const existing = await this.articleRepository.findById(id);
    if (!existing) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'article.notFound', {
        id: id.toString(),
      });
    }

    const existingEnglishTitle = existing.title?.['en'] ?? undefined;
    const newEnglishTitle = dto.title?.['en'] ?? undefined;

    if (newEnglishTitle && newEnglishTitle !== existingEnglishTitle) {
      const titleExists =
        await this.articleRepository.findByEnglishTitle(newEnglishTitle);
      if (titleExists) {
        throw new I18nHttpException(
          HttpStatus.CONFLICT,
          'article.titleAlreadyExists',
          { title: newEnglishTitle },
        );
      }
      dto.slug = await generateUniqueSlug(
        newEnglishTitle,
        this.articleModel,
        existing.id.toString(),
      );
    }

    if (dto.isPublished && !existing.isPublished && !dto.publishedAt) {
      dto.publishedAt = new Date().toISOString();
    }

    const updated = await this.articleRepository.updateArticle(id, dto);
    if (!updated) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'article.notFound', {
        id: id.toString(),
      });
    }
    return updated;
  }

  async delete(id: Types.ObjectId): Promise<void> {
    await this.findOne(id);
    await this.articleRepository.deleteArticle(id);
  }
}
