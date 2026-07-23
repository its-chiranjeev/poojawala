import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { RazorpayXService } from './razorpay-x.service';
import { RepositoriesModule } from '@hichandra/repositories';
@Module({
  imports: [RepositoriesModule],
  providers: [PaymentService, RazorpayXService],
  exports: [PaymentService, RazorpayXService],
})
export class PaymentModule {}
