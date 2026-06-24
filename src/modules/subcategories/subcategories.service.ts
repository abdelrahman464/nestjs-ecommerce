import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { generateUniqueSlug } from '../../common/utils/slug.util';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { CategoryRepository } from '../categories/repository/categories.repository';
import { CreateSubCategoryDto } from './dto/create-subcategory.dto';
import { UpdateSubCategoryDto } from './dto/update-subcategory.dto';
import { SubCategoryRepository } from './repository/subcategory.repository';
import { SubCategory, SubCategoryDocument } from './schemas/subcategory.schema';

@Injectable()
export class SubCategoriesService {
  constructor(
    private readonly subCategoryRepository: SubCategoryRepository,
    private readonly categoryRepository: CategoryRepository,
    @InjectModel(SubCategory.name)
    private readonly subCategoryModel: Model<SubCategoryDocument>,
  ) {}

  async findAll(
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<SubCategoryDocument>> {
    return this.subCategoryRepository.findAll(queryParams);
  }

  async findByCategory(
    categoryId: Types.ObjectId,
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<SubCategoryDocument>> {
    await this.ensureCategoryExists(categoryId);
    return this.subCategoryRepository.findAll({
      ...queryParams,
      category: categoryId.toString(),
    });
  }

  async findOne(id: Types.ObjectId): Promise<SubCategoryDocument> {
    const subCategory = await this.subCategoryRepository.findById(id);
    if (!subCategory) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'subcategory.notFound',
        {
          id: id.toString(),
        },
      );
    }
    return subCategory;
  }

  async findBySlug(slug: string): Promise<SubCategoryDocument> {
    const subCategory = await this.subCategoryRepository.findBySlug(slug);
    if (!subCategory) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'subcategory.notFoundBySlug',
        { slug },
      );
    }
    return subCategory;
  }

  async create(dto: CreateSubCategoryDto): Promise<SubCategoryDocument> {
    await this.ensureCategoryExists(dto.category);

    const titleExists = await this.subCategoryRepository.findByGermanTitle(
      dto.title['de'],
      dto.category,
    );
    if (titleExists) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'subcategory.titleAlreadyExists',
        { title: dto.title['de'] },
      );
    }

    const slug = await generateUniqueSlug(
      dto.title['de'],
      this.subCategoryModel,
    );
    const subCategory = await this.subCategoryRepository.createSubCategory({
      ...dto,
      slug,
    });
    if (!subCategory) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'subcategory.createFailed',
      );
    }

    return subCategory;
  }

  async update(
    id: Types.ObjectId,
    dto: UpdateSubCategoryDto,
  ): Promise<SubCategoryDocument> {
    const existing = await this.subCategoryRepository.findById(id);
    if (!existing) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'subcategory.notFound',
        {
          id: id.toString(),
        },
      );
    }
    // ensure category exists
    if (dto.category) {
      await this.ensureCategoryExists(dto.category);
    }
    // get target category
    const targetCategory = dto.category ?? existing.category;
    // get existing german title
        const existingGermanTitle = existing.title?.['de'] ?? undefined;
    // get new german title
    const newGermanTitle = dto.title?.['de'] ?? undefined;
    // check if new german title is different from existing german title
    if (newGermanTitle && newGermanTitle !== existingGermanTitle) {
      // check if new english title already exists
      const titleExists = await this.subCategoryRepository.findByGermanTitle(
        newGermanTitle,
        targetCategory,
      );
      // if new german title already exists, throw error
      if (titleExists && titleExists.id.toString() !== existing.id.toString()) {
        throw new I18nHttpException(
          HttpStatus.CONFLICT,
          'subcategory.titleAlreadyExists',
          { title: newGermanTitle },
        );
      }

      dto.slug = await generateUniqueSlug(
        newGermanTitle,
        this.subCategoryModel,
        existing.id.toString(),
      );
    }

    const updated = await this.subCategoryRepository.updateSubCategory(id, dto);
    if (!updated) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'subcategory.notFound',
        {
          id: id.toString(),
        },
      );
    }

    return updated;
  }

  async delete(id: Types.ObjectId): Promise<void> {
    await this.findOne(id);
    await this.subCategoryRepository.deleteSubCategory(id);
  }

  private async ensureCategoryExists(
    category: Types.ObjectId | string,
  ): Promise<void> {
    const parent = await this.categoryRepository.findById(category);
    if (!parent) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'subcategory.parentNotFound',
        { id: category.toString() },
      );
    }
  }
}
