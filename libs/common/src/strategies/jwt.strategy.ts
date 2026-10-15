import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRepository } from '@poojawala/repositories';
import { USER_STATUS, USER_ROLE } from '@poojawala/entities';
import { JwtPayload } from '@poojawala/common';
import { ROLE_COOKIE_MAP, parseCookieHeader } from '../auth/auth-cookies';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly userRepository: UserRepository,
  ) {
    const jwtSecret =
      configService.get<string>('JWT_ACCESS_SECRET') ||
      configService.get<string>('JWT_SECRET');

    if (!jwtSecret) {
      throw new Error('JWT_ACCESS_SECRET or JWT_SECRET must be configured');
    }

    // [EXISTING CODE]
    // super({
    //   jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    //   ignoreExpiration: false,
    //   secretOrKey: jwtSecret,
    // });

    // Super initialization with passReqToCallback for role-cookie consistency validation
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // 1. First check Authorization Bearer token if present
        (request: any) => {
          const bearer = ExtractJwt.fromAuthHeaderAsBearerToken()(request);
          if (bearer) {
            if (request) {
              request._extractedRoleFromCookie = null;
            }
            return bearer;
          }
          return null;
        },
        // 2. Otherwise check the three known role-specific access-token cookies
        (request: any) => {
          if (!request) {
            return null;
          }

          const rawCookies =
            request.cookies ||
            (request.headers?.cookie ? parseCookieHeader(request.headers.cookie) : {});

          // TODO: Legacy generic auth cookie logic retained for reference.
          // Role-based cookies are now authoritative.
          // const legacyToken = rawCookies['accessToken'];

          const present: { role: USER_ROLE; token: string; cookieName: string }[] = [];
          for (const [roleKey, roleCookies] of Object.entries(ROLE_COOKIE_MAP)) {
            const token = rawCookies[roleCookies.access] || rawCookies[roleCookies.accessCamel];
            if (token) {
              present.push({
                role: roleKey as USER_ROLE,
                token,
                cookieName: roleCookies.access,
              });
            }
          }

          if (present.length === 0) {
            return null;
          }

          let selected: { role: USER_ROLE; token: string; cookieName: string } | null = null;

          if (present.length === 1) {
            selected = present[0];
          } else {
            // Priority 1: Check incoming x-csrf-token against each role's CSRF cookie.
            // When Admin & Customer dashboards are both open in the same browser, each dashboard
            // sends its own role's x-csrf-token header with requests.
            const incomingCsrf =
              request.headers?.['x-csrf-token'] ||
              request.headers?.['x-csrf'];

            if (incomingCsrf) {
              const csrfMatch = present.find((item) => {
                const cookieNames = ROLE_COOKIE_MAP[item.role];
                const cookieCsrf =
                  rawCookies[cookieNames.csrf] || rawCookies[cookieNames.csrfCamel];
                return cookieCsrf && cookieCsrf === incomingCsrf;
              });

              if (csrfMatch) {
                selected = csrfMatch;
              }
            }

            // Priority 2: Check for explicit role hint header (e.g. x-auth-role or x-role)
            if (!selected) {
              const roleHint = (
                request.headers?.['x-auth-role'] || request.headers?.['x-role']
              )?.toString().toUpperCase();

              if (roleHint) {
                const match = present.find((item) => item.role === roleHint);
                if (match) {
                  selected = match;
                }
              }
            }

            // Priority 3: Check route roles attached by JwtAuthGuard (_routeRoles)
            if (!selected && Array.isArray(request._routeRoles) && request._routeRoles.length > 0) {
              const matches = present.filter((item) => request._routeRoles.includes(item.role));
              if (matches.length === 1) {
                selected = matches[0];
              }
            }

            // Priority 4: Fallback to the newest active token (latest iat)
            if (!selected) {
              const decodeTokenIat = (token: string): number => {
                try {
                  const parts = token.split('.');
                  if (parts.length === 3) {
                    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
                    return payload.iat || 0;
                  }
                } catch {}
                return 0;
              };

              const sorted = [...present].sort((a, b) => decodeTokenIat(b.token) - decodeTokenIat(a.token));
              selected = sorted[0];
            }
          }

          request._extractedRoleFromCookie = selected.role;
          request._extractedCookieName = selected.cookieName;
          return selected.token;
        },
      ]),
      passReqToCallback: true,
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  // async validate(payload: { sub: number; email: string; role: string }) {
  //   const user = await this.userRepository.findByEmail(payload.email.toLowerCase());
  //
  //   if (!user || user.id !== payload.sub || user.status !== USER_STATUS.ACTIVE) {
  //     throw new UnauthorizedException('Invalid token');
  //   }
  //
  //   return {
  //     id: user.id,
  //     email: user.email,
  //     role: user.role,
  //     status: user.status,
  //     boardId: user.boardId,
  //     schoolId: user.schoolId,
  //     tokenVersion: user.tokenVersion,
  //   };
  // }

  async validate(reqOrPayload: any, payloadMaybe?: JwtPayload) {
    let req: any = null;
    let payload: JwtPayload;

    if (payloadMaybe !== undefined) {
      req = reqOrPayload;
      payload = payloadMaybe;
    } else {
      payload = reqOrPayload;
    }

    // 4 & 5. Validate the selected JWT and ensure the authenticated user's role matches
    // the role represented by the cookie. Reject invalid/mismatched role-cookie usage.
    const cookieRole = req?._extractedRoleFromCookie;
    if (cookieRole && payload.role !== cookieRole) {
      throw new UnauthorizedException(
        `Role mismatch: token role '${payload.role}' does not match cookie role '${cookieRole}'`,
      );
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.role !== payload.role) {
      throw new UnauthorizedException('User role mismatch');
    }

    // TOKEN VERSION CHECK
    if (user.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Session expired');
    }

    return user;
  }
}
