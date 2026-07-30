import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { EntitiesModule } from '@likemyproduct/entities';
import { RepositoriesModule } from '@likemyproduct/repositories';
import { CommonAuthModule } from '@likemyproduct/common';
import { AuthModuleModule } from 'apps/auth-service/src/auth/auth-module.module';
import { S3Module } from '@likemyproduct/s3';


@Module({
  imports: [
    EntitiesModule,
    RepositoriesModule,
    CommonAuthModule,
    AuthModuleModule,
    S3Module,
  ],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule { }
