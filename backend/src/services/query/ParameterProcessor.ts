import { ParameterDefinition } from './types';
import { logger } from '@/utils/logger';
import { createError } from '@/middleware/error.middleware';

/**
 * Parameter Processor
 * 
 * Processes and transforms query parameters before execution
 */
export class ParameterProcessor {
  
  /**
   * Process parameters according to their definitions
   */
  async processParameters(
    parameterDefs: ParameterDefinition[],
    providedParameters: Record<string, any>
  ): Promise<any[]> {
    const processedParams: any[] = [];
    
    try {
      for (let i = 0; i < parameterDefs.length; i++) {
        const paramDef = parameterDefs[i];
        let value = providedParameters[paramDef.name];
        
        // Use default value if parameter not provided
        if (value === undefined || value === null) {
          if (paramDef.default !== undefined) {
            value = paramDef.default;
          } else if (paramDef.required) {
            throw createError(`Required parameter missing: ${paramDef.name}`, 400);
          } else {
            value = null;
          }
        }
        
        // Type conversion
        if (value !== null) {
          value = this.convertParameterType(value, paramDef);
        }
        
        // Validate parameter value
        if (value !== null) {
          this.validateParameterValue(value, paramDef);
        }
        
        // Apply transformation if specified
        if (value !== null && paramDef.transform) {
          value = await this.transformParameter(value, paramDef.transform, paramDef);
        }
        
        processedParams.push(value);
      }
      
      return processedParams;
      
    } catch (error) {
      logger.error('Parameter processing failed:', error);
      throw error;
    }
  }
  
  /**
   * Convert parameter to the correct type
   */
  private convertParameterType(value: any, paramDef: ParameterDefinition): any {
    try {
      switch (paramDef.type) {
        case 'string':
          return String(value);
          
        case 'number':
          const num = Number(value);
          if (isNaN(num)) {
            throw createError(`Cannot convert ${value} to number for parameter ${paramDef.name}`, 400);
          }
          return num;
          
        case 'boolean':
          if (typeof value === 'boolean') return value;
          if (typeof value === 'string') {
            const lower = value.toLowerCase();
            if (lower === 'true' || lower === '1') return true;
            if (lower === 'false' || lower === '0') return false;
          }
          if (typeof value === 'number') {
            return value !== 0;
          }
          throw createError(`Cannot convert ${value} to boolean for parameter ${paramDef.name}`, 400);
          
        case 'date':
          if (value instanceof Date) return value;
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            throw createError(`Cannot convert ${value} to date for parameter ${paramDef.name}`, 400);
          }
          return date;
          
        case 'array':
          if (Array.isArray(value)) return value;
          if (typeof value === 'string') {
            try {
              const parsed = JSON.parse(value);
              if (Array.isArray(parsed)) return parsed;
            } catch {
              // Try comma-separated values
              return value.split(',').map(v => v.trim());
            }
          }
          return [value]; // Wrap single value in array
          
        case 'object':
          if (typeof value === 'object' && !Array.isArray(value)) return value;
          if (typeof value === 'string') {
            try {
              const parsed = JSON.parse(value);
              if (typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
            } catch {
              // Continue to error
            }
          }
          throw createError(`Cannot convert ${value} to object for parameter ${paramDef.name}`, 400);
          
        default:
          return value;
      }
    } catch (error) {
      throw createError(`Type conversion failed for parameter ${paramDef.name}: ${(error as Error).message}`, 400);
    }
  }
  
  /**
   * Apply transformation to parameter value
   */
  private async transformParameter(
    value: any,
    transform: string,
    paramDef: ParameterDefinition
  ): Promise<any> {
    try {
      switch (transform) {
        case 'daysToTimestamp':
          return this.daysToTimestamp(value);
          
        case 'hoursToTimestamp':
          return this.hoursToTimestamp(value);
          
        case 'daysToPasswordExpiry':
          return this.daysToPasswordExpiry(value);
          
        case 'daysToFileTime':
          return this.daysToFileTime(value);
          
        case 'encrypt':
          return await this.encryptValue(value);
          
        case 'hash':
          return await this.hashValue(value);
          
        default:
          logger.warn(`Unknown parameter transformation: ${transform}`);
          return value;
      }
    } catch (error) {
      throw createError(`Parameter transformation failed for ${paramDef.name}: ${(error as Error).message}`, 400);
    }
  }
  
  /**
   * Convert days to Unix timestamp
   */
  private daysToTimestamp(days: number): number {
    const now = new Date();
    const targetDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
    return Math.floor(targetDate.getTime() / 1000);
  }
  
  /**
   * Convert hours to Unix timestamp
   */
  private hoursToTimestamp(hours: number): number {
    const now = new Date();
    const targetDate = new Date(now.getTime() - (hours * 60 * 60 * 1000));
    return Math.floor(targetDate.getTime() / 1000);
  }
  
  /**
   * Convert days to password expiry calculation
   */
  private daysToPasswordExpiry(days: number): number {
    const maxPasswordAge = 42; // Default AD password policy in days
    const now = new Date();
    const expiryDate = new Date(now.getTime() + ((days - maxPasswordAge) * 24 * 60 * 60 * 1000));
    return Math.floor(expiryDate.getTime() / 1000);
  }
  
  /**
   * Convert days to Windows FileTime format
   */
  private daysToFileTime(days: number): string {
    const now = new Date();
    const targetDate = new Date(now.getTime() - (days * 24 * 60 * 60 * 1000));
    // Windows FileTime: 100-nanosecond intervals since January 1, 1601
    const windowsFileTime = (targetDate.getTime() + 11644473600000) * 10000;
    return windowsFileTime.toString();
  }
  
  /**
   * Encrypt sensitive parameter value
   */
  private async encryptValue(value: string): Promise<string> {
    // Import encryption utility
    const { getCredentialEncryption } = await import('@/utils/encryption');
    const encryption = getCredentialEncryption();
    return encryption.encrypt(value);
  }
  
  /**
   * Hash parameter value
   */
  private async hashValue(value: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(value).digest('hex');
  }
  
  /**
   * Validate parameter against validation rules
   */
  private validateParameterValue(value: any, paramDef: ParameterDefinition): void {
    if (!paramDef.validation) return;
    
    const rules = paramDef.validation;
    
    // Min/Max validation for numbers
    if (paramDef.type === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        throw createError(`Parameter ${paramDef.name} must be >= ${rules.min}`, 400);
      }
      if (rules.max !== undefined && value > rules.max) {
        throw createError(`Parameter ${paramDef.name} must be <= ${rules.max}`, 400);
      }
    }
    
    // Length validation for strings
    if (paramDef.type === 'string') {
      if (rules.min !== undefined && value.length < rules.min) {
        throw createError(`Parameter ${paramDef.name} must be at least ${rules.min} characters`, 400);
      }
      if (rules.max !== undefined && value.length > rules.max) {
        throw createError(`Parameter ${paramDef.name} must be at most ${rules.max} characters`, 400);
      }
    }
    
    // Pattern validation for strings
    if (paramDef.type === 'string' && rules.pattern) {
      const regex = new RegExp(rules.pattern);
      if (!regex.test(value)) {
        throw createError(`Parameter ${paramDef.name} does not match required pattern`, 400);
      }
    }
    
    // Enum validation
    if (rules.enum && !rules.enum.includes(value)) {
      throw createError(`Parameter ${paramDef.name} must be one of: ${rules.enum.join(', ')}`, 400);
    }
  }
  
  /**
   * Create parameter placeholder for SQL
   */
  static createParameterPlaceholder(index: number): string {
    return `$${index + 1}`;
  }
  
  /**
   * Replace parameter placeholders in SQL template
   */
  static replaceParameterPlaceholders(
    sqlTemplate: string,
    parameterNames: string[],
    parameterValues: Record<string, any>
  ): { sql: string; parameters: any[] } {
    let sql = sqlTemplate;
    const parameters: any[] = [];
    
    // Replace named parameters with positional parameters
    parameterNames.forEach((name, _index) => {
      const placeholder = `{{${name}}}`;
      const positionalPlaceholder = `$${parameters.length + 1}`;
      
      if (sql.includes(placeholder)) {
        sql = sql.replace(new RegExp(placeholder, 'g'), positionalPlaceholder);
        parameters.push(parameterValues[name]);
      }
    });
    
    return { sql, parameters };
  }
}