import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '@likemyproduct/database';
import { EntitiesModule } from '@likemyproduct/entities';
import { RepositoriesModule } from '@likemyproduct/repositories';
import { CommonAuthModule } from '@likemyproduct/common';
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
