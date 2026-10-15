import { Controller } from '@nestjs/common';
import { AstrologerService } from './astrologer.service';

@Controller('astrologers')
export class AstrologerController {
  constructor(private readonly astrologerService: AstrologerService) {}
}
