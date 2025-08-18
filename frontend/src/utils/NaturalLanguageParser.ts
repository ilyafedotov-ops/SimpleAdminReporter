/* eslint-disable no-useless-escape */
import { ReportFilter } from '../types';

// Define field types for type-specific parsing
type FieldType = 'string' | 'number' | 'boolean' | 'datetime' | 'array';

// Define field metadata for type information
interface FieldMetadata {
  fieldName: string;
  displayName: string;
  dataType: FieldType;
  description?: string;
}

// Define operator mappings for natural language
interface OperatorMapping {
  patterns: RegExp[];
  operator: string;
  description: string;
}

// Natural language parser class
export class NaturalLanguageParser {
  private fields: FieldMetadata[];
  private operatorMappings: OperatorMapping[];

  constructor(fields: FieldMetadata[]) {
    this.fields = fields;
    
    // Define operator mappings with multiple patterns for each operator
    this.operatorMappings = [
      {
        patterns: [
          /is equal to/i,
          /equals/i,
          /is/i,
          /=/i
        ],
        operator: 'equals',
        description: 'Equal to'
      },
      {
        patterns: [
          /is not equal to/i,
          /not equals/i,
          /does not equal/i,
          /!=/i,
          /not equal/i
        ],
        operator: 'notEquals',
        description: 'Not equal to'
      },
      {
        patterns: [
          /is greater than/i,
          /greater than/i,
          />/i,
          /more than/i
        ],
        operator: 'greaterThan',
        description: 'Greater than'
      },
      {
        patterns: [
          /is less than/i,
          /less than/i,
          /</i,
          /before/i
        ],
        operator: 'lessThan',
        description: 'Less than'
      },
      {
        patterns: [
          /is greater than or equal to/i,
          /greater than or equal/i,
          />=/i,
          /at least/i
        ],
        operator: 'greaterThanOrEqual',
        description: 'Greater than or equal to'
      },
      {
        patterns: [
          /is less than or equal to/i,
          /less than or equal/i,
          /<=/i,
          /at most/i,
          /up to/i
        ],
        operator: 'lessThanOrEqual',
        description: 'Less than or equal to'
      },
      {
        patterns: [
          /contains/i,
          /includes/i
        ],
        operator: 'contains',
        description: 'Contains'
      },
      {
        patterns: [
          /does not contain/i,
          /not contains/i,
          /excludes/i
        ],
        operator: 'notContains',
        description: 'Does not contain'
      },
      {
        patterns: [
          /starts with/i,
          /begins with/i
        ],
        operator: 'startsWith',
        description: 'Starts with'
      },
      {
        patterns: [
          /ends with/i
        ],
        operator: 'endsWith',
        description: 'Ends with'
      },
      {
        patterns: [
          /is empty/i,
          /has no value/i,
          /is null/i
        ],
        operator: 'isEmpty',
        description: 'Is empty'
      },
      {
        patterns: [
          /is not empty/i,
          /has value/i,
          /is not null/i
        ],
        operator: 'isNotEmpty',
        description: 'Is not empty'
      }
    ];
  }

  /**
   * Parse natural language input into query filters
   * @param input The natural language input string
   * @returns Array of ReportFilter objects
   */
  parse(input: string): ReportFilter[] {
    // Clean and normalize input
    const normalizedInput = input.trim().toLowerCase();
    if (!normalizedInput) return [];

    // Extract filter conditions from the input
    const filters: ReportFilter[] = [];
    
    // Split input by common logical connectors
    const conditions = this.splitConditions(normalizedInput);
    
    for (const condition of conditions) {
      const filter = this.parseCondition(condition.trim());
      if (filter) {
        filters.push(filter);
      }
    }
    
    return filters;
  }

  /**
   * Split input into separate conditions based on logical connectors
   */
  private splitConditions(input: string): string[] {
    // Split by AND, OR, but preserve the connectors for context
    const parts = input.split(/(?=\b(?:and|or)\b)/i);
    return parts.map(part => part.trim()).filter(part => part.length > 0);
  }

  /**
   * Parse a single condition into a ReportFilter
   */
  private parseCondition(condition: string): ReportFilter | null {
    // Remove common prefixes like "where", "filter", etc.
    const cleanedCondition = condition.replace(/^(where|filter|show|find)\s+/i, '').trim();
    
    // Try to match field name first
    const field = this.findField(cleanedCondition);
    if (!field) {
      console.warn(`No matching field found for condition: ${condition}`);
      return null;
    }
    
    // Extract the field name from the condition
    const fieldPattern = new RegExp(`\\b${field.fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const conditionWithoutField = cleanedCondition.replace(fieldPattern, '').trim();
    
    // Find operator
    const operatorResult = this.findOperator(conditionWithoutField);
    if (!operatorResult) {
      console.warn(`No matching operator found for condition: ${condition}`);
      return null;
    }
    
    // Extract value
    const value = this.extractValue(
      conditionWithoutField, 
      operatorResult.match, 
      field.dataType
    );
    
    return {
      field: field.fieldName,
      operator: operatorResult.operator as ReportFilter['operator'],
      value: value,
      dataType: field.dataType as ReportFilter['dataType']
    };
  }

  /**
   * Find the field that matches the condition
   */
  private findField(condition: string): FieldMetadata | null {
    // First, try exact field name matches
    for (const field of this.fields) {
      const fieldNameLower = field.fieldName.toLowerCase();
      const displayNameLower = field.displayName.toLowerCase();
      
      if (condition.includes(fieldNameLower) || condition.includes(displayNameLower)) {
        return field;
      }
    }
    
    // Try fuzzy matching if no exact match
    for (const field of this.fields) {
      const fieldNameLower = field.fieldName.toLowerCase();
      const displayNameLower = field.displayName.toLowerCase();
      
      if (this.fuzzyMatch(condition, fieldNameLower) || this.fuzzyMatch(condition, displayNameLower)) {
        return field;
      }
    }
    
    return null;
  }

  /**
   * Find the operator that matches the condition
   */
  private findOperator(condition: string): { operator: string; match: string } | null {
    for (const mapping of this.operatorMappings) {
      for (const pattern of mapping.patterns) {
        const match = condition.match(pattern);
        if (match) {
          return {
            operator: mapping.operator,
            match: match[0]
          };
        }
      }
    }
    return null;
  }

  /**
   * Extract the value from the condition
   */
  private extractValue(condition: string, operatorMatch: string, fieldType: FieldType): string | number | boolean | null {
    // Remove the operator from the condition
    const valueString = condition.replace(new RegExp(`\\b${operatorMatch}\\b`, 'i'), '').trim();
    
    // Parse based on field type
    switch (fieldType) {
      case 'number':
        return this.parseNumber(valueString);
      case 'boolean':
        return this.parseBoolean(valueString);
      case 'datetime':
        return this.parseDate(valueString);
      case 'array': {
        const arrayValue = this.parseArray(valueString);
        // For now, return the first element or null since ReportFilter doesn't support array values
        return arrayValue && arrayValue.length > 0 ? arrayValue[0] : null;
      }
      default:
        // For string and other types, return the cleaned string
        return valueString.replace(/['"]/g, '').trim();
    }
  }

  /**
   * Parse a number value
   */
  private parseNumber(value: string): number | null {
    const num = parseFloat(value.replace(/[^\d.-]/g, ''));
    return isNaN(num) ? null : num;
  }

  /**
   * Parse a boolean value
   */
  private parseBoolean(value: string): boolean | null {
    const lowerValue = value.toLowerCase();
    if (lowerValue.includes('true') || lowerValue.includes('yes') || lowerValue.includes('on')) {
      return true;
    } else if (lowerValue.includes('false') || lowerValue.includes('no') || lowerValue.includes('off')) {
      return false;
    }
    return null;
  }

  /**
   * Parse a date value
   */
  private parseDate(value: string): string | null {
    // Remove quotes and common date prefixes
    const cleanValue = value.replace(/['"]/g, '').trim();
    
    // Handle relative dates
    if (cleanValue.includes('today')) {
      return new Date().toISOString();
    } else if (cleanValue.includes('yesterday')) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toISOString();
    } else if (cleanValue.includes('tomorrow')) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow.toISOString();
    }
    
    // Try to parse as a standard date
    const date = new Date(cleanValue);
    return isNaN(date.getTime()) ? null : date.toISOString();
  }

  /**
   * Parse an array value
   */
  private parseArray(value: string): string[] | null {
    // Remove brackets and split by comma
    const cleanValue = value.replace(/[\[\]]/g, '').trim();
    if (!cleanValue) return null;
    
    return cleanValue.split(',').map(item => item.trim().replace(/['"]/g, ''));
  }

  /**
   * Simple fuzzy matching for field names
   */
  private fuzzyMatch(text: string, pattern: string): boolean {
    // Simple implementation: check if all characters in pattern appear in text in order
    let patternIndex = 0;
    for (const char of text) {
      if (patternIndex < pattern.length && char === pattern[patternIndex]) {
        patternIndex++;
      }
    }
    return patternIndex === pattern.length;
  }

  /**
   * Get suggestions for field names based on input
   */
  getSuggestions(input: string): FieldMetadata[] {
    const lowerInput = input.toLowerCase();
    return this.fields.filter(field => 
      field.fieldName.toLowerCase().includes(lowerInput) ||
      field.displayName.toLowerCase().includes(lowerInput) ||
      (field.description && field.description.toLowerCase().includes(lowerInput))
    );
  }

  /**
   * Get operator suggestions for a field
   */
  getOperatorSuggestions(fieldType: FieldType): { operator: string; description: string }[] {
    return this.operatorMappings
      .filter(mapping => {
        // Some operators are only valid for certain field types
        if (fieldType === 'string') {
          return true; // All operators can work with strings
        } else if (fieldType === 'number') {
          return !['startsWith', 'endsWith', 'contains', 'notContains'].includes(mapping.operator);
        } else if (fieldType === 'boolean') {
          return ['equals', 'notEquals'].includes(mapping.operator);
        } else if (fieldType === 'datetime') {
          return !['startsWith', 'endsWith', 'contains', 'notContains'].includes(mapping.operator);
        } else if (fieldType === 'array') {
          return ['contains', 'notContains', 'isEmpty', 'isNotEmpty'].includes(mapping.operator);
        }
        return true;
      })
      .map(mapping => ({
        operator: mapping.operator,
        description: mapping.description
      }));
  }
}