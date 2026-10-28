import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Temple, TempleAarti, User } from '@poojawala/entities';
import { TempleRepository } from '@poojawala/repositories';
import { CommonModule } from '@poojawala/common';
import { S3Module } from '@poojawala/s3';
import { EmailServicesModule } from '@poojawala/email-services';
import { NotificationModule } from '@poojawala/notification';
import { TempleController } from './temple.controller';
import { TempleService } from './temple.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Temple, TempleAarti, User]),
    CommonModule,
    S3Module,
    EmailServicesModule,
    NotificationModule,
  ],
  controllers: [TempleController],
  providers: [
    TempleService,
    TempleRepository,
  ],
  exports: [TempleService, TempleRepository],
})
export class TempleModule {}
