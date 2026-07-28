import { Module } from '@nestjs/common';
import { UserManagementController } from './user-management.controller';
import { UserModule } from './user/user.module';
import { BookingModule } from './booking/booking.module';

import { DatabaseModule } from '@likemyproduct/database';
import { UserManagementService } from './user-management.service';
import { EntitiesModule } from '@likemyproduct/entities';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    EntitiesModule,
    UserModule,
    BookingModule
  ],
  controllers: [UserManagementController],
  providers: [UserManagementService],
})
export class UserManagementModule { }
