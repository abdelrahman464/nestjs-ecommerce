import { CreateUserDto } from '../dto/create-user.dto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ApiFeatures } from '../../../common/utils/api-features.utils';
import { PaginatedResponseDto } from '../../../shared/dtos/paginated-response.dto';
import { USER_SEARCH_FIELDS } from '../constants/user.constants';
import { UserRole } from '../enums/user-role.enum';
import { User, UserDocument } from '../schemas/user.schema';
import { UpdateUserDto } from '../dto/update-user.dto';
@Injectable()
export class UserRepository {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async findAll(
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<UserDocument>> {
    const {
      hasGoogle,
      password: _password,
      sessionVersion: _sessionVersion,
      ...rest
    } = queryParams;

    const match: Record<string, unknown> = {};
    if (hasGoogle === 'true' || hasGoogle === true) {
      match.googleId = { $exists: true, $nin: [null, ''] };
    } else if (hasGoogle === 'false' || hasGoogle === false) {
      match.$or = [
        { googleId: { $exists: false } },
        { googleId: null },
        { googleId: '' },
      ];
    }

    const features = new ApiFeatures<UserDocument>(
      this.userModel.find(match).select('-password -sessionVersion'),
      rest,
      this.userModel,
    );

    return features
      .filter()
      .search([...USER_SEARCH_FIELDS])
      .sort()
      .paginate()
      .executePaginated();
  }

  /**
   * Lean customer list for staff dropdowns (manual order).
   * Always `role: USER`; query `role` is ignored.
   */
  async findCustomers(
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<UserDocument>> {
    const { role: _role, ...rest } = queryParams;
    const params = {
      ...rest,
      sort: rest.sort ?? 'name',
    };

    const features = new ApiFeatures<UserDocument>(
      this.userModel.find({ role: UserRole.USER }).select('_id name email'),
      params,
      this.userModel,
    );

    return features
      .filter()
      .search([...USER_SEARCH_FIELDS])
      .sort()
      .paginate()
      .executePaginated();
  }

  async findById(id: Types.ObjectId | string): Promise<UserDocument | null> {
    return await this.userModel.findById(id).exec();
  }

  async findUserByEmail(email: string): Promise<UserDocument | null> {
    return await this.userModel.findOne({ email }).select('+email').exec();
  }

  async createUser(createUserDto: CreateUserDto): Promise<UserDocument> {
    return await this.userModel.create(createUserDto);
  }

  async updateUser(
    id: Types.ObjectId | string,
    updateUserDto: UpdateUserDto,
  ): Promise<UserDocument> {
    const updatedUser = await this.userModel.findByIdAndUpdate(
      id,
      updateUserDto,
      {
        new: true,
        runValidators: true,
      },
    );
    return updatedUser;
  }

  async deleteUser(id: Types.ObjectId | string): Promise<void> {
    await this.userModel.findByIdAndDelete(id).exec();
  }

  async findByEmailWithPassword(email: string): Promise<UserDocument> {
    return await this.userModel.findOne({ email }).select('+password').exec();
  }

  async findByGoogleId(googleId: string): Promise<UserDocument> {
    return await this.userModel.findOne({ googleId }).exec();
  }

  async updateUserGoogleId(id: Types.ObjectId | string, googleId: string): Promise<UserDocument> {
    return await this.userModel.findByIdAndUpdate(id, { $set: { googleId } }, { new: true }).exec();
  }

  async bumpSessionVersion(
    userId: Types.ObjectId | string,
  ): Promise<UserDocument | null> {
    return await this.userModel
      .findByIdAndUpdate(userId, { $inc: { sessionVersion: 1 } }, { new: true })
      .exec();
  }

  async updatePassword(
    userId: Types.ObjectId | string,
    newHashedPassword: string,
    options?: { bumpSessionVersion?: boolean },
  ): Promise<UserDocument> {
    const update: Record<string, unknown> = {
      $set: {
        password: newHashedPassword,
        passwordChangedAt: new Date(),
      },
    };
    if (options?.bumpSessionVersion) {
      update.$inc = { sessionVersion: 1 };
    }

    return await this.userModel
      .findByIdAndUpdate(userId, update, { new: true })
      .exec();
  }
}
