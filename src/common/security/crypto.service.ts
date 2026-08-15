import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class CryptoService {
  /** SHA-256 hex. Strings (OTP hashes) or Buffers (file bytes for media dedup). */
  createSha256Hash(data: string | Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}