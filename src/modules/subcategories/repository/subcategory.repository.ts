import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { flattenObject } from '../../../common/utils/flatten-object.util';
import { PaginatedResponseDto } from 'src/shared/dtos/paginated-response.dto';
import { CreateSubCategoryDto } from '../dto/create-subcategory.dto';
import { UpdateSubCategoryDto } from '../dto/update-subcategory.dto';
import {
  SubCategory,
  SubCategoryDocument,
} from '../schemas/subcategory.schema';
import { CATEGORY_PUBLIC_FIELDS } from '../../categories/constants/category.constants';
import { SUB_CATEGORY_SEARCH_FIELDS } from '../constants/subcategory.constants';

@Injectable()
export class SubCategoryRepository {
  constructor(
    @InjectModel(SubCategory.name)
    private readonly subCategoryModel: Model<SubCategoryDocument>,
  ) {}

  private static readonly populate = [
    { path: 'category', select: CATEGORY_PUBLIC_FIELDS },
  ];
  async findAll(
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<SubCategoryDocument>> {
    const features = new ApiFeatures<SubCategoryDocument>(
      this.subCategoryModel.find().populate(SubCategoryRepository.populate),
      queryParams,
      this.subCategoryModel,
    );
    return features
      .filter()
      .search(SUB_CATEGORY_SEARCH_FIELDS)
      .sort()
      .paginate()
      .executePaginated();
  }

  async findById(
    id: Types.ObjectId | string,
  ): Promise<SubCategoryDocument | null> {
    return await this.subCategoryModel.findById(id).exec();
  }

  async findBySlug(slug: string): Promise<SubCategoryDocument | null> {
    return await this.subCategoryModel.findOne({ slug }).exec();
  }

  async findByGermanTitle(
    title: string,
    category: Types.ObjectId | string,
  ): Promise<SubCategoryDocument | null> {
    return await this.subCategoryModel
      .findOne({ 'title.de': title, category })
      .exec();
  }

  async findByCategory(
    category: Types.ObjectId | string,
  ): Promise<SubCategoryDocument[]> {
    return await this.subCategoryModel.find({ category }).exec();
  }

  async createSubCategory(
    dto: CreateSubCategoryDto & { slug: string },
  ): Promise<SubCategoryDocument> {
    return await this.subCategoryModel.create(dto);
  }

  async updateSubCategory(
    id: Types.ObjectId | string,
    dto: UpdateSubCategoryDto,
  ): Promise<SubCategoryDocument | null> {
    const $set = flattenObject(dto);

    return this.subCategoryModel
      .findByIdAndUpdate(id, { $set }, { new: true, runValidators: true })
      .exec();
  }

  async deleteSubCategory(id: Types.ObjectId | string): Promise<void> {
    await this.subCategoryModel.findByIdAndDelete(id).exec();
  }
}
