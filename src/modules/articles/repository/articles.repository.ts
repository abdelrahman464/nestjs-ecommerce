import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { flattenObject } from '../../../common/utils/flatten-object.util';
import { PaginatedResponseDto } from '../../../shared/dtos/paginated-response.dto';
import { USER_PUBLIC_FIELDS } from '../../users/constants/user.constants';
import { CreateArticleDto } from '../dto/create-article.dto';
import { UpdateArticleDto } from '../dto/update-article.dto';
import { Article, ArticleDocument } from '../schemas/article.schema';

@Injectable()
export class ArticleRepository {
  constructor(
    @InjectModel(Article.name)
    private readonly articleModel: Model<ArticleDocument>,
  ) {}

  private static readonly populate = [
    { path: 'author', select: USER_PUBLIC_FIELDS },
  ];

  async findAll(
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<ArticleDocument>> {
    const features = new ApiFeatures<ArticleDocument>(
      this.articleModel.find().populate(ArticleRepository.populate),
      queryParams,
      this.articleModel,
    );
    return features
      .filter()
      .search(['title.en', 'title.de', 'slug', 'tags'])
      .sort()
      .paginate()
      .executePaginated();
  }

  async findById(id: Types.ObjectId | string): Promise<ArticleDocument | null> {
    return this.articleModel
      .findById(id)
      .populate(ArticleRepository.populate)
      .exec();
  }

  async findBySlug(slug: string): Promise<ArticleDocument | null> {
    return this.articleModel
      .findOne({ slug })
      .populate(ArticleRepository.populate)
      .exec();
  }

  async findByEnglishTitle(title: string): Promise<ArticleDocument | null> {
    return this.articleModel.findOne({ 'title.en': title }).exec();
  }

  async createArticle(
    dto: CreateArticleDto & { author?: Types.ObjectId },
  ): Promise<ArticleDocument> {
    return this.articleModel.create(dto);
  }

  async updateArticle(
    id: Types.ObjectId | string,
    dto: UpdateArticleDto,
  ): Promise<ArticleDocument | null> {
    const $set = flattenObject(dto);
    return this.articleModel
      .findByIdAndUpdate(id, { $set }, { new: true, runValidators: true })
      .populate(ArticleRepository.populate)
      .exec();
  }

  async deleteArticle(id: Types.ObjectId | string): Promise<void> {
    await this.articleModel.findByIdAndDelete(id).exec();
  }
}
