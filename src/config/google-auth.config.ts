import { registerAs } from '@nestjs/config';

export default registerAs('google-auth', () => ({
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:8000/api/v1/auth/google/callback',
}));
