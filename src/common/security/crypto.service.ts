import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class CryptoService {
  createSha256Hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

//   generateRandomToken(bytes: number = 32): string {
//     return crypto.randomBytes(bytes).toString('hex');
//   }
}
