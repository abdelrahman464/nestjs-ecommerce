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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Types } from 'mongoose';
import { Localize } from 'src/common/decorators/localize.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { LocalizeMode } from 'src/common/enums/localize-mode.enum';
import { IMAGE_UPLOAD_PIPE } from '../media/media.constants';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { CategoriesService } from './categories.service';
import { BulkCreateCategoriesDto } from './dto/bulk-create-categories.dto';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CategoryDocument } from './schemas/category.schema';

@Controller('categories')
// @SerializeDto(CategoryResponseDto)
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

  /**
   * Upload category image → Cloudinary → save URL on the category.
   *
   * multipart field name: `file`
   * Auth: ADMIN or MANAGER
   *
   * Example (Postman):
   *   POST {{base}}/categories/{{id}}/image
   *   Authorization: Bearer <admin jwt>
   *   Body → form-data → key `file` (type File) → pick a jpg/png/webp
   */
  @Post(':id/image')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @UploadedFile(IMAGE_UPLOAD_PIPE)
    file: Express.Multer.File,
  ): Promise<CategoryDocument> {
    return this.categoriesService.uploadImage(id, file);
  }

  /** Remove image from category + delete asset on Cloudinary. */
  @Delete(':id/image')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async removeImage(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
  ): Promise<CategoryDocument> {
    return this.categoriesService.removeImage(id);
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
