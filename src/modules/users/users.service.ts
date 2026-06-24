import { Injectable, HttpStatus } from '@nestjs/common';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { UserRepository } from './repository/users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { UserDocument } from './schemas/user.schema';
import { Types } from 'mongoose';

@Injectable()
export class UsersService {
  constructor(private userRepository: UserRepository) {}

  async findAll(): Promise<UserDocument[]> {
    const users = await this.userRepository.findAll();
    return users;
  }

  async findOne(id: Types.ObjectId | string): Promise<UserDocument> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'user.notFound', {
        id: String(id),
      });
    }
    return user;
  }

  async create(createUserDto: CreateUserDto): Promise<UserDocument> {
    const existingUser = await this.userRepository.findUserByEmail(
      createUserDto.email,
    );
    if (existingUser) {
      throw new I18nHttpException(HttpStatus.CONFLICT, 'user.alreadyExists', {
        email: createUserDto.email,
      });
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = await this.userRepository.createUser({
      name: createUserDto.name,
      email: createUserDto.email,
      password: hashedPassword,
      ...(createUserDto.role && { role: createUserDto.role }),
    });
    if (!user) {
      throw new I18nHttpException(HttpStatus.BAD_REQUEST, 'user.createFailed');
    }
    return user;
  }

  async update(
    id: Types.ObjectId | string,
    updateUserDto: UpdateUserDto,
  ): Promise<UserDocument> {
    const updatedUser = await this.userRepository.updateUser(id, updateUserDto);
    if (!updatedUser) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'user.notFound', {
        id: String(id),
      });
    }
    return updatedUser;
  }

  async delete(id: Types.ObjectId | string): Promise<void> {
    this.userRepository.deleteUser(id);
  }
}
