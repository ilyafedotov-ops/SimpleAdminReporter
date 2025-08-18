import React from 'react';
import { useAppSelector } from '@/store';
import { selectTheme } from '@/store/slices/uiSlice';
import { formatDuration } from '@/utils/formatters';

export interface ExecutionSummaryProps {
  status?: string;
  recordCount: number;
  executionTime?: number;
  category?: string;
  style?: React.CSSProperties;
}

export const ExecutionSummary: React.FC<ExecutionSummaryProps> = ({
  status = 'Completed',
  recordCount,
  executionTime,
  category = 'Query',
  style
}) => {
  const theme = useAppSelector(selectTheme);
  const darkMode = theme.darkMode;

  return (
    <div style={{
      marginBottom: '24px',
      padding: '24px',
      borderRadius: '16px',
      background: darkMode ? 'rgba(17, 24, 39, 0.5)' : 'rgba(255, 255, 255, 0.9)',
      backdropFilter: 'blur(20px)',
      border: darkMode ? '1px solid rgba(55, 65, 81, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
      boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
      ...style
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '24px' }}>
        <div>
          <p style={{ margin: 0, fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280', marginBottom: '4px' }}>Status</p>
          <p style={{ margin: 0, fontSize: '16px', fontWeight: '500', color: darkMode ? '#f3f4f6' : '#1f2937' }}>
            {status}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280', marginBottom: '4px' }}>Total Records</p>
          <p style={{ margin: 0, fontSize: '16px', fontWeight: '500', color: darkMode ? '#f3f4f6' : '#1f2937' }}>
            {recordCount}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280', marginBottom: '4px' }}>Execution Time</p>
          <p style={{ margin: 0, fontSize: '16px', fontWeight: '500', color: darkMode ? '#f3f4f6' : '#1f2937' }}>
            {executionTime ? formatDuration(executionTime) : 'N/A'}
          </p>
        </div>
        <div>
          <p style={{ margin: 0, fontSize: '12px', color: darkMode ? '#9ca3af' : '#6b7280', marginBottom: '4px' }}>Category</p>
          <p style={{ margin: 0, fontSize: '16px', fontWeight: '500', color: darkMode ? '#f3f4f6' : '#1f2937' }}>
            {category}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ExecutionSummary;