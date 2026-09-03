import { Module } from '@nestjs/common';
import { AuthModuleService } from './auth-module.service';
import { AuthModuleController } from './auth-module.controller';
import { EntitiesModule } from '@poojawala/entities';
import { RepositoriesModule } from '@poojawala/repositories';
import { CommonAuthModule } from '@poojawala/common';
import { EmailServicesModule } from '@poojawala/email-services';
import { SmsServicesModule } from '@poojawala/sms-services';
import { S3Module } from '@poojawala/s3';
import { CommonModule } from '@poojawala/common';

@Module({
  imports: [
    EntitiesModule,
    RepositoriesModule,
    CommonAuthModule,
    CommonModule,
    EmailServicesModule,
    SmsServicesModule,
    S3Module,
  ],
  controllers: [AuthModuleController],
  providers: [AuthModuleService],
  exports: [AuthModuleService],
})
export class AuthModuleModule { }
