import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthRepository } from './repository/auth.repository';
import { UserRepository } from '../users/repository/users.repository';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { ConfigModule } from '@nestjs/config';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GoogleStrategy } from './strategies/google.strategy';
import { TokenService } from 'src/common/tokens/token.service';
import { CookieService } from 'src/common/cookies/cookie.service';
import { HashService } from 'src/common/security/hash.service';
import { CryptoService } from 'src/common/security/crypto.service';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    CookieService,
    HashService,
    CryptoService,
    AuthRepository,
    UserRepository,
    JwtAuthGuard,
    GoogleStrategy,
  ],
  exports: [TokenService, CookieService],
})
export class AuthModule {}
