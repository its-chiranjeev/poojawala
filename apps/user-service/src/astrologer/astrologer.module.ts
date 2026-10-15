import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AstrologerProfile, User } from '@poojawala/entities';
import {
  AstrologerProfileRepository,
  UserRepository,
} from '@poojawala/repositories';
import { CommonModule } from '@poojawala/common';
import { S3Module } from '@poojawala/s3';
import { AstrologerController } from './astrologer.controller';
import { AstrologerService } from './astrologer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([AstrologerProfile, User]),
    CommonModule,
    S3Module,
  ],
  controllers: [AstrologerController],
  providers: [
    AstrologerService,
    AstrologerProfileRepository,
    UserRepository,
  ],
  exports: [AstrologerService, AstrologerProfileRepository],
})
export class AstrologerModule {}
