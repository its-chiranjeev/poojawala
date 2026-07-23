import { Module } from '@nestjs/common';
import { RepositoriesService } from './repositories.service';
import { EntitiesModule } from '@likemyproduct/entities';
import { UserRepository } from './user.repository';
import { OtpRepository } from './otp.repository';
@Module({
  imports: [EntitiesModule],
  providers: [
    RepositoriesService,
    UserRepository,
    OtpRepository,
  ],
  exports: [
    RepositoriesService,
    UserRepository,
    OtpRepository,
  ],
})
export class RepositoriesModule { }
