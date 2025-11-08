import { Module } from '@nestjs/common';
import { BookingController } from './booking.controller';
import { BookingService } from './services/booking.service';
import { RecurrenceService } from './services/recurrence.service';
import { BookingRepository } from './repositories/booking.repository';
import { BookingSeries } from './entities/booking-series.entity';
import { BookingInstance } from './entities/booking-instance.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  controllers: [BookingController],
  providers: [BookingService, RecurrenceService, BookingRepository],
  exports: [BookingService, BookingRepository],
  imports: [TypeOrmModule.forFeature([BookingSeries, BookingInstance])],
})
export class BookingModule {}
