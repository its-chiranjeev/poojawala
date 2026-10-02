import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product, Category } from '@poojawala/entities';
import { ProductRepository, CategoryRepository } from '@poojawala/repositories';
import { S3Module } from '@poojawala/s3';
import { CommonModule } from '@poojawala/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

@Module({
  imports: [
    // Register both Product and Category so their repositories can be injected
    TypeOrmModule.forFeature([Product, Category]),
    S3Module,
    CommonModule,
  ],
  controllers: [ProductController],
  providers: [ProductService, ProductRepository, CategoryRepository],
  exports: [ProductService, ProductRepository],
})
export class ProductModule {}
