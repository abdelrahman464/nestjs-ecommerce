import { Injectable } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

const RESET_TTL_SECONDS = 10 * 60; // 10 minutes

@Injectable()
export class AuthPasswordResetService {
  constructor(private readonly redisService: RedisService) {}

  private key(email: string): string {
    return `auth:reset:${email.trim().toLowerCase()}`;
  }

  /** Store hashed reset code (replaces any previous code for this email). */
  async saveCode(email: string, codeHash: string): Promise<void> {
    const redis = this.redisService.getClient();
    const key = this.key(email);
    await redis.hset(key, {
      codeHash,
      verified: '0',
    });
    await redis.expire(key, RESET_TTL_SECONDS);
  }

  /**
   * Validates the hashed code. On success marks verified=1 and refreshes TTL
   * so the user still has time to submit the new password.
   */
  async verifyCode(email: string, codeHash: string): Promise<boolean> {
    const redis = this.redisService.getClient();
    const key = this.key(email);
    const stored = await redis.hget(key, 'codeHash');
    if (!stored || stored !== codeHash) {
      return false;
    }

    await redis.hset(key, 'verified', '1');
  
    await redis.expire(key, RESET_TTL_SECONDS);
    return true;
  }

  async isVerified(email: string): Promise<boolean> {
    const verified = await this.redisService
      .getClient()
      .hget(this.key(email), 'verified');
    return verified === '1';
  }

  async clear(email: string): Promise<void> {
    await this.redisService.getClient().del(this.key(email));
  }
}
