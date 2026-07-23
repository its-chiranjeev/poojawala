import { Module } from '@nestjs/common';
import { AuthModuleService } from './auth-module.service';
import { AuthModuleController } from './auth-module.controller';
import { EntitiesModule } from '@likemyproduct/entities';
import { RepositoriesModule } from '@likemyproduct/repositories';
import { CommonAuthModule } from '@likemyproduct/common';
import { EmailServicesModule } from '@likemyproduct/email-services';
import { S3Module } from '@likemyproduct/s3';

@Module({
  imports: [
    EntitiesModule,
    RepositoriesModule,
    CommonAuthModule,
    EmailServicesModule,
    S3Module,
  ],
  controllers: [AuthModuleController],
  providers: [AuthModuleService],
  exports: [AuthModuleService],
})
export class AuthModuleModule { }
