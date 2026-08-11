import { Types } from 'mongoose';

type JwtPayload = {
  id: Types.ObjectId | string;
  email: string;
  /** User.sessionVersion at token issue time. */
  sv?: number;
  /** Refresh-session id stored in Redis (`auth:session:{sid}`). */
  sid?: string;
  iat: number;
  exp?: number;
};

export default JwtPayload;
