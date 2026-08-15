import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { RedisService } from '../../redis/redis.service';
import { parseDurationToSeconds } from '../../common/utils/parse-duration-to-seconds.util';
import type {
  AuthSessionMeta,
  AuthSessionView,
} from './types/auth-session-meta.type';
import type { ClientRequestMeta } from './utils/extract-client-meta.util';

@Injectable()
export class AuthSessionService {
  constructor(
    private readonly redisService: RedisService,
    private readonly config: ConfigService,
  ) {}

  private sessionKey(sid: string): string {
    return `auth:session:${sid}`;
  }

  private userSessionsKey(userId: string): string {
    return `auth:user:${userId}:sessions`;
  }

  private refreshTtlSeconds(): number {
    return parseDurationToSeconds(
      this.config.get<string>('jwt.refreshExpire') || '30d',
    );
  }

  /** Creates a refresh session HASH in Redis. Returns the session id (`sid`). */
  async createSession(
    userId: string,
    client: ClientRequestMeta,
  ): Promise<string> {
    const redis = this.redisService.getClient();
    const sid = randomUUID();
    const ttl = this.refreshTtlSeconds();
    const now = new Date().toISOString();

    const meta: AuthSessionMeta = {
      userId,
      ip: client.ip,
      userAgent: client.userAgent,
      device: client.device,
      country: client.country,
      createdAt: now,
    };

    await redis.hset(this.sessionKey(sid), meta);
    await redis.expire(this.sessionKey(sid), ttl);
    await redis.sadd(this.userSessionsKey(userId), sid);
    await redis.expire(this.userSessionsKey(userId), ttl);

    return sid;
  }

  async isSessionActive(sid: string, userId: string): Promise<boolean> {
    const storedUserId = await this.redisService
      .getClient()
      .hget(this.sessionKey(sid), 'userId');
    return storedUserId === userId;
  }

  async listSessions(
    userId: string,
    currentSid?: string,
  ): Promise<AuthSessionView[]> {
    const redis = this.redisService.getClient();
    const sids = await redis.smembers(this.userSessionsKey(userId));
    if (sids.length === 0) return [];

    const sessions: AuthSessionView[] = [];
    for (const sid of sids) {
      const raw = await redis.hgetall(this.sessionKey(sid));
      if (!raw?.userId) {
        // TTL expired but sid left in the index — tidy up.
        await redis.srem(this.userSessionsKey(userId), sid);
        continue;
      }
      sessions.push({
        sid,
        userId: raw.userId,
        ip: raw.ip || 'unknown',
        userAgent: raw.userAgent || '',
        device: raw.device || 'unknown',
        country: raw.country || '',
        createdAt: raw.createdAt || '',
        //The double ! converts a value into a boolean.
        current: !!currentSid && sid === currentSid,
      });
    }

    return sessions.sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || ''),
    );
  }

  async revokeSession(sid: string, userId: string): Promise<void> {
    const redis = this.redisService.getClient();
    const owner = await redis.hget(this.sessionKey(sid), 'userId');
    if (owner && owner !== userId) {
      return;
    }
    await redis.del(this.sessionKey(sid));
    await redis.srem(this.userSessionsKey(userId), sid);
  }

  async revokeAllSessions(userId: string): Promise<void> {
    const redis = this.redisService.getClient();
    const sids = await redis.smembers(this.userSessionsKey(userId));
    if (sids.length === 0) {
      await redis.del(this.userSessionsKey(userId));
      return;
    }

    const keys = [
      ...sids.map((sid) => this.sessionKey(sid)),
      this.userSessionsKey(userId),
    ];
    await redis.del(...keys);
  }
}
