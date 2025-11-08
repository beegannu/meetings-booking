import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { CreateBookingDto } from '../dto/create-booking.dto';
import { BookingRepository } from '../repositories/booking.repository';
import { RecurrenceService } from './recurrence.service';

@Injectable()
export class BookingService {
  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly recurrenceService: RecurrenceService,
  ) {}

  async createBooking(dto: CreateBookingDto): Promise<any> {
    const startTime = new Date(dto.start_time);
    const endTime = new Date(dto.end_time);

    if (startTime >= endTime) {
      throw new BadRequestException('start_time must be before end_time');
    }

    if (startTime < new Date()) {
      throw new BadRequestException('Cannot book meetings in the past');
    }

    if (dto.recurrence_rule) {
      try {
        const occurrences = this.recurrenceService.parseRRule(
          dto.recurrence_rule,
          startTime,
          endTime,
        );

        if (occurrences.length === 0) {
          throw new BadRequestException('RRULE generated no occurrences');
        }
      } catch (error) {
        if (error instanceof BadRequestException) {
          throw error;
        }
        throw new BadRequestException(
          `Invalid recurrence rule: ${error.message}`,
        );
      }
    }

    try {
      const { series, instances } =
        await this.bookingRepository.createBookingSeries(
          dto.resource_id,
          startTime,
          endTime,
          dto.recurrence_rule,
        );

      const isInfiniteRecurrence =
        dto.recurrence_rule &&
        this.recurrenceService.isInfiniteRecurrence(dto.recurrence_rule);

      return {
        booking_id: series.id,
        resource_id: dto.resource_id,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        recurrence_rule: dto.recurrence_rule,
        has_conflict: false,
        message: isInfiniteRecurrence
          ? 'Recurring booking created (infinite recurrence)'
          : instances.length === 1
            ? 'Booking created successfully'
            : `Recurring booking created with ${instances.length} occurrences`,
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        const duration = endTime.getTime() - startTime.getTime();
        const nextSlots = await this.bookingRepository.findNextAvailableSlots(
          dto.resource_id,
          startTime,
          duration,
          dto.recurrence_rule,
          5,
        );

        const conflicts = await this.bookingRepository.findConflicts(
          dto.resource_id,
          startTime,
          endTime,
          dto.recurrence_rule,
        );

        return {
          has_conflict: true,
          conflicts: conflicts.map((c) => ({
            booking_id: c.id,
            start_time: c.start_time.toISOString(),
            end_time: c.end_time.toISOString(),
          })),
          next_available_slots: nextSlots.map((slot) => ({
            start_time: slot.start.toISOString(),
            end_time: slot.end.toISOString(),
          })),
          message: 'Booking conflicts with existing meetings',
        };
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        `Failed to create booking: ${error.message}`,
      );
    }
  }

  async getAvailability(
    resourceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<any> {
    if (startDate >= endDate) {
      throw new BadRequestException('start_date must be before end_date');
    }

    const bookedSlots = await this.bookingRepository.findBookedSlots(
      resourceId,
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

  async cancelException(seriesId: string, instanceDate: Date): Promise<any> {
    try {
      const exception = await this.bookingRepository.cancelException(
        seriesId,
        instanceDate,
      );

      return {
        message: 'Booking instance cancelled successfully',
        booking_id: exception.id,
        parent_booking_id: seriesId,
        cancelled_date: exception.start_time.toISOString(),
      };
    } catch (error) {
      if (error.message === 'Recurring booking series not found') {
        throw new BadRequestException('Recurring booking series not found');
      }
      throw new BadRequestException(
        `Failed to cancel booking instance: ${error.message}`,
      );
    }
  }

  private calculateAvailableSlots(
    startDate: Date,
    endDate: Date,
    bookedSlots: Array<{ start: Date; end: Date }>,
  ): Array<{ start_time: string; end_time: string }> {
    const availableSlots: Array<{ start_time: string; end_time: string }> = [];

    if (bookedSlots.length === 0) {
      return [
        {
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
        },
      ];
    }

    if (bookedSlots[0].start > startDate) {
      availableSlots.push({
        start_time: startDate.toISOString(),
        end_time: bookedSlots[0].start.toISOString(),
      });
    }

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

    const lastBooking = bookedSlots[bookedSlots.length - 1];
    if (lastBooking.end < endDate) {
      availableSlots.push({
        start_time: lastBooking.end.toISOString(),
        end_time: endDate.toISOString(),
      });
    }

    return availableSlots;
  }
}
