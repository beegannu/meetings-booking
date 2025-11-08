import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  Query,
  Get,
  Delete,
} from '@nestjs/common';
import { BookingService } from './services/booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { CancelExceptionDto } from './dto/cancel-exception.dto';


@Controller('booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createBooking(@Body(ValidationPipe) createBookingDto: CreateBookingDto) {
    return this.bookingService.createBooking(createBookingDto);
  }

  @Get('availability')
  async getAvailability(@Query(ValidationPipe) query: AvailabilityQueryDto) {
    return await this.bookingService.getAvailability(
      query.resource_id,
      new Date(query.start_date),
      new Date(query.end_date),
    );
  }

  @Delete('exceptions')
  @HttpCode(HttpStatus.OK)
  async cancelException(@Body(ValidationPipe) cancelDto: CancelExceptionDto) {
    return await this.bookingService.cancelException(
      cancelDto.booking_id,
      new Date(cancelDto.instance_date),
    );
  }
}
