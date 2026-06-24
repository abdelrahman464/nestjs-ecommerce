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
import { UpdateCategoryDto } from './dto/update-category.dto';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { CategoryDocument } from './schemas/category.schema';
import { Public } from 'src/common/decorators/public.decorator';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { Localize } from 'src/common/decorators/localize.decorator';
import { LocalizeMode } from 'src/common/enums/localize-mode.enum';

@Controller('categories')
// @SerializeDto(CategoryResponseDto)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  async findAll(
    @Query() queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<CategoryDocument>> {
    const categories = await this.categoriesService.findAll(queryParams);
    return categories;
  }

  @Public()
  @Localize(LocalizeMode.ALL)
  @Get(':id')
  async findOne(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
  ): Promise<CategoryDocument> {
    const category = await this.categoriesService.findOne(id);
    return category;
  }

  @Public()
  @Localize(LocalizeMode.ALL)
  @Get(':slug')
  async findOneBySlug(@Param('slug') slug: string): Promise<CategoryDocument> {
    const category = await this.categoriesService.findBySlug(slug);
    return category;
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createCategoryDto: CreateCategoryDto,
  ): Promise<CategoryDocument> {
    const category = await this.categoriesService.create(createCategoryDto);
    return category;
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async update(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ): Promise<CategoryDocument> {
    const category = await this.categoriesService.update(id, updateCategoryDto);
    return category;
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
