import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommonModule } from '@poojawala/common';
import { S3Module } from '@poojawala/s3';
import { BlogPost, BlogCategory } from '@poojawala/entities';
import { BlogService } from './blog.service';
import { BlogController } from './blog.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([BlogPost, BlogCategory]),
    CommonModule,
    S3Module,
  ],
  controllers: [BlogController],
  providers: [BlogService],
  exports: [BlogService],
})
export class BlogModule {}
