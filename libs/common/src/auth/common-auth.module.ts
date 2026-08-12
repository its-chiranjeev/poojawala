import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { RepositoriesModule } from '@poojawala/repositories';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { LocalStrategy } from '../strategies/local.strategy';

@Module({
  imports: [
    PassportModule.register({
      defaultStrategy: 'jwt',
    }),
    RepositoriesModule,
  ],
  providers: [JwtStrategy, LocalStrategy],
  exports: [PassportModule, JwtStrategy, LocalStrategy],
})
export class CommonAuthModule { }
