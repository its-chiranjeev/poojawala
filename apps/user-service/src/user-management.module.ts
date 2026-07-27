import { Module } from '@nestjs/common';
import { UserManagementController } from './user-management.controller';
import { UserModule } from './user/user.module';

import { DatabaseModule } from '@likemyproduct/database';
import { UserManagementService } from './user-management.service';
import { EntitiesModule } from '@likemyproduct/entities';
import { ConfigModule } from '@nestjs/config';
import { ServiceModule } from './service/service.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    EntitiesModule,
    UserModule,
    ServiceModule,
  ],
  controllers: [UserManagementController],
  providers: [UserManagementService],
})
export class UserManagementModule { }
