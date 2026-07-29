import { Exclude, Expose } from 'class-transformer';
import { Types } from 'mongoose';

@Exclude()
export class CategoryResponseDto {
  @Expose()
  _id: Types.ObjectId;

  @Expose()
  title: string;

  @Expose()
  slug: string;

  @Expose()
  description: string;

  @Expose()
  parentCategory: CategoryResponseDto;

  @Expose()
  isActive: boolean;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}
