import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Delete,
  Query,
  ParseIntPipe,
  UseGuards,
  ValidationPipe,
  Patch,
  Req,
  Request,
} from '@nestjs/common';
import { ContactUsService } from './contact-us.service';
import { CreateContactUsDto, GetAllContactUsDto, UpdateContactUsStatusDto } from '@poojawala/dtos';
import { JwtAuthGuard, RolesGuard, Roles, CsrfGuard } from '@poojawala/common';
import { USER_ROLE } from '@poojawala/entities';

@Controller('contact-us')
export class ContactUsController {
  constructor(private readonly contactUsService: ContactUsService) { }

  @Post('add')
  // @UseGuards(CsrfGuard) // Public route, no JWT/Role auth needed
  create(
    @Body(new ValidationPipe({ whitelist: true }))
    createContactUsDto: CreateContactUsDto,
  ) {
    return this.contactUsService.create(createContactUsDto);
  }

  @Get('all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN)
  getAll(
    @Query(new ValidationPipe({ whitelist: true, transform: true }))
    query: GetAllContactUsDto,
  ) {
    return this.contactUsService.getAll(query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(USER_ROLE.ADMIN)
  getById(@Param('id', ParseIntPipe) id: number) {
    return this.contactUsService.getById(id);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  updateStatus(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body(new ValidationPipe({ whitelist: true }))
    updateDto: UpdateContactUsStatusDto,
  ) {
    const user = (req as any)?.user;
    return this.contactUsService.updateStatus(id, updateDto, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard, CsrfGuard)
  @Roles(USER_ROLE.ADMIN)
  softDelete(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const user = (req as any)?.user;
    return this.contactUsService.softDelete(id, user);
  }
}
