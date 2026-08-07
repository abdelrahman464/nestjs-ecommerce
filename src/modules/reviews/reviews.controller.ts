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
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewsService } from './reviews.service';
import { ReviewDocument } from './schemas/review.schema';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateReviewDto,
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<ReviewDocument> {
    return this.reviewsService.createReview(dto, authUser.id);
  }

  @Public()
  @Get()
  async findAll(
    @Query() queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<ReviewDocument>> {
    return this.reviewsService.getAllReviews(queryParams);
  }

  @Get('my')
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.MANAGER)
  async findMine(
    @GetAuthUser() authUser: AuthenticatedUser,
    @Query() queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<ReviewDocument>> {
    return this.reviewsService.getMyReviews(authUser.id, queryParams);
  }

  @Public()
  @Get('product/:productId')
  async findByProduct(
    @Param('productId', ParseObjectIdPipe) productId: Types.ObjectId,
    @Query() queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<ReviewDocument>> {
    return this.reviewsService.getReviewsByProduct(
      productId.toString(),
      queryParams,
    );
  }

  @Public()
  @Get(':id')
  async findOne(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
  ): Promise<ReviewDocument> {
    return this.reviewsService.getReviewById(id.toString());
  }

  @Patch(':id')
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.MANAGER)
  async update(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() dto: UpdateReviewDto,
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<ReviewDocument> {
    return this.reviewsService.updateReview(
      id.toString(),
      dto,
      authUser.id,
      authUser.role,
    );
  }

  @Delete(':id')
  @Roles(UserRole.USER, UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.OK)
  async remove(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<void> {
    return this.reviewsService.deleteReview(
      id.toString(),
      authUser.id,
      authUser.role,
    );
  }
}
