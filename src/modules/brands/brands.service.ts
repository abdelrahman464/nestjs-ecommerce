import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { generateUniqueSlug } from '../../common/utils/slug.util';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { BrandRepository } from './repository/brands.repository';
import { Brand, BrandDocument } from './schemas/brand.schema';

@Injectable()
export class BrandsService {
  constructor(
    private readonly brandRepository: BrandRepository,
    @InjectModel(Brand.name) private brandModel: Model<BrandDocument>,
  ) {}

  async findAll(
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<BrandDocument>> {
    return this.brandRepository.findAll(queryParams);
  }

  async findOne(id: Types.ObjectId): Promise<BrandDocument> {
    const brand = await this.brandRepository.findById(id);
    if (!brand) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'brand.notFound', {
        id: id.toString(),
      });
    }
    return brand;
  }

  async findBySlug(slug: string): Promise<BrandDocument> {
    const brand = await this.brandRepository.findBySlug(slug);
    if (!brand) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'brand.notFoundBySlug',
        {
          slug,
        },
      );
    }
    return brand;
  }

  async create(dto: CreateBrandDto): Promise<BrandDocument> {
    const titleExists = await this.brandRepository.findByGermanTitle(
      dto.title['de'],
    );
    if (titleExists) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'brand.titleAlreadyExists',
        { title: dto.title['de'] },
      );
    }

    const slug = await generateUniqueSlug(dto.title['de'], this.brandModel);
    const brand = await this.brandRepository.createBrand({ ...dto, slug });
    if (!brand) {
      throw new I18nHttpException(HttpStatus.BAD_REQUEST, 'brand.createFailed');
    }
    return brand;
  }

  async update(
    id: Types.ObjectId,
    dto: UpdateBrandDto,
  ): Promise<BrandDocument> {
    const existing = await this.brandRepository.findById(id);
    if (!existing) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'brand.notFound', {
        id: id.toString(),
      });
    }

    const existingGermanTitle = existing.title?.['de'] ?? undefined;
    const newGermanTitle = dto.title?.['de'] ?? undefined;

    if (newGermanTitle && newGermanTitle !== existingGermanTitle) {
      const titleExists =
        await this.brandRepository.findByGermanTitle(newGermanTitle);
      if (titleExists) {
        throw new I18nHttpException(
          HttpStatus.CONFLICT,
          'brand.titleAlreadyExists',
          { title: newGermanTitle },
        );
      }
      dto.slug = await generateUniqueSlug(
        newGermanTitle,
        this.brandModel,
        existing.id.toString(),
      );
    }

    const updated = await this.brandRepository.updateBrand(id, dto);
    if (!updated) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'brand.notFound', {
        id: id.toString(),
      });
    }
    return updated;
  }

  async delete(id: Types.ObjectId): Promise<void> {
    await this.findOne(id);
    await this.brandRepository.deleteBrand(id);
  }
}
