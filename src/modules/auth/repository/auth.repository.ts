import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRepository } from '../../users/repository/users.repository';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from 'src/modules/users/schemas/user.schema';
import { Model, Types } from 'mongoose';

@Injectable()
export class AuthRepository {
  constructor(
    private userRepo: UserRepository,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async isRefreshTokenMatching(
    userId: Types.ObjectId | string,
    refreshToken: string,
  ): Promise<boolean> {
    const user = await this.userRepo.findById(userId);
    if (!user || !user.currentHashedRefreshToken) return false;
    return bcrypt.compare(refreshToken, user.currentHashedRefreshToken);
  }

  async findUserByResetCode(hashResetCode: string): Promise<UserDocument> {
    return await this.userModel.findOne({
      passwordResetCode: hashResetCode,
      passwordResetExpires: { $gt: Date.now() },
    });
  }

  async resetUserPassword(
    email: string,
    hashedPassword: string,
  ): Promise<UserDocument | null> {
    return await this.userModel.findOneAndUpdate(
      { email },
      {
        password: hashedPassword,
        passwordChangedAt: new Date(),
        $unset: {
          passwordResetCode: '',
          passwordResetExpires: '',
          passwordResetVerified: '',
          currentHashedRefreshToken: '',
        },
      },
      { new: true },
    );
  }
}
