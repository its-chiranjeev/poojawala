import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserRepository } from '@poojawala/repositories';
import { USER_STATUS } from '@poojawala/entities';
import { JwtPayload } from '@poojawala/common';

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

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request) => {
          if (!request || !request.headers || !request.headers.cookie) {
            return null;
          }
          const cookies = request.headers.cookie.split(';').reduce((acc: Record<string, string>, cookie) => {
            const parts = cookie.split('=');
            acc[parts.shift()!.trim()] = decodeURIComponent(parts.join('='));
            return acc;
          }, {});
          return cookies['accessToken'] || null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  // async validate(payload: { sub: number; email: string; role: string }) {
  //   const user = await this.userRepository.findByEmail(payload.email.toLowerCase());

  //   if (!user || user.id !== payload.sub || user.status !== USER_STATUS.ACTIVE) {
  //     throw new UnauthorizedException('Invalid token');
  //   }

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

  async validate(payload: JwtPayload) {
    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      // select: [
      //   'id',
      //   'email',
      //   'role',
      //   'status',
      //   'boardId',
      //   'schoolId',
      //   'tokenVersion',
      // ],
    });

    // if (!user || user.status !== USER_STATUS.ACTIVE) {
    //   throw new UnauthorizedException('Invalid token');
    // }

    //TOKEN VERSION CHECK
    if (user?.tokenVersion !== payload.tokenVersion) {
      throw new UnauthorizedException('Session expired');
    }

    return user;
  }
}
