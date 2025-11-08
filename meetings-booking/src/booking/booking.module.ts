import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './services/booking.service';
import { RecurrenceService } from './services/recurrence.service';

@Module({
  controllers: [BookingController],
  providers: [BookingService, RecurrenceService],
  exports: [BookingService],
})
export class BookingModule {}
