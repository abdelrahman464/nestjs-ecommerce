import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { createI18nMongooseModule } from '../../common/utils/mongoose-i18n-schema.util';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { ReviewRepository } from './repository/review.repository';
import { Review, ReviewSchema } from './schemas/review.schema';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [
    createI18nMongooseModule(Review.name, ReviewSchema),
    MongooseModule.forFeature([{ name: Product.name, schema: ProductSchema }]),
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService, ReviewRepository],
})
export class ReviewsModule {}
