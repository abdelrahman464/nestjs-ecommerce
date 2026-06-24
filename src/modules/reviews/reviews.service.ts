import { HttpStatus, Injectable } from '@nestjs/common';
import mongoose from 'mongoose';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { UserRole } from '../users/enums/user-role.enum';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewRepository } from './repository/review.repository';
import { ReviewDocument } from './schemas/review.schema';

@Injectable()
export class ReviewsService {
  constructor(private readonly reviewRepository: ReviewRepository) {}

  async createReview(
    data: CreateReviewDto,
    userId: string,
  ): Promise<ReviewDocument> {
    const productExists = await this.reviewRepository.productExists(
      data.productId,
    );
    if (!productExists) {
      throw new I18nHttpException(
        HttpStatus.NOT_FOUND,
        'review.productNotFound',
        { id: data.productId },
      );
    }

    const existing = await this.reviewRepository.findOne({
      user: userId,
      product: data.productId,
    });
    if (existing) {
      throw new I18nHttpException(
        HttpStatus.CONFLICT,
        'review.alreadyReviewed',
      );
    }

    return this.reviewRepository.create({ ...data, user: userId });
  }

  async getAllReviews(
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<ReviewDocument>> {
    const product = queryParams.product;
    if (product && !mongoose.Types.ObjectId.isValid(String(product))) {
      throw new I18nHttpException(
        HttpStatus.BAD_REQUEST,
        'review.invalidProductId',
      );
    }
    return this.reviewRepository.findAll(queryParams);
  }

  async getMyReviews(
    userId: string,
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<ReviewDocument>> {
    return this.reviewRepository.findAll({ ...queryParams, user: userId });
  }

  async getReviewsByProduct(
    productId: string,
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<ReviewDocument>> {
    const productExists = await this.reviewRepository.productExists(productId);
    if (!productExists) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'review.productNotFound', {
        id: productId,
      });
    }
    return this.reviewRepository.findAll({ ...queryParams, product: productId });
  }

  async getReviewById(id: string): Promise<ReviewDocument> {
    const review = await this.reviewRepository.findById(id);
    if (!review) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'review.notFound', {
        id,
      });
    }
    return review;
  }

  async updateReview(
    id: string,
    data: UpdateReviewDto,
    userId: string,
    userRole: UserRole | undefined,
  ): Promise<ReviewDocument> {
    const review = await this.reviewRepository.findById(id);
    if (!review) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'review.notFound', {
        id,
      });
    }

    if (userRole !== UserRole.ADMIN && !this.isReviewOwner(review, userId)) {
      throw new I18nHttpException(
        HttpStatus.FORBIDDEN,
        'review.notAllowedUpdate',
      );
    }

    const updated = await this.reviewRepository.update(id, data);
    if (!updated) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'review.notFound', {
        id,
      });
    }
    return updated;
  }

  async deleteReview(
    id: string,
    userId: string,
    userRole: UserRole | undefined,
  ): Promise<void> {
    const review = await this.reviewRepository.findById(id);
    if (!review) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'review.notFound', {
        id,
      });
    }

    if (userRole !== UserRole.ADMIN && !this.isReviewOwner(review, userId)) {
      throw new I18nHttpException(
        HttpStatus.FORBIDDEN,
        'review.notAllowedDelete',
      );
    }

    await this.reviewRepository.delete(id);
  }

  private isReviewOwner(review: ReviewDocument, userId: string): boolean {
    return review.user._id.toString() === userId;
  }
}
