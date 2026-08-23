import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { LoggerModule } from 'nestjs-pino';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard';
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
import throttlerConfig from './config/throttler.config';
import cloudinaryConfig from './config/cloudinary.config';
import { buildLoggerParams } from './config/logger.config';
import { PaymentsModule } from './modules/payments/payments.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { MediaModule } from './modules/media/media.module';
import { CartModule } from './modules/cart/cart.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { OrdersModule } from './modules/orders/orders.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
import { SeoModule } from './modules/seo/seo.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { RedisModule } from './redis/redis.module';
import { RedisService } from './redis/redis.service';
import { QueuesModule } from './queues/queues.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
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
        throttlerConfig,
        cloudinaryConfig,
      ],
      // First file wins on duplicate keys. start:prod → .env.production, then .env fallback.
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
    }),
    // Structured logging (Pino). Must sit early so HTTP access logs wrap all routes.
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildLoggerParams(config),
    }),
    RedisModule,
    // Rate limit BEFORE JWT (APP_GUARD is registered earlier than useGlobalGuards
    // in main.ts). Redis storage = one shared counter across API replicas.
    // skipIf: e2e/unit tests would otherwise trip 429s while hammering routes.
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [ConfigService, RedisService],
      useFactory: (config: ConfigService, redis: RedisService) => {
        const policy = config.getOrThrow<{ ttl: number; limit: number }>(
          'throttler.default',
        );
        return {
          skipIf: () => process.env.NODE_ENV === 'test',
          throttlers: [
            {
              name: 'default',
              ttl: policy.ttl,
              limit: policy.limit,
            },
          ],
          // Reuse the existing ioredis client (sessions / OTP / BullMQ).
          // Passing the client object means this storage will NOT quit Redis
          // on shutdown — RedisService owns the connection lifecycle.
          storage: new ThrottlerStorageRedisService(redis.getClient()),
        };
      },
    }),
    QueuesModule,
    AuditLogModule,
    AnalyticsModule,
    I18nModule.forRoot({
      fallbackLanguage: SUPPORTED_CONTENT_LOCALES[0] ?? 'en',
      loaderOptions: {
        path: path.join(__dirname, '/i18n/'),
        watch: process.env.NODE_ENV !== 'production',
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
    MediaModule,
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
  providers: [
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
})
export class AppModule {}
