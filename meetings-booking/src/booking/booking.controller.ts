import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Query,
  Get,
  Delete,
  BadRequestException,
} from '@nestjs/common';
import { BookingService } from './services/booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { CancelExceptionDto } from './dto/cancel-exception.dto';

@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  createBooking(@Body() createBookingDto: CreateBookingDto) {
    return this.bookingService.createBooking(createBookingDto);
  }

  @Get('availability')
  async getAvailability(@Query() query: AvailabilityQueryDto) {
    try {
      const startDate = new Date(query.start_date);
      const endDate = new Date(query.end_date);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new BadRequestException('Invalid date format');
      }

      return await this.bookingService.getAvailability(
        query.resource_id,
        startDate,
        endDate,
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      console.error('Availability endpoint error:', error);
      console.error('Query params:', query);
      console.error('Error stack:', error.stack);

      if (error.message && error.message.includes('Failed to query')) {
        throw new BadRequestException(`Database error: ${error.message}`);
      }
      throw new BadRequestException(
        `Failed to get availability: ${error.message}`,
      );
    }
  }

  @Delete('exceptions')
  @HttpCode(HttpStatus.OK)
  async cancelException(@Body() cancelDto: CancelExceptionDto) {
    return await this.bookingService.cancelException(
      cancelDto.booking_id,
      new Date(cancelDto.instance_date),
    );
  }
}
