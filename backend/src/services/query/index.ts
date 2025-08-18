/**
 * Query Service Module Exports
 * 
 * Central export point for all query service components
 */

// Core service
export { QueryService } from './QueryService';

// Support services
export { QueryValidator } from './QueryValidator';
export { ParameterProcessor } from './ParameterProcessor';
export { ResultTransformer } from './ResultTransformer';
export { QueryCache } from './QueryCache';
export { QueryDefinitionRegistry } from './QueryDefinitionRegistry';
export { QueryBuilder } from './QueryBuilder';

// Types
export * from './types';

// Utility functions
export const createQueryService = (pool: any, redisClient?: any) => {
  const { QueryService } = require('./QueryService');
  return QueryService.getInstance(pool, redisClient);
};

export const createQueryBuilder = () => {
  const { QueryBuilder } = require('./QueryBuilder');
  return new QueryBuilder();
};