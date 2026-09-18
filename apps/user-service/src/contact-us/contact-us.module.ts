import { Module } from '@nestjs/common';
import { ContactUsController } from './contact-us.controller';
import { ContactUsService } from './contact-us.service';
import { RepositoriesModule } from '@poojawala/repositories';
import { EmailServicesModule } from '@poojawala/email-services';

@Module({
  imports: [RepositoriesModule, EmailServicesModule],
  controllers: [ContactUsController],
  providers: [ContactUsService],
})
export class ContactUsModule {}

