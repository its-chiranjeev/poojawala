import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Temple, TempleAarti } from '@poojawala/entities';
import { TempleRepository } from '@poojawala/repositories';
import { CommonModule } from '@poojawala/common';
import { S3Module } from '@poojawala/s3';
import { TempleController } from './temple.controller';
import { TempleService } from './temple.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Temple, TempleAarti]),
    CommonModule,
    S3Module,
  ],
  controllers: [TempleController],
  providers: [
    TempleService,
    TempleRepository,
  ],
  exports: [TempleService, TempleRepository],
})
export class TempleModule {}
