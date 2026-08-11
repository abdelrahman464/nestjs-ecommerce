import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(private readonly config: ConfigService) {
    const url =
      this.config.get<string>('redis.url') || 'redis://127.0.0.1:6379';
    this.client = new Redis(url, {
      maxRetriesPerRequest: 3, //If a command fails, retry up to 3 times before giving up
      lazyConnect: true, // Only connect to Redis when a command is issued "Don’t connect in constructor; wait for connect()"
    });

    //Log connection errors instead of crashing silently
    this.client.on('error', (err) => {
      this.logger.error(`Redis error: ${err.message}`);
    });
  }

  //Connect when Nest boots
  async onModuleInit(): Promise<void> {
    await this.client.connect();
    this.logger.log('Connected to Redis');
  }

  //Clean close when app stops
  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
  // Return the Redis client instance "Other services borrow this one connection"
  getClient(): Redis {
    return this.client;
  }
}
