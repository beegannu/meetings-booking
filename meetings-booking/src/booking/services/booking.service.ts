import { Booking } from '../entities/booking.entity';
import { CreateBookingDto } from '../dto/create-booking.dto';
import { v4 as uuidv4 } from 'uuid';

export class BookingService {
  createBooking(createBookingDto: CreateBookingDto): Booking {
    return {
      id: uuidv4(),
      resource_id: createBookingDto.resource_id,
      start_time: new Date(createBookingDto.start_time),
      end_time: new Date(createBookingDto.end_time),
      created_at: new Date(),
      updated_at: new Date(),
    };
  }
}
