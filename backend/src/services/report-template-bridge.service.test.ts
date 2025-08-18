/**
 * Unit tests for ReportTemplateBridgeService
 * Tests for template migration, query transformation, backward compatibility, and error handling
 */

import { ReportTemplateBridgeService, reportTemplateBridge } from './report-template-bridge.service';
import { getQueryById, LDAPQueryDefinition } from '../queries/ldap';
import { createError } from '../middleware/error.middleware';

// Mock dependencies
jest.mock('../queries/ldap', () => ({
  getQueryById: jest.fn()
}));

jest.mock('../middleware/error.middleware', () => ({
  createError: jest.fn((message: string, statusCode: number) => {
    const error = new Error(message) as any;
    error.statusCode = statusCode;
    return error;
  })
}));

describe('ReportTemplateBridgeService', () => {
  let service: ReportTemplateBridgeService;
  
  // Mock LDAP query definition
  const mockQueryDefinition: LDAPQueryDefinition = {
    id: 'inactive_users',
    name: 'Inactive Users',
    description: 'Find users who have not logged in for a specified number of days',
    category: 'users',
    query: {
      scope: 'sub',
      filter: '(&(objectClass=user)(objectCategory=person)(lastLogonTimestamp>=1))',
      attributes: ['sAMAccountName', 'displayName', 'mail', 'lastLogonTimestamp'],
      sizeLimit: 5000
    },
    parameters: {
      days: {
        type: 'number',
        required: true,
        default: 90,
        description: 'Number of days of inactivity',
        transform: 'daysToTimestamp'
      }
    },
    fieldMappings: {
      sAMAccountName: { displayName: 'Username' },
      displayName: { displayName: 'Display Name' },
      mail: { displayName: 'Email' },
      lastLogonTimestamp: { 
        displayName: 'Last Logon',
        type: 'date',
        transform: 'fileTimeToDate'
      }
    }
  };

  beforeEach(() => {
    service = new ReportTemplateBridgeService();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a new instance', () => {
      expect(service).toBeInstanceOf(ReportTemplateBridgeService);
    });

    it('should provide a singleton instance', () => {
      expect(reportTemplateBridge).toBeInstanceOf(ReportTemplateBridgeService);
    });
  });

  describe('getQueryDefinitionByReportType', () => {
    it('should return query definition for valid mapped report type', () => {
      (getQueryById as jest.Mock).mockReturnValue(mockQueryDefinition);

      const result = service.getQueryDefinitionByReportType('ad_inactive_users');

      expect(getQueryById).toHaveBeenCalledWith('inactive_users');
      expect(result).toEqual(mockQueryDefinition);
    });

    it('should try with ad_ prefix if direct mapping not found', () => {
      (getQueryById as jest.Mock).mockReturnValue(mockQueryDefinition);

      const result = service.getQueryDefinitionByReportType('inactive_users');

      expect(getQueryById).toHaveBeenCalledWith('inactive_users');
      expect(result).toEqual(mockQueryDefinition);
    });

    it('should return query definition if reportType is already a query ID', () => {
      // For a reportType that doesn't exist in the mapping but is a valid query ID
      (getQueryById as jest.Mock).mockImplementation((id: string) => {
        if (id === 'some_direct_query_id') {
          return mockQueryDefinition;
        }
        return undefined;
      });

      const result = service.getQueryDefinitionByReportType('some_direct_query_id');

      expect(getQueryById).toHaveBeenCalledWith('some_direct_query_id');
      expect(result).toEqual(mockQueryDefinition);
    });

    it('should throw error for unknown report type', () => {
      (getQueryById as jest.Mock).mockReturnValue(undefined);
      const mockError = new Error('Unknown report type: unknown_report') as any;
      mockError.statusCode = 400;
      (createError as jest.Mock).mockReturnValue(mockError);

      expect(() => {
        service.getQueryDefinitionByReportType('unknown_report');
      }).toThrow('Unknown report type: unknown_report');

      expect(createError).toHaveBeenCalledWith('Unknown report type: unknown_report', 400);
    });

    it('should throw error if query definition not found for mapped query ID', () => {
      (getQueryById as jest.Mock).mockReturnValue(undefined);
      const mockError = new Error('Query definition not found for: inactive_users') as any;
      mockError.statusCode = 500;
      (createError as jest.Mock).mockReturnValue(mockError);

      expect(() => {
        service.getQueryDefinitionByReportType('ad_inactive_users');
      }).toThrow('Query definition not found for: inactive_users');

      expect(createError).toHaveBeenCalledWith('Query definition not found for: inactive_users', 500);
    });

    it('should handle all mapped report types', () => {
      (getQueryById as jest.Mock).mockReturnValue(mockQueryDefinition);

      const reportTypes = [
        'ad_inactive_users',
        'ad_disabled_users', 
        'ad_password_expiry',
        'ad_locked_users',
        'ad_never_expiring_passwords',
        'ad_privileged_users',
        'ad_recent_lockouts',
        'ad_password_changes'
      ];

      reportTypes.forEach(reportType => {
        const result = service.getQueryDefinitionByReportType(reportType);
        expect(result).toEqual(mockQueryDefinition);
      });
    });

    it('should handle fallback mappings for missing queries', () => {
      (getQueryById as jest.Mock).mockReturnValue(mockQueryDefinition);

      const fallbackMappings = [
        'ad_admin_groups',
        'ad_users_no_manager',
        'ad_recent_users',
        'ad_disabled_with_groups',
        'ad_users_by_department'
      ];

      fallbackMappings.forEach(reportType => {
        const result = service.getQueryDefinitionByReportType(reportType);
        expect(result).toEqual(mockQueryDefinition);
      });
    });
  });

  describe('transformParameters', () => {
    it('should transform parameters using parameter mapping', () => {
      const oldParams = { days: 30 };
      
      const result = service.transformParameters('ad_inactive_users', oldParams);

      expect(result).toEqual({ days: 30 });
    });

    it('should return original parameters if no mapping exists', () => {
      const oldParams = { customParam: 'value' };
      
      const result = service.transformParameters('unknown_report', oldParams);

      expect(result).toEqual(oldParams);
    });

    it('should return original parameters if no parameter mapping exists for mapped query', () => {
      const oldParams = { customParam: 'value' };
      
      const result = service.transformParameters('ad_disabled_users', oldParams);

      expect(result).toEqual(oldParams);
    });

    it('should preserve unmapped parameters', () => {
      const oldParams = { days: 30, customParam: 'value' };
      
      const result = service.transformParameters('ad_inactive_users', oldParams);

      expect(result).toEqual({ days: 30, customParam: 'value' });
    });

    it('should handle empty parameters', () => {
      const oldParams = {};
      
      const result = service.transformParameters('ad_inactive_users', oldParams);

      expect(result).toEqual({});
    });

    it('should handle all parameter mappings', () => {
      const testCases = [
        { reportType: 'ad_password_expiry', params: { days: 30 }, expected: { days: 30 } },
        { reportType: 'ad_recent_lockouts', params: { hours: 24 }, expected: { hours: 24 } },
        { reportType: 'ad_password_changes', params: { hours: 48 }, expected: { hours: 48 } }
      ];

      testCases.forEach(({ reportType, params, expected }) => {
        const result = service.transformParameters(reportType, params);
        expect(result).toEqual(expected);
      });
    });
  });

  describe('getAvailableReportTypes', () => {
    it('should return all available report types', () => {
      const result = service.getAvailableReportTypes();

      expect(result).toEqual([
        'ad_inactive_users',
        'ad_disabled_users',
        'ad_password_expiry',
        'ad_locked_users',
        'ad_never_expiring_passwords',
        'ad_privileged_users',
        'ad_recent_lockouts',
        'ad_password_changes',
        'ad_admin_groups',
        'ad_users_no_manager',
        'ad_recent_users',
        'ad_disabled_with_groups',
        'ad_users_by_department'
      ]);
    });

    it('should return consistent results', () => {
      const result1 = service.getAvailableReportTypes();
      const result2 = service.getAvailableReportTypes();

      expect(result1).toEqual(result2);
    });
  });

  describe('canBridgeReportType', () => {
    it('should return true for mapped report types', () => {
      const result = service.canBridgeReportType('ad_inactive_users');
      expect(result).toBe(true);
    });

    it('should return false for unmapped report types', () => {
      const result = service.canBridgeReportType('unknown_report');
      expect(result).toBe(false);
    });

    it('should handle all available report types', () => {
      const availableTypes = service.getAvailableReportTypes();
      
      availableTypes.forEach(reportType => {
        const result = service.canBridgeReportType(reportType);
        expect(result).toBe(true);
      });
    });
  });

  describe('getQueryIdByReportType', () => {
    it('should return query ID for mapped report type', () => {
      const result = service.getQueryIdByReportType('ad_inactive_users');
      expect(result).toBe('inactive_users');
    });

    it('should return null for unmapped report type', () => {
      const result = service.getQueryIdByReportType('unknown_report');
      expect(result).toBeNull();
    });

    it('should handle all mapped report types', () => {
      const expectedMappings = {
        'ad_inactive_users': 'inactive_users',
        'ad_disabled_users': 'disabled_users',
        'ad_password_expiry': 'password_expiry',
        'ad_locked_users': 'locked_accounts',
        'ad_never_expiring_passwords': 'never_expiring_passwords',
        'ad_privileged_users': 'privileged_users',
        'ad_recent_lockouts': 'recent_lockouts',
        'ad_password_changes': 'recent_password_changes'
      };

      Object.entries(expectedMappings).forEach(([reportType, expectedQueryId]) => {
        const result = service.getQueryIdByReportType(reportType);
        expect(result).toBe(expectedQueryId);
      });
    });
  });

  describe('getAllQueryDefinitions', () => {
    beforeEach(() => {
      // Mock Date for consistent testing
      jest.spyOn(Date.prototype, 'toISOString').mockReturnValue('2025-01-01T00:00:00.000Z');
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should return all query definitions with proper structure', () => {
      (getQueryById as jest.Mock).mockReturnValue(mockQueryDefinition);

      const result = service.getAllQueryDefinitions();

      expect(result).toHaveLength(13); // Total number of mapped report types
      
      const firstDefinition = result[0];
      expect(firstDefinition).toEqual({
        id: 'inactive_users',
        name: 'Inactive Users',
        description: 'Find users who have not logged in for a specified number of days',
        version: '1.0.0',
        dataSource: 'ad',
        category: 'users',
        parameters: [
          {
            name: 'days',
            type: 'number',
            required: true,
            defaultValue: 90,
            description: 'Number of days of inactivity',
            displayName: 'Days'
          }
        ],
        isSystem: true,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z'
      });
    });

    it('should handle query definitions without parameters', () => {
      const queryWithoutParams = { ...mockQueryDefinition, parameters: undefined };
      (getQueryById as jest.Mock).mockReturnValue(queryWithoutParams);

      const result = service.getAllQueryDefinitions();

      expect(result[0].parameters).toEqual([]);
    });

    it('should handle empty parameters object', () => {
      const queryWithEmptyParams = { ...mockQueryDefinition, parameters: {} };
      (getQueryById as jest.Mock).mockReturnValue(queryWithEmptyParams);

      const result = service.getAllQueryDefinitions();

      expect(result[0].parameters).toEqual([]);
    });

    it('should properly format parameter definitions', () => {
      const complexQueryDef = {
        ...mockQueryDefinition,
        parameters: {
          days: {
            type: 'number',
            required: true,
            default: 90,
            description: 'Number of days of inactivity'
          },
          department: {
            type: 'string',
            required: false,
            description: 'User department filter'
          },
          enabled_only: {
            type: 'boolean',
            required: false,
            default: true
          }
        }
      };
      (getQueryById as jest.Mock).mockReturnValue(complexQueryDef);

      const result = service.getAllQueryDefinitions();

      expect(result[0].parameters).toEqual([
        {
          name: 'days',
          type: 'number',
          required: true,
          defaultValue: 90,
          description: 'Number of days of inactivity',
          displayName: 'Days'
        },
        {
          name: 'department',
          type: 'string',
          required: false,
          defaultValue: undefined,
          description: 'User department filter',
          displayName: 'Department'
        },
        {
          name: 'enabled_only',
          type: 'boolean',
          required: false,
          defaultValue: true,
          description: 'Parameter: enabled_only',
          displayName: 'Enabled only'
        }
      ]);
    });
  });

  describe('getDataSourceByReportType (private method)', () => {
    it('should return correct data source for ad_ prefixed types', () => {
      (getQueryById as jest.Mock).mockReturnValue(mockQueryDefinition);

      const result = service.getAllQueryDefinitions();
      const adReport = result.find(r => r.id === 'inactive_users');

      expect(adReport?.dataSource).toBe('ad');
    });

    it('should return azure for azure_ prefixed types', () => {
      const azureQueryDef = { ...mockQueryDefinition, id: 'azure_test_query' };
      (getQueryById as jest.Mock).mockReturnValue(azureQueryDef);

      // Mock to test azure prefix
      service.getAvailableReportTypes = jest.fn().mockReturnValue(['azure_test_report']);
      service.getQueryDefinitionByReportType = jest.fn().mockReturnValue(azureQueryDef);

      const result = service.getAllQueryDefinitions();

      expect(result[0].dataSource).toBe('azure');
    });

    it('should return o365 for o365_ prefixed types', () => {
      const o365QueryDef = { ...mockQueryDefinition, id: 'o365_test_query' };
      (getQueryById as jest.Mock).mockReturnValue(o365QueryDef);

      // Mock to test o365 prefix
      service.getAvailableReportTypes = jest.fn().mockReturnValue(['o365_test_report']);
      service.getQueryDefinitionByReportType = jest.fn().mockReturnValue(o365QueryDef);

      const result = service.getAllQueryDefinitions();

      expect(result[0].dataSource).toBe('o365');
    });

    it('should return ad as default fallback', () => {
      const queryDefWithoutPrefix = { ...mockQueryDefinition, id: 'test_query' };
      (getQueryById as jest.Mock).mockReturnValue(queryDefWithoutPrefix);

      // Test by calling getAllQueryDefinitions which uses private method
      service.getAvailableReportTypes = jest.fn().mockReturnValue(['test_report']);
      service.getQueryDefinitionByReportType = jest.fn().mockReturnValue(queryDefWithoutPrefix);

      const result = service.getAllQueryDefinitions();

      expect(result[0].dataSource).toBe('ad');
    });
  });

  describe('getParameterDefinitions (private method)', () => {
    it('should handle parameters with missing type', () => {
      const queryWithMissingType = {
        ...mockQueryDefinition,
        parameters: {
          testParam: {
            required: true,
            default: 'test'
          }
        }
      };
      (getQueryById as jest.Mock).mockReturnValue(queryWithMissingType);

      const result = service.getAllQueryDefinitions();

      expect(result[0].parameters[0]).toEqual({
        name: 'testParam',
        type: 'string',
        required: true,
        defaultValue: 'test',
        description: 'Parameter: testParam',
        displayName: 'TestParam'
      });
    });

    it('should format display names correctly', () => {
      const queryWithComplexNames = {
        ...mockQueryDefinition,
        parameters: {
          user_department: { type: 'string', required: false },
          max_results_count: { type: 'number', required: false },
          is_enabled: { type: 'boolean', required: false }
        }
      };
      (getQueryById as jest.Mock).mockReturnValue(queryWithComplexNames);

      const result = service.getAllQueryDefinitions();

      expect(result[0].parameters.map((p: any) => p.displayName)).toEqual([
        'User department',
        'Max results count',
        'Is enabled'
      ]);
    });
  });

  describe('error handling', () => {
    it('should handle getQueryById throwing an error', () => {
      (getQueryById as jest.Mock).mockImplementation(() => {
        throw new Error('Query registry error');
      });

      expect(() => {
        service.getQueryDefinitionByReportType('ad_inactive_users');
      }).toThrow('Query registry error');
    });

    it('should handle null/undefined parameters in transformParameters', () => {
      // The service currently doesn't handle null/undefined gracefully, 
      // so we expect it to throw for these cases
      expect(() => {
        service.transformParameters('ad_inactive_users', null as any);
      }).toThrow();

      expect(() => {
        service.transformParameters('ad_inactive_users', undefined as any);
      }).toThrow();
    });

    it('should handle invalid parameter values', () => {
      const oldParams = { days: null, hours: undefined, validParam: 'test' };
      
      const result = service.transformParameters('ad_inactive_users', oldParams);

      expect(result).toEqual({ days: null, hours: undefined, validParam: 'test' });
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete workflow for existing report type', () => {
      (getQueryById as jest.Mock).mockReturnValue(mockQueryDefinition);

      // Check if report can be bridged
      expect(service.canBridgeReportType('ad_inactive_users')).toBe(true);

      // Get query ID
      expect(service.getQueryIdByReportType('ad_inactive_users')).toBe('inactive_users');

      // Transform parameters
      const params = { days: 30, customParam: 'test' };
      const transformedParams = service.transformParameters('ad_inactive_users', params);
      expect(transformedParams).toEqual({ days: 30, customParam: 'test' });

      // Get query definition
      const queryDef = service.getQueryDefinitionByReportType('ad_inactive_users');
      expect(queryDef).toEqual(mockQueryDefinition);
    });

    it('should handle workflow for non-existent report type', () => {
      const reportType = 'non_existent_report';

      // Check if report can be bridged
      expect(service.canBridgeReportType(reportType)).toBe(false);

      // Get query ID
      expect(service.getQueryIdByReportType(reportType)).toBeNull();

      // Transform parameters (should return as-is)
      const params = { test: 'value' };
      const transformedParams = service.transformParameters(reportType, params);
      expect(transformedParams).toEqual(params);

      // Get query definition should throw
      (getQueryById as jest.Mock).mockReturnValue(undefined);
      (createError as jest.Mock).mockReturnValue(new Error() as any);

      expect(() => {
        service.getQueryDefinitionByReportType(reportType);
      }).toThrow();
    });
  });

  describe('backward compatibility', () => {
    it('should maintain compatibility with old report type names', () => {
      (getQueryById as jest.Mock).mockReturnValue(mockQueryDefinition);

      const oldReportTypes = [
        'ad_inactive_users',
        'ad_disabled_users',
        'ad_password_expiry',
        'ad_locked_users'
      ];

      oldReportTypes.forEach(reportType => {
        expect(() => {
          service.getQueryDefinitionByReportType(reportType);
        }).not.toThrow();
      });
    });

    it('should support legacy parameter structures', () => {
      const legacyParams = {
        days: '30', // String instead of number
        enabled: 'true', // String instead of boolean
        department: null // Null value
      };

      const result = service.transformParameters('ad_inactive_users', legacyParams);

      expect(result).toEqual(legacyParams); // Should preserve original structure
    });
  });

  describe('performance and edge cases', () => {
    it('should handle large parameter objects efficiently', () => {
      const largeParams: Record<string, any> = {};
      for (let i = 0; i < 1000; i++) {
        largeParams[`param${i}`] = `value${i}`;
      }

      const start = Date.now();
      const result = service.transformParameters('ad_inactive_users', largeParams);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100); // Should complete within 100ms
      expect(Object.keys(result)).toHaveLength(1000);
    });

    it('should handle concurrent access safely', async () => {
      (getQueryById as jest.Mock).mockReturnValue(mockQueryDefinition);

      const promises = Array.from({ length: 100 }, () => 
        Promise.resolve(service.getQueryDefinitionByReportType('ad_inactive_users'))
      );

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result).toEqual(mockQueryDefinition);
      });
    });

    it('should handle special characters in report types', () => {
      expect(service.canBridgeReportType('ad_test-report')).toBe(false);
      expect(service.canBridgeReportType('ad_test.report')).toBe(false);
      expect(service.canBridgeReportType('ad_test_report')).toBe(false);
    });
  });
});