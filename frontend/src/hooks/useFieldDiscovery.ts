 
 
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
import { useState, useEffect, useCallback } from 'react';
import { ApiResponse } from '@/types';

export interface FieldMetadata {
  source: 'ad' | 'azure' | 'o365';
  fieldName: string;
  displayName: string;
  dataType: 'string' | 'integer' | 'datetime' | 'boolean' | 'array' | 'reference' | 'decimal';
  category: string;
  description: string;
  isSearchable: boolean;
  isSortable: boolean;
  isExportable: boolean;
  isSensitive: boolean;
  sampleValues?: string[];
  validationRules?: any;
  aliases?: string[];  // Alternative names that can be used to reference this field
}

export interface FieldCategory {
  name: string;
  displayName: string;
  description: string;
  fields: FieldMetadata[];
}

interface UseFieldDiscoveryReturn {
  categories: FieldCategory[];
  fields: FieldMetadata[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
  discoverSchema: (refresh?: boolean) => Promise<void>;
  isDiscovering: boolean;
  totalFields: number;
  setCredentialId?: (credentialId: number | undefined) => void;
}

export const useFieldDiscovery = (source: 'ad' | 'azure' | 'o365' | 'postgres'): UseFieldDiscoveryReturn => {
  const [categories, setCategories] = useState<FieldCategory[]>([]);
  const [fields, setFields] = useState<FieldMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [totalFields, setTotalFields] = useState(0);
  const [credentialId, setCredentialId] = useState<number | undefined>(undefined);

  const fetchFields = useCallback(async (refresh = false) => {
    if (source === 'postgres') {
      // For postgres queries, we don't have field discovery yet
      setCategories([]);
      setFields([]);
      setLoading(false);
      return;
    }

    // For Azure, we need to get fields from all Graph entity types
    if (source === 'azure') {
      try {
        setLoading(true);
        setError(null);
        
        // Get fields for all Graph entity types
        const entityTypes = ['users', 'groups', 'applications', 'devices'];
        const allFields: FieldMetadata[] = [];
        const categoryMap = new Map<string, FieldMetadata[]>();

        for (const entityType of entityTypes) {
          try {
            const params = new URLSearchParams();
            params.append('t', Date.now().toString());
            if (refresh) params.append('refresh', 'true');
            
            const response = await fetch(`/api/graph/fields/${entityType}?${params}`, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}`,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
              },
            });

            if (response.ok) {
              const result: ApiResponse<any> = await response.json();
              if (result.success && ((result as any)?.data)?.fields) {
                // Convert Graph fields to FieldMetadata format  
                const resultData = (result as any)?.data;
                const fields: FieldMetadata[] = resultData?.fields?.map((field: Record<string, unknown>) => ({
                  source: 'azure' as const,
                  fieldName: field.name,
                  displayName: field.displayName,
                  dataType: field.type === 'datetime' ? 'datetime' : 
                           field.type === 'boolean' ? 'boolean' :
                           field.type === 'array' ? 'array' :
                           field.type === 'object' ? 'reference' : 'string',
                  category: field.category || 'general',
                  description: field.description || '',
                  isSearchable: field.isSearchable !== false,
                  isSortable: field.isSortable !== false,
                  isExportable: true,
                  isSensitive: false,
                  sampleValues: field.sampleValues
                })) || [];

                allFields.push(...fields);

                // Group by category
                fields.forEach(field => {
                  const category = `${entityType}_${field.category}`;
                  if (!categoryMap.has(category)) {
                    categoryMap.set(category, []);
                  }
                  categoryMap.get(category)!.push(field);
                });
              }
            }
          } catch (entityError) {
            console.warn(`Failed to load fields for ${entityType}:`, entityError);
          }
        }

        // Convert to categories format
        const categories: FieldCategory[] = Array.from(categoryMap.entries()).map(([key, fields]) => {
          const [entityType, categoryName] = key.split('_');
          return {
            name: key,
            displayName: `${entityType.charAt(0).toUpperCase() + entityType.slice(1)} - ${categoryName.charAt(0).toUpperCase() + categoryName.slice(1)}`,
            description: `${categoryName} fields for ${entityType}`,
            fields
          };
        });

        setCategories(categories);
        setFields(allFields);
        setTotalFields(allFields.length);
      } catch (error: unknown) {
        setError(((error as any)?.message || String(error)));
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams();
      params.append('t', Date.now().toString());
      if (refresh) params.append('refresh', 'true');
      if (credentialId) params.append('credentialId', credentialId.toString());
      
      const response = await fetch(`/api/reports/fields/${source}?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch fields: ${response.statusText}`);
      }

      const result: ApiResponse<any> = await response.json();

      if (result.success && ((result as any)?.data)) {
        // The backend now returns an object: { source, categories, totalFields }
        // but older versions returned the categories array directly. Support both.

        const resultData = (result as any)?.data;
        const categoriesData: FieldCategory[] = Array.isArray(resultData)
          ? (resultData as FieldCategory[])
          : (resultData?.categories || []);

        setCategories(categoriesData);

        // Flatten categories to get all fields
        const allFields = categoriesData.reduce<FieldMetadata[]>((acc, category) => {
          return [...acc, ...category.fields];
        }, []);

        setFields(allFields);

        // Update total fields if the API provided it, otherwise derive from length
        const totalFieldsFromApi = Array.isArray(resultData) 
          ? (resultData as any)?.totalFields 
          : resultData?.totalFields;
        setTotalFields(totalFieldsFromApi || allFields.length);
      } else {
        throw new Error(result.error || 'Failed to load field metadata');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('Field discovery error:', err);
    } finally {
      setLoading(false);
    }
  }, [source, credentialId]);

  const discoverSchema = useCallback(async (refresh = false) => {
    if (source === 'postgres') {
      return; // Not supported for postgres
    }

    setIsDiscovering(true);
    setError(null);
    
    try {
      const params = new URLSearchParams();
      if (refresh) params.append('refresh', 'true');
      if (credentialId) params.append('credentialId', credentialId.toString());
      
      // Add timeout to prevent infinite hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(`/api/reports/schema/${source}/discover?${params}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}`,
          'Cache-Control': 'no-cache' // Prevent browser caching that can cause 304 responses
        },
        signal: controller.signal
      }).finally(() => clearTimeout(timeoutId));

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required. Please ensure you have valid AD credentials.');
        }
        if (response.status === 304) {
          // Handle 304 Not Modified - try to get cached data or refresh
          console.warn('Received 304 Not Modified, refreshing request');
          // Fall back to regular field fetch
          await fetchFields();
          return;
        }
        throw new Error(`Schema discovery failed: ${response.statusText}`);
      }

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        console.error('Failed to parse response:', parseError);
        throw new Error('Invalid response format from server');
      }
      
      if (result.success && ((result as any)?.data)) {
        // Use the dynamically discovered fields
        const schemaData = (result as any)?.data;
        if (schemaData?.categories) {
          setCategories(schemaData.categories);
        }
        
        if (schemaData?.allFields) {
          setFields(schemaData.allFields);
          setTotalFields(schemaData?.totalAttributes || schemaData?.allFields?.length || 0);
        }
        
        // If we have common attributes, we could highlight them
        console.log(`Discovered ${schemaData?.totalAttributes || 0} attributes from ${source}`);
        
        // Also refresh the regular fields to ensure we have the latest
        await fetchFields(true);
      } else {
        console.error('Schema discovery response:', result);
        throw new Error(result.error || 'Failed to discover schema');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Schema discovery failed';
      setError(errorMessage);
      console.error('Schema discovery error:', err);
      
      // Fall back to regular field fetch with refresh
      try {
        await fetchFields(true);
      } catch (fetchError) {
        console.error('Fallback field fetch also failed:', fetchError);
      }
    } finally {
      // Always ensure flags are reset so the UI can render fields
      setIsDiscovering(false);
      // If discovery succeeded without invoking fetchFields, manually clear the generic loading state
      setLoading(false);
    }
  }, [source, fetchFields, credentialId]);

  const refetch = useCallback(() => {
    fetchFields(true);
  }, [fetchFields]);

  useEffect(() => {
    // For AD, try schema discovery first
    if (source === 'ad') {
      discoverSchema(false).catch(() => {
        // Fallback to regular field fetch if discovery fails
        fetchFields();
      });
    } else {
      fetchFields();
    }
  }, [source, credentialId]); // Re-fetch when source or credentialId changes

  return {
    categories,
    fields,
    loading: loading || isDiscovering,
    error,
    refetch,
    discoverSchema,
    isDiscovering,
    totalFields,
    setCredentialId
  };
};

export default useFieldDiscovery;