import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(err: any, user: any): TUser {
    // If unauthenticated or token error, return null without throwing
    if (err || !user) {
      return null as TUser;
    }
    return user as TUser;
  }
}
