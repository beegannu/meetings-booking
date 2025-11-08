import { Booking } from '../entities/booking.entity';
import { CreateBookingDto } from '../dto/create-booking.dto';
import { v4 as uuidv4 } from 'uuid';
import { BadRequestException } from '@nestjs/common';

export class BookingService {
  private bookings: Map<string, Booking> = new Map();

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

  async getAvailability(
    resourceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<any> {
    // Get all bookings for this resource in the date range
    const relevantBookings = Array.from(this.bookings.values()).filter(
      (booking) =>
        booking.resource_id === resourceId &&
        !booking.is_exception &&
        this.isInRange(booking, startDate, endDate),
    );

    // Generate available slots
    const bookedSlots = this.bookingsToTimeSlots(
      relevantBookings,
      startDate,
      endDate,
    );
    const availableSlots = this.calculateAvailableSlots(
      startDate,
      endDate,
      bookedSlots,
    );

    return {
      resource_id: resourceId,
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      available_slots: availableSlots,
    };
  }

  private bookingsToTimeSlots(
    bookings: Booking[],
    startDate: Date,
    endDate: Date,
  ): Array<{ start: Date; end: Date }> {
    const slots: Array<{ start: Date; end: Date }> = [];

    for (const booking of bookings) {
      // Since recurring bookings are already expanded into individual instances when created,
      // we can just use the stored start_time and end_time directly
      if (this.isInRange(booking, startDate, endDate)) {
        slots.push({ start: booking.start_time, end: booking.end_time });
      }
    }

    return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
  }

  /**
   * Calculate available slots by finding gaps between booked slots
   */
  private calculateAvailableSlots(
    startDate: Date,
    endDate: Date,
    bookedSlots: Array<{ start: Date; end: Date }>,
  ): Array<{ start_time: string; end_time: string }> {
    const availableSlots: Array<{ start_time: string; end_time: string }> = [];

    if (bookedSlots.length === 0) {
      // Entire range is available
      return [
        {
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
        },
      ];
    }

    // Check before first booking
    if (bookedSlots[0].start > startDate) {
      availableSlots.push({
        start_time: startDate.toISOString(),
        end_time: bookedSlots[0].start.toISOString(),
      });
    }

    // Check gaps between bookings
    for (let i = 0; i < bookedSlots.length - 1; i++) {
      const gapStart = bookedSlots[i].end;
      const gapEnd = bookedSlots[i + 1].start;

      if (gapEnd > gapStart) {
        availableSlots.push({
          start_time: gapStart.toISOString(),
          end_time: gapEnd.toISOString(),
        });
      }
    }

    // Check after last booking
    const lastBooking = bookedSlots[bookedSlots.length - 1];
    if (lastBooking.end < endDate) {
      availableSlots.push({
        start_time: lastBooking.end.toISOString(),
        end_time: endDate.toISOString(),
      });
    }

    return availableSlots;
  }

  private isInRange(booking: Booking, startDate: Date, endDate: Date): boolean {
    return (
      (booking.start_time >= startDate && booking.start_time <= endDate) ||
      (booking.end_time >= startDate && booking.end_time <= endDate) ||
      (booking.start_time <= startDate && booking.end_time >= endDate)
    );
  }

  async cancelException(
    parentBookingId: string,
    instanceDate: Date,
  ): Promise<any> {
    // Find all bookings with this parent_booking_id
    const seriesBookings = Array.from(this.bookings.values()).filter(
      (b) => b.parent_booking_id === parentBookingId,
    );

    if (seriesBookings.length === 0) {
      throw new BadRequestException('Recurring booking series not found');
    }

    // Find the specific instance to cancel
    const instanceToCancel = seriesBookings.find((booking) => {
      const bookingDate = new Date(booking.start_time);
      bookingDate.setHours(0, 0, 0, 0);
      const targetDate = new Date(instanceDate);
      targetDate.setHours(0, 0, 0, 0);
      return bookingDate.getTime() === targetDate.getTime();
    });

    if (!instanceToCancel) {
      throw new BadRequestException(
        'Instance not found in this recurring series',
      );
    }

    // Mark as exception (cancelled)
    instanceToCancel.is_exception = true;
    instanceToCancel.updated_at = new Date();
    this.bookings.set(instanceToCancel.id, instanceToCancel);

    return {
      message: 'Booking instance cancelled successfully',
      booking_id: instanceToCancel.id,
      parent_booking_id: parentBookingId,
      cancelled_date: instanceToCancel.start_time.toISOString(),
    };
  }
}
