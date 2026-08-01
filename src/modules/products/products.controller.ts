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
import { Localize } from 'src/common/decorators/localize.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { SerializeDto } from 'src/common/decorators/serializeDto.decorator';
import { LocalizeMode } from 'src/common/enums/localize-mode.enum';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { BulkCreateProductsDto } from './dto/bulk-create-products.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import { ReorderProductsDto } from './dto/reorder-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductStatus } from './enums/product-status.enum';
import { ProductsService } from './products.service';
import { ProductDocument } from './schemas/product.schema';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import { AuthenticatedUser } from '../../common/types/authenticated-user.type';

@Controller('products')
// @SerializeDto(ProductResponseDto)
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
    return this.productsService.createBulk(bulkCreateProductsDto.products, authUser.id);
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

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
  ): Promise<void> {
    return this.productsService.delete(id);
  }
}
