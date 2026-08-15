import { registerAs } from '@nestjs/config';

/**
 * Cloudinary credentials (Dashboard → Account Settings / API Keys).
 *
 * You need THREE values:
 * - cloud_name  → looks like "dxxxxx" (shown on dashboard home)
 * - api_key     → number string
 * - api_secret  → keep private (never commit; only .env.development)
 */
export default registerAs('cloudinary', () => ({
  cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim() || '',
  apiKey: process.env.CLOUDINARY_API_KEY?.trim() || '',
  apiSecret: process.env.CLOUDINARY_API_SECRET?.trim() || '',
}));
