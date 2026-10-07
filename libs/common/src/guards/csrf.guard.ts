import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { USER_ROLE } from '@poojawala/entities';
import { getRoleCookieNames, parseCookieHeader } from '../auth/auth-cookies';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    // We only enforce CSRF on state-changing methods (POST, PUT, PATCH, DELETE)
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }

    const userRole: USER_ROLE | undefined = request.user?.role;
    if (!userRole) {
      throw new ForbiddenException('Authenticated user role is required for CSRF validation');
    }

    const cookieNames = getRoleCookieNames(userRole);
    if (!cookieNames) {
      throw new ForbiddenException(`Unknown role '${userRole}' for CSRF validation`);
    }

    const rawCookies =
      request.cookies || (request.headers?.cookie ? parseCookieHeader(request.headers.cookie) : {});

    // TODO: Legacy generic auth cookie logic retained for reference.
    // Role-based cookies are now authoritative.
    // const legacyCsrf = rawCookies['csrf-token'];

    // Support both kebab-case (poojawala-admin-csrf-token) and camelCase (poojawalaAdminCsrfToken)
    const roleCsrfCookie =
      rawCookies[cookieNames.csrf] || rawCookies[cookieNames.csrfCamel];

    const headerCsrfToken =
      request.headers?.['x-csrf-token'] ||
      request.headers?.['x-csrf'] ||
      request.headers?.[cookieNames.csrf] ||
      request.headers?.[cookieNames.csrfCamel.toLowerCase()];

    // In development environment, allow bypass ONLY if neither CSRF header nor CSRF cookie is sent
    // (for smooth local curl/Postman testing). If either is present, or in production/tests, strictly enforce.
    const isProd = process.env.NODE_ENV === 'production';
    const isTest = process.env.NODE_ENV === 'test';
    if (!isProd && !isTest && !headerCsrfToken && !roleCsrfCookie) {
      return true;
    }

    if (!roleCsrfCookie || !headerCsrfToken || roleCsrfCookie !== headerCsrfToken) {
      throw new ForbiddenException('Invalid or missing CSRF token');
    }

    return true;
  }

  private parseCookies(cookieHeader?: string): Record<string, string> {
    return parseCookieHeader(cookieHeader);
  }
}
