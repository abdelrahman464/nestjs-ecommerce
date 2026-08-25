import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ensurePublicDnsForSrv } from '../config/dns-setup';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        ensurePublicDnsForSrv();
        return {
          uri: config.get<string>('database.uri'),
          // Atlas hosts are IPv4; skip broken IPv6 attempts on Windows.
          family: 4,
        };
      },
      inject: [ConfigService],
    }),
  ],
})
export class DatabaseModule {}
