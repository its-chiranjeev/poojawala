import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { UserRepository } from '@poojawala/repositories';
import { USER_STATUS } from '@poojawala/entities';
import * as bcrypt from 'bcryptjs';
import { Request } from 'express';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, 'local') {
  constructor(private readonly userRepository: UserRepository) {
    super({
      usernameField: 'identifier',
      passwordField: 'password',
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request & {
      body: { email?: string; username?: string; identifier?: string };
    },
    password: string,
  ) {
    const rawIdentifier =
      req?.body?.identifier ?? req?.body?.email ?? req?.body?.username;

    const identifier = rawIdentifier?.trim()?.toLowerCase();
    if (!identifier) {
      throw new UnauthorizedException('Email or username is required');
    }

    const user = await this.userRepository.findByEmailOrUsername(identifier);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.hashedPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.hashedPassword);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status !== USER_STATUS.ACTIVE) {
      throw new UnauthorizedException('User account is not active');
    }

    return user;
  }
}
