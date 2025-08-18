import dayjs from 'dayjs';

/**
 * Default cell value formatter with LDAP data transformations
 */
export const defaultFormatCellValue = (value: unknown, columnKey: string): string => {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  
  // Handle arrays
  if (Array.isArray(value)) {
    if (value.length === 0) return '-';
    return value.join(', ');
  }
  
  // Handle other objects
  if (typeof value === 'object' && !(value instanceof Date)) {
    // Check if it's an empty object
    if (Object.keys(value).length === 0) return '-';
    return JSON.stringify(value);
  }
  
  // Handle Date objects or ISO date strings
  if ((typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) || value instanceof Date) {
    const dateObj = value instanceof Date ? value : new Date(value as string);
    if (!isNaN(dateObj.getTime())) {
      return dayjs(dateObj).format('YYYY-MM-DD, HH:mm:ss');
    }
  }
  
  // Transform Windows FileTime fields to readable dates
  if ((columnKey === 'lastLogonTimestamp' || columnKey === 'pwdLastSet' || columnKey === 'accountExpires' || 
       columnKey === 'badPasswordTime' || columnKey === 'lockoutTime' || columnKey === 'lastLogon') && 
      (typeof value === 'string' || typeof value === 'number')) {
    const timestamp = typeof value === 'string' ? parseInt(value) : value;
    if (timestamp === 0 || timestamp === 9.223372036854776e18) {
      return 'Never';
    }
    // Convert Windows FileTime to JavaScript timestamp
    const jsTimestamp = timestamp / 10000 - 11644473600000;
    const date = new Date(jsTimestamp);
    if (isNaN(date.getTime())) {
      return String(value);
    }
    return dayjs(date).format('YYYY-MM-DD, HH:mm:ss');
  }
  
  // Transform LDAP generalized time fields (YYYYMMDDHHMMSS.0Z format)
  if ((columnKey === 'whenCreated' || columnKey === 'whenChanged') && typeof value === 'string') {
    // Parse LDAP generalized time format: YYYYMMDDHHMMSS.0Z
    const match = value.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (match) {
      const [, year, month, day, hour, minute, second] = match;
      const date = new Date(Date.UTC(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(minute),
        parseInt(second)
      ));
      return dayjs(date).format('YYYY-MM-DD, HH:mm:ss');
    }
    // Check if it's already in ISO format
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return dayjs(date).format('YYYY-MM-DD, HH:mm:ss');
      }
    }
    return String(value);
  }
  
  // Transform UserAccountControl flags to status
  if (columnKey === 'userAccountControl' && typeof value === 'number') {
    const disabled = (value & 0x0002) !== 0;
    const lockedOut = (value & 0x0010) !== 0;
    const passwordNeverExpires = (value & 0x10000) !== 0;
    
    let status = disabled ? 'Disabled' : 'Active';
    if (lockedOut) status += ', Locked';
    if (passwordNeverExpires) status += ', Password Never Expires';
    
    return status;
  }
  
  return String(value);
};

/**
 * Helper to detect if a value contains meaningful information (recursive)
 */
export const hasInformation = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return true;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.some(item => hasInformation(item));
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(v => hasInformation(v));
  return false;
};

/**
 * Get column type based on data
 */
export const detectColumnType = (data: Record<string, unknown>[], dataIndex: string): 'text' | 'number' | 'date' | 'boolean' | 'select' => {
  if (data.length === 0) return 'text';
  
  const sampleValue = data[0][dataIndex];
  
  if (typeof sampleValue === 'boolean') {
    return 'boolean';
  }
  
  if (typeof sampleValue === 'number') {
    return 'number';
  }
  
  if (typeof sampleValue === 'string') {
    // Check if it's a date string
    if (/^\d{4}-\d{2}-\d{2}/.test(sampleValue)) {
      return 'date';
    }
    
    // Check if there are limited unique values (good for select)
    const uniqueValues = new Set(data.map(row => row[dataIndex]));
    if (uniqueValues.size <= 10) {
      return 'select';
    }
  }
  
  return 'text';
};

/**
 * Quick filter presets - empty by default
 * Components using EnhancedDataTable should provide their own relevant filters
 */
export const commonQuickFilters = [];

/**
 * Example AD/LDAP quick filters for reference
 * These can be used by AD-specific components
 */
export const adQuickFilters = [
  {
    label: 'Active Only',
    filters: {
      userAccountControl: {
        type: 'select' as const,
        value: 'Active'
      }
    }
  },
  {
    label: 'Disabled Only',
    filters: {
      userAccountControl: {
        type: 'select' as const,
        value: 'Disabled'
      }
    }
  },
  {
    label: 'Never Expires',
    filters: {
      accountExpires: {
        type: 'select' as const,
        value: 'Never'
      }
    }
  },
  {
    label: 'Recent Activity (30 days)',
    filters: {
      lastLogonTimestamp: {
        type: 'dateRange' as const,
        value: [dayjs().subtract(30, 'days'), dayjs()]
      }
    }
  }
];