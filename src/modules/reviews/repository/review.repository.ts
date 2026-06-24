import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types } from 'mongoose';
import { Product, ProductDocument } from '../../products/schemas/product.schema';
import { CreateReviewDto } from '../dto/create-review.dto';
import { Review, ReviewDocument } from '../schemas/review.schema';
import { USER_PUBLIC_FIELDS } from '../../users/constants/user.constants';
import { UpdateReviewDto } from '../dto/update-review.dto';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PaginatedResponseDto } from '../../../shared/dtos/paginated-response.dto';

export type CreateReviewPayload = CreateReviewDto & { user: string };

@Injectable()
export class ReviewRepository {
  constructor(
    @InjectModel(Review.name) private reviewModel: Model<ReviewDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
  ) {}

  private static readonly populate = [
    { path: 'user', select: USER_PUBLIC_FIELDS },
    { path: 'product', select: 'title slug' },
  ];

  async create(data: CreateReviewPayload): Promise<ReviewDocument> {
    const { productId, ...rest } = data;
    const review = new this.reviewModel({
      ...rest,
      product: productId,
      user: data.user,
    });
    await review.save();
    await this.calcAverageRatingsAndQuantity(review.product.toString());
    return review.populate(ReviewRepository.populate);
  }

  async findAll(
    queryParams: Record<string, any>,
  ): Promise<PaginatedResponseDto<ReviewDocument>> {
    const features = new ApiFeatures<ReviewDocument>(
      this.reviewModel.find().populate(ReviewRepository.populate),
      queryParams,
      this.reviewModel,
    );

    return features
      .filter()
      .search(['title'])
      .sort()
      .paginate()
      .executePaginated();
  }

  async findOne(filter: FilterQuery<Review>): Promise<ReviewDocument | null> {
    return this.reviewModel.findOne(filter).exec();
  }

  async findById(id: Types.ObjectId | string): Promise<ReviewDocument | null> {
    return this.reviewModel
      .findById(id)
      .populate(ReviewRepository.populate)
      .exec();
  }

  async productExists(id: Types.ObjectId | string): Promise<boolean> {
    const exists = await this.productModel.exists({ _id: id });
    return exists !== null;
  }

  async update(
    id: Types.ObjectId | string,
    data: UpdateReviewDto,
  ): Promise<ReviewDocument | null> {
    const review = await this.reviewModel
      .findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .populate(ReviewRepository.populate)
      .exec();
    if (review) {
      await this.calcAverageRatingsAndQuantity(review.product._id.toString());
    }
    return review;
  }

  async delete(id: Types.ObjectId | string): Promise<ReviewDocument | null> {
    const review = await this.reviewModel.findByIdAndDelete(id).exec();
    if (review) {
      await this.calcAverageRatingsAndQuantity(review.product.toString());
    }
    return review;
  }

  async calcAverageRatingsAndQuantity(productId: string): Promise<void> {
    const result = await this.reviewModel.aggregate<{
      avgRatings: number;
      ratingsQuantity: number;
    }>([
      {
        $match: { product: new Types.ObjectId(productId) },
      },
      {
        $group: {
          _id: '$product',
          avgRatings: { $avg: '$ratings' },
          ratingsQuantity: { $sum: 1 },
        },
      },
    ]);

    if (result.length > 0) {
      await this.productModel.findByIdAndUpdate(productId, {
        ratingsAverage: parseFloat(result[0].avgRatings.toFixed(1)),
        ratingsQuantity: result[0].ratingsQuantity,
      });
    } else {
      await this.productModel.findByIdAndUpdate(productId, {
        ratingsAverage: 0,
        ratingsQuantity: 0,
      });
    }
  }
}
