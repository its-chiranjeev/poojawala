import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { RepositoriesModule } from '@hichandra/repositories';
@Module({
  imports: [RepositoriesModule],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
