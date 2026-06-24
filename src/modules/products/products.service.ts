import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { generateUniqueSlug } from '../../common/utils/slug.util';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductRepository } from './repository/products.repository';
import { Product, ProductDocument } from './schemas/product.schema';

@Injectable()
export class ProductsService {
  constructor(
    private readonly productRepository: ProductRepository,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
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
    const titleExists = await this.productRepository.findByGermanTitle(
      dto.title['de'],
    );
    if (titleExists) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'product.titleAlreadyExists',
        { title: dto.title['de'] },
      );
    }

    const skuExists = await this.productRepository.findBySku(dto.sku);
    if (skuExists) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'product.skuAlreadyExists',
        {
          sku: dto.sku,
        },
      );
    }

    const slug = await generateUniqueSlug(dto.title['de'], this.productModel);
    const product = await this.productRepository.createProduct({
      ...dto,
      slug,
    });
    if (!product) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'product.createFailed',
      );
    }
    return product;
  }

  async update(
    id: Types.ObjectId,
    dto: UpdateProductDto,
  ): Promise<ProductDocument> {
    const existing = await this.productRepository.findById(id);
    if (!existing) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'product.notFound', {
        id: id.toString(),
      });
    }

    const existingGermanTitle = existing.title?.['de'] ?? undefined;
    const newGermanTitle = dto.title?.['de'] ?? undefined;

    if (newGermanTitle && newGermanTitle !== existingGermanTitle) {
      const titleExists =
        await this.productRepository.findByGermanTitle(newGermanTitle);
      if (titleExists) {
        throw new I18nHttpException(
          HttpStatus.CONFLICT,
          'product.titleAlreadyExists',
          { title: newGermanTitle },
        );
      }
      dto.slug = await generateUniqueSlug(
        newGermanTitle,
        this.productModel,
        existing.id.toString(),
      );
    }

    if (dto.sku && dto.sku.toUpperCase() !== existing.sku) {
      const skuExists = await this.productRepository.findBySku(dto.sku);
      if (skuExists) {
        throw new I18nHttpException(
          HttpStatus.CONFLICT,
          'product.skuAlreadyExists',
          { sku: dto.sku },
        );
      }
    }

    const updated = await this.productRepository.updateProduct(id, dto);
    if (!updated) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'product.notFound', {
        id: id.toString(),
      });
    }
    return updated;
  }

  async delete(id: Types.ObjectId): Promise<void> {
    await this.findOne(id);
    await this.productRepository.deleteProduct(id);
  }
}
