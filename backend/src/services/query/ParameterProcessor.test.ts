import { ParameterProcessor } from './ParameterProcessor';

describe('ParameterProcessor', () => {
  let parameterProcessor: ParameterProcessor;

  beforeEach(() => {
    parameterProcessor = new ParameterProcessor();
  });

  describe('processParameters', () => {
    it('should process string parameters correctly', async () => {
      const paramDefs = [
        { name: 'username', type: 'string' as const, required: true }
      ];
      
      const result = await parameterProcessor.processParameters(paramDefs, {
        username: 'testuser'
      });

      expect(result).toEqual(['testuser']);
    });

    it('should process number parameters correctly', async () => {
      const paramDefs = [
        { name: 'count', type: 'number' as const, required: true }
      ];
      
      const result = await parameterProcessor.processParameters(paramDefs, {
        count: '42'
      });

      expect(result).toEqual([42]);
    });

    it('should process boolean parameters correctly', async () => {
      const paramDefs = [
        { name: 'active', type: 'boolean' as const, required: true }
      ];
      
      const result = await parameterProcessor.processParameters(paramDefs, {
        active: 'true'
      });

      expect(result).toEqual([true]);
    });

    it('should process date parameters correctly', async () => {
      const paramDefs = [
        { name: 'date', type: 'date' as const, required: true }
      ];
      
      const result = await parameterProcessor.processParameters(paramDefs, {
        date: '2024-01-15T00:00:00.000Z'
      });

      expect(result[0]).toBeInstanceOf(Date);
      expect(result[0].getFullYear()).toBe(2024);
    });

    it('should use default values for missing optional parameters', async () => {
      const paramDefs = [
        { 
          name: 'limit', 
          type: 'number' as const, 
          required: false,
          default: 100
        }
      ];
      
      const result = await parameterProcessor.processParameters(paramDefs, {});

      expect(result).toEqual([100]);
    });

    it('should validate required parameters', async () => {
      const paramDefs = [
        { name: 'required_param', type: 'string' as const, required: true }
      ];
      
      await expect(
        parameterProcessor.processParameters(paramDefs, {})
      ).rejects.toThrow('Required parameter missing: required_param');
    });

    it('should apply transformations correctly', async () => {
      const paramDefs = [
        { 
          name: 'days', 
          type: 'number' as const, 
          required: true,
          transform: 'daysToFileTime' as any
        }
      ];
      
      const result = await parameterProcessor.processParameters(paramDefs, {
        days: 30
      });

      expect(typeof result[0]).toBe('string');
      expect(result[0]).toMatch(/^\d+$/); // Should be a FileTime string
    });

    it('should validate parameter constraints', async () => {
      const paramDefs = [
        { 
          name: 'count', 
          type: 'number' as const, 
          required: true,
          validation: {
            min: 1,
            max: 100
          }
        }
      ];
      
      // Valid value
      const validResult = await parameterProcessor.processParameters(paramDefs, {
        count: 50
      });
      expect(validResult).toEqual([50]);

      // Invalid value (too high)
      await expect(
        parameterProcessor.processParameters(paramDefs, {
          count: 150
        })
      ).rejects.toThrow('must be <= 100');

      // Invalid value (too low)
      await expect(
        parameterProcessor.processParameters(paramDefs, {
          count: 0
        })
      ).rejects.toThrow('must be >= 1');
    });

    it('should handle multiple parameters with mixed types', async () => {
      const paramDefs = [
        { name: 'username', type: 'string' as const, required: true },
        { name: 'age', type: 'number' as const, required: false, default: 25 },
        { name: 'active', type: 'boolean' as const, required: true },
        { name: 'created_at', type: 'date' as const, required: false }
      ];
      
      const result = await parameterProcessor.processParameters(paramDefs, {
        username: 'john.doe',
        active: true,
        created_at: '2024-01-01T00:00:00.000Z'
      });

      expect(result).toHaveLength(4);
      expect(result[0]).toBe('john.doe');
      expect(result[1]).toBe(25); // default value
      expect(result[2]).toBe(true);
      expect(result[3]).toBeInstanceOf(Date);
    });

    it('should handle array parameters', async () => {
      const paramDefs = [
        { 
          name: 'ids', 
          type: 'array' as const, 
          required: true,
          itemType: 'number' as const
        }
      ];
      
      const result = await parameterProcessor.processParameters(paramDefs, {
        ids: ['1', '2', '3']
      });

      expect(result).toEqual([['1', '2', '3']]); // Arrays don't convert item types
    });

    it('should not sanitize string parameters by default', async () => {
      const paramDefs = [
        { name: 'comment', type: 'string' as const, required: true }
      ];
      
      const result = await parameterProcessor.processParameters(paramDefs, {
        comment: '<script>alert("xss")</script>Clean text'
      });

      // Processor doesn't sanitize by default - that's handled elsewhere
      expect(result[0]).toEqual('<script>alert("xss")</script>Clean text');
    });

    it('should validate string length constraints', async () => {
      const paramDefs = [
        { 
          name: 'username', 
          type: 'string' as const, 
          required: true,
          validation: {
            pattern: '^.{3,20}$' // Use pattern for string length validation
          }
        }
      ];
      
      // Valid length
      const validResult = await parameterProcessor.processParameters(paramDefs, {
        username: 'john'
      });
      expect(validResult).toEqual(['john']);

      // Too short
      await expect(
        parameterProcessor.processParameters(paramDefs, {
          username: 'jo'
        })
      ).rejects.toThrow('does not match required pattern');

      // Too long
      await expect(
        parameterProcessor.processParameters(paramDefs, {
          username: 'this_username_is_way_too_long'
        })
      ).rejects.toThrow('does not match required pattern');
    });

    it('should handle parameter order correctly', async () => {
      const paramDefs = [
        { name: 'third', type: 'string' as const, required: false, default: 'c' },
        { name: 'first', type: 'string' as const, required: true },
        { name: 'second', type: 'number' as const, required: true }
      ];
      
      const result = await parameterProcessor.processParameters(paramDefs, {
        first: 'a',
        second: 2
      });

      // Should maintain parameter definition order
      expect(result).toEqual(['c', 'a', 2]);
    });
  });
});