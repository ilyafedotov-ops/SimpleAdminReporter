import { CustomReportQuery } from '../types';

// Define complexity levels
export type ComplexityLevel = 'low' | 'medium' | 'high' | 'veryHigh';

// Define complexity factors
interface ComplexityFactors {
  fieldCount: number;
  filterCount: number;
  nestedFilters: number;
  joinCount: number;
  groupBy: number;
  orderBy: number;
  subqueryCount: number;
}

// Query complexity result
export interface QueryComplexity {
  score: number;
  level: ComplexityLevel;
  factors: ComplexityFactors;
  performanceImpact: 'low' | 'medium' | 'high';
  suggestions: string[];
}

// Query complexity analyzer class
export class QueryComplexityAnalyzer {
  /**
   * Analyze the complexity of a query
   * @param query The query to analyze
   * @returns QueryComplexity object with analysis results
   */
  analyze(query: CustomReportQuery): QueryComplexity {
    // Initialize factors
    const factors: ComplexityFactors = {
      fieldCount: query.fields.length,
      filterCount: query.filters.length,
      nestedFilters: this.countNestedFilters(query.filters),
      joinCount: 0, // Join count would be determined by the fields selected
      groupBy: query.groupBy ? 1 : 0,
      orderBy: query.orderBy ? 1 : 0,
      subqueryCount: 0 // Subquery count would be determined by field relationships
    };

    // Calculate join count based on field relationships
    factors.joinCount = this.calculateJoinCount(query.fields);
    
    // Calculate subquery count based on field relationships
    factors.subqueryCount = this.calculateSubqueryCount(query.fields);

    // Calculate base score
    let score = 0;
    score += factors.fieldCount * 10;
    score += factors.filterCount * 20;
    score += factors.nestedFilters * 30;
    score += factors.joinCount * 25;
    score += factors.groupBy * 15;
    score += factors.orderBy * 10;
    score += factors.subqueryCount * 40;

    // Determine complexity level
    const level = this.getComplexityLevel(score);

    // Determine performance impact
    const performanceImpact = this.getPerformanceImpact(level, factors);

    // Generate suggestions for optimization
    const suggestions = this.generateSuggestions(query, factors, level);

    return {
      score,
      level,
      factors,
      performanceImpact,
      suggestions
    };
  }

  /**
   * Count nested filters (filters with complex conditions)
   */
  private countNestedFilters(filters: CustomReportQuery['filters']): number {
    let count = 0;
    for (const filter of filters) {
      // Count complex operators that indicate nested logic
      if (['contains', 'notContains', 'startsWith', 'endsWith'].includes(filter.operator)) {
        count++;
      }
      // Count array field filters which may require subqueries
      // Note: In the ReportFilter type, dataType doesn't include 'array',
      // but we'll keep this check for future extensibility
    }
    return count;
  }

  /**
   * Calculate join count based on selected fields
   * This is a simplified version - in a real implementation, 
   * this would use metadata about field relationships
   */
  private calculateJoinCount(fields: CustomReportQuery['fields']): number {
    // In a real implementation, this would analyze the fields to determine
    // how many joins are needed based on relationships between entities
    // For now, we'll use a simple heuristic
    
    // Group fields by entity type (simplified)
    const entities = new Set<string>();
    for (const field of fields) {
      // Extract entity from field name (simplified heuristic)
      const entityMatch = field.name.match(/^(\w+)_/);
      if (entityMatch) {
        entities.add(entityMatch[1]);
      } else {
        // Default entity for fields without prefix
        entities.add('main');
      }
    }
    
    // Number of joins is roughly the number of entities minus 1
    return Math.max(0, entities.size - 1);
  }

  /**
   * Calculate subquery count based on selected fields
   * This is a simplified version - in a real implementation,
   * this would use metadata about field relationships
   */
  private calculateSubqueryCount(fields: CustomReportQuery['fields']): number {
    // In a real implementation, this would identify fields that require
    // subqueries based on their definitions
    // For now, we'll use a simple heuristic
    
    let count = 0;
    for (const field of fields) {
      // Fields with "count", "sum", "avg" in name might indicate aggregation
      if (/(count|sum|avg|min|max)_/.test(field.name.toLowerCase())) {
        count++;
      }
    }
    return count;
  }

  /**
   * Determine complexity level based on score
   */
  private getComplexityLevel(score: number): ComplexityLevel {
    if (score < 50) return 'low';
    if (score < 100) return 'medium';
    if (score < 200) return 'high';
    return 'veryHigh';
  }

  /**
   * Determine performance impact based on complexity level and factors
   */
  private getPerformanceImpact(level: ComplexityLevel, factors: ComplexityFactors): 'low' | 'medium' | 'high' {
    if (level === 'low') return 'low';
    if (level === 'medium') return 'medium';
    
    // For high and very high complexity, consider additional factors
    if (factors.joinCount > 2 || factors.subqueryCount > 0) {
      return 'high';
    }
    return 'medium';
  }

  /**
   * Generate optimization suggestions based on query characteristics
   */
  private generateSuggestions(
    query: CustomReportQuery, 
    factors: ComplexityFactors, 
    level: ComplexityLevel
  ): string[] {
    const suggestions: string[] = [];

    // Field count suggestions
    if (factors.fieldCount > 10) {
      suggestions.push('Consider reducing the number of selected fields to improve performance');
    }

    // Filter suggestions
    if (factors.filterCount > 5) {
      suggestions.push('Large number of filters may impact performance. Consider if all are necessary');
    }

    // Join suggestions
    if (factors.joinCount > 2) {
      suggestions.push('Multiple joins can significantly impact performance. Consider if all related data is needed');
    }

    // Group by suggestions
    if (factors.groupBy && factors.fieldCount > 5) {
      suggestions.push('When grouping, try to limit the number of non-aggregated fields');
    }

    // Order by suggestions
    if (factors.orderBy && !query.groupBy) {
      suggestions.push('Ensure the ordered field is indexed for better performance');
    }

    // Subquery suggestions
    if (factors.subqueryCount > 0) {
      suggestions.push('Subqueries can be expensive. Consider if results can be achieved with joins instead');
    }

    // Complexity-specific suggestions
    if (level === 'veryHigh') {
      suggestions.push('This query is very complex and may have significant performance impact. Consider breaking it into smaller queries');
      suggestions.push('Ensure appropriate indexes exist on filtered and joined fields');
    }

    return suggestions;
  }

  /**
   * Get color for complexity level
   */
  getComplexityColor(level: ComplexityLevel): string {
    switch (level) {
      case 'low': return '#10b981'; // Green
      case 'medium': return '#f59e0b'; // Yellow
      case 'high': return '#f97316'; // Orange
      case 'veryHigh': return '#ef4444'; // Red
      default: return '#6b7280'; // Gray
    }
  }

  /**
   * Get icon for complexity level
   */
  getComplexityIcon(level: ComplexityLevel): string {
    switch (level) {
      case 'low': return '🟢';
      case 'medium': return '🟡';
      case 'high': return '🟠';
      case 'veryHigh': return '🔴';
      default: return '⚪';
    }
  }
}