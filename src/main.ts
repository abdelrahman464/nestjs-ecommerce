import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import { CustomExceptionFilter } from './common/filters/custom-exception.filter';
import { WrapDataInterceptor } from './common/interceptors/wrap-data.interceptor';
import { LocalizationInterceptor } from './common/interceptors/localization.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { TokenService } from './common/tokens/token.service';
import { User } from './modules/users/schemas/user.schema';
import { getModelToken } from '@nestjs/mongoose';
import { RolesGuard } from './common/guards/roles.guard';
import { I18nService, I18nValidationPipe } from 'nestjs-i18n';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  // So req.ip reflects the real client behind a reverse proxy / Docker.
  app.set('trust proxy', 1);
  const i18n = app.get(I18nService);
  app.useGlobalFilters(new CustomExceptionFilter(i18n));
  app.useGlobalPipes(
    new I18nValidationPipe({
      whitelist: true, // ignore unknown fields
      forbidNonWhitelisted: true, // throws on unknown fields
      transform: true, // auto-converts types
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  const reflector = app.get(Reflector);
  app.useGlobalGuards(
    new JwtAuthGuard(
      app.get(TokenService),
      app.get(getModelToken(User.name)),
      reflector,
    ),
    new RolesGuard(reflector),
  );
  app.useGlobalInterceptors(
    new WrapDataInterceptor(),
    // new SerializeDtoInterceptor(reflector),
    new LocalizationInterceptor(reflector),
  );
  app.use(cookieParser());
  const configService = app.get(ConfigService);
  
  app.enableCors({
    origin: configService.get<string>('app.frontendUrl'),
    credentials: true,
  });
  app.setGlobalPrefix('api/v1');
  const port = configService.get<string>('app.port') ?? 8000;
  await app.listen(port);
}
bootstrap();
