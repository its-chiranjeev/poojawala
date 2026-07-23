import { Module } from '@nestjs/common';
import { SmsService } from './sms-services.service';

@Module({
  controllers: [],
  providers: [SmsService],
  exports: [SmsService],
})
export class SmsServicesModule {}
