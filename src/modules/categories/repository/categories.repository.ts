import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateCategoryDto } from '../dto/create-category.dto';
import { UpdateCategoryDto } from '../dto/update-category.dto';
import { Category, CategoryDocument } from '../schemas/category.schema';
import { flattenObject } from '../../../common/utils/flatten-object.util';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PaginatedResponseDto } from 'src/shared/dtos/paginated-response.dto';
import { CATEGORY_SEARCH_FIELDS } from '../constants/category.constants';

@Injectable()
export class CategoryRepository {
  constructor(
    @InjectModel(Category.name)
    private readonly categoryModel: Model<CategoryDocument>,
  ) {}

  async findAll(
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<CategoryDocument>> {
    const features = new ApiFeatures<CategoryDocument>(
      this.categoryModel.find(),
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

  async findById(id: Types.ObjectId | string): Promise<CategoryDocument | null> {
    return await this.categoryModel.findById(id).exec();
  }

  async findByGermanTitle(title: string): Promise<CategoryDocument | null> {
    return await this.categoryModel.findOne({ 'title.de': title }).exec();
  }

  async findBySlug(slug: string): Promise<CategoryDocument | null> {
    return await this.categoryModel.findOne({ slug }).exec();
  }

  async createCategory(dto: CreateCategoryDto): Promise<CategoryDocument> {
    return await this.categoryModel.create(dto);
  }

  async updateCategory(
    id: Types.ObjectId | string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryDocument | null> {
    const $set = flattenObject(dto);

    return this.categoryModel
      .findByIdAndUpdate(id, { $set }, { new: true, runValidators: true })
      .exec();
  }

  async deleteCategory(id: Types.ObjectId | string): Promise<void> {
    await this.categoryModel.findByIdAndDelete(id).exec();
  }
}
