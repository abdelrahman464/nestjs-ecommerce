import { HttpStatus, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
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
import {
  CreateProductDto,
  CreateProductPersistence,
} from './dto/create-product.dto';
import { ReorderProductItemDto } from './dto/reorder-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductStatus } from './enums/product-status.enum';
import { ProductRepository } from './repository/products.repository';
import { ProductDocument } from './schemas/product.schema';
import { resolveProductStatus } from './utils/product-status.util';

@Injectable()
export class ProductsService {
  constructor(
    private readonly productRepository: ProductRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly brandRepository: BrandRepository,
  ) {}

  async findAll(
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<ProductDocument>> {
    return this.productRepository.findAll(queryParams);
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

  async create(dto: CreateProductDto): Promise<ProductDocument> {
    await this.assertCategoryAndBrand(dto.category, dto.brand);
    this.assertPriceInvariant(dto.price, dto.priceAfterDiscount);
    this.assertStockStatusCombo(dto.stock, dto.status);

    const canonicalTitle = getLocalizedValue(dto.title, DEFAULT_CONTENT_LOCALE);
    if (!canonicalTitle) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'validation.field_required',
        { field: `title.${DEFAULT_CONTENT_LOCALE}` },
      );
    }

    await this.assertTitleAvailable(canonicalTitle);
    await this.assertSkuAvailable(dto.sku);

    const slug = await this.productRepository.generateUniqueSlug(canonicalTitle);
    const order =
      dto.order ?? (await this.productRepository.getMaxOrder()) + 1;
    const status = resolveProductStatus(dto.stock, dto.status);
    const priceAfterDiscount = dto.priceAfterDiscount ?? 0;

    try {
      const product = await this.productRepository.createProduct({
        ...dto,
        slug,
        order,
        status,
        priceAfterDiscount,
      });
      if (!product) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'product.createFailed',
        );
      }
      return product;
    } catch (error) {
      this.rethrowDuplicateKey(error);
      throw error;
    }
  }

  async createBulk(dtos: CreateProductDto[]): Promise<ProductDocument[]> {
    const prepared: CreateProductPersistence[] = [];
    let nextOrder = (await this.productRepository.getMaxOrder()) + 1;
    const seenTitles = new Set<string>();
    const seenSkus = new Set<string>();

    for (const dto of dtos) {
      await this.assertCategoryAndBrand(dto.category, dto.brand);
      this.assertPriceInvariant(dto.price, dto.priceAfterDiscount);
      this.assertStockStatusCombo(dto.stock, dto.status);

      const canonicalTitle = getLocalizedValue(
        dto.title,
        DEFAULT_CONTENT_LOCALE,
      );
      if (!canonicalTitle) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'validation.field_required',
          { field: `title.${DEFAULT_CONTENT_LOCALE}` },
        );
      }

      const sku = dto.sku.toUpperCase();
      if (seenTitles.has(canonicalTitle) || seenSkus.has(sku)) {
        throw new I18nHttpException(
          HttpStatus.CONFLICT,
          seenTitles.has(canonicalTitle)
            ? 'product.titleAlreadyExists'
            : 'product.skuAlreadyExists',
          seenTitles.has(canonicalTitle)
            ? { title: canonicalTitle }
            : { sku },
        );
      }

      await this.assertTitleAvailable(canonicalTitle);
      await this.assertSkuAvailable(sku);

      seenTitles.add(canonicalTitle);
      seenSkus.add(sku);

      const slug =
        await this.productRepository.generateUniqueSlug(canonicalTitle);
      const order = dto.order ?? nextOrder++;

      prepared.push({
        ...dto,
        sku,
        slug,
        order,
        status: resolveProductStatus(dto.stock, dto.status),
        priceAfterDiscount: dto.priceAfterDiscount ?? 0,
      });
    }

    try {
      return await this.productRepository.createProducts(prepared);
    } catch (error) {
      this.rethrowDuplicateKey(error);
      throw error;
    }
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

    const nextPrice = dto.price ?? existing.price;
    const nextDiscount =
      dto.priceAfterDiscount !== undefined
        ? dto.priceAfterDiscount
        : existing.priceAfterDiscount;
    this.assertPriceInvariant(nextPrice, nextDiscount);

    const nextStock = dto.stock ?? existing.stock;
    const requestedStatus = dto.status ?? existing.status;
    this.assertStockStatusCombo(nextStock, requestedStatus);

    const existingCanonicalTitle = getLocalizedValue(
      existing.title as unknown as Record<string, string>,
      DEFAULT_CONTENT_LOCALE,
    );
    const newCanonicalTitle = dto.title
      ? getLocalizedValue(dto.title, DEFAULT_CONTENT_LOCALE)
      : undefined;

    if (
      newCanonicalTitle &&
      newCanonicalTitle !== existingCanonicalTitle
    ) {
      await this.assertTitleAvailable(newCanonicalTitle);
      dto.slug = await this.productRepository.generateUniqueSlug(
        newCanonicalTitle,
        existing.id.toString(),
      );
    }

    if (dto.sku && dto.sku.toUpperCase() !== existing.sku) {
      await this.assertSkuAvailable(dto.sku);
    }

    dto.status = resolveProductStatus(nextStock, requestedStatus);
    if (dto.priceAfterDiscount === undefined && dto.price !== undefined) {
      // keep discount coherent if only price changes and discount would exceed
      if (existing.priceAfterDiscount > nextPrice) {
        dto.priceAfterDiscount = nextPrice;
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
    await this.productRepository.softDeleteProduct(id);
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

  private async assertSkuAvailable(sku: string): Promise<void> {
    const skuExists = await this.productRepository.findBySku(sku);
    if (skuExists) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'product.skuAlreadyExists',
        { sku: sku.toUpperCase() },
      );
    }
  }

  private assertPriceInvariant(
    price: number,
    priceAfterDiscount?: number | null,
  ): void {
    if (
      priceAfterDiscount != null &&
      priceAfterDiscount > price
    ) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'product.invalidPriceAfterDiscount',
      );
    }
  }

  private assertStockStatusCombo(
    stock: number,
    status?: ProductStatus,
  ): void {
    if (status === ProductStatus.ACTIVE && stock <= 0) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'product.invalidStockStatus',
      );
    }
  }

  private rethrowDuplicateKey(error: unknown): void {
    if (!isDuplicateKeyError(error)) return;

    const field = getDuplicateKeyField(error) ?? '';
    if (field.includes('sku')) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'product.skuAlreadyExists',
        { sku: '' },
      );
    }
    if (field.includes('slug')) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'product.slugAlreadyExists',
      );
    }
    throw new I18nHttpException(
      HttpStatus.CONFLICT,
      'product.titleAlreadyExists',
      { title: '' },
    );
  }
}
