import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { Booking } from '../entities/booking.entity';
import { CreateBookingDto } from '../dto/create-booking.dto';
import { RecurrenceService } from './recurrence.service';

@Injectable()
export class BookingService {
  // In-memory storage - in production, this would be a database
  private bookings: Map<string, Booking> = new Map();

  constructor(private readonly recurrenceService: RecurrenceService) {}

  /**
   * Create a booking (single or recurring)
   */
  async createBooking(dto: CreateBookingDto): Promise<any> {
    const startTime = new Date(dto.start_time);
    const endTime = new Date(dto.end_time);

    // Validate time range
    if (startTime >= endTime) {
      throw new BadRequestException('start_time must be before end_time');
    }

    if (startTime < new Date()) {
      throw new BadRequestException('Cannot book meetings in the past');
    }

    const duration = endTime.getTime() - startTime.getTime();

    // Check for conflicts
    const conflicts = await this.checkConflicts(
      dto.resource_id,
      startTime,
      endTime,
      dto.recurrence_rule,
    );

    if (conflicts.length > 0) {
      // Find next available slots
      const nextSlots = await this.findNextAvailableSlots(
        dto.resource_id,
        startTime,
        endTime,
        dto.recurrence_rule,
        duration,
      );

      return {
        has_conflict: true,
        conflicts: conflicts.map((c) => ({
          booking_id: c.id,
          start_time: c.start_time.toISOString(),
          end_time: c.end_time.toISOString(),
        })),
        next_available_slots: nextSlots,
        message: 'Booking conflicts with existing meetings',
      };
    }

    // Create bookings
    const bookings: Booking[] = [];
    const parentBookingId = uuidv4();

    if (dto.recurrence_rule) {
      // Recurring booking
      try {
        const occurrences = this.recurrenceService.parseRRule(
          dto.recurrence_rule,
          startTime,
          endTime,
        );

        if (occurrences.length === 0) {
          throw new BadRequestException('RRULE generated no occurrences');
        }

        for (const occurrenceStart of occurrences) {
          const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);
          const booking = this.createBookingEntity(
            dto.resource_id,
            occurrenceStart,
            occurrenceEnd,
            dto.recurrence_rule,
            parentBookingId,
          );
          this.bookings.set(booking.id, booking);
          bookings.push(booking);
        }
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new BadRequestException(
          `Invalid recurrence rule: ${error.message}`,
        );
      }
    } else {
      // Single booking
      const booking = this.createBookingEntity(
        dto.resource_id,
        startTime,
        endTime,
      );
      this.bookings.set(booking.id, booking);
      bookings.push(booking);
    }

    return {
      booking_id: bookings.length === 1 ? bookings[0].id : parentBookingId,
      resource_id: dto.resource_id,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      recurrence_rule: dto.recurrence_rule,
      has_conflict: false,
      message:
        bookings.length === 1
          ? 'Booking created successfully'
          : `Recurring booking created with ${bookings.length} occurrences`,
    };
  }

  /**
   * Get availability for a resource in a date range
   */
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

  /**
   * Check for conflicts with existing bookings
   */
  private async checkConflicts(
    resourceId: string,
    startTime: Date,
    endTime: Date,
    recurrenceRule?: string,
  ): Promise<Booking[]> {
    const conflicts: Booking[] = [];
    const duration = endTime.getTime() - startTime.getTime();

    if (recurrenceRule) {
      // Check conflicts for each occurrence in the recurring series
      try {
        const occurrences = this.recurrenceService.parseRRule(
          recurrenceRule,
          startTime,
          endTime,
        );

        for (const occurrenceStart of occurrences) {
          const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);
          const occurrenceConflicts = this.findConflictingBookings(
            resourceId,
            occurrenceStart,
            occurrenceEnd,
          );
          conflicts.push(...occurrenceConflicts);
        }
      } catch (error) {
        throw new BadRequestException(
          `Invalid recurrence rule: ${error.message}`,
        );
      }
    } else {
      // Single booking conflict check
      conflicts.push(
        ...this.findConflictingBookings(resourceId, startTime, endTime),
      );
    }

    // Remove duplicates
    return Array.from(new Map(conflicts.map((b) => [b.id, b])).values());
  }

  /**
   * Find bookings that conflict with the given time range
   */
  private findConflictingBookings(
    resourceId: string,
    startTime: Date,
    endTime: Date,
  ): Booking[] {
    const conflicts: Booking[] = [];

    for (const booking of this.bookings.values()) {
      if (
        booking.resource_id === resourceId &&
        !booking.is_exception &&
        this.isOverlapping(
          booking.start_time,
          booking.end_time,
          startTime,
          endTime,
        )
      ) {
        conflicts.push(booking);
      }
    }

    return conflicts;
  }

  /**
   * Check if two time ranges overlap
   */
  private isOverlapping(
    start1: Date,
    end1: Date,
    start2: Date,
    end2: Date,
  ): boolean {
    return start1 < end2 && start2 < end1;
  }

  /**
   * Find next available slots after conflict
   */
  private async findNextAvailableSlots(
    resourceId: string,
    startTime: Date,
    endTime: Date,
    recurrenceRule: string | undefined,
    duration: number,
  ): Promise<Array<{ start_time: string; end_time: string }>> {
    const slots: Array<{ start_time: string; end_time: string }> = [];
    const searchEndDate = new Date();
    searchEndDate.setDate(searchEndDate.getDate() + 90); // Search next 90 days

    let currentTime = new Date(Math.max(startTime.getTime(), Date.now()));

    if (recurrenceRule) {
      // For recurring bookings, find slots that match the recurrence pattern
      try {
        const occurrences = this.recurrenceService.parseRRule(
          recurrenceRule,
          currentTime,
          new Date(currentTime.getTime() + duration), // Use duration for endDate placeholder
        );

        for (const occurrenceStart of occurrences) {
          const occurrenceEnd = new Date(occurrenceStart.getTime() + duration);
          const conflicts = this.findConflictingBookings(
            resourceId,
            occurrenceStart,
            occurrenceEnd,
          );

          if (conflicts.length === 0) {
            slots.push({
              start_time: occurrenceStart.toISOString(),
              end_time: occurrenceEnd.toISOString(),
            });
            if (slots.length >= 5) break; // Return max 5 suggestions
          }
        }
      } catch (error) {
        // If recurrence parsing fails, fall back to single slot search
      }
    } else {
      // For single booking, find next available slot
      while (currentTime < searchEndDate && slots.length < 5) {
        const slotEnd = new Date(currentTime.getTime() + duration);
        const conflicts = this.findConflictingBookings(
          resourceId,
          currentTime,
          slotEnd,
        );

        if (conflicts.length === 0) {
          slots.push({
            start_time: currentTime.toISOString(),
            end_time: slotEnd.toISOString(),
          });
          break;
        }

        // Move to next hour
        currentTime = new Date(currentTime.getTime() + 60 * 60 * 1000);
      }
    }

    return slots;
  }

  /**
   * Convert bookings to time slots (bookings are already expanded into individual instances)
   */
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

  /**
   * Check if booking is in date range
   */
  private isInRange(booking: Booking, startDate: Date, endDate: Date): boolean {
    return (
      (booking.start_time >= startDate && booking.start_time <= endDate) ||
      (booking.end_time >= startDate && booking.end_time <= endDate) ||
      (booking.start_time <= startDate && booking.end_time >= endDate)
    );
  }

  /**
   * Create a booking entity
   */
  private createBookingEntity(
    resourceId: string,
    startTime: Date,
    endTime: Date,
    recurrenceRule?: string,
    parentBookingId?: string,
  ): Booking {
    const now = new Date();
    return {
      id: uuidv4(),
      resource_id: resourceId,
      start_time: startTime,
      end_time: endTime,
      recurrence_rule: recurrenceRule,
      parent_booking_id: parentBookingId,
      is_exception: false,
      created_at: now,
      updated_at: now,
    };
  }

  /**
   * Get all bookings for testing/debugging
   */
  getAllBookings(): Booking[] {
    return Array.from(this.bookings.values());
  }

  /**
   * Cancel a specific instance of a recurring booking
   */
  async cancelException(
    parentBookingId: string,
    instanceDate: Date,
  ): Promise<any> {
    // Find all bookings with this parent_booking_id
    const seriesBookings = Array.from(this.bookings.values()).filter(
      (b) => b.parent_booking_id === parentBookingId,
    );

    console.log(JSON.stringify(this.bookings.values()));

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

  /**
   * Clear all bookings (for testing)
   */
  clearBookings(): void {
    this.bookings.clear();
  }
}
