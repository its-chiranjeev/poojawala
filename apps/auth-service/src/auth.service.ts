import { Injectable,UnauthorizedException } from '@nestjs/common';
import { LoginDto } from '@poojawala/dtos';
import { User } from '@poojawala/entities';
import { InjectRepository } from '@nestjs/typeorm/dist/common/typeorm.decorators';




@Injectable()
export class AuthService {
 

  
  getHello(): string {
    return 'Hello World!';
  }
}
