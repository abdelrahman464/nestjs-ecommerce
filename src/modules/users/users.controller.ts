import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { SerializeDto } from '../../common/decorators/serializeDto.decorator';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { Types } from 'mongoose';
import { AdminUserResponseDto } from './dto/admin-manager-response.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import { UserRole } from './enums/user-role.enum';
import { UserDocument } from './schemas/user.schema';

@Controller('users')
@SerializeDto(AdminUserResponseDto)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  async findAll(): Promise<UserDocument[]> {
    return this.usersService.findAll();
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createUserDto: CreateUserDto,
  ): Promise<UserDocument> {
    return this.usersService.create(createUserDto);
  }

  @Get('profile')
  @SerializeDto(UserResponseDto)
  async getProfile(
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<UserDocument> {
    return this.usersService.findOne(authUser.id);
  }

  @Get(':id') //validate mongoId
  @Roles(UserRole.ADMIN)
  @SerializeDto(UserResponseDto)
  async findOne(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
  ): Promise<UserDocument> {
    return this.usersService.findOne(id);
  }

  @Patch(':id') //validate mongoId
  @Roles(UserRole.ADMIN, UserRole.USER)
  async update(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserDocument> {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id') //validate mongoId
  @Roles(UserRole.ADMIN, UserRole.USER)
  @HttpCode(HttpStatus.OK)
  async delete(@Param('id', ParseObjectIdPipe) id: Types.ObjectId): Promise<void> {
    return this.usersService.delete(id);
  }
}
