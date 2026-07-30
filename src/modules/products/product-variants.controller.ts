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
} from '@nestjs/common';
import { Types } from 'mongoose';
import { Public } from 'src/common/decorators/public.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { SerializeDto } from 'src/common/decorators/serializeDto.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { UserRole } from '../users/enums/user-role.enum';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { BulkCreateProductVariantsDto } from './dto/bulk-create-product-variants.dto';
import { ProductVariantResponseDto } from './dto/product-variant-response.dto';
import { ReorderVariantsDto } from './dto/reorder-variants.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { ProductVariantsService } from './product-variants.service';
import { ProductVariantDocument } from './schemas/product-variant.schema';

@Controller('products/:productId/variants')
// @SerializeDto(ProductVariantResponseDto)
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
  ): Promise<ProductVariantDocument[]> {
    return this.variantsService.createBulk(productId, dto.variants);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('productId', ParseObjectIdPipe) productId: Types.ObjectId,
    @Body() dto: CreateProductVariantDto,
  ): Promise<ProductVariantDocument> {
    return this.variantsService.create(productId, dto);
  }

  @Patch('reorder')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async reorder(
    @Param('productId', ParseObjectIdPipe) productId: Types.ObjectId,
    @Body() dto: ReorderVariantsDto,
  ): Promise<ProductVariantDocument[]> {
    return this.variantsService.reorder(productId, dto.items);
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
