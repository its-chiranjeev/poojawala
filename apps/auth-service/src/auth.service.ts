import { Injectable,UnauthorizedException } from '@nestjs/common';
import { LoginDto } from '@likemyproduct/dtos';
import { User } from '@likemyproduct/entities';
import { InjectRepository } from '@nestjs/typeorm/dist/common/typeorm.decorators';




@Injectable()
export class AuthService {
 

  
  getHello(): string {
    return 'Hello World!';
  }
}
