import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DatabaseModule } from '@poojawala/database';
import { EntitiesModule } from '@poojawala/entities';
import { AuthModuleModule } from './auth/auth-module.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '@poojawala/entities';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forFeature([User]),
    DatabaseModule,
    EntitiesModule,
    AuthModuleModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule { }
