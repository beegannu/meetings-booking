import { Injectable } from '@nestjs/common';
import { RRule, Frequency } from 'rrule';

export interface RecurrenceConfig {
  freq: Frequency;
  count?: number;
  interval?: number;
  until?: Date;
}

@Injectable()
export class RecurrenceService {
  parseRRule(rruleString: string, startDate: Date, endDate: Date): Date[] {
    try {
      // example: RRULE:FREQ=WEEKLY;COUNT=10
      const ruleStr = rruleString.replace(/^RRULE:/i, '');
      const params = this.parseRRuleParams(ruleStr);

      const options: any = {
        freq: params.freq,
        dtstart: startDate,
      };

      if (params.count !== undefined) {
        options.count = params.count;
      }
      if (params.until) {
        options.until = params.until;
      }
      if (params.interval) {
        options.interval = params.interval;
      }

      const rule = new RRule(options);
      // For infite, taking a max of 2 years
      if (!params.count && !params.until) {
        const twoYearsFromNow = new Date();
        twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2);
        return rule.between(startDate, twoYearsFromNow, true);
      }

      return rule.all();
    } catch (error) {
      throw new Error(`Invalid RRULE format: ${error.message}`);
    }
  }

  private parseRRuleParams(rruleString: string): RecurrenceConfig {
    const params: RecurrenceConfig = {
      freq: Frequency.YEARLY,
    };
    const parts = rruleString.split(';');
    let freqFound = false;

    for (const part of parts) {
      const [key, value] = part.split('=');
      const upperKey = key.toUpperCase();

      switch (upperKey) {
        case 'FREQ':
          params.freq = this.mapFrequency(value);
          freqFound = true;
          break;
        case 'COUNT':
          params.count = parseInt(value, 10);
          break;
        case 'INTERVAL':
          params.interval = parseInt(value, 10);
          break;
        case 'UNTIL':
          params.until = new Date(value);
          break;
      }
    }

    if (!freqFound) {
      throw new Error('FREQ parameter is required in RRULE');
    }

    return params;
  }


  private mapFrequency(freq: string): Frequency {
    const upperFreq = freq.toUpperCase();
    switch (upperFreq) {
      case 'DAILY':
        return RRule.DAILY;
      case 'WEEKLY':
        return RRule.WEEKLY;
      case 'MONTHLY':
        return RRule.MONTHLY;
      case 'YEARLY':
        return RRule.YEARLY;
      default:
        throw new Error(`Unsupported frequency: ${freq}`);
    }
  }

  isInfiniteRecurrence(rruleString: string): boolean {
    try {
      const ruleStr = rruleString.replace(/^RRULE:/i, '');
      const parts = ruleStr.split(';');

      const hasCount = parts.some((p) => p.toUpperCase().startsWith('COUNT='));
      const hasUntil = parts.some((p) => p.toUpperCase().startsWith('UNTIL='));

      return !hasCount && !hasUntil;
    } catch {
      return false;
    }
  }
}
