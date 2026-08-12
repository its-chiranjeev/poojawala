import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@poojawala/database';
import { EntitiesModule } from '@poojawala/entities';
import { RepositoriesModule } from '@poojawala/repositories';
import { CommonAuthModule } from '@poojawala/common';
import { PaymentModule } from './payment/payment.module';

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
  ],
})
export class PaymentManagementModule {}
