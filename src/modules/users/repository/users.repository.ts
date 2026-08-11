import { UpdateUserDto } from '../dto/update-user.dto';
import { CreateUserDto } from '../dto/create-user.dto';
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
@Injectable()
export class UserRepository {
  constructor(@InjectModel(User.name) private userModel: Model<User>) {}

  async findAll(): Promise<UserDocument[]> {
    return await this.userModel.find().sort({ createdAt: -1 }).exec();
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
