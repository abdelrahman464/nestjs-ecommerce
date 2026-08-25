export const USER_PUBLIC_FIELDS = '_id name email role ' as const;

/** Text search for `GET /users?search=` and `GET /users/customers?search=` */
export const USER_SEARCH_FIELDS = ['name', 'email'] as const;
