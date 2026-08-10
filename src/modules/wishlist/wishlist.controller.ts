import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { UserRole } from '../users/enums/user-role.enum';
import { AddWishlistItemDto } from './dto/add-wishlist-item.dto';
import { WishlistView } from './types/wishlist-view.type';
import { WishlistService } from './wishlist.service';

@Controller('wishlist')
@Roles(UserRole.USER, UserRole.ADMIN, UserRole.MANAGER)
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  getWishlist(
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<WishlistView> {
    return this.wishlistService.getWishlist(authUser.id);
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  addItem(
    @GetAuthUser() authUser: AuthenticatedUser,
    @Body() dto: AddWishlistItemDto,
  ): Promise<WishlistView> {
    return this.wishlistService.addItem(authUser.id, dto.variantId);
  }

  @Delete('items/:variantId')
  @HttpCode(HttpStatus.OK)
  removeItem(
    @GetAuthUser() authUser: AuthenticatedUser,
    @Param('variantId', ParseObjectIdPipe) variantId: Types.ObjectId,
  ): Promise<WishlistView> {
    return this.wishlistService.removeItem(authUser.id, variantId.toString());
  }

  @Post('items/:variantId/moveToCart')
  @HttpCode(HttpStatus.OK)
  moveToCart(
    @GetAuthUser() authUser: AuthenticatedUser,
    @Param('variantId', ParseObjectIdPipe) variantId: Types.ObjectId,
  ): Promise<WishlistView> {
    return this.wishlistService.moveToCart(authUser.id, variantId.toString());
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  clear(
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<WishlistView> {
    return this.wishlistService.clear(authUser.id);
  }
}
