import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import {
  DEFAULT_CONTENT_LOCALE,
  getLocalizedValue,
} from '../../common/constants/supported-content-locales.constant';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import {
  getDuplicateKeyField,
  isDuplicateKeyError,
} from '../../common/utils/mongo-error.util';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { BrandRepository } from '../brands/repository/brands.repository';
import { CategoryRepository } from '../categories/repository/categories.repository';
import { EntityMediaService } from '../media/entity-media.service';
import {
  CreateProductDto,
  CreateProductPersistence,
} from './dto/create-product.dto';
import { ReorderProductItemDto } from './dto/reorder-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductStatus } from './enums/product-status.enum';
import { ProductVariantsService } from './product-variants.service';
import { ProductVariantRepository } from './repository/product-variants.repository';
import { ProductRepository } from './repository/products.repository';
import { ProductDocument } from './schemas/product.schema';

const PRODUCT_GALLERY_FIELDS = {
  urlsField: 'images',
  publicIdsField: 'imagePublicIds',
} as const;

@Injectable()
export class ProductsService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly variantRepository: ProductVariantRepository,
    private readonly variantsService: ProductVariantsService,
    private readonly categoryRepository: CategoryRepository,
    private readonly brandRepository: BrandRepository,
    private readonly entityMedia: EntityMediaService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async findAll(
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<ProductDocument>> {
    return this.productRepository.findAll(queryParams);
  }

  /** Admin stock overview — products → variants → live stock via aggregation. */
  async getStockOverview(queryParams: Record<string, unknown>) {
    return this.productRepository.getStockOverview(queryParams);
  }

  async getStorefrontCatalog(queryParams: Record<string, unknown>) {
    return this.productRepository.getStorefrontCatalog(queryParams);
  }

  async getStorefrontBySlug(slug: string) {
    const product = await this.productRepository.getStorefrontBySlug(slug);
    if (!product) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'product.notFoundBySlug',
        { slug },
      );
    }
    return product;
  }

  async findOne(id: Types.ObjectId): Promise<ProductDocument> {
    const product = await this.productRepository.findById(id);
    if (!product) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'product.notFound', {
        id: id.toString(),
      });
    }
    return product;
  }

  async findBySlug(slug: string): Promise<ProductDocument> {
    const product = await this.productRepository.findBySlug(slug);
    if (!product) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'product.notFoundBySlug',
        { slug },
      );
    }
    return product;
  }

  /** Active products for the public SEO sitemap. */
  async listSitemapEntries(): Promise<
    Array<{ slug: string; updatedAt: Date }>
  > {
    return this.productRepository.listSitemapEntries();
  }

  async create(
    dto: CreateProductDto,
    createdBy: string,
  ): Promise<ProductDocument> {
    await this.assertCategoryAndBrand(dto.category, dto.brand);

    const canonicalTitle = getLocalizedValue(dto.title, DEFAULT_CONTENT_LOCALE);
    if (!canonicalTitle) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'validation.field_required',
        { field: `title.${DEFAULT_CONTENT_LOCALE}` },
      );
    }

    await this.assertTitleAvailable(canonicalTitle);

    const { optionDefinitions, groupBy } =
      this.variantsService.validateOptionDefinitions(
        dto.optionDefinitions,
        dto.groupBy,
      );

    const slug =
      await this.productRepository.generateUniqueSlug(canonicalTitle);
    const order = dto.order ?? (await this.productRepository.getMaxOrder()) + 1;

    const productPayload: CreateProductPersistence = {
      category: dto.category,
      brand: dto.brand,
      title: dto.title,
      description: dto.description,
      shortDescription: dto.shortDescription,
      seo: dto.seo,
      showOnBanner: dto.showOnBanner,
      slug,
      order,
      status: dto.status ?? ProductStatus.ACTIVE,
      optionDefinitions,
      groupBy,
    };

    const session = await this.connection.startSession();
    try {
      let product!: ProductDocument;
      await session.withTransaction(async () => {
        product = await this.productRepository.createProduct(
          productPayload,
          session,
        );
        await this.variantsService.createDefaultForProduct(
          product,
          dto.defaultVariant,
          session,
          createdBy,
        );
      });
      return (await this.productRepository.findById(product._id))!;
    } catch (error) {
      this.rethrowDuplicateKey(error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  async createBulk(dtos: CreateProductDto[], createdBy: string): Promise<ProductDocument[]> {
    const created: ProductDocument[] = [];
    for (const dto of dtos) {
      created.push(await this.create(dto, createdBy));
    }
    return created;
  }

  async update(
    id: Types.ObjectId,
    dto: UpdateProductDto,
  ): Promise<ProductDocument> {
    const existing = await this.findOne(id);

    if (dto.category !== undefined || dto.brand !== undefined) {
      await this.assertCategoryAndBrand(
        dto.category ?? existing.category,
        dto.brand !== undefined ? dto.brand : existing.brand,
      );
    }

    const existingCanonicalTitle = getLocalizedValue(
      existing.title as unknown as Record<string, string>,
      DEFAULT_CONTENT_LOCALE,
    );
    const newCanonicalTitle = dto.title
      ? getLocalizedValue(dto.title, DEFAULT_CONTENT_LOCALE)
      : undefined;

    if (newCanonicalTitle && newCanonicalTitle !== existingCanonicalTitle) {
      await this.assertTitleAvailable(newCanonicalTitle);
      dto.slug = await this.productRepository.generateUniqueSlug(
        newCanonicalTitle,
        existing.id.toString(),
      );
    }

    if (dto.optionDefinitions !== undefined || dto.groupBy !== undefined) {
      const { optionDefinitions, groupBy } =
        this.variantsService.validateOptionDefinitions(
          dto.optionDefinitions ??
            (existing.optionDefinitions as unknown as any),
          dto.groupBy !== undefined ? dto.groupBy : existing.groupBy,
        );
      dto.optionDefinitions = optionDefinitions;
      dto.groupBy = groupBy;

      // Block definition changes that invalidate existing variant options
      const variants = await this.variantRepository.findByProductId(id);
      for (const variant of variants) {
        const optionsObj =
          variant.options instanceof Map
            ? Object.fromEntries(variant.options.entries())
            : ((variant.options as unknown as Record<string, string>) ?? {});
        this.variantsService.validateOptionsAgainstDefinitions(
          { optionDefinitions } as ProductDocument,
          optionsObj,
        );
      }
    }

    try {
      const updated = await this.productRepository.updateProduct(id, dto);
      if (!updated) {
        throw new I18nHttpException(HttpStatus.NOT_FOUND, 'product.notFound', {
          id: id.toString(),
        });
      }
      return updated;
    } catch (error) {
      this.rethrowDuplicateKey(error);
      throw error;
    }
  }

  async reorder(items: ReorderProductItemDto[]): Promise<ProductDocument[]> {
    for (const item of items) {
      await this.findOne(item.productId);
    }
    return this.productRepository.reorderProducts(items);
  }

  async delete(id: Types.ObjectId): Promise<void> {
    await this.findOne(id);
    await this.variantsService.assertProductVariantsDeletable(id);

    await this.entityMedia.destroyGalleryStored(
      this.productRepository.mediaStore(),
      id,
      PRODUCT_GALLERY_FIELDS,
    );
    await this.variantsService.releaseGalleriesForProduct(id);

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        await this.variantRepository.softDeleteByProduct(id, session);
        await this.productRepository.softDeleteProduct(id, session);
      });
    } finally {
      await session.endSession();
    }
  }

  async uploadImage(
    id: Types.ObjectId,
    file: Express.Multer.File,
  ): Promise<ProductDocument> {
    await this.entityMedia.appendToGallery(
      this.productRepository.mediaStore(),
      id,
      file,
      PRODUCT_GALLERY_FIELDS,
      'product.notFound',
    );
    return this.findOne(id);
  }

  async uploadImages(
    id: Types.ObjectId,
    files: Express.Multer.File[],
  ): Promise<ProductDocument> {
    await this.entityMedia.appendManyToGallery(
      this.productRepository.mediaStore(),
      id,
      files,
      PRODUCT_GALLERY_FIELDS,
      'product.notFound',
    );
    return this.findOne(id);
  }

  async removeImage(
    id: Types.ObjectId,
    url: string,
  ): Promise<ProductDocument> {
    await this.entityMedia.removeFromGallery(
      this.productRepository.mediaStore(),
      id,
      url,
      PRODUCT_GALLERY_FIELDS,
      'product.notFound',
    );
    return this.findOne(id);
  }

  private async assertCategoryAndBrand(
    categoryId: Types.ObjectId,
    brandId?: Types.ObjectId | null,
  ): Promise<void> {
    const category = await this.categoryRepository.findById(categoryId);
    if (!category) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'product.categoryNotFound',
        { id: categoryId.toString() },
      );
    }

    if (brandId) {
      const brand = await this.brandRepository.findById(brandId);
      if (!brand) {
        throw new I18nHttpException(
          HttpStatus.NOT_FOUND,
          'product.brandNotFound',
          { id: brandId.toString() },
        );
      }
    }
  }

  private async assertTitleAvailable(title: string): Promise<void> {
    const titleExists =
      await this.productRepository.findByDefaultLocaleTitle(title);
    if (titleExists) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'product.titleAlreadyExists',
        { title },
      );
    }
  }

  private rethrowDuplicateKey(error: unknown): void {
    if (!isDuplicateKeyError(error)) return;

    const field = getDuplicateKeyField(error) ?? '';
    if (field.includes('slug')) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'product.slugAlreadyExists',
      );
    }
    if (field.includes('sku')) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'product.skuAlreadyExists',
        { sku: '' },
      );
    }
    if (field.includes('barcode')) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'product.barcodeAlreadyExists',
        { barcode: '' },
      );
    }
    throw new I18nHttpException(
      HttpStatus.CONFLICT,
      'product.titleAlreadyExists',
      { title: '' },
    );
  }
}
