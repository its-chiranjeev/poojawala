import { Module } from '@nestjs/common';
import { ServiceController } from './service.controller';
import { ServiceService } from './service.service';
import { Service } from '@poojawala/entities';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceRepository } from '@poojawala/repositories';
import { S3Module } from '@poojawala/s3';
import { PurohitServiceRepository } from '@poojawala/repositories';
import { PurohitService } from '@poojawala/entities';
import { PurohitProfileRepository } from '@poojawala/repositories';
import { PurohitProfile } from '@poojawala/entities';

@Module({
  imports: [TypeOrmModule.forFeature([Service, PurohitService, PurohitProfile]), S3Module],
  controllers: [ServiceController],
  providers: [ServiceService, ServiceRepository, PurohitServiceRepository, PurohitProfileRepository],
})
export class ServiceModule {}
