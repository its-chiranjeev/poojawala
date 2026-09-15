import { Module } from '@nestjs/common';
import { EmailService } from './email-services.service';
import { ResendProvider } from './providers/resend.provider';

@Module({
  controllers: [],
  providers: [EmailService, ResendProvider],
  exports: [EmailService, ResendProvider],
})
export class EmailServicesModule {}
