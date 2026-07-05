import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from '../users/enums/user-role.enum';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { BulkCreateCategoriesDto } from './dto/bulk-create-categories.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CategoryDocument } from './schemas/category.schema';
import { Public } from 'src/common/decorators/public.decorator';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { Localize } from 'src/common/decorators/localize.decorator';
import { LocalizeMode } from 'src/common/enums/localize-mode.enum';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  async findAll(
    @Query() queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<CategoryDocument>> {
    return this.categoriesService.findAll(queryParams);
  }

  @Public()
  @Get('parent/:parentCategoryId')
  async findByParentCategory(
    @Param('parentCategoryId', ParseObjectIdPipe)
    parentCategoryId: Types.ObjectId,
    @Query() queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<CategoryDocument>> {
    return this.categoriesService.findByParentCategory(
      parentCategoryId,
      queryParams,
    );
  }

  @Public()
  @Localize(LocalizeMode.ALL)
  @Get('slug/:slug')
  async findOneBySlug(@Param('slug') slug: string): Promise<CategoryDocument> {
    return this.categoriesService.findBySlug(slug);
  }

  @Post('bulk')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async createBulk(
    @Body() bulkCreateCategoriesDto: BulkCreateCategoriesDto,
  ): Promise<CategoryDocument[]> {
    return this.categoriesService.createBulk(bulkCreateCategoriesDto.categories);
  }

  @Public()
  @Localize(LocalizeMode.ALL)
  @Get(':id')
  async findOne(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
  ): Promise<CategoryDocument> {
    return this.categoriesService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createCategoryDto: CreateCategoryDto,
  ): Promise<CategoryDocument> {
    return this.categoriesService.create(createCategoryDto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async update(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ): Promise<CategoryDocument> {
    return this.categoriesService.update(id, updateCategoryDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
  ): Promise<void> {
    return this.categoriesService.delete(id);
  }
}
