import dayjs from 'dayjs';
import {
  calculateNextRun,
  getScheduleDescription,
  validateScheduleConfig,
  ScheduleConfig
} from './schedule';

// Mock dayjs to control time during tests
jest.mock('dayjs');
const mockedDayjs = dayjs as jest.MockedFunction<typeof dayjs>;

describe('Schedule Utils', () => {
  let mockNow: dayjs.Dayjs;
  let originalDayjs: typeof dayjs;

  beforeAll(() => {
    originalDayjs = jest.requireActual('dayjs');
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Set up a fixed "now" time for predictable tests
    // Using Tuesday, 2025-01-07 at 10:30:00
    mockNow = originalDayjs('2025-01-07T10:30:00.000Z');
    
    // Mock dayjs() with proper typing
    mockedDayjs.mockImplementation((date?: any, format?: any, locale?: string, strict?: boolean) => {
      if (date !== undefined) {
        return originalDayjs(date, format, locale, strict);
      }
      return mockNow;
    });
  });

  describe('calculateNextRun', () => {
    describe('daily frequency', () => {
      it('should calculate next run for today if time has not passed', () => {
        const config: ScheduleConfig = {
          frequency: 'daily',
          time: '15:00'
        };

        const result = calculateNextRun(config);
        const expected = mockNow.hour(15).minute(0).second(0).millisecond(0).toDate();
        
        expect(result).toEqual(expected);
      });

      it('should calculate next run for tomorrow if time has already passed', () => {
        const config: ScheduleConfig = {
          frequency: 'daily',
          time: '09:00'
        };

        const result = calculateNextRun(config);
        const expected = mockNow.hour(9).minute(0).second(0).millisecond(0).add(1, 'day').toDate();
        
        expect(result).toEqual(expected);
      });

      it('should handle midnight time correctly', () => {
        const config: ScheduleConfig = {
          frequency: 'daily',
          time: '00:00'
        };

        const result = calculateNextRun(config);
        const expected = mockNow.hour(0).minute(0).second(0).millisecond(0).add(1, 'day').toDate();
        
        expect(result).toEqual(expected);
      });

      it('should handle 23:59 time correctly', () => {
        const config: ScheduleConfig = {
          frequency: 'daily',
          time: '23:59'
        };

        const result = calculateNextRun(config);
        const expected = mockNow.hour(23).minute(59).second(0).millisecond(0).toDate();
        
        expect(result).toEqual(expected);
      });
    });

    describe('weekly frequency', () => {
      it('should throw error if dayOfWeek is undefined', () => {
        const config: ScheduleConfig = {
          frequency: 'weekly',
          time: '10:00'
        };

        expect(() => calculateNextRun(config)).toThrow('Day of week is required for weekly schedules');
      });

      it('should calculate next run for same week if day has not passed', () => {
        // Current day is Tuesday (2), scheduling for Friday (5)
        const config: ScheduleConfig = {
          frequency: 'weekly',
          time: '15:00',
          dayOfWeek: 5 // Friday
        };

        const result = calculateNextRun(config);
        const expected = mockNow.hour(15).minute(0).second(0).millisecond(0).add(3, 'day').toDate();
        
        expect(result).toEqual(expected);
      });

      it('should calculate next run for next week if day has already passed', () => {
        // Current day is Tuesday (2), scheduling for Monday (1)
        const config: ScheduleConfig = {
          frequency: 'weekly',
          time: '15:00',
          dayOfWeek: 1 // Monday
        };

        const result = calculateNextRun(config);
        const expected = mockNow.hour(15).minute(0).second(0).millisecond(0).add(6, 'day').toDate();
        
        expect(result).toEqual(expected);
      });

      it('should calculate next run for same day next week if time has passed', () => {
        // Current day is Tuesday (2), scheduling for Tuesday (2) but earlier time
        const config: ScheduleConfig = {
          frequency: 'weekly',
          time: '09:00',
          dayOfWeek: 2 // Tuesday
        };

        const result = calculateNextRun(config);
        const expected = mockNow.hour(9).minute(0).second(0).millisecond(0).add(7, 'day').toDate();
        
        expect(result).toEqual(expected);
      });

      it('should calculate next run for same day if time has not passed', () => {
        // Current day is Tuesday (2), scheduling for Tuesday (2) but later time
        const config: ScheduleConfig = {
          frequency: 'weekly',
          time: '15:00',
          dayOfWeek: 2 // Tuesday
        };

        const result = calculateNextRun(config);
        const expected = mockNow.hour(15).minute(0).second(0).millisecond(0).toDate();
        
        expect(result).toEqual(expected);
      });

      it('should handle Sunday (0) correctly', () => {
        const config: ScheduleConfig = {
          frequency: 'weekly',
          time: '10:00',
          dayOfWeek: 0 // Sunday
        };

        const result = calculateNextRun(config);
        const expected = mockNow.hour(10).minute(0).second(0).millisecond(0).add(5, 'day').toDate();
        
        expect(result).toEqual(expected);
      });

      it('should handle Saturday (6) correctly', () => {
        const config: ScheduleConfig = {
          frequency: 'weekly',
          time: '10:00',
          dayOfWeek: 6 // Saturday
        };

        const result = calculateNextRun(config);
        const expected = mockNow.hour(10).minute(0).second(0).millisecond(0).add(4, 'day').toDate();
        
        expect(result).toEqual(expected);
      });
    });

    describe('monthly frequency', () => {
      it('should throw error if dayOfMonth is undefined', () => {
        const config: ScheduleConfig = {
          frequency: 'monthly',
          time: '10:00'
        };

        expect(() => calculateNextRun(config)).toThrow('Day of month is required for monthly schedules');
      });

      it('should calculate next run for current month if date has not passed', () => {
        // Current date is 7th, scheduling for 15th
        const config: ScheduleConfig = {
          frequency: 'monthly',
          time: '15:00',
          dayOfMonth: 15
        };

        const result = calculateNextRun(config);
        const expected = mockNow.date(15).hour(15).minute(0).second(0).millisecond(0).toDate();
        
        expect(result).toEqual(expected);
      });

      it('should calculate next run for next month if date has already passed', () => {
        // Current date is 7th, scheduling for 5th
        const config: ScheduleConfig = {
          frequency: 'monthly',
          time: '15:00',
          dayOfMonth: 5
        };

        const result = calculateNextRun(config);
        const expected = mockNow.date(5).hour(15).minute(0).second(0).millisecond(0).add(1, 'month').toDate();
        
        expect(result).toEqual(expected);
      });

      it('should calculate next run for next month if same date but time has passed', () => {
        // Current date is 7th at 10:30, scheduling for 7th at 09:00
        const config: ScheduleConfig = {
          frequency: 'monthly',
          time: '09:00',
          dayOfMonth: 7
        };

        const result = calculateNextRun(config);
        const expected = mockNow.date(7).hour(9).minute(0).second(0).millisecond(0).add(1, 'month').toDate();
        
        expect(result).toEqual(expected);
      });

      it('should handle end of month correctly for day 31', () => {
        // Test with February which doesn't have 31 days
        mockNow = originalDayjs('2025-02-15T10:30:00.000Z');
        mockedDayjs.mockImplementation((date?: any, format?: any, locale?: string, strict?: boolean) => {
          if (date !== undefined) {
            return originalDayjs(date, format, locale, strict);
          }
          return mockNow;
        });
        
        const config: ScheduleConfig = {
          frequency: 'monthly',
          time: '15:00',
          dayOfMonth: 31
        };

        const result = calculateNextRun(config);
        // Should be set to last day of February
        const expected = mockNow.date(31).hour(15).minute(0).second(0).millisecond(0).endOf('month').toDate();
        
        expect(result).toEqual(expected);
      });

      it('should handle leap year February correctly', () => {
        // Test with leap year
        mockNow = originalDayjs('2024-02-15T10:30:00.000Z');
        mockedDayjs.mockImplementation((date?: any, format?: any, locale?: string, strict?: boolean) => {
          if (date !== undefined) {
            return originalDayjs(date, format, locale, strict);
          }
          return mockNow;
        });
        
        const config: ScheduleConfig = {
          frequency: 'monthly',
          time: '15:00',
          dayOfMonth: 30
        };

        const result = calculateNextRun(config);
        // Should be set to last day of February (29th in leap year)
        const expected = mockNow.date(30).hour(15).minute(0).second(0).millisecond(0).endOf('month').toDate();
        
        expect(result).toEqual(expected);
      });

      it('should handle day 1 correctly', () => {
        const config: ScheduleConfig = {
          frequency: 'monthly',
          time: '00:00',
          dayOfMonth: 1
        };

        const result = calculateNextRun(config);
        const expected = mockNow.date(1).hour(0).minute(0).second(0).millisecond(0).add(1, 'month').toDate();
        
        expect(result).toEqual(expected);
      });
    });

    describe('invalid frequency', () => {
      it('should throw error for unknown frequency', () => {
        const config = {
          frequency: 'yearly' as any,
          time: '10:00'
        };

        expect(() => calculateNextRun(config)).toThrow('Unknown frequency: yearly');
      });
    });

    describe('time parsing', () => {
      it('should handle single digit hours', () => {
        const config: ScheduleConfig = {
          frequency: 'daily',
          time: '9:00'
        };

        const result = calculateNextRun(config);
        const expected = mockNow.hour(9).minute(0).second(0).millisecond(0).add(1, 'day').toDate();
        
        expect(result).toEqual(expected);
      });

      it('should handle single digit minutes', () => {
        const config: ScheduleConfig = {
          frequency: 'daily',
          time: '15:05'
        };

        const result = calculateNextRun(config);
        const expected = mockNow.hour(15).minute(5).second(0).millisecond(0).toDate();
        
        expect(result).toEqual(expected);
      });
    });
  });

  describe('getScheduleDescription', () => {
    it('should return correct description for daily schedule', () => {
      const config: ScheduleConfig = {
        frequency: 'daily',
        time: '15:30'
      };

      const result = getScheduleDescription(config);
      expect(result).toBe('Daily at 15:30');
    });

    it('should return correct description for weekly schedule', () => {
      const config: ScheduleConfig = {
        frequency: 'weekly',
        time: '09:00',
        dayOfWeek: 1
      };

      const result = getScheduleDescription(config);
      expect(result).toBe('Every Monday at 09:00');
    });

    it('should return correct description for weekly schedule with all days', () => {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      days.forEach((day, index) => {
        const config: ScheduleConfig = {
          frequency: 'weekly',
          time: '10:00',
          dayOfWeek: index
        };

        const result = getScheduleDescription(config);
        expect(result).toBe(`Every ${day} at 10:00`);
      });
    });

    it('should return unknown day for weekly schedule without dayOfWeek', () => {
      const config: ScheduleConfig = {
        frequency: 'weekly',
        time: '10:00'
      };

      const result = getScheduleDescription(config);
      expect(result).toBe('Every Unknown at 10:00');
    });

    it('should return correct description for monthly schedule', () => {
      const config: ScheduleConfig = {
        frequency: 'monthly',
        time: '12:00',
        dayOfMonth: 15
      };

      const result = getScheduleDescription(config);
      expect(result).toBe('Monthly on day 15 at 12:00');
    });

    it('should return "last day" for monthly schedule with day 31', () => {
      const config: ScheduleConfig = {
        frequency: 'monthly',
        time: '23:59',
        dayOfMonth: 31
      };

      const result = getScheduleDescription(config);
      expect(result).toBe('Monthly on last day at 23:59');
    });

    it('should return "Unknown schedule" for invalid frequency', () => {
      const config = {
        frequency: 'yearly' as any,
        time: '10:00'
      };

      const result = getScheduleDescription(config);
      expect(result).toBe('Unknown schedule');
    });
  });

  describe('validateScheduleConfig', () => {
    describe('time validation', () => {
      it('should validate correct time formats', () => {
        const validTimes = ['00:00', '09:30', '12:00', '23:59', '1:05', '24:00'];
        
        validTimes.forEach(time => {
          const config: ScheduleConfig = {
            frequency: 'daily',
            time
          };

          const result = validateScheduleConfig(config);
          if (time === '24:00') {
            // 24:00 is invalid
            expect(result.valid).toBe(false);
          } else {
            expect(result.valid).toBe(true);
          }
        });
      });

      it('should reject invalid time formats', () => {
        const invalidTimes = ['25:00', '12:60', '12:5', '1:5', '12', '12:', ':30', 'abc', ''];
        
        invalidTimes.forEach(time => {
          const config: ScheduleConfig = {
            frequency: 'daily',
            time
          };

          const result = validateScheduleConfig(config);
          expect(result.valid).toBe(false);
          expect(result.error).toBe('Invalid time format. Use HH:MM');
        });
      });

      it('should handle edge cases for time validation', () => {
        const edgeCases = [
          { time: '24:00', valid: false },
          { time: '23:60', valid: false },
          { time: '00:00', valid: true },
          { time: '23:59', valid: true }
        ];

        edgeCases.forEach(({ time, valid }) => {
          const config: ScheduleConfig = {
            frequency: 'daily',
            time
          };

          const result = validateScheduleConfig(config);
          expect(result.valid).toBe(valid);
        });
      });
    });

    describe('daily frequency validation', () => {
      it('should validate daily schedule with valid time', () => {
        const config: ScheduleConfig = {
          frequency: 'daily',
          time: '15:30'
        };

        const result = validateScheduleConfig(config);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should not require additional fields for daily schedule', () => {
        const config: ScheduleConfig = {
          frequency: 'daily',
          time: '10:00',
          dayOfWeek: 1, // Should be ignored
          dayOfMonth: 15 // Should be ignored
        };

        const result = validateScheduleConfig(config);
        expect(result.valid).toBe(true);
      });
    });

    describe('weekly frequency validation', () => {
      it('should validate weekly schedule with valid dayOfWeek', () => {
        for (let day = 0; day <= 6; day++) {
          const config: ScheduleConfig = {
            frequency: 'weekly',
            time: '10:00',
            dayOfWeek: day
          };

          const result = validateScheduleConfig(config);
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        }
      });

      it('should reject weekly schedule without dayOfWeek', () => {
        const config: ScheduleConfig = {
          frequency: 'weekly',
          time: '10:00'
        };

        const result = validateScheduleConfig(config);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Day of week must be between 0 (Sunday) and 6 (Saturday)');
      });

      it('should reject weekly schedule with invalid dayOfWeek', () => {
        const invalidDays = [-1, 7, 10, -5];
        
        invalidDays.forEach(day => {
          const config: ScheduleConfig = {
            frequency: 'weekly',
            time: '10:00',
            dayOfWeek: day
          };

          const result = validateScheduleConfig(config);
          expect(result.valid).toBe(false);
          expect(result.error).toBe('Day of week must be between 0 (Sunday) and 6 (Saturday)');
        });
      });
    });

    describe('monthly frequency validation', () => {
      it('should validate monthly schedule with valid dayOfMonth', () => {
        for (let day = 1; day <= 31; day++) {
          const config: ScheduleConfig = {
            frequency: 'monthly',
            time: '10:00',
            dayOfMonth: day
          };

          const result = validateScheduleConfig(config);
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        }
      });

      it('should reject monthly schedule without dayOfMonth', () => {
        const config: ScheduleConfig = {
          frequency: 'monthly',
          time: '10:00'
        };

        const result = validateScheduleConfig(config);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Day of month must be between 1 and 31');
      });

      it('should reject monthly schedule with invalid dayOfMonth', () => {
        const invalidDays = [0, 32, 40, -1, -10];
        
        invalidDays.forEach(day => {
          const config: ScheduleConfig = {
            frequency: 'monthly',
            time: '10:00',
            dayOfMonth: day
          };

          const result = validateScheduleConfig(config);
          expect(result.valid).toBe(false);
          expect(result.error).toBe('Day of month must be between 1 and 31');
        });
      });
    });

    describe('invalid frequency validation', () => {
      it('should reject unknown frequencies', () => {
        const invalidFrequencies = ['yearly', 'hourly', 'minutely', 'custom', ''];
        
        invalidFrequencies.forEach(frequency => {
          const config = {
            frequency: frequency as any,
            time: '10:00'
          };

          const result = validateScheduleConfig(config);
          expect(result.valid).toBe(false);
          expect(result.error).toBe('Invalid frequency. Use daily, weekly, or monthly');
        });
      });
    });

    describe('complex validation scenarios', () => {
      it('should validate complete weekly config', () => {
        const config: ScheduleConfig = {
          frequency: 'weekly',
          time: '14:30',
          dayOfWeek: 3,
          dayOfMonth: 15 // Should be ignored for weekly
        };

        const result = validateScheduleConfig(config);
        expect(result.valid).toBe(true);
      });

      it('should validate complete monthly config', () => {
        const config: ScheduleConfig = {
          frequency: 'monthly',
          time: '08:15',
          dayOfWeek: 1, // Should be ignored for monthly
          dayOfMonth: 28
        };

        const result = validateScheduleConfig(config);
        expect(result.valid).toBe(true);
      });

      it('should fail on multiple validation errors (time takes precedence)', () => {
        const config: ScheduleConfig = {
          frequency: 'weekly',
          time: 'invalid-time',
          dayOfWeek: 10 // Also invalid
        };

        const result = validateScheduleConfig(config);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Invalid time format. Use HH:MM');
      });
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle daylight saving time transitions', () => {
      // Test with a date during DST transition (March 2025)
      mockNow = originalDayjs('2025-03-09T10:30:00.000Z');
      mockedDayjs.mockImplementation((date?: any, format?: any, locale?: string, strict?: boolean) => {
        if (date !== undefined) {
          return originalDayjs(date, format, locale, strict);
        }
        return mockNow;
      });

      const config: ScheduleConfig = {
        frequency: 'daily',
        time: '15:00'
      };

      const result = calculateNextRun(config);
      expect(result).toBeInstanceOf(Date);
    });

    it('should handle year boundaries correctly', () => {
      // Test with December 31st
      mockNow = originalDayjs('2025-12-31T10:30:00.000Z');
      mockedDayjs.mockImplementation((date?: any, format?: any, locale?: string, strict?: boolean) => {
        if (date !== undefined) {
          return originalDayjs(date, format, locale, strict);
        }
        return mockNow;
      });

      const config: ScheduleConfig = {
        frequency: 'daily',
        time: '15:00'
      };

      const result = calculateNextRun(config);
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2025);
    });

    it('should handle month boundaries for monthly schedules', () => {
      // Test with last day of month
      mockNow = originalDayjs('2025-01-31T10:30:00.000Z');
      mockedDayjs.mockImplementation((date?: any, format?: any, locale?: string, strict?: boolean) => {
        if (date !== undefined) {
          return originalDayjs(date, format, locale, strict);
        }
        return mockNow;
      });

      const config: ScheduleConfig = {
        frequency: 'monthly',
        time: '15:00',
        dayOfMonth: 31
      };

      const result = calculateNextRun(config);
      expect(result).toBeInstanceOf(Date);
    });

    it('should handle February 29th in non-leap years', () => {
      // Test with non-leap year
      mockNow = originalDayjs('2025-01-15T10:30:00.000Z');
      mockedDayjs.mockImplementation((date?: any, format?: any, locale?: string, strict?: boolean) => {
        if (date !== undefined) {
          return originalDayjs(date, format, locale, strict);
        }
        return mockNow;
      });

      const config: ScheduleConfig = {
        frequency: 'monthly',
        time: '15:00',
        dayOfMonth: 29
      };

      const result = calculateNextRun(config);
      expect(result).toBeInstanceOf(Date);
    });
  });
});