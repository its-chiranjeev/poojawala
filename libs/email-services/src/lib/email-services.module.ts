import { Module } from '@nestjs/common';
import { EmailService } from './email-services.service';

@Module({
  controllers: [],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailServicesModule {}
