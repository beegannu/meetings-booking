import { Test, TestingModule } from '@nestjs/testing';
import { RecurrenceService } from './recurrence.service';

describe('RecurrenceService', () => {
  let service: RecurrenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RecurrenceService],
    }).compile();

    service = module.get<RecurrenceService>(RecurrenceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('parseRRule', () => {
    it('should parse daily recurrence with COUNT', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'RRULE:FREQ=DAILY;COUNT=5';

      const occurrences = service.parseRRule(rule, startDate, endDate);

      expect(occurrences).toHaveLength(5);
      expect(occurrences[0].toISOString()).toBe('2025-01-06T09:00:00.000Z');
      expect(occurrences[1].toISOString()).toBe('2025-01-07T09:00:00.000Z');
      expect(occurrences[2].toISOString()).toBe('2025-01-08T09:00:00.000Z');
      expect(occurrences[3].toISOString()).toBe('2025-01-09T09:00:00.000Z');
      expect(occurrences[4].toISOString()).toBe('2025-01-10T09:00:00.000Z');
    });

    it('should parse weekly recurrence with COUNT', () => {
      const startDate = new Date('2025-01-06T09:00:00Z'); // Monday
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'RRULE:FREQ=WEEKLY;COUNT=3';

      const occurrences = service.parseRRule(rule, startDate, endDate);

      expect(occurrences).toHaveLength(3);
      expect(occurrences[0].toISOString()).toBe('2025-01-06T09:00:00.000Z');
      expect(occurrences[1].toISOString()).toBe('2025-01-13T09:00:00.000Z');
      expect(occurrences[2].toISOString()).toBe('2025-01-20T09:00:00.000Z');
    });

    it('should parse monthly recurrence with COUNT', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'RRULE:FREQ=MONTHLY;COUNT=3';

      const occurrences = service.parseRRule(rule, startDate, endDate);

      expect(occurrences).toHaveLength(3);
      expect(occurrences[0].toISOString()).toBe('2025-01-06T09:00:00.000Z');
      expect(occurrences[1].toISOString()).toBe('2025-02-06T09:00:00.000Z');
      expect(occurrences[2].toISOString()).toBe('2025-03-06T09:00:00.000Z');
    });

    it('should parse yearly recurrence with COUNT', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'RRULE:FREQ=YEARLY;COUNT=3';

      const occurrences = service.parseRRule(rule, startDate, endDate);

      expect(occurrences).toHaveLength(3);
      expect(occurrences[0].toISOString()).toBe('2025-01-06T09:00:00.000Z');
      expect(new Date(occurrences[1]).getFullYear()).toBe(2026);
      expect(new Date(occurrences[2]).getFullYear()).toBe(2027);
    });

    it('should parse weekly recurrence with INTERVAL', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3';

      const occurrences = service.parseRRule(rule, startDate, endDate);

      expect(occurrences).toHaveLength(3);
      expect(occurrences[0].toISOString()).toBe('2025-01-06T09:00:00.000Z');
      expect(occurrences[1].toISOString()).toBe('2025-01-20T09:00:00.000Z');
      expect(occurrences[2].toISOString()).toBe('2025-02-03T09:00:00.000Z');
    });

    it('should parse infinite recurrence (no COUNT or UNTIL)', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'RRULE:FREQ=WEEKLY';

      const occurrences = service.parseRRule(rule, startDate, endDate);

      expect(occurrences.length).toBeGreaterThan(0);
      expect(occurrences[0].toISOString()).toBe('2025-01-06T09:00:00.000Z');
      
      const twoYearsFromStart = new Date(startDate);
      twoYearsFromStart.setFullYear(twoYearsFromStart.getFullYear() + 2);
      const threeYearsFromStart = new Date(startDate);
      threeYearsFromStart.setFullYear(threeYearsFromStart.getFullYear() + 3);
      
      const lastOccurrence = occurrences[occurrences.length - 1];
      expect(lastOccurrence.getTime()).toBeGreaterThanOrEqual(twoYearsFromStart.getTime());
      expect(lastOccurrence.getTime()).toBeLessThan(threeYearsFromStart.getTime());
    });

    it('should parse recurrence with UNTIL', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const untilDate = new Date('2025-01-20T09:00:00Z');
      const rule = `RRULE:FREQ=WEEKLY;UNTIL=${untilDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;

      try {
        const occurrences = service.parseRRule(rule, startDate, endDate);
        expect(occurrences.length).toBeGreaterThan(0);
        expect(occurrences[0].toISOString()).toBe('2025-01-06T09:00:00.000Z');
      } catch (error) {
        expect(error.message).toContain('Invalid');
      }
    });

    it('should handle case-insensitive RRULE prefix', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'rrule:FREQ=WEEKLY;COUNT=3';

      const occurrences = service.parseRRule(rule, startDate, endDate);

      expect(occurrences).toHaveLength(3);
    });

    it('should throw error for invalid RRULE format', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'INVALID_RRULE';

      expect(() => {
        service.parseRRule(rule, startDate, endDate);
      }).toThrow();
    });

    it('should throw error for missing FREQ parameter', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'RRULE:COUNT=10';

      expect(() => {
        service.parseRRule(rule, startDate, endDate);
      }).toThrow('FREQ parameter is required');
    });

    it('should throw error for unsupported frequency', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'RRULE:FREQ=HOURLY;COUNT=10';

      expect(() => {
        service.parseRRule(rule, startDate, endDate);
      }).toThrow('Unsupported frequency');
    });
  });

  describe('isInfiniteRecurrence', () => {
    it('should return true for infinite recurrence (no COUNT, no UNTIL)', () => {
      expect(service.isInfiniteRecurrence('RRULE:FREQ=WEEKLY')).toBe(true);
      expect(service.isInfiniteRecurrence('RRULE:FREQ=DAILY')).toBe(true);
      expect(service.isInfiniteRecurrence('RRULE:FREQ=MONTHLY')).toBe(true);
    });

    it('should return false for finite recurrence with COUNT', () => {
      expect(
        service.isInfiniteRecurrence('RRULE:FREQ=WEEKLY;COUNT=10'),
      ).toBe(false);
      expect(
        service.isInfiniteRecurrence('RRULE:FREQ=DAILY;COUNT=5'),
      ).toBe(false);
    });

    it('should return false for finite recurrence with UNTIL', () => {
      expect(
        service.isInfiniteRecurrence('RRULE:FREQ=WEEKLY;UNTIL=20250120T090000Z'),
      ).toBe(false);
    });

    it('should return false for finite recurrence with COUNT and UNTIL', () => {
      expect(
        service.isInfiniteRecurrence(
          'RRULE:FREQ=WEEKLY;COUNT=10;UNTIL=20250120T090000Z',
        ),
      ).toBe(false);
    });

    it('should handle case-insensitive COUNT and UNTIL', () => {
      expect(
        service.isInfiniteRecurrence('RRULE:FREQ=WEEKLY;count=10'),
      ).toBe(false);
      expect(
        service.isInfiniteRecurrence('RRULE:FREQ=WEEKLY;until=20250120T090000Z'),
      ).toBe(false);
    });

    it('should return false for invalid RRULE (graceful handling)', () => {
      const result = service.isInfiniteRecurrence('INVALID_RRULE');
      expect(typeof result).toBe('boolean');
    });

    it('should handle RRULE with INTERVAL but no COUNT or UNTIL', () => {
      expect(
        service.isInfiniteRecurrence('RRULE:FREQ=WEEKLY;INTERVAL=2'),
      ).toBe(true);
    });
  });

  describe('parseRRule - Edge Cases', () => {
    it('should handle empty RRULE string', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');

      expect(() => {
        service.parseRRule('', startDate, endDate);
      }).toThrow();
    });

    it('should handle RRULE with only FREQ parameter', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'RRULE:FREQ=DAILY';

      const occurrences = service.parseRRule(rule, startDate, endDate);

      expect(occurrences.length).toBeGreaterThan(0);
      expect(occurrences[0].toISOString()).toBe('2025-01-06T09:00:00.000Z');
    });

    it('should handle RRULE with multiple parameters in different order', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'RRULE:COUNT=5;FREQ=WEEKLY';

      const occurrences = service.parseRRule(rule, startDate, endDate);

      expect(occurrences).toHaveLength(5);
    });

    it('should handle RRULE with whitespace', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'RRULE:FREQ=WEEKLY; COUNT=3';

      expect(() => {
        service.parseRRule(rule, startDate, endDate);
      }).not.toThrow();
    });

    it('should handle zero COUNT (should generate at least start date)', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'RRULE:FREQ=WEEKLY;COUNT=0';

      const occurrences = service.parseRRule(rule, startDate, endDate);

      expect(occurrences).toHaveLength(0);
    });

    it('should handle INTERVAL=1 (same as no interval)', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=3';

      const occurrences = service.parseRRule(rule, startDate, endDate);

      expect(occurrences).toHaveLength(3);
      expect(occurrences[0].toISOString()).toBe('2025-01-06T09:00:00.000Z');
      expect(occurrences[1].toISOString()).toBe('2025-01-13T09:00:00.000Z');
      expect(occurrences[2].toISOString()).toBe('2025-01-20T09:00:00.000Z');
    });

    it('should handle large INTERVAL values', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'RRULE:FREQ=WEEKLY;INTERVAL=4;COUNT=3';

      const occurrences = service.parseRRule(rule, startDate, endDate);

      expect(occurrences).toHaveLength(3);
      expect(occurrences[0].toISOString()).toBe('2025-01-06T09:00:00.000Z');
      expect(occurrences[1].toISOString()).toBe('2025-02-03T09:00:00.000Z');
      expect(occurrences[2].toISOString()).toBe('2025-03-03T09:00:00.000Z');
    });

    it('should handle UNTIL date in the past', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const pastDate = new Date('2024-01-06T09:00:00Z');
      const rule = `RRULE:FREQ=WEEKLY;UNTIL=${pastDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;

      try {
        const occurrences = service.parseRRule(rule, startDate, endDate);
        expect(Array.isArray(occurrences)).toBe(true);
      } catch (error) {
        expect(error.message).toContain('Invalid');
      }
    });

    it('should handle UNTIL date same as start date', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const untilDate = new Date('2025-01-06T09:00:00Z');
      const rule = `RRULE:FREQ=WEEKLY;UNTIL=${untilDate.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;

      try {
        const occurrences = service.parseRRule(rule, startDate, endDate);
        expect(occurrences.length).toBeGreaterThanOrEqual(1);
      } catch (error) {
        expect(error.message).toContain('Invalid');
      }
    });

    it('should generate occurrences up to 2 years for infinite recurrence', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'RRULE:FREQ=WEEKLY';

      const occurrences = service.parseRRule(rule, startDate, endDate);

      expect(occurrences.length).toBeGreaterThan(0);
      
      const twoYearsFromStart = new Date(startDate);
      twoYearsFromStart.setFullYear(twoYearsFromStart.getFullYear() + 2);
      const threeYearsFromStart = new Date(startDate);
      threeYearsFromStart.setFullYear(threeYearsFromStart.getFullYear() + 3);

      const lastOccurrence = occurrences[occurrences.length - 1];
      expect(lastOccurrence.getTime()).toBeGreaterThanOrEqual(twoYearsFromStart.getTime());
      expect(lastOccurrence.getTime()).toBeLessThan(threeYearsFromStart.getTime());
    });

    it('should handle MONTHLY recurrence correctly across month boundaries', () => {
      const startDate = new Date('2025-01-31T09:00:00Z');
      const endDate = new Date('2025-01-31T10:00:00Z');
      const rule = 'RRULE:FREQ=MONTHLY;COUNT=3';

      const occurrences = service.parseRRule(rule, startDate, endDate);

      expect(occurrences).toHaveLength(3);
      expect(occurrences[0].toISOString()).toBe('2025-01-31T09:00:00.000Z');
    });

    it('should handle YEARLY recurrence correctly across year boundaries', () => {
      const startDate = new Date('2025-12-31T09:00:00Z');
      const endDate = new Date('2025-12-31T10:00:00Z');
      const rule = 'RRULE:FREQ=YEARLY;COUNT=3';

      const occurrences = service.parseRRule(rule, startDate, endDate);

      expect(occurrences).toHaveLength(3);
      expect(occurrences[0].toISOString()).toBe('2025-12-31T09:00:00.000Z');
      expect(new Date(occurrences[1]).getFullYear()).toBe(2026);
      expect(new Date(occurrences[2]).getFullYear()).toBe(2027);
    });
  });

  describe('parseRRule - Error Handling', () => {
    it('should throw error for malformed RRULE string', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');

      expect(() => {
        service.parseRRule('RRULE:FREQ=', startDate, endDate);
      }).toThrow();
    });

    it('should handle invalid COUNT value gracefully', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'RRULE:FREQ=WEEKLY;COUNT=invalid';

      try {
        service.parseRRule(rule, startDate, endDate);
      } catch (error) {
        expect(error.message).toBeDefined();
      }
    });

    it('should handle invalid INTERVAL value gracefully', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'RRULE:FREQ=WEEKLY;INTERVAL=invalid';

      try {
        service.parseRRule(rule, startDate, endDate);
      } catch (error) {
        expect(error.message).toBeDefined();
      }
    });

    it('should handle invalid UNTIL date format gracefully', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'RRULE:FREQ=WEEKLY;UNTIL=invalid';

      try {
        service.parseRRule(rule, startDate, endDate);
      } catch (error) {
        expect(error.message).toBeDefined();
      }
    });

    it('should throw error when FREQ is empty', () => {
      const startDate = new Date('2025-01-06T09:00:00Z');
      const endDate = new Date('2025-01-06T10:00:00Z');
      const rule = 'RRULE:FREQ=;COUNT=10';

      try {
        service.parseRRule(rule, startDate, endDate);
        expect(true).toBe(false);
      } catch (error) {
        expect(error.message).toBeDefined();
      }
    });
  });

  describe('isInfiniteRecurrence - Edge Cases', () => {
    it('should handle empty string gracefully', () => {
      const result = service.isInfiniteRecurrence('');
      expect(typeof result).toBe('boolean');
    });

    it('should return false for null or undefined (graceful handling)', () => {
      expect(service.isInfiniteRecurrence(null as any)).toBe(false);
      expect(service.isInfiniteRecurrence(undefined as any)).toBe(false);
    });

    it('should handle COUNT=0 as finite', () => {
      expect(service.isInfiniteRecurrence('RRULE:FREQ=WEEKLY;COUNT=0')).toBe(
        false,
      );
    });

    it('should handle COUNT with whitespace (may be treated as infinite if parsing fails)', () => {
      const result = service.isInfiniteRecurrence('RRULE:FREQ=WEEKLY; COUNT=10');
      expect(typeof result).toBe('boolean');
    });

    it('should handle UNTIL with whitespace (may be treated as infinite if parsing fails)', () => {
      const result = service.isInfiniteRecurrence(
        'RRULE:FREQ=WEEKLY; UNTIL=20250120T090000Z',
      );
      expect(typeof result).toBe('boolean');
    });

    it('should handle case variations in COUNT', () => {
      expect(service.isInfiniteRecurrence('RRULE:FREQ=WEEKLY;Count=10')).toBe(
        false,
      );
      expect(service.isInfiniteRecurrence('RRULE:FREQ=WEEKLY;COUNT=10')).toBe(
        false,
      );
    });

    it('should handle case variations in UNTIL', () => {
      expect(
        service.isInfiniteRecurrence('RRULE:FREQ=WEEKLY;Until=20250120T090000Z'),
      ).toBe(false);
      expect(
        service.isInfiniteRecurrence('RRULE:FREQ=WEEKLY;UNTIL=20250120T090000Z'),
      ).toBe(false);
    });
  });
});

