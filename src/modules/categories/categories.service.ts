import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  DEFAULT_CONTENT_LOCALE,
  getLocalizedValue,
} from '../../common/constants/supported-content-locales.constant';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { generateUniqueSlug } from '../../common/utils/slug.util';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryRepository } from './repository/categories.repository';
import { Category, CategoryDocument } from './schemas/category.schema';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly categoryRepository: CategoryRepository,
    @InjectModel(Category.name) private categoryModel: Model<CategoryDocument>,
  ) {}

  async findAll(
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<CategoryDocument>> {
    return this.categoryRepository.findAll(queryParams);
  }

  async findByParentCategory(
    parentCategoryId: Types.ObjectId,
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<CategoryDocument>> {
    await this.ensureParentCategoryExists(parentCategoryId);
    return this.categoryRepository.findByParentCategory(
      parentCategoryId,
      queryParams,
    );
  }

  async findOne(id: Types.ObjectId): Promise<CategoryDocument> {
    const category = await this.categoryRepository.findById(id);
    if (!category) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'category.notFound', {
        id: id.toString(),
      });
    }
    return category;
  }

  async findBySlug(slug: string): Promise<CategoryDocument> {
    const category = await this.categoryRepository.findBySlug(slug);
    if (!category) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'category.notFoundBySlug',
        {
          slug: slug,
        },
      );
    }
    return category;
  }

  /** Active categories for the public SEO sitemap. */
  async listSitemapEntries(): Promise<
    Array<{ slug: string; updatedAt: Date }>
  > {
    return this.categoryRepository.listSitemapEntries();
  }

  async create(dto: CreateCategoryDto): Promise<CategoryDocument> {
    if (dto.parentCategory) {
      await this.ensureParentCategoryExists(dto.parentCategory);
    }

    const canonicalTitle = getLocalizedValue(dto.title, DEFAULT_CONTENT_LOCALE)!;
    const titleExists = await this.categoryRepository.findByDefaultLocaleTitle(
      canonicalTitle,
      dto.parentCategory ?? null,
    );
    if (titleExists) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'category.titleAlreadyExists',
        { title: canonicalTitle },
      );
    }

    const slug = await generateUniqueSlug({
      title: canonicalTitle,
      model: this.categoryModel,
    });
    const category = await this.categoryRepository.createCategory({
      ...dto,
      slug,
    });
    if (!category) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'category.createFailed',
      );
    }

    return category;
  }

  async createBulk(dtos: CreateCategoryDto[]): Promise<CategoryDocument[]> {
    const prepared: Array<CreateCategoryDto & { slug: string }> = [];

    for (const dto of dtos) {
      if (dto.parentCategory) {
        await this.ensureParentCategoryExists(dto.parentCategory);
      }

      const canonicalTitle = getLocalizedValue(
        dto.title,
        DEFAULT_CONTENT_LOCALE,
      )!;
      const titleExists =
        await this.categoryRepository.findByDefaultLocaleTitle(
          canonicalTitle,
          dto.parentCategory ?? null,
        );
      if (titleExists) {
        throw new I18nHttpException(
          HttpStatus.CONFLICT,
          'category.titleAlreadyExists',
          { title: canonicalTitle },
        );
      }

      const slug = await generateUniqueSlug({
        title: canonicalTitle,
        model: this.categoryModel,
      });
      prepared.push({ ...dto, slug });
    }

    return this.categoryRepository.createCategories(prepared);
  }

  async update(
    id: Types.ObjectId,
    dto: UpdateCategoryDto,
  ): Promise<CategoryDocument> {
    const existing = await this.categoryRepository.findById(id);
    if (!existing) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'category.notFound', {
        id: id.toString(),
      });
    }

    if (dto.parentCategory) {
      await this.ensureParentCategoryExists(dto.parentCategory);

      if (dto.parentCategory.toString() === id.toString()) {
        throw new I18nHttpException(
          HttpStatus.BAD_REQUEST,
          'category.invalidParent',
        );
      }
    }

    const targetParent =
      dto.parentCategory !== undefined
        ? dto.parentCategory
        : (existing.parentCategory ?? null);

    const existingCanonicalTitle = getLocalizedValue(
      existing.title as unknown as Record<string, string>,
      DEFAULT_CONTENT_LOCALE,
    );
    const newCanonicalTitle = dto.title
      ? getLocalizedValue(dto.title, DEFAULT_CONTENT_LOCALE)
      : undefined;

    if (newCanonicalTitle && newCanonicalTitle !== existingCanonicalTitle) {
      const titleExists =
        await this.categoryRepository.findByDefaultLocaleTitle(
          newCanonicalTitle,
          targetParent,
        );
      if (titleExists && titleExists.id.toString() !== existing.id.toString()) {
        throw new I18nHttpException(
          HttpStatus.CONFLICT,
          'category.titleAlreadyExists',
          { title: newCanonicalTitle },
        );
      }

      dto.slug = await generateUniqueSlug({
        title: newCanonicalTitle,
        model: this.categoryModel,
        excludeId: existing.id.toString(),
      });
    }

    const updated = await this.categoryRepository.updateCategory(id, dto);
    if (!updated) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'category.notFound', {
        id: id.toString(),
      });
    }

    return updated;
  }

  async delete(id: Types.ObjectId): Promise<void> {
    await this.findOne(id);

    const childCount =
      await this.categoryRepository.countChildrenByParentCategory(id);
    if (childCount > 0) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'category.hasChildren',
      );
    }

    await this.categoryRepository.deleteCategory(id);
  }

  private async ensureParentCategoryExists(
    parentCategory: Types.ObjectId | string,
  ): Promise<void> {
    const parent = await this.categoryRepository.findById(parentCategory);
    if (!parent) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'category.parentNotFound',
        { id: parentCategory.toString() },
      );
    }
  }
}
