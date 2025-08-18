import {
  buildGraphRequest,
  buildFilterExpression,
  formatFilterValue,
  buildComplexGraphFilter,
  calculateDateOffset,
  // formatDateForGraph,
  parseGraphResponse,
  parseCSVResponse,
  applyClientSideFilter,
  applySortToData,
  handleGraphError,
  GraphFilter,
  GraphQueryOptions
} from './graph-utils';

// Mock GraphRequest
class MockGraphRequest {
  private params: any = {};

  filter(value: string) {
    this.params.filter = value;
    return this;
  }

  select(value: string) {
    this.params.select = value;
    return this;
  }

  top(value: number) {
    this.params.top = value;
    return this;
  }

  skip(value: number) {
    this.params.skip = value;
    return this;
  }

  orderby(value: string) {
    this.params.orderby = value;
    return this;
  }

  count(value: boolean) {
    this.params.count = value;
    return this;
  }
  header(name: string, value: string) {
    if (!this.params.headers) {
      this.params.headers = {};
    }
    this.params.headers[name] = value;
    return this;
  }

  expand(value: string) {
    this.params.expand = value;
    return this;
  }

  getParams() {
    return this.params;
  }
}

describe('Graph Utilities', () => {
  describe('buildGraphRequest', () => {
    it('should build request with all options', () => {
      const request = new MockGraphRequest() as any;
      const options: GraphQueryOptions = {
        filter: "userType eq 'Guest'",
        select: ['id', 'displayName', 'mail'],
        top: 50,
        skip: 100,
        orderBy: 'displayName',
        count: true,
        expand: 'manager'
      };

      buildGraphRequest(request, options);
      const params = request.getParams();

      expect(params).toEqual({
        filter: "userType eq 'Guest'",
        select: 'id,displayName,mail',
        top: 50,
        skip: 100,
        orderby: 'displayName',
        count: true,
        expand: 'manager',
        headers: {
          'ConsistencyLevel': 'eventual'
        }
      });
    });

    it('should handle string select parameter', () => {
      const request = new MockGraphRequest() as any;
      const options: GraphQueryOptions = {
        select: 'id,displayName'
      };

      buildGraphRequest(request, options);
      const params = request.getParams();

      expect(params.select).toBe('id,displayName');
    });

    it('should handle empty options', () => {
      const request = new MockGraphRequest() as any;
      buildGraphRequest(request, {});
      
      expect(request.getParams()).toEqual({});
    });
  });

  describe('formatFilterValue', () => {
    it('should format string values with quotes', () => {
      expect(formatFilterValue('test')).toBe("'test'");
    });

    it('should escape single quotes in strings', () => {
      expect(formatFilterValue("O'Brien")).toBe("'O''Brien'");
    });

    it('should format boolean values', () => {
      expect(formatFilterValue(true)).toBe('true');
      expect(formatFilterValue(false)).toBe('false');
    });

    it('should format numbers', () => {
      expect(formatFilterValue(123)).toBe('123');
      expect(formatFilterValue(123.45)).toBe('123.45');
    });

    it('should format dates as ISO strings', () => {
      const date = new Date('2024-01-01T12:00:00.000Z');
      expect(formatFilterValue(date)).toBe('2024-01-01T12:00:00.000Z');
    });

    it('should handle null and undefined', () => {
      expect(formatFilterValue(null)).toBe('null');
      expect(formatFilterValue(undefined)).toBe('null');
    });
  });

  describe('buildFilterExpression', () => {
    it('should build equals filter', () => {
      const filter: GraphFilter = {
        field: 'department',
        operator: 'equals',
        value: 'IT'
      };
      expect(buildFilterExpression(filter)).toBe("department eq 'IT'");
    });

    it('should build not equals filter', () => {
      const filter: GraphFilter = {
        field: 'status',
        operator: 'not_equals',
        value: 'inactive'
      };
      expect(buildFilterExpression(filter)).toBe("status ne 'inactive'");
    });

    it('should build contains filter', () => {
      const filter: GraphFilter = {
        field: 'displayName',
        operator: 'contains',
        value: 'john'
      };
      expect(buildFilterExpression(filter)).toBe("contains(displayName,'john')");
    });

    it('should build comparison filters', () => {
      expect(buildFilterExpression({
        field: 'age',
        operator: 'greater_than',
        value: 25
      })).toBe('age gt 25');

      expect(buildFilterExpression({
        field: 'salary',
        operator: 'less_or_equal',
        value: 50000
      })).toBe('salary le 50000');
    });

    it('should build in filter', () => {
      const filter: GraphFilter = {
        field: 'department',
        operator: 'in',
        value: ['IT', 'HR', 'Finance']
      };
      expect(buildFilterExpression(filter)).toBe("department in ('IT','HR','Finance')");
    });

    it('should handle null values', () => {
      expect(buildFilterExpression({
        field: 'manager',
        operator: 'equals',
        value: null
      })).toBe('manager eq null');
    });

    it('should throw error for unknown operator', () => {
      expect(() => buildFilterExpression({
        field: 'test',
        operator: 'unknown',
        value: 'value'
      })).toThrow('Unknown filter operator: unknown');
    });
  });

  describe('buildComplexGraphFilter', () => {
    it('should combine filters with AND', () => {
      const filters: GraphFilter[] = [
        { field: 'department', operator: 'equals', value: 'IT' },
        { field: 'accountEnabled', operator: 'equals', value: true }
      ];

      const result = buildComplexGraphFilter(filters, 'and');
      expect(result).toBe("department eq 'IT' and accountEnabled eq true");
    });

    it('should combine filters with OR', () => {
      const filters: GraphFilter[] = [
        { field: 'userType', operator: 'equals', value: 'Guest' },
        { field: 'accountEnabled', operator: 'equals', value: false }
      ];

      const result = buildComplexGraphFilter(filters, 'or');
      expect(result).toBe("userType eq 'Guest' or accountEnabled eq false");
    });

    it('should handle single filter', () => {
      const filters: GraphFilter[] = [
        { field: 'mail', operator: 'not_equals', value: null }
      ];

      const result = buildComplexGraphFilter(filters);
      expect(result).toBe('mail ne null');
    });

    it('should return empty string for no filters', () => {
      expect(buildComplexGraphFilter([])).toBe('');
      expect(buildComplexGraphFilter(null as any)).toBe('');
    });
  });

  describe('calculateDateOffset', () => {
    const now = new Date();

    it('should calculate days offset', () => {
      const result = calculateDateOffset('days', 7);
      const expected = new Date(now);
      expected.setDate(expected.getDate() - 7);
      
      expect(result.toDateString()).toBe(expected.toDateString());
    });

    it('should calculate weeks offset', () => {
      const result = calculateDateOffset('week', 2);
      const expected = new Date(now);
      expected.setDate(expected.getDate() - 14);
      
      expect(result.toDateString()).toBe(expected.toDateString());
    });

    it('should calculate months offset', () => {
      const result = calculateDateOffset('months', 3);
      const expected = new Date(now);
      expected.setMonth(expected.getMonth() - 3);
      
      expect(result.getMonth()).toBe(expected.getMonth());
    });

    it('should handle singular forms', () => {
      const dayResult = calculateDateOffset('day', 1);
      const daysResult = calculateDateOffset('days', 1);
      
      expect(dayResult.toDateString()).toBe(daysResult.toDateString());
    });

    it('should throw error for unknown period', () => {
      expect(() => calculateDateOffset('invalid', 1)).toThrow('Unknown time period: invalid');
    });
  });

  describe('parseGraphResponse', () => {
    it('should parse value property response', () => {
      const response = {
        value: [{ id: '1' }, { id: '2' }],
        '@odata.count': 2
      };

      const result = parseGraphResponse(response);
      expect(result).toEqual({ 
        data: [{ id: '1' }, { id: '2' }],
        totalCount: 2,
        nextLink: undefined
      });
    });

    it('should handle direct array response', () => {
      const response = [{ id: '1' }, { id: '2' }];
      
      const result = parseGraphResponse(response);
      expect(result).toEqual({ data: response });
    });

    it('should handle single object response', () => {
      const response = { id: '1', name: 'Test' };
      
      const result = parseGraphResponse(response);
      expect(result).toEqual({ data: [response] });
    });

    it('should handle empty responses', () => {
      expect(parseGraphResponse(null)).toEqual({ data: [] });
      expect(parseGraphResponse(undefined)).toEqual({ data: [] });
      expect(parseGraphResponse({ value: null })).toEqual({ data: [] });
    });
  });

  describe('parseCSVResponse', () => {
    it('should parse valid CSV', () => {
      const csv = `"User Principal Name","Display Name","Storage Used (Byte)"
"user1@example.com","User One","1024"
"user2@example.com","User Two","2048"`;

      const result = parseCSVResponse(csv);
      
      expect(result).toEqual({
        data: [
          {
            'User Principal Name': 'user1@example.com',
            'Display Name': 'User One',
            'Storage Used (Byte)': '1024'
          },
          {
            'User Principal Name': 'user2@example.com',
            'Display Name': 'User Two',
            'Storage Used (Byte)': '2048'
          }
        ],
        headers: ['User Principal Name', 'Display Name', 'Storage Used (Byte)']
      });
    });

    it('should handle CSV with commas in values', () => {
      const csv = `"Name","Description"
"John Doe","Manager, IT Department"
"Jane Smith","Developer, Senior"`;

      const result = parseCSVResponse(csv);
      
      expect(((result as any)?.data)[0].Description).toBe('Manager, IT Department');
      expect(((result as any)?.data)[1].Description).toBe('Developer, Senior');
    });

    it('should handle escaped quotes', () => {
      const csv = `"Name","Quote"
"John","He said ""Hello"""
"Jane","She's great"`;

      const result = parseCSVResponse(csv);
      
      expect(((result as any)?.data)[0].Quote).toBe('He said "Hello"');
    });

    it('should handle empty CSV', () => {
      expect(parseCSVResponse('')).toEqual({ data: [], headers: [] });
      expect(parseCSVResponse('header1,header2')).toEqual({ data: [], headers: [] });
    });
  });

  describe('applyClientSideFilter', () => {
    const data = [
      { name: 'John', department: 'IT', age: 30 },
      { name: 'Jane', department: 'HR', age: 25 },
      { name: 'Bob', department: 'IT', age: 35 }
    ];

    it('should filter data by equals', () => {
      const filters: GraphFilter[] = [
        { field: 'department', operator: 'equals', value: 'IT' }
      ];

      const result = applyClientSideFilter(data, filters);
      expect(result).toHaveLength(2);
      expect(result.every(d => d.department === 'IT')).toBe(true);
    });

    it('should filter data by contains', () => {
      const filters: GraphFilter[] = [
        { field: 'name', operator: 'contains', value: 'o' }
      ];

      const result = applyClientSideFilter(data, filters);
      expect(result).toHaveLength(2);
      expect(result.map(d => d.name)).toEqual(['John', 'Bob']);
    });

    it('should filter with multiple conditions', () => {
      const filters: GraphFilter[] = [
        { field: 'department', operator: 'equals', value: 'IT' },
        { field: 'age', operator: 'greater_than', value: 30 }
      ];

      const result = applyClientSideFilter(data, filters);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Bob');
    });

    it('should handle nested properties', () => {
      const nestedData = [
        { name: 'John', profile: { department: 'IT' } },
        { name: 'Jane', profile: { department: 'HR' } }
      ];

      const filters: GraphFilter[] = [
        { field: 'profile.department', operator: 'equals', value: 'IT' }
      ];

      const result = applyClientSideFilter(nestedData, filters);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('John');
    });
  });

  describe('applySortToData', () => {
    const data = [
      { name: 'Charlie', age: 30 },
      { name: 'Alice', age: 25 },
      { name: 'Bob', age: 35 }
    ];

    it('should sort ascending', () => {
      const sorted = applySortToData(data, { field: 'name', direction: 'asc' });
      expect(sorted.map(d => d.name)).toEqual(['Alice', 'Bob', 'Charlie']);
    });

    it('should sort descending', () => {
      const sorted = applySortToData(data, { field: 'age', direction: 'desc' });
      expect(sorted.map(d => d.age)).toEqual([35, 30, 25]);
    });

    it('should handle nested properties', () => {
      const nestedData = [
        { name: 'John', profile: { score: 85 } },
        { name: 'Jane', profile: { score: 92 } },
        { name: 'Bob', profile: { score: 78 } }
      ];

      const sorted = applySortToData(nestedData, { 
        field: 'profile.score', 
        direction: 'desc' 
      });
      
      expect(sorted.map(d => d.name)).toEqual(['Jane', 'John', 'Bob']);
    });
  });

  describe('handleGraphError', () => {
    it('should handle resource not found error', () => {
      const error = { code: 'Request_ResourceNotFound', message: 'Resource not found' };
      expect(() => handleGraphError(error)).toThrow('Resource not found');
    });

    it('should handle authorization error', () => {
      const error = { code: 'Authorization_RequestDenied', message: 'Access denied' };
      expect(() => handleGraphError(error)).toThrow('Insufficient permissions to perform this operation');
    });

    it('should handle generic errors', () => {
      const error = { message: 'Something went wrong' };
      expect(() => handleGraphError(error)).toThrow('Graph API error: Something went wrong');
    });

    it('should handle unknown errors', () => {
      const error = {};
      expect(() => handleGraphError(error)).toThrow('Graph API error: Unknown Graph API error');
    });
  });
});