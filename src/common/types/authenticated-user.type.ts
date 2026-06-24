import { UserRole } from '../../modules/users/enums/user-role.enum';

/** Shape of `req.user` set by {@link JwtAuthGuard}. */
export type AuthenticatedUser = {
  id: string;
  email: string;
  role: UserRole;
};
