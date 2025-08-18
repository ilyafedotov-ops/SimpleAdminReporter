import { EnhancedDataTable } from './index';
import { defaultFormatCellValue, commonQuickFilters } from './utils';
import { message } from 'antd';
import dayjs from 'dayjs';

// Example 1: Basic Usage with Auto-detected Filters
interface DataItem {
  name: string;
  email: string;
  status: string;
  lastLogin: string;
  isActive: boolean;
  [key: string]: unknown;
}

export const BasicExample = ({ data }: { data: DataItem[] }) => {
  return (
    <EnhancedDataTable
      data={data}
      columns={[
        { dataIndex: 'name', title: 'Name' },
        { dataIndex: 'email', title: 'Email' },
        { dataIndex: 'status', title: 'Status' },
        { dataIndex: 'lastLogin', title: 'Last Login' },
        { dataIndex: 'isActive', title: 'Active' },
      ]}
      formatCellValue={defaultFormatCellValue}
    />
  );
};

// Example 2: With Custom Filter Types and Quick Filters
interface ADUserData {
  sAMAccountName: string;
  displayName: string;
  userAccountControl: string;
  lastLogonTimestamp: string;
  department: string;
  accountExpires: string;
  [key: string]: unknown;
}

export const AdvancedExample = ({ data }: { data: ADUserData[] }) => {
  const handleExport = (data: ADUserData[], format: 'csv' | 'excel' | 'json') => {
    // Custom export logic
    message.success(`Exporting ${data.length} rows as ${format}`);
  };

  const handleFilterChange = (filters: Record<string, unknown>) => {
    console.log('Active filters:', filters);
  };

  return (
    <EnhancedDataTable
      data={data}
      columns={[
        { 
          dataIndex: 'sAMAccountName', 
          title: 'Username',
          filterType: 'text'
        },
        { 
          dataIndex: 'displayName', 
          title: 'Display Name',
          filterType: 'text'
        },
        { 
          dataIndex: 'userAccountControl', 
          title: 'Status',
          filterType: 'select',
          filterOptions: [
            { label: 'Active', value: 'Active' },
            { label: 'Disabled', value: 'Disabled' },
            { label: 'Locked', value: 'Locked' }
          ]
        },
        { 
          dataIndex: 'lastLogonTimestamp', 
          title: 'Last Logon',
          filterType: 'dateRange'
        },
        { 
          dataIndex: 'department', 
          title: 'Department',
          filterType: 'select' // Will auto-populate options
        },
        { 
          dataIndex: 'accountExpires', 
          title: 'Account Expires',
          filterType: 'dateRange'
        }
      ]}
      title="Active Directory Users Report"
      description="Showing all users matching the selected criteria"
      quickFilters={commonQuickFilters}
      formatCellValue={defaultFormatCellValue}
      onExport={handleExport}
      onFilterChange={handleFilterChange}
      enableRowSelection={true}
      showExport={true}
      showColumnToggle={true}
      showQuickFilters={true}
    />
  );
};

// Example 3: For Report History Page
interface ReportHistoryItem {
  report_name: string;
  executed_at: string;
  status: 'success' | 'failed' | 'running';
  row_count: number;
  execution_time_ms: number;
  [key: string]: unknown;
}

export const ReportHistoryExample = ({ historyData }: { historyData: ReportHistoryItem[] }) => {
  return (
    <EnhancedDataTable
      data={historyData}
      columns={[
        { 
          dataIndex: 'report_name', 
          title: 'Report Name',
          filterType: 'select'
        },
        { 
          dataIndex: 'executed_at', 
          title: 'Executed At',
          filterType: 'dateRange'
        },
        { 
          dataIndex: 'status', 
          title: 'Status',
          filterType: 'select',
          filterOptions: [
            { label: 'Success', value: 'success' },
            { label: 'Failed', value: 'failed' },
            { label: 'Running', value: 'running' }
          ]
        },
        { 
          dataIndex: 'row_count', 
          title: 'Row Count',
          filterType: 'number'
        },
        { 
          dataIndex: 'execution_time_ms', 
          title: 'Duration (ms)',
          filterType: 'number'
        }
      ]}
      quickFilters={[
        {
          label: 'Today',
          filters: {
            executed_at: {
              type: 'dateRange',
              value: [dayjs().startOf('day'), dayjs().endOf('day')]
            }
          }
        },
        {
          label: 'Failed Only',
          filters: {
            status: {
              type: 'select',
              value: 'failed'
            }
          }
        }
      ]}
      formatCellValue={defaultFormatCellValue}
      pageSize={20}
    />
  );
};

// Example 4: Minimal Usage (for simple tables)
export const MinimalExample = ({ data }: { data: Record<string, unknown>[] }) => {
  // Extract columns from data automatically
  const columns = data.length > 0 
    ? Object.keys(data[0]).map(key => ({
        dataIndex: key,
        title: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')
      }))
    : [];

  return (
    <EnhancedDataTable
      data={data}
      columns={columns}
      formatCellValue={defaultFormatCellValue}
      showExport={true}
      showColumnToggle={true}
    />
  );
};