import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import {
  DEFAULT_CONTENT_LOCALE,
  localizedPath,
} from '../../../common/constants/supported-content-locales.constant';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { flattenObject } from '../../../common/utils/flatten-object.util';
import { generateUniqueSlug as buildUniqueSlug } from '../../../common/utils/slug.util';
import { PaginatedResponseDto } from '../../../shared/dtos/paginated-response.dto';
import { BRAND_PUBLIC_FIELDS } from '../../brands/constants/brand.constants';
import { CATEGORY_PUBLIC_FIELDS } from '../../categories/constants/category.constants';
import {
  PRODUCT_DEFAULT_SORT,
  PRODUCT_SEARCH_FIELDS,
} from '../constants/product.constants';
import { CreateProductPersistence } from '../dto/create-product.dto';
import { ReorderProductItemDto } from '../dto/reorder-products.dto';
import { UpdateProductDto } from '../dto/update-product.dto';
import { Product, ProductDocument } from '../schemas/product.schema';

const NOT_DELETED = { deletedAt: null };

@Injectable()
export class ProductRepository {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    @InjectConnection()
    private readonly connection: Connection,
  ) {}

  private static readonly populate = [
    { path: 'category', select: CATEGORY_PUBLIC_FIELDS },
    { path: 'brand', select: BRAND_PUBLIC_FIELDS },
  ];

  async findAll(
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<ProductDocument>> {
    const params = {
      ...queryParams,
      sort: queryParams.sort ?? PRODUCT_DEFAULT_SORT,
    };

    const features = new ApiFeatures<ProductDocument>(
      this.productModel
        .find({ ...NOT_DELETED })
        .populate(ProductRepository.populate),
      params,
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
      .findOne({ _id: id, ...NOT_DELETED })
      .populate(ProductRepository.populate)
      .exec();
  }

  async findBySlug(slug: string): Promise<ProductDocument | null> {
    return this.productModel
      .findOne({ slug, ...NOT_DELETED })
      .populate(ProductRepository.populate)
      .exec();
  }

  async findByDefaultLocaleTitle(
    title: string,
  ): Promise<ProductDocument | null> {
    return this.productModel
      .findOne({
        [localizedPath('title', DEFAULT_CONTENT_LOCALE)]: title,
        ...NOT_DELETED,
      })
      .exec();
  }

  async getMaxOrder(): Promise<number> {
    const product = await this.productModel
      .findOne({ ...NOT_DELETED })
      .sort({ order: -1 })
      .select('order')
      .lean()
      .exec();

    return product?.order ?? 0;
  }

  async generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
    return buildUniqueSlug({
      title,
      model: this.productModel,
      excludeId,
      extraFilter: NOT_DELETED,
    });
  }

  async createProduct(
    data: CreateProductPersistence,
    session?: ClientSession,
  ): Promise<ProductDocument> {
    const [product] = await this.productModel.create([data], { session });
    return product;
  }

  async createProducts(
    products: CreateProductPersistence[],
  ): Promise<ProductDocument[]> {
    const session = await this.connection.startSession();
    try {
      let created: ProductDocument[] = [];
      await session.withTransaction(async () => {
        created = await this.productModel.insertMany(products, { session });
      });
      return created;
    } finally {
      await session.endSession();
    }
  }

  async updateProduct(
    id: Types.ObjectId | string,
    dto: UpdateProductDto,
    session?: ClientSession,
  ): Promise<ProductDocument | null> {
    const $set = flattenObject(dto as Record<string, unknown>);
    return this.productModel
      .findOneAndUpdate(
        { _id: id, ...NOT_DELETED },
        { $set },
        { new: true, runValidators: true, session },
      )
      .populate(ProductRepository.populate)
      .exec();
  }

  async reorderProducts(
    items: ReorderProductItemDto[],
  ): Promise<ProductDocument[]> {
    const session = await this.connection.startSession();
    try {
      let updated: ProductDocument[] = [];
      await session.withTransaction(async () => {
        const ops = items.map((item) => ({
          updateOne: {
            filter: { _id: item.productId, ...NOT_DELETED },
            update: { $set: { order: item.order } },
          },
        }));
        await this.productModel.bulkWrite(ops, { session });

        const ids = items.map((item) => item.productId);
        updated = await this.productModel
          .find({ _id: { $in: ids }, ...NOT_DELETED })
          .session(session)
          .populate(ProductRepository.populate)
          .exec();
      });
      return updated;
    } finally {
      await session.endSession();
    }
  }

  async softDeleteProduct(
    id: Types.ObjectId | string,
    session?: ClientSession,
  ): Promise<void> {
    await this.productModel
      .findOneAndUpdate(
        { _id: id, ...NOT_DELETED },
        { $set: { deletedAt: new Date() } },
        { session },
      )
      .exec();
  }
}
