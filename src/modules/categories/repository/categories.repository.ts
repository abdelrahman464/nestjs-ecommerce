import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DEFAULT_CONTENT_LOCALE,
  localizedPath,
} from '../../../common/constants/supported-content-locales.constant';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { Category, CategoryDocument } from '../schemas/category.schema';
import { flattenObject } from '../../../common/utils/flatten-object.util';
import {
  EntityMediaStore,
  mongooseMediaStore,
} from '../../media/entity-media.store';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PaginatedResponseDto } from 'src/shared/dtos/paginated-response.dto';
import {
  CATEGORY_SEARCH_FIELDS,
  CATEGORY_PUBLIC_FIELDS,
} from '../constants/category.constants';

@Injectable()
export class CategoryRepository {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  mediaStore(): EntityMediaStore {
    return mongooseMediaStore(this.categoryModel);
  }

  private static readonly populate = [
    { path: 'parentCategory', select: CATEGORY_PUBLIC_FIELDS },
  ];

  async findAll(
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<CategoryDocument>> {
    const features = new ApiFeatures<CategoryDocument>(
      this.categoryModel.find().populate(CategoryRepository.populate),
      queryParams,
      this.categoryModel,
    );
    return features
      .filter()
      .search(CATEGORY_SEARCH_FIELDS)
      .sort()
      .paginate()
      .executePaginated();
  }

  async findByParentCategory(
    parentCategoryId: Types.ObjectId,
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<CategoryDocument>> {
    return this.findAll({
      ...queryParams,
      parentCategory: parentCategoryId.toString(),
    });
  }

  async findById(id: Types.ObjectId | string): Promise<CategoryDocument | null> {
    return this.categoryModel
      .findById(id)
      .populate(CategoryRepository.populate)
      .exec();
  }

  async findByDefaultLocaleTitle(
    title: string,
    parentCategory?: Types.ObjectId | string | null,
  ): Promise<CategoryDocument | null> {
    const query: Record<string, any> = {
      [localizedPath('title', DEFAULT_CONTENT_LOCALE)]: title,
    };

    if (parentCategory) {
      query.parentCategory = parentCategory;
    } else {
      query.parentCategory = null;
    }

    return this.categoryModel.findOne(query).exec();
  }

  /** @deprecated Use findByDefaultLocaleTitle */
  async findByGermanTitle(
    title: string,
    parentCategory?: Types.ObjectId | string | null,
  ): Promise<CategoryDocument | null> {
    return this.findByDefaultLocaleTitle(title, parentCategory);
  }

  async findBySlug(slug: string): Promise<CategoryDocument | null> {
    return this.categoryModel
      .findOne({ slug })
      .populate(CategoryRepository.populate)
      .exec();
  }

  /** Active categories for the public sitemap. */
  async listSitemapEntries(): Promise<
    Array<{ slug: string; updatedAt: Date }>
  > {
    const rows = await this.categoryModel
      .find({ isActive: true })
      .select('slug updatedAt')
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return rows as unknown as Array<{ slug: string; updatedAt: Date }>;
  }

  async countChildrenByParentCategory(
    parentCategoryId: Types.ObjectId | string,
  ): Promise<number> {
    return this.categoryModel
      .countDocuments({ parentCategory: parentCategoryId })
      .exec();
  }

  async createCategory(dto: CreateCategoryDto): Promise<CategoryDocument> {
    return this.categoryModel.create(dto);
  }

  async createCategories(
    categories: Array<CreateCategoryDto>,
  ): Promise<CategoryDocument[]> {
    const created: CategoryDocument[] = [];
    for (const category of categories) {
      created.push(await this.categoryModel.create(category));
    }
    return created;
  }

  async updateCategory(
    id: Types.ObjectId | string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryDocument | null> {
    const $set = flattenObject(dto);

    return this.categoryModel
      .findByIdAndUpdate(id, { $set }, { new: true, runValidators: true })
      .populate(CategoryRepository.populate)
      .exec();
  }

  async deleteCategory(id: Types.ObjectId | string): Promise<void> {
    await this.categoryModel.findByIdAndDelete(id).exec();
  }
}
