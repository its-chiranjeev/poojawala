import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@poojawala/database';
import { EntitiesModule } from '@poojawala/entities';
import { RepositoriesModule } from '@poojawala/repositories';
import { CommonAuthModule } from '@poojawala/common';
import { PaymentModule } from './payment/payment.module';
import { NotificationModule } from '@poojawala/notification';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    DatabaseModule,
    EntitiesModule,
    RepositoriesModule,
    CommonAuthModule,
    PaymentModule,
    NotificationModule,
  ],
})
export class PaymentManagementModule { }
