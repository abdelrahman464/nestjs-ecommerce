import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { flattenObject } from '../../../common/utils/flatten-object.util';
import { PaginatedResponseDto } from '../../../shared/dtos/paginated-response.dto';
import { CATEGORY_PUBLIC_FIELDS } from '../../categories/constants/category.constants';
import { BRAND_PUBLIC_FIELDS } from '../../brands/constants/brand.constants';
import { CreateProductDto } from '../dto/create-product.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { Product, ProductDocument } from '../schemas/product.schema';
import { SUB_CATEGORY_PUBLIC_FIELDS } from '../../subcategories/constants/subCategory.constants';
import { PRODUCT_SEARCH_FIELDS } from '../constants/product.constants';

@Injectable()
export class ProductRepository {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  private static readonly populate = [
    { path: 'category', select: CATEGORY_PUBLIC_FIELDS },
    { path: 'subCategory', select: SUB_CATEGORY_PUBLIC_FIELDS },
    { path: 'brand', select: BRAND_PUBLIC_FIELDS },
  ];

  async findAll(
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<ProductDocument>> {
    const features = new ApiFeatures<ProductDocument>(
      this.productModel.find().populate(ProductRepository.populate),
      queryParams,
      this.productModel,
    );

    return features
      .filter()
      .search(PRODUCT_SEARCH_FIELDS)
      .sort()
      .paginate()
      .executePaginated();
  }

  async findById(id: Types.ObjectId | string): Promise<ProductDocument | null> {
    return this.productModel
      .findById(id)
      .populate(ProductRepository.populate)
      .exec();
  }

  async findBySlug(slug: string): Promise<ProductDocument | null> {
    return this.productModel
      .findOne({ slug })
      .populate(ProductRepository.populate)
      .exec();
  }

  async findByGermanTitle(title: string): Promise<ProductDocument | null> {
    return this.productModel.findOne({ 'title.de': title }).exec();
  }

  async findBySku(sku: string): Promise<ProductDocument | null> {
    return this.productModel.findOne({ sku: sku.toUpperCase() }).exec();
  }

  async createProduct(dto: CreateProductDto): Promise<ProductDocument> {
    return this.productModel.create({
      dto,
    });
  }

  async updateProduct(
    id: Types.ObjectId | string,
    dto: UpdateProductDto,
  ): Promise<ProductDocument | null> {
    const $set = flattenObject(dto);
    return this.productModel
      .findByIdAndUpdate(id, { $set }, { new: true, runValidators: true })
      .populate(ProductRepository.populate)
      .exec();
  }

  async deleteProduct(id: Types.ObjectId | string): Promise<void> {
    await this.productModel.findByIdAndDelete(id).exec();
  }
}
