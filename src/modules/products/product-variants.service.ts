import { HttpStatus, Injectable } from '@nestjs/common';
import { ClientSession, Types } from 'mongoose';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import {
  getDuplicateKeyField,
  isDuplicateKeyError,
} from '../../common/utils/mongo-error.util';
import {
  CreateDefaultVariantDto,
  CreateProductVariantDto,
  CreateProductVariantPersistence,
} from './dto/create-product-variant.dto';
import { ProductOptionDefinitionDto } from './dto/product-option-definition.dto';
import { ReorderVariantItemDto } from './dto/reorder-variants.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import {
  MAX_PRODUCT_OPTION_TYPES,
  ProductOptionType,
} from './enums/product-option-type.enum';
import { ProductStatus } from './enums/product-status.enum';
import { ProductVariantRepository } from './repository/product-variants.repository';
import { ProductRepository } from './repository/products.repository';
import { ProductDocument } from './schemas/product.schema';
import { ProductVariantDocument } from './schemas/product-variant.schema';
import { buildOptionsKey } from './utils/options-key.util';
import { resolveProductStatus } from './utils/product-status.util';

@Injectable()
export class ProductVariantsService {
  constructor(
    private readonly variantRepository: ProductVariantRepository,
    private readonly productRepository: ProductRepository,
  ) {}

  async findByProduct(
    productId: Types.ObjectId,
  ): Promise<ProductVariantDocument[]> {
    await this.requireProduct(productId);
    return this.variantRepository.findByProductId(productId);
  }

  async findOne(
    productId: Types.ObjectId,
    variantId: Types.ObjectId,
  ): Promise<ProductVariantDocument> {
    await this.requireProduct(productId);
    const variant = await this.variantRepository.findByIdAndProduct(
      variantId,
      productId,
    );
    if (!variant) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'product.variantNotFound',
        {
          id: variantId.toString(),
        },
      );
    }
    return variant;
  }

  async findAvailableById(variantId: string): Promise<ProductVariantDocument> {
    const variant = await this.variantRepository.findById(variantId);
    if (!variant) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'product.variantNotFound',
        {
          id: variantId,
        },
      );
    }

    const product = await this.productRepository.findById(variant.product);
    if (!product || product.status === ProductStatus.INACTIVE) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'product.variantUnavailable',
      );
    }

    if (
      variant.status === ProductStatus.INACTIVE ||
      variant.status === ProductStatus.OUT_OF_STOCK ||
      variant.stock <= 0
    ) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'product.variantUnavailable',
      );
    }

    return variant;
  }

  async createDefaultForProduct(
    product: ProductDocument,
    dto: CreateDefaultVariantDto,
    session?: ClientSession,
  ): Promise<ProductVariantDocument> {
    await this.assertSkuAvailable(dto.sku);
    await this.assertBarcodeAvailable(dto.barcode);
    this.assertPriceInvariant(dto.price, dto.priceAfterDiscount);
    this.assertStockStatusCombo(dto.stock, ProductStatus.ACTIVE);

    const options = this.normalizeOptions(dto.options);
    this.validateOptionsAgainstDefinitions(product, options);

    const payload: CreateProductVariantPersistence = {
      ...dto,
      product: product._id,
      options,
      optionsKey: buildOptionsKey(options),
      priceAfterDiscount: dto.priceAfterDiscount ?? 0,
      status: resolveProductStatus(dto.stock, ProductStatus.ACTIVE),
      isDefault: true,
      order: 0,
    };

    try {
      return await this.variantRepository.createVariant(payload, session);
    } catch (error) {
      this.rethrowDuplicateKey(error);
      throw error;
    }
  }

  async create(
    productId: Types.ObjectId,
    dto: CreateProductVariantDto,
  ): Promise<ProductVariantDocument> {
    const product = await this.requireProduct(productId);
    const options = this.normalizeOptions(dto.options);

    this.validateOptionsAgainstDefinitions(product, options);

    this.assertPriceInvariant(dto.price, dto.priceAfterDiscount);
    this.assertStockStatusCombo(dto.stock, dto.status);
    await this.assertSkuAvailable(dto.sku);
    await this.assertBarcodeAvailable(dto.barcode);

    const optionsKey = buildOptionsKey(options);
    const isDefault = dto.isDefault === true;
    const order =
      dto.order ?? (await this.variantRepository.getMaxOrder(productId)) + 1;

    if (isDefault) {
      await this.variantRepository.clearDefaultFlag(productId);
    }

    const payload: CreateProductVariantPersistence = {
      ...dto,
      product: productId,
      options,
      optionsKey,
      priceAfterDiscount: dto.priceAfterDiscount ?? 0,
      status: resolveProductStatus(dto.stock, dto.status),
      isDefault,
      order,
    };

    try {
      return await this.variantRepository.createVariant(payload);
    } catch (error) {
      this.rethrowDuplicateKey(error);
      throw error;
    }
  }

  async createBulk(
    productId: Types.ObjectId,
    dtos: CreateProductVariantDto[],
  ): Promise<ProductVariantDocument[]> {
    const product = await this.requireProduct(productId);

    const prepared: CreateProductVariantPersistence[] = [];
    const seenSkus = new Set<string>();
    const seenBarcodes = new Set<string>();
    const seenOptionsKeys = new Set<string>();
    let defaultCount = 0;
    let nextOrder = (await this.variantRepository.getMaxOrder(productId)) + 1;

    for (const dto of dtos) {
      const options = this.normalizeOptions(dto.options);
      this.validateOptionsAgainstDefinitions(product, options);
      this.assertPriceInvariant(dto.price, dto.priceAfterDiscount);
      this.assertStockStatusCombo(dto.stock, dto.status);

      const sku = dto.sku.toUpperCase();
      const barcode = dto.barcode.trim();
      const optionsKey = buildOptionsKey(options);

      if (seenSkus.has(sku)) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'product.skuDuplicateInRequest',
          { sku },
        );
      }
      if (seenBarcodes.has(barcode)) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'product.barcodeDuplicateInRequest',
          { barcode },
        );
      }
      if (seenOptionsKeys.has(optionsKey)) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'product.variantCombinationDuplicateInRequest',
        );
      }

      await this.assertSkuAvailable(sku);
      await this.assertBarcodeAvailable(barcode);

      seenSkus.add(sku);
      seenBarcodes.add(barcode);
      seenOptionsKeys.add(optionsKey);

      const isDefault = dto.isDefault === true;
      if (isDefault) defaultCount += 1;
      if (defaultCount > 1) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'product.multipleDefaultVariants',
        );
      }

      const order = dto.order ?? nextOrder++;

      prepared.push({
        ...dto,
        sku,
        barcode,
        product: productId,
        options,
        optionsKey,
        priceAfterDiscount: dto.priceAfterDiscount ?? 0,
        status: resolveProductStatus(dto.stock, dto.status),
        isDefault,
        order,
      });
    }

    try {
      return await this.variantRepository.createVariantsBulk(
        productId,
        prepared,
        defaultCount === 1,
      );
    } catch (error) {
      this.rethrowDuplicateKey(error);
      throw error;
    }
  }

  async update(
    productId: Types.ObjectId,
    variantId: Types.ObjectId,
    dto: UpdateProductVariantDto,
  ): Promise<ProductVariantDocument> {
    const product = await this.requireProduct(productId);
    const existing = await this.findOne(productId, variantId);

    const nextPrice = dto.price ?? existing.price;
    const nextDiscount =
      dto.priceAfterDiscount !== undefined
        ? dto.priceAfterDiscount
        : existing.priceAfterDiscount;
    this.assertPriceInvariant(nextPrice, nextDiscount);

    const nextStock = dto.stock ?? existing.stock;
    const requestedStatus = dto.status ?? existing.status;
    this.assertStockStatusCombo(nextStock, requestedStatus);

    if (dto.sku && dto.sku.toUpperCase() !== existing.sku) {
      await this.assertSkuAvailable(dto.sku);
    }
    if (dto.barcode && dto.barcode.trim() !== existing.barcode) {
      await this.assertBarcodeAvailable(dto.barcode);
    }

    const patch: UpdateProductVariantDto & {
      optionsKey?: string;
      options?: Record<string, string>;
      status?: ProductStatus;
    } = { ...dto };

    if (dto.options !== undefined) {
      const options = this.normalizeOptions(dto.options);
      this.validateOptionsAgainstDefinitions(product, options);
      patch.options = options;
      patch.optionsKey = buildOptionsKey(options);
    }

    patch.status = resolveProductStatus(nextStock, requestedStatus);

    if (dto.isDefault === false && existing.isDefault) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'product.cannotUnsetDefaultVariant',
      );
    }

    if (dto.isDefault === true && !existing.isDefault) {
      await this.variantRepository.clearDefaultFlag(productId);
    }

    if (dto.priceAfterDiscount === undefined && dto.price !== undefined) {
      if (existing.priceAfterDiscount > nextPrice) {
        patch.priceAfterDiscount = nextPrice;
      }
    }

    try {
      const updated = await this.variantRepository.updateVariant(
        variantId,
        patch,
      );
      if (!updated) {
        throw new I18nHttpException(
          HttpStatus.NOT_FOUND,
          'product.variantNotFound',
          { id: variantId.toString() },
        );
      }
      return updated;
    } catch (error) {
      this.rethrowDuplicateKey(error);
      throw error;
    }
  }

  async reorder(
    productId: Types.ObjectId,
    items: ReorderVariantItemDto[],
  ): Promise<ProductVariantDocument[]> {
    await this.requireProduct(productId);
    for (const item of items) {
      await this.findOne(productId, item.variantId);
    }
    return this.variantRepository.reorderVariants(productId, items);
  }

  async delete(
    productId: Types.ObjectId,
    variantId: Types.ObjectId,
  ): Promise<void> {
    await this.requireProduct(productId);
    const existing = await this.findOne(productId, variantId);
    const count = await this.variantRepository.countByProduct(productId);
    if (count <= 1) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'product.cannotDeleteLastVariant',
      );
    }

    await this.variantRepository.softDeleteVariant(variantId);

    if (existing.isDefault) {
      const remaining = await this.variantRepository.findByProductId(productId);
      if (remaining[0]) {
        await this.variantRepository.updateVariant(remaining[0]._id, {
          isDefault: true,
        });
      }
    }
  }

  validateOptionDefinitions(
    definitions: ProductOptionDefinitionDto[] | undefined,
    groupBy?: ProductOptionType | null,
  ): {
    optionDefinitions: ProductOptionDefinitionDto[];
    groupBy: ProductOptionType | null;
  } {
    const optionDefinitions = definitions ?? [];

    // chec
    if (optionDefinitions.length > MAX_PRODUCT_OPTION_TYPES) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'product.tooManyOptionTypes',
        { max: MAX_PRODUCT_OPTION_TYPES },
      );
    }

    // check for duplicate option types
    const seen = new Set<string>();
    for (const def of optionDefinitions) {
      if (seen.has(def.type)) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'product.duplicateOptionType',
          { type: def.type },
        );
      }
      seen.add(def.type);

      // normalize values and check for duplicate values
      const normalizedValues = def.values.map((v) => v.trim().toLowerCase());
      if (new Set(normalizedValues).size !== normalizedValues.length) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'product.duplicateOptionValue',
          { type: def.type },
        );
      }
    }

    // check for invalid groupBy type
    let nextGroupBy = groupBy ?? null;
    if (nextGroupBy && !seen.has(nextGroupBy)) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'product.invalidGroupBy',
        { groupBy: nextGroupBy },
      );
    }
    // set groupBy to null if no option definitions
    if (!optionDefinitions.length) {
      nextGroupBy = null;
    } else if (!nextGroupBy) {
      nextGroupBy = optionDefinitions[0].type;
    }

    return { optionDefinitions, groupBy: nextGroupBy };
  }

  validateOptionsAgainstDefinitions(
    product: Pick<ProductDocument, 'optionDefinitions'>,
    options: Record<string, string>,
  ): void {
    const definitions = product.optionDefinitions ?? [];
    const keys = Object.keys(options);

    if (!definitions.length) {
      if (keys.length) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'product.optionsNotAllowed',
        );
      }
      return;
    }

    const defMap = new Map<ProductOptionType, Set<string>>(
      definitions.map((d) => [
        d.type,
        new Set(d.values.map((v) => v.trim().toLowerCase())),
      ]),
    );

    for (const type of defMap.keys()) {
      if (!(type in options)) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'product.missingOptionType',
          { type },
        );
      }
    }
    for (const [type, value] of Object.entries(options)) {
      const allowed = defMap.get(type as ProductOptionType);

      if (!allowed) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'product.unknownOptionType',
          { type },
        );
      }
      if (!allowed.has(value.trim().toLowerCase())) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'product.invalidOptionValue',
          { type, value },
        );
      }
    }
  }

  /**
   * { "color": "Red", "size": "48" } → { "color": "red", "size": "48" }
   * {"color": "blue","size": "256","weight":""} → {"color": "blue","size": "256"}
   * */
  private normalizeOptions(
    options?: Record<string, string>,
  ): Record<string, string> {
    if (!options) return {};
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(options)) {
      if (value == null || String(value).trim() === '') continue;
      normalized[key.trim().toLowerCase()] = String(value).trim();
    }
    return normalized;
  }

  private async requireProduct(
    productId: Types.ObjectId,
  ): Promise<ProductDocument> {
    const product = await this.productRepository.findById(productId);
    if (!product) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'product.notFound', {
        id: productId.toString(),
      });
    }
    return product;
  }

  private async assertSkuAvailable(sku: string): Promise<void> {
    const exists = await this.variantRepository.findBySku(sku);
    if (exists) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'product.skuAlreadyExists',
        { sku: sku.toUpperCase() },
      );
    }
  }

  private async assertBarcodeAvailable(barcode: string): Promise<void> {
    const exists = await this.variantRepository.findByBarcode(barcode);
    if (exists) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'product.barcodeAlreadyExists',
        { barcode },
      );
    }
  }

  private assertPriceInvariant(
    price: number,
    priceAfterDiscount?: number | null,
  ): void {
    if (priceAfterDiscount != null && priceAfterDiscount > price) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'product.invalidPriceAfterDiscount',
      );
    }
  }

  private assertStockStatusCombo(stock: number, status?: ProductStatus): void {
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
        {
          sku: '',
        },
      );
    }
    if (field.includes('barcode')) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'product.barcodeAlreadyExists',
        { barcode: '' },
      );
    }
    if (field.includes('optionsKey')) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'product.variantCombinationExists',
      );
    }
    throw new I18nHttpException(
      HttpStatus.CONFLICT,
      'product.variantAlreadyExists',
    );
  }
}
