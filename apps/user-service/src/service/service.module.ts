import { Module } from '@nestjs/common';
import { ServiceController } from './service.controller';
import { ServiceService } from './service.service';
import { Service, Category } from '@poojawala/entities';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceRepository } from '@poojawala/repositories';
import { CategoryRepository } from '@poojawala/repositories';
import { S3Module } from '@poojawala/s3';
import { PurohitServiceRepository } from '@poojawala/repositories';
import { PurohitService } from '@poojawala/entities';
import { PurohitProfileRepository } from '@poojawala/repositories';
import { PurohitProfile } from '@poojawala/entities';
import { CommonModule } from '@poojawala/common';
import { NotificationModule } from '@poojawala/notification';
import { EmailServicesModule } from '@poojawala/email-services';

@Module({
  imports: [
    TypeOrmModule.forFeature([Service, Category, PurohitService, PurohitProfile]),
    S3Module,
    CommonModule,
    NotificationModule,
    EmailServicesModule,
  ],
  controllers: [ServiceController],
  providers: [
    ServiceService,
    ServiceRepository,
    CategoryRepository,
    PurohitServiceRepository,
    PurohitProfileRepository,
  ],
})
export class ServiceModule {}
