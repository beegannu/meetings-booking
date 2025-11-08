import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './services/booking.service';
import { RecurrenceService } from './services/recurrence.service';
import { BookingSeries } from './entities/booking-series.entity';
import { BookingInstance } from './entities/booking-instance.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  controllers: [BookingController],
  providers: [BookingService, RecurrenceService],
  exports: [BookingService],
  imports: [TypeOrmModule.forFeature([BookingSeries, BookingInstance])],
})
export class BookingModule {}
