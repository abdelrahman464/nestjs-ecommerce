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
  Query,
} from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { SerializeDto } from '../../common/decorators/serializeDto.decorator';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import { Types } from 'mongoose';
import { AdminUserResponseDto } from './dto/admin-manager-response.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { UserRole } from './enums/user-role.enum';
import { UserDocument } from './schemas/user.schema';

@Controller('users')
@SerializeDto(AdminUserResponseDto)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  async findAll(
    @Query() queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<UserDocument>> {
    return this.usersService.findAll(queryParams);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() createUserDto: CreateUserDto,
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<UserDocument> {
    return this.usersService.create(createUserDto, authUser);
  }

  @Get('customers')
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  async findCustomers(
    @Query() queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<UserDocument>> {
    return this.usersService.findCustomers(queryParams);
  }

  @Get('profile')
  async getProfile(
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<UserDocument> {
    return this.usersService.findOne(authUser.id);
  }

  @Patch('profile')
  async updateProfile(
    @Body() dto: UpdateProfileDto,
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<UserDocument> {
    return this.usersService.updateProfile(authUser.id, dto, authUser);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  async findOne(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
  ): Promise<UserDocument> {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  async update(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() updateUserDto: UpdateUserDto,
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<UserDocument> {
    return this.usersService.update(id, updateUserDto, authUser);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async delete(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<void> {
    return this.usersService.delete(id, authUser);
  }
}
