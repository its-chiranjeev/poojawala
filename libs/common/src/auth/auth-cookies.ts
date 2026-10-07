import { USER_ROLE } from '@poojawala/entities';
import type { CookieOptions, Request, Response } from 'express';

export interface RoleCookieNames {
  readonly csrf: string;
  readonly csrfCamel: string;
  readonly access: string;
  readonly accessCamel: string;
  readonly refresh: string;
  readonly refreshCamel: string;
}

/**
 * Authoritative central mapping of User Role -> Cookie Names.
 * Supports both kebab-case and camelCase variants for maximum compatibility across
 * web frontends, Postman, and mobile clients.
 */
export const ROLE_COOKIE_MAP: Record<USER_ROLE, RoleCookieNames> = {
  [USER_ROLE.ADMIN]: {
    csrf: 'poojawala-admin-csrf-token',
    csrfCamel: 'poojawalaAdminCsrfToken',
    access: 'poojawala-admin-access-token',
    accessCamel: 'poojawalaAdminAccessToken',
    refresh: 'poojawala-admin-refresh-token',
    refreshCamel: 'poojawalaAdminRefreshToken',
  },
  [USER_ROLE.CUSTOMER]: {
    csrf: 'poojawala-customer-csrf-token',
    csrfCamel: 'poojawalaCustomerCsrfToken',
    access: 'poojawala-customer-access-token',
    accessCamel: 'poojawalaCustomerAccessToken',
    refresh: 'poojawala-customer-refresh-token',
    refreshCamel: 'poojawalaCustomerRefreshToken',
  },
  [USER_ROLE.PUROHIT]: {
    csrf: 'poojawala-purohit-csrf-token',
    csrfCamel: 'poojawalaPurohitCsrfToken',
    access: 'poojawala-purohit-access-token',
    accessCamel: 'poojawalaPurohitAccessToken',
    refresh: 'poojawala-purohit-refresh-token',
    refreshCamel: 'poojawalaPurohitRefreshToken',
  },
} as const;

export const ALL_AUTH_COOKIE_NAMES: readonly string[] = Object.values(ROLE_COOKIE_MAP).flatMap(
  (names) => [
    names.csrf,
    names.csrfCamel,
    names.access,
    names.accessCamel,
    names.refresh,
    names.refreshCamel,
  ],
);

export const ALL_ACCESS_COOKIE_NAMES: readonly string[] = Object.values(ROLE_COOKIE_MAP).flatMap(
  (names) => [names.access, names.accessCamel],
);

export const ALL_REFRESH_COOKIE_NAMES: readonly string[] = Object.values(ROLE_COOKIE_MAP).flatMap(
  (names) => [names.refresh, names.refreshCamel],
);

export const ALL_CSRF_COOKIE_NAMES: readonly string[] = Object.values(ROLE_COOKIE_MAP).flatMap(
  (names) => [names.csrf, names.csrfCamel],
);

export const ACCESS_TOKEN_COOKIE_MAX_AGE = 15 * 60 * 1000; // 15 minutes
export const REFRESH_TOKEN_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
export const CSRF_TOKEN_COOKIE_MAX_AGE = REFRESH_TOKEN_COOKIE_MAX_AGE; // 7 days - identical to refresh token

/**
 * Returns the cookie names associated with a given user role.
 */
export function getRoleCookieNames(role?: USER_ROLE | string | null): RoleCookieNames | null {
  if (!role || !(role in ROLE_COOKIE_MAP)) {
    return null;
  }
  return ROLE_COOKIE_MAP[role as USER_ROLE];
}

/**
 * Returns camelCase response property name for a role's CSRF token (e.g. poojawalaAdminCsrfToken).
 */
export function getRoleCsrfPropertyName(role?: USER_ROLE | string | null): string | null {
  if (role === USER_ROLE.ADMIN) return 'poojawalaAdminCsrfToken';
  if (role === USER_ROLE.CUSTOMER) return 'poojawalaCustomerCsrfToken';
  if (role === USER_ROLE.PUROHIT) return 'poojawalaPurohitCsrfToken';
  return null;
}

/**
 * Returns the USER_ROLE represented by an access token cookie name (kebab or camelCase), or null.
 */
export function getRoleFromAccessTokenCookie(cookieName: string): USER_ROLE | null {
  for (const [role, cookies] of Object.entries(ROLE_COOKIE_MAP)) {
    if (cookies.access === cookieName || cookies.accessCamel === cookieName) {
      return role as USER_ROLE;
    }
  }
  return null;
}

/**
 * Returns the USER_ROLE represented by a refresh token cookie name (kebab or camelCase), or null.
 */
export function getRoleFromRefreshTokenCookie(cookieName: string): USER_ROLE | null {
  for (const [role, cookies] of Object.entries(ROLE_COOKIE_MAP)) {
    if (cookies.refresh === cookieName || cookies.refreshCamel === cookieName) {
      return role as USER_ROLE;
    }
  }
  return null;
}

/**
 * Parses raw Cookie header into key-value map.
 */
export function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      list[parts[0].trim()] = decodeURIComponent(parts.slice(1).join('=').trim());
    }
  });
  return list;
}

/**
 * Standard base cookie options honoring environment, origin, and security constraints.
 */
export function getBaseAuthCookieOptions(req?: Request | any): CookieOptions {
  const isProd = process.env.NODE_ENV === 'production';
  const origin = req?.headers?.origin;
  const isCrossSite =
    origin &&
    (origin.includes('192.168.') ||
      origin.includes('10.') ||
      origin.includes('172.') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1'));

  const sameSite: 'none' | 'lax' = isCrossSite || !isProd ? 'none' : 'lax';
  const secure = true;

  const options: CookieOptions = {
    secure,
    sameSite,
    path: '/',
  };

  if (isCrossSite || !isProd) {
    (options as any).partitioned = true;
  }

  return options;
}

/**
 * Sets the role-specific access, refresh, and CSRF cookies on the response.
 * Sets the primary kebab-case cookie and also sets the camelCase alias (e.g. poojawalaAdminCsrfToken).
 */
export function setRoleAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string; csrfToken: string },
  role: USER_ROLE,
  req?: Request | any,
): void {
  const cookieNames = getRoleCookieNames(role);
  if (!cookieNames) {
    throw new Error(`Invalid role for auth cookies: ${role}`);
  }

  const baseOptions = getBaseAuthCookieOptions(req || (res as any).req);

  // Access token cookie (kebab-case)
  res.cookie(cookieNames.access, tokens.accessToken, {
    ...baseOptions,
    httpOnly: true,
    maxAge: ACCESS_TOKEN_COOKIE_MAX_AGE,
  });

  // Refresh token cookie (kebab-case)
  res.cookie(cookieNames.refresh, tokens.refreshToken, {
    ...baseOptions,
    httpOnly: true,
    maxAge: REFRESH_TOKEN_COOKIE_MAX_AGE,
  });

  // CSRF token cookie (kebab-case)
  res.cookie(cookieNames.csrf, tokens.csrfToken, {
    ...baseOptions,
    httpOnly: false, // Accessible to client-side JS so frontend can attach it to x-csrf-token
    maxAge: CSRF_TOKEN_COOKIE_MAX_AGE,
  });
}

/**
 * Clears the role-specific access, refresh, and CSRF cookies on the response.
 */
export function clearRoleAuthCookies(
  res: Response,
  role: USER_ROLE,
  req?: Request | any,
): void {
  const cookieNames = getRoleCookieNames(role);
  if (!cookieNames) {
    return;
  }

  const baseOptions = getBaseAuthCookieOptions(req || (res as any).req);
  const clearOptions: CookieOptions = {
    ...baseOptions,
    maxAge: 0,
    expires: new Date(0),
  };

  // Strictly clear ONLY the 3 canonical role-specific cookies:
  // 1. poojawala-<role>-access-token
  // 2. poojawala-<role>-refresh-token
  // 3. poojawala-<role>-csrf-token
  res.clearCookie(cookieNames.access, {
    ...clearOptions,
    httpOnly: true,
  });

  res.clearCookie(cookieNames.refresh, {
    ...clearOptions,
    httpOnly: true,
  });

  res.clearCookie(cookieNames.csrf, {
    ...clearOptions,
    httpOnly: false,
  });
}

/**
 * Clears auth cookies for all roles (complete session wipe).
 */
export function clearAllAuthCookies(res: Response, req?: Request | any): void {
  for (const role of [USER_ROLE.ADMIN, USER_ROLE.CUSTOMER, USER_ROLE.PUROHIT]) {
    clearRoleAuthCookies(res, role, req);
  }
}
