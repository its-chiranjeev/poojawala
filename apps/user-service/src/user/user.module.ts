import { EmailServicesModule } from '@poojawala/email-services';
import { SmsServicesModule } from '@poojawala/sms-services';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { EntitiesModule } from '@poojawala/entities';
import { RepositoriesModule } from '@poojawala/repositories';
import { CommonAuthModule } from '@poojawala/common';
import { AuthModuleModule } from 'apps/auth-service/src/auth/auth-module.module';
import { S3Module } from '@poojawala/s3';


@Module({
  imports: [
    EntitiesModule,
    RepositoriesModule,
    CommonAuthModule,
    AuthModuleModule,
    S3Module,
    EmailServicesModule,
    SmsServicesModule,
  ],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule { }