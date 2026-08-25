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
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Types } from 'mongoose';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import { Localize } from '../../common/decorators/localize.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { LocalizeMode } from '../../common/enums/localize-mode.enum';
import { IMAGE_UPLOAD_PIPE } from '../media/media.constants';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { BulkCreateProductsDto } from './dto/bulk-create-products.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ReorderProductsDto } from './dto/reorder-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductStatus } from './enums/product-status.enum';
import { ProductsService } from './products.service';
import { ProductDocument } from './schemas/product.schema';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Public()
  @Get()
  async findAll(
    @Query() queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<ProductDocument>> {
    const { status, ...rest } = queryParams;
    // Default: active only. Pass status=all to list every non-deleted status.
    const params =
      status === 'all'
        ? rest
        : { ...rest, status: status ?? ProductStatus.ACTIVE };

    return this.productsService.findAll(params);
  }

  /**
   * Customer catalog. Must sit before `:id` so "storefront" is not parsed
   * as an ObjectId.
   */
  @Public()
  @Get('storefront')
  async findStorefront(@Query() queryParams: Record<string, unknown>) {
    return this.productsService.getStorefrontCatalog(queryParams);
  }

  @Public()
  @Get('storefront/slug/:slug')
  async findStorefrontBySlug(@Param('slug') slug: string) {
    return this.productsService.getStorefrontBySlug(slug);
  }

  /**
   * Declared BEFORE `@Get(':id')` — Nest matches same-depth routes in
   * declaration order, so putting it later would let `:id` swallow
   * "stock-overview" and fail the ObjectId pipe.
   */
  @Get('stockOverview')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async stockOverview(@Query() queryParams: Record<string, unknown>) {
    return this.productsService.getStockOverview(queryParams);
  }

  @Public()
  @Localize(LocalizeMode.ALL)
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string): Promise<ProductDocument> {
    return this.productsService.findBySlug(slug);
  }

  @Public()
  @Localize(LocalizeMode.ALL)
  @Get(':id')
  async findOne(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
  ): Promise<ProductDocument> {
    return this.productsService.findOne(id);
  }

  @Post('bulk')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async createBulk(
    @Body() bulkCreateProductsDto: BulkCreateProductsDto,
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<ProductDocument[]> {
    return this.productsService.createBulk(
      bulkCreateProductsDto.products,
      authUser.id,
    );
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateProductDto,
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<ProductDocument> {
    return this.productsService.create(dto, authUser.id);
  }

  @Patch('reorder')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async reorder(
    @Body() reorderProductsDto: ReorderProductsDto,
  ): Promise<ProductDocument[]> {
    return this.productsService.reorder(reorderProductsDto.items);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async update(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductDocument> {
    return this.productsService.update(id, dto);
  }

  /**
   * Append multiple gallery images first (more specific path than :id/images).
   * multipart field: `files` (max 10 files in this request)
   */
  @Post(':id/images/bulk')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadImages(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @UploadedFiles(IMAGE_UPLOAD_PIPE)
    files: Express.Multer.File[],
  ): Promise<ProductDocument> {
    return this.productsService.uploadImages(id, files);
  }

  /**
   * Append one gallery image (Cloudinary).
   * multipart field: `file`
   * Max 10 images per product.
   */
  @Post(':id/images')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @UploadedFile(IMAGE_UPLOAD_PIPE)
    file: Express.Multer.File,
  ): Promise<ProductDocument> {
    return this.productsService.uploadImage(id, file);
  }

  /**
   * Remove one image by URL.
   * Body: { "url": "https://res.cloudinary.com/..." }
   * (also accepts ?url= as a convenience)
   */
  @Delete(':id/images')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async removeImage(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body('url') bodyUrl?: string,
    @Query('url') queryUrl?: string,
  ): Promise<ProductDocument> {
    return this.productsService.removeImage(id, bodyUrl ?? queryUrl ?? '');
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
  ): Promise<void> {
    return this.productsService.delete(id);
  }
}
