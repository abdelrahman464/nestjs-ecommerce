import {
  DEFAULT_CONTENT_LOCALE,
  localizedPath,
} from '../../../common/constants/supported-content-locales.constant';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { flattenObject } from '../../../common/utils/flatten-object.util';
import { PaginatedResponseDto } from '../../../shared/dtos/paginated-response.dto';
import { CreateBrandDto } from '../dto/create-brand.dto';
import { UpdateBrandDto } from '../dto/update-brand.dto';
import { Brand, BrandDocument } from '../schemas/brand.schema';
import { BRAND_SEARCH_FIELDS } from '../constants/brand.constants';

@Injectable()
export class BrandRepository {
  constructor(
    @InjectModel(Brand.name)
    private readonly brandModel: Model<BrandDocument>,
  ) {}

  async findAll(
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<BrandDocument>> {
    const features = new ApiFeatures<BrandDocument>(
      this.brandModel.find(),
      queryParams,
      this.brandModel,
    );
    return features
      .filter()
      .search(BRAND_SEARCH_FIELDS)
      .sort()
      .paginate()
      .executePaginated();
  }

  async findById(id: Types.ObjectId | string): Promise<BrandDocument | null> {
    return this.brandModel.findById(id).exec();
  }

  async findBySlug(slug: string): Promise<BrandDocument | null> {
    return this.brandModel.findOne({ slug }).exec();
  }

  /** Active brands for the public sitemap. */
  async listSitemapEntries(): Promise<
    Array<{ slug: string; updatedAt: Date }>
  > {
    const rows = await this.brandModel
      .find({ isActive: true })
      .select('slug updatedAt')
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return rows as unknown as Array<{ slug: string; updatedAt: Date }>;
  }

  async findByDefaultLocaleTitle(
    title: string,
  ): Promise<BrandDocument | null> {
    return this.brandModel
      .findOne({ [localizedPath('title', DEFAULT_CONTENT_LOCALE)]: title })
      .exec();
  }

  /** @deprecated Use findByDefaultLocaleTitle */
  async findByGermanTitle(title: string): Promise<BrandDocument | null> {
    return this.findByDefaultLocaleTitle(title);
  }

  async createBrand(dto: CreateBrandDto): Promise<BrandDocument> {
    return this.brandModel.create(dto);
  }

  async updateBrand(
    id: Types.ObjectId | string,
    dto: UpdateBrandDto,
  ): Promise<BrandDocument | null> {
    const $set = flattenObject(dto);
    return this.brandModel
      .findByIdAndUpdate(id, { $set }, { new: true, runValidators: true })
      .exec();
  }

  async deleteBrand(id: Types.ObjectId | string): Promise<void> {
    await this.brandModel.findByIdAndDelete(id).exec();
  }
}
