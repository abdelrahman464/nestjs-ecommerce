import { Exclude, Expose } from 'class-transformer';
import { Types } from 'mongoose';

@Exclude()
export class SubCategoryResponseDto {
  @Expose()
  _id: Types.ObjectId;

  @Expose()
  title: string;

  @Expose()
  slug: string;

  @Expose()
  description: string;

  @Expose()
  isActive: boolean;

  @Expose()
  category: Types.ObjectId;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;
}
