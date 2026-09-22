import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from '@poojawala/entities';
import { ProductRepository } from '@poojawala/repositories';
import { S3Module } from '@poojawala/s3';
import { CommonModule } from '@poojawala/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

@Module({
  imports: [TypeOrmModule.forFeature([Product]), S3Module, CommonModule],
  controllers: [ProductController],
  providers: [ProductService, ProductRepository],
  exports: [ProductService, ProductRepository],
})
export class ProductModule {}
