import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import databaseConfig from './config/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { ProductsModule } from './modules/products/products.module';
import { BrandsModule } from './modules/brands/brands.module';
import { ArticlesModule } from './modules/articles/articles.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import jwtConfig from './config/jwt.config';
import appConfig from './config/app.config';
import emailConfig from './config/email.config';
import googleAuthConfig from './config/google-auth.config';
import stripeConfig from './config/stripe.config';
import klarnaConfig from './config/klarna.config';
import paymentConfig from './config/payment.config';
import redisConfig from './config/redis.config';
import { PaymentsModule } from './modules/payments/payments.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { FilesUploadModule } from './modules/files-upload/files-upload.module';
import { CartModule } from './modules/cart/cart.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { OrdersModule } from './modules/orders/orders.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
import { SeoModule } from './modules/seo/seo.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { RedisModule } from './redis/redis.module';
import { QueuesModule } from './queues/queues.module';
import * as path from 'path';
import {
  AcceptLanguageResolver,
  HeaderResolver,
  I18nModule,
  QueryResolver,
} from 'nestjs-i18n';
import { SUPPORTED_CONTENT_LOCALES } from './common/constants/supported-content-locales.constant';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        databaseConfig,
        jwtConfig,
        appConfig,
        emailConfig,
        googleAuthConfig,
        stripeConfig,
        klarnaConfig,
        paymentConfig,
        redisConfig,
      ],
      envFilePath: `.env.${process.env.NODE_ENV || 'development'}`,
    }),
    ScheduleModule.forRoot(),
    RedisModule,
    QueuesModule,
    I18nModule.forRoot({
      fallbackLanguage: SUPPORTED_CONTENT_LOCALES[0] ?? 'en',
      loaderOptions: {
        path: path.join(__dirname, '/i18n/'),
        watch: true,
      },
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        AcceptLanguageResolver,
        new HeaderResolver(['x-lang']),
      ],
    }),
    DatabaseModule,
    NotificationModule,
    AuthModule,
    UsersModule,
    FilesUploadModule,
    CategoriesModule,
    BrandsModule,
    WarehousesModule,
    ProductsModule,
    InventoryModule,
    OrdersModule,
    CartModule,
    WishlistModule,
    ArticlesModule,
    ReviewsModule,
    PaymentsModule,
    SeoModule,
  ],
})
export class AppModule {}
