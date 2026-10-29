import { Module } from '@nestjs/common';
import { ServiceController } from './service.controller';
import { ServiceService } from './service.service';
import { Service, Category, Temple, ServiceFeature } from '@poojawala/entities';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ServiceRepository,
  CategoryRepository,
  PurohitServiceRepository,
  PurohitProfileRepository,
  TempleRepository,
  ServiceFeatureRepository,
} from '@poojawala/repositories';
import { S3Module } from '@poojawala/s3';
import { PurohitService } from '@poojawala/entities';
import { PurohitProfile } from '@poojawala/entities';
import { CommonModule } from '@poojawala/common';
import { NotificationModule } from '@poojawala/notification';
import { EmailServicesModule } from '@poojawala/email-services';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Service,
      Category,
      PurohitService,
      PurohitProfile,
      Temple,
      ServiceFeature,
    ]),
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
    TempleRepository,
    ServiceFeatureRepository,
  ],
  exports: [ServiceService, ServiceRepository],
})
export class ServiceModule {}
