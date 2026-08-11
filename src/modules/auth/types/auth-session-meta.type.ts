export type AuthSessionMeta = {
  userId: string;
  ip: string;
  userAgent: string;
  /** Coarse client class from User-Agent: mobile | tablet | desktop | unknown */
  device: string;
  /** ISO country code when a proxy/CDN sends it (e.g. CF-IPCountry). */
  country: string;
  createdAt: string;
};

export type AuthSessionView = AuthSessionMeta & {
  sid: string;
  current: boolean;
};
