import { Body, Controller, Get,Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from '@poojawala/dtos';
import passport from 'passport';
import { promises } from 'dns';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get()
  getHello(): string {
    return this.authService.getHello();
  }

 
}
