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
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { IMAGE_UPLOAD_PIPE } from '../media/media.constants';
import { UserRole } from '../users/enums/user-role.enum';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { BulkCreateProductVariantsDto } from './dto/bulk-create-product-variants.dto';
import { ReorderVariantsDto } from './dto/reorder-variants.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { ProductVariantsService } from './product-variants.service';
import { ProductVariantDocument } from './schemas/product-variant.schema';

@Controller('products/:productId/variants')
export class ProductVariantsController {
  constructor(private readonly variantsService: ProductVariantsService) {}

  @Public()
  @Get()
  async findAll(
    @Param('productId', ParseObjectIdPipe) productId: Types.ObjectId,
  ): Promise<ProductVariantDocument[]> {
    return this.variantsService.findByProduct(productId);
  }

  @Public()
  @Get(':variantId')
  async findOne(
    @Param('productId', ParseObjectIdPipe) productId: Types.ObjectId,
    @Param('variantId', ParseObjectIdPipe) variantId: Types.ObjectId,
  ): Promise<ProductVariantDocument> {
    return this.variantsService.findOne(productId, variantId);
  }

  @Post('bulk')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async createBulk(
    @Param('productId', ParseObjectIdPipe) productId: Types.ObjectId,
    @Body() dto: BulkCreateProductVariantsDto,
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<ProductVariantDocument[]> {
    return this.variantsService.createBulk(
      productId,
      dto.variants,
      authUser.id,
    );
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('productId', ParseObjectIdPipe) productId: Types.ObjectId,
    @Body() dto: CreateProductVariantDto,
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<ProductVariantDocument> {
    return this.variantsService.create(productId, dto, authUser.id);
  }

  @Patch('reorder')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async reorder(
    @Param('productId', ParseObjectIdPipe) productId: Types.ObjectId,
    @Body() dto: ReorderVariantsDto,
  ): Promise<ProductVariantDocument[]> {
    return this.variantsService.reorder(productId, dto.items);
  }

  /**
   * Append multiple gallery images (multipart field: `files`, max 10).
   */
  @Post(':variantId/images/bulk')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadImages(
    @Param('productId', ParseObjectIdPipe) productId: Types.ObjectId,
    @Param('variantId', ParseObjectIdPipe) variantId: Types.ObjectId,
    @UploadedFiles(IMAGE_UPLOAD_PIPE)
    files: Express.Multer.File[],
  ): Promise<ProductVariantDocument> {
    return this.variantsService.uploadImages(productId, variantId, files);
  }

  /**
   * Append one gallery image (Cloudinary).
   * multipart field: `file`
   * Max 10 images per variant.
   */
  @Post(':variantId/images')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Param('productId', ParseObjectIdPipe) productId: Types.ObjectId,
    @Param('variantId', ParseObjectIdPipe) variantId: Types.ObjectId,
    @UploadedFile(IMAGE_UPLOAD_PIPE)
    file: Express.Multer.File,
  ): Promise<ProductVariantDocument> {
    return this.variantsService.uploadImage(productId, variantId, file);
  }

  /**
   * Remove one image by URL.
   * Body: { "url": "https://res.cloudinary.com/..." }
   * (also accepts ?url= as a convenience)
   */
  @Delete(':variantId/images')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async removeImage(
    @Param('productId', ParseObjectIdPipe) productId: Types.ObjectId,
    @Param('variantId', ParseObjectIdPipe) variantId: Types.ObjectId,
    @Body('url') bodyUrl?: string,
    @Query('url') queryUrl?: string,
  ): Promise<ProductVariantDocument> {
    return this.variantsService.removeImage(
      productId,
      variantId,
      bodyUrl ?? queryUrl ?? '',
    );
  }

  @Patch(':variantId')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async update(
    @Param('productId', ParseObjectIdPipe) productId: Types.ObjectId,
    @Param('variantId', ParseObjectIdPipe) variantId: Types.ObjectId,
    @Body() dto: UpdateProductVariantDto,
  ): Promise<ProductVariantDocument> {
    return this.variantsService.update(productId, variantId, dto);
  }

  @Delete(':variantId')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('productId', ParseObjectIdPipe) productId: Types.ObjectId,
    @Param('variantId', ParseObjectIdPipe) variantId: Types.ObjectId,
  ): Promise<void> {
    return this.variantsService.delete(productId, variantId);
  }
}
