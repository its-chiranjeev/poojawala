import { Module } from '@nestjs/common';
import { ServiceController } from './service.controller';
import { ServiceService } from './service.service';
import { Service } from '@likemyproduct/entities';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServiceRepository } from '@likemyproduct/repositories';
import { S3Module } from '@likemyproduct/s3';
import { PurohitServiceRepository } from '@likemyproduct/repositories';
import { PurohitService } from '@likemyproduct/entities';

@Module({
  imports: [TypeOrmModule.forFeature([Service, PurohitService]), S3Module],
  controllers: [ServiceController],
  providers: [ServiceService, ServiceRepository, PurohitServiceRepository],
})
export class ServiceModule {}
