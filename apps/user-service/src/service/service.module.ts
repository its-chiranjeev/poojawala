import { Module } from '@nestjs/common';
import { ServiceController } from './service.controller';
import { ServiceService } from './service.service';
import { Service, ServiceCategory } from '@poojawala/entities';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceRepository } from '@poojawala/repositories';
import { ServiceCategoryRepository } from '@poojawala/repositories';
import { S3Module } from '@poojawala/s3';
import { PurohitServiceRepository } from '@poojawala/repositories';
import { PurohitService } from '@poojawala/entities';
import { PurohitProfileRepository } from '@poojawala/repositories';
import { PurohitProfile } from '@poojawala/entities';
import { CommonModule } from '@poojawala/common';

@Module({
  imports: [
    TypeOrmModule.forFeature([Service, ServiceCategory, PurohitService, PurohitProfile]),
    S3Module,
    CommonModule,
  ],
  controllers: [ServiceController],
  providers: [
    ServiceService,
    ServiceRepository,
    ServiceCategoryRepository,
    PurohitServiceRepository,
    PurohitProfileRepository,
  ],
})
export class ServiceModule {}
