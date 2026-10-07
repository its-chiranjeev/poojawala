import { Injectable, UnauthorizedException, ExecutionContext, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { USER_ROLE } from '@poojawala/entities';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(@Optional() private readonly reflector?: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    if (this.reflector && req) {
      const routeRoles = this.reflector.getAllAndOverride<USER_ROLE[]>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (routeRoles && routeRoles.length > 0) {
        req._routeRoles = routeRoles;
      }
    }
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (info?.name === 'TokenExpiredError') {
      throw new UnauthorizedException('Token is expired.Please login again');
    }

    if (err || !user) {
      throw err || new UnauthorizedException(info?.message || 'Unauthorized');
    }

    return user;
  }
}
