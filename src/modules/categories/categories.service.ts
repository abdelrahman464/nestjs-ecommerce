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
    const titleExists = await this.categoryRepository.findByGermanTitle(
      dto.title['de'],
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

  async update(
    id: Types.ObjectId,
    dto: UpdateCategoryDto,
  ): Promise<CategoryDocument> {
    const existing = await this.categoryRepository.findById(id);
    if (!existing)
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'category.notFound', {
        id: id.toString(),
      });

    // get existing english title
    const existingGermanTitle = existing.title?.['de'] ?? undefined;

    // get new english title
    const newGermanTitle = dto.title?.['de'] ?? undefined;

    // check if new english title is different from existing english title
    if (newGermanTitle && newGermanTitle !== existingGermanTitle) {
      // check if new english title already exists
      const titleExists =
        await this.categoryRepository.findByGermanTitle(newGermanTitle);
      // if new english title already exists, throw error
      if (titleExists) {
        throw new I18nHttpException(
          HttpStatus.CONFLICT,
          'category.titleAlreadyExists',
          { title: newGermanTitle },
        );
      }
      // generate new slug
      const newSlug = await generateUniqueSlug(
        newGermanTitle,
        this.categoryModel,
        existing.id.toString(),
      );
      dto.slug = newSlug;
    }

    return this.categoryRepository.updateCategory(id, dto);
  }

  async delete(id: Types.ObjectId): Promise<void> {
    await this.findOne(id);
    await this.categoryRepository.deleteCategory(id);
  }
}
