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
import { Localize } from '../../common/decorators/localize.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { LocalizeMode } from '../../common/enums/localize-mode.enum';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { BrandsService } from './brands.service';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { BrandDocument } from './schemas/brand.schema';

@Controller('brands')
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Public()
  @Get()
  async findAll(
    @Query() queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<BrandDocument>> {
    return this.brandsService.findAll(queryParams);
  }

  @Public()
  @Localize(LocalizeMode.ALL)
  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string): Promise<BrandDocument> {
    return this.brandsService.findBySlug(slug);
  }

  @Public()
  @Localize(LocalizeMode.ALL)
  @Get(':id')
  async findOne(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
  ): Promise<BrandDocument> {
    return this.brandsService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateBrandDto): Promise<BrandDocument> {
    return this.brandsService.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async update(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() dto: UpdateBrandDto,
  ): Promise<BrandDocument> {
    return this.brandsService.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
  ): Promise<void> {
    return this.brandsService.delete(id);
  }
}
