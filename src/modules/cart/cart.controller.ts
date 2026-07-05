import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { GetAuthUser } from '../../common/decorators/get-auth-user.decorator';
import { ParseObjectIdPipe } from '../../common/pipes/parse-object-id.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { BulkAddCartItemsDto } from './dto/bulk-add-cart-items.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartDocument } from './schemas/cart.schema';

@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  async getCart(@GetAuthUser() authUser: AuthenticatedUser): Promise<CartDocument> {
    return this.cartService.getCart(authUser.id);
  }

  @Post('items/bulk')
  @HttpCode(HttpStatus.OK)
  async addItemsBulk(
    @GetAuthUser() authUser: AuthenticatedUser,
    @Body() dto: BulkAddCartItemsDto,
  ): Promise<CartDocument> {
    return this.cartService.addItemsBulk(authUser.id, dto.items);
  }

  @Post('items')
  @HttpCode(HttpStatus.OK)
  async addItem(
    @GetAuthUser() authUser: AuthenticatedUser,
    @Body() dto: AddCartItemDto,
  ): Promise<CartDocument> {
    return this.cartService.addItem(authUser.id, dto);
  }

  @Patch('items/:productId')
  async updateItem(
    @GetAuthUser() authUser: AuthenticatedUser,
    @Param('productId', ParseObjectIdPipe) productId: Types.ObjectId,
    @Body() dto: UpdateCartItemDto,
  ): Promise<CartDocument> {
    return this.cartService.updateItem(
      authUser.id,
      productId.toString(),
      dto,
    );
  }

  @Delete('items/:productId')
  @HttpCode(HttpStatus.OK)
  async removeItem(
    @GetAuthUser() authUser: AuthenticatedUser,
    @Param('productId', ParseObjectIdPipe) productId: Types.ObjectId,
  ): Promise<CartDocument> {
    return this.cartService.removeItem(authUser.id, productId.toString());
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  async clearCart(
    @GetAuthUser() authUser: AuthenticatedUser,
  ): Promise<CartDocument> {
    return this.cartService.clearCart(authUser.id);
  }
}
