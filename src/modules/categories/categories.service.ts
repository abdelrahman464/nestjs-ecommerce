import { Injectable, HttpStatus } from '@nestjs/common';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { Model, Types } from 'mongoose';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category, CategoryDocument } from './schemas/category.schema';
import { CategoryRepository } from './repository/categories.repository';
import { generateUniqueSlug } from '../../common/utils/slug.util';
import { InjectModel } from '@nestjs/mongoose';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';

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

  async create(dto: CreateCategoryDto): Promise<CategoryDocument> {
    if (dto.parentCategory) {
      await this.ensureParentCategoryExists(dto.parentCategory);
    }

    const titleExists = await this.categoryRepository.findByGermanTitle(
      dto.title['de'],
      dto.parentCategory ?? null,
    );
    if (titleExists) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'category.titleAlreadyExists',
        { title: dto.title['de'] },
      );
    }

    const slug = await generateUniqueSlug(dto.title['de'], this.categoryModel);
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

      const titleExists = await this.categoryRepository.findByGermanTitle(
        dto.title['de'],
        dto.parentCategory ?? null,
      );
      if (titleExists) {
        throw new I18nHttpException(
          HttpStatus.CONFLICT,
          'category.titleAlreadyExists',
          { title: dto.title['de'] },
        );
      }

      const slug = await generateUniqueSlug(
        dto.title['de'],
        this.categoryModel,
      );
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

    const existingGermanTitle = existing.title?.['de'] ?? undefined;
    const newGermanTitle = dto.title?.['de'] ?? undefined;

    // if the new german title is different from the existing german title, check if the title already exists
    if (newGermanTitle && newGermanTitle !== existingGermanTitle) {
      //make sure the title is not already taken by another category in the same parent category
      const titleExists = await this.categoryRepository.findByGermanTitle(
        newGermanTitle,
        targetParent,
      );
      if (titleExists && titleExists.id.toString() !== existing.id.toString()) {
        throw new I18nHttpException(
          HttpStatus.CONFLICT,
          'category.titleAlreadyExists',
          { title: newGermanTitle },
        );
      }

      dto.slug = await generateUniqueSlug(
        newGermanTitle,
        this.categoryModel,
        existing.id.toString(),
      );
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

    // block deletion if the category has children
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
