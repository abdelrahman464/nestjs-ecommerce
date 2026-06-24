import { Types } from 'mongoose';

type JwtPayload = {
  id: Types.ObjectId;
  email: string;
  iat: number;
  exp?: number;
};

export default JwtPayload;
