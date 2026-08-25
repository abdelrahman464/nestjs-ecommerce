import { Injectable, HttpStatus } from '@nestjs/common';
import { I18nHttpException } from '../../common/filters/i18n-http.exception';
import { UserRepository } from './repository/users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { UserDocument } from './schemas/user.schema';
import { Types } from 'mongoose';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { PaginatedResponseDto } from '../../shared/dtos/paginated-response.dto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/enums/audit-action.enum';
import { AuditResourceType } from '../audit-log/enums/audit-resource-type.enum';
import { AuditSource } from '../audit-log/enums/audit-source.enum';

@Injectable()
export class UsersService {
  constructor(
    private userRepository: UserRepository,
    private auditLogService: AuditLogService,
  ) {}

  async findAll(
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<UserDocument>> {
    return this.userRepository.findAll(queryParams);
  }

  async findCustomers(
    queryParams: Record<string, unknown>,
  ): Promise<PaginatedResponseDto<UserDocument>> {
    return this.userRepository.findCustomers(queryParams);
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

  async create(
    createUserDto: CreateUserDto,
    actor?: AuthenticatedUser,
  ): Promise<UserDocument> {
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

    await this.auditLogService.record({
      action: AuditAction.USER_CREATE,
      resourceType: AuditResourceType.USER,
      resourceId: user._id,
      actorId: actor?.id,
      actorRole: actor?.role,
      actorEmail: actor?.email,
      source: AuditSource.HTTP,
      metadata: {
        email: user.email,
        role: user.role,
      },
    });

    return user;
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    actor: AuthenticatedUser,
  ): Promise<UserDocument> {
    return this.applyUpdate(userId, dto, actor);
  }

  async update(
    id: Types.ObjectId | string,
    dto: UpdateUserDto,
    actor: AuthenticatedUser,
  ): Promise<UserDocument> {
    return this.applyUpdate(id, dto, actor);
  }

  private async applyUpdate(
    id: Types.ObjectId | string,
    dto: UpdateProfileDto | UpdateUserDto,
    actor: AuthenticatedUser,
  ): Promise<UserDocument> {
    if (dto.email) {
      const existing = await this.userRepository.findUserByEmail(dto.email);
      if (existing && existing._id.toString() !== String(id)) {
        throw new I18nHttpException(HttpStatus.CONFLICT, 'user.alreadyExists', {
          email: dto.email,
        });
      }
    }

    const role = 'role' in dto ? dto.role : undefined;
    const before =
      role !== undefined ? await this.userRepository.findById(id) : null;

    const updatedUser = await this.userRepository.updateUser(id, dto);
    if (!updatedUser) {
      throw new I18nHttpException(HttpStatus.NOT_FOUND, 'user.notFound', {
        id: String(id),
      });
    }

    await this.auditLogService.record({
      action: AuditAction.USER_UPDATE,
      resourceType: AuditResourceType.USER,
      resourceId: updatedUser._id,
      actorId: actor.id,
      actorRole: actor.role,
      actorEmail: actor.email,
      source: AuditSource.HTTP,
      metadata: {
        fields: Object.keys(dto),
        ...(before && role !== undefined
          ? { previousRole: before.role, newRole: updatedUser.role }
          : {}),
      },
    });

    return updatedUser;
  }

  async delete(
    id: Types.ObjectId | string,
    actor?: AuthenticatedUser,
  ): Promise<void> {
    const existing = await this.userRepository.findById(id);
    await this.userRepository.deleteUser(id);

    await this.auditLogService.record({
      action: AuditAction.USER_DELETE,
      resourceType: AuditResourceType.USER,
      resourceId: id,
      actorId: actor?.id,
      actorRole: actor?.role,
      actorEmail: actor?.email,
      source: AuditSource.HTTP,
      metadata: existing
        ? { email: existing.email, role: existing.role }
        : undefined,
    });
  }
}
