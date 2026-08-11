import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from 'src/modules/users/schemas/user.schema';
import { Model } from 'mongoose';

@Injectable()
export class AuthRepository {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

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
        $set: {
          password: hashedPassword,
          passwordChangedAt: new Date(),
        },
        $inc: { sessionVersion: 1 },
        $unset: {
          passwordResetCode: '',
          passwordResetExpires: '',
          passwordResetVerified: '',
        },
      },
      { new: true },
    );
  }
}
