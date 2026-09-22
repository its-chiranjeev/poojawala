import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard, Roles, RolesGuard } from '@poojawala/common';
import { USER_ROLE } from '@poojawala/entities';
import {
  CreateProductDto,
  GetProductsQueryDto,
  UpdateProductDto,
  UpdateProductStatusDto,
} from '@poojawala/dtos';
import { ProductService } from './product.service';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) { }

  @Post("add")
  @Roles(USER_ROLE.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(
    FileFieldsInterceptor([
      {
        name: 'image',
        maxCount: 1,
      },
    ]),
  )
  @HttpCode(HttpStatus.CREATED)
  async createProduct(
    @Req() req: any,
    @Body() dto: CreateProductDto,
    @UploadedFiles()
    files: {
      image?: Express.Multer.File[];
    },
  ) {
    const user = req.user;
    return this.productService.createProduct(dto, files, user.id);
  }

  // Public — any user (logged in or not) can list products
  @Get('all')
  @HttpCode(HttpStatus.OK)
  async getAllProducts(@Query() query: GetProductsQueryDto) {
    return this.productService.getAllProducts(query);
  }

  // Public — any user (logged in or not) can view a product
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  async getProductById(@Param('id', ParseIntPipe) id: number) {
    return this.productService.getProductById(id);
  }

  @Patch(':id')
  @Roles(USER_ROLE.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @UseInterceptors(
    FileFieldsInterceptor([
      {
        name: 'image',
        maxCount: 1,
      },
    ]),
  )
  @HttpCode(HttpStatus.OK)
  async updateProduct(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @UploadedFiles()
    files: {
      image?: Express.Multer.File[];
    },
  ) {
    const user = req.user;
    return this.productService.updateProduct(id, dto, files, user.id);
  }

  @Patch(':id/status')
  @Roles(USER_ROLE.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.OK)
  async updateProductStatus(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductStatusDto,
  ) {
    const user = req.user;
    return this.productService.updateProductStatus(id, dto.isActive, user.id);
  }

  @Delete(':id')
  @Roles(USER_ROLE.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @HttpCode(HttpStatus.OK)
  async deleteProduct(
    @Req() req: any,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const user = req.user;
    return this.productService.deleteProduct(id, user.id);
  }
}
