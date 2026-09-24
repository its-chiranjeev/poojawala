import { Module } from '@nestjs/common';
import { ContactUsController } from './contact-us.controller';
import { ContactUsService } from './contact-us.service';
import { RepositoriesModule } from '@poojawala/repositories';
import { EmailServicesModule } from '@poojawala/email-services';

import { CommonModule } from '@poojawala/common';

@Module({
  imports: [RepositoriesModule, EmailServicesModule, CommonModule],
  controllers: [ContactUsController],
  providers: [ContactUsService],
})
export class ContactUsModule {}

