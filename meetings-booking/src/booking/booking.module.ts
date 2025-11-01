import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './services/booking.service';

@Module({
  controllers: [BookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
