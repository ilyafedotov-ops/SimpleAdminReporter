import React, { useEffect } from 'react';
import { useAppDispatch } from '@/store';
import { setBreadcrumbs, setCurrentPage } from '@/store/slices/uiSlice';
import { QueryMetricsDashboard } from '@/components/query/QueryMetricsDashboard';
import { QueryHealthBanner } from '@/components/query/QueryHealthBanner';

const QueryMetricsPage: React.FC = () => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    dispatch(setCurrentPage({ page: 'query-metrics', title: 'Query Metrics' }));
    dispatch(setBreadcrumbs([
      { title: 'Dashboard', path: '/dashboard' },
      { title: 'Reports', path: '/reports' },
      { title: 'Query Metrics' }
    ]));
  }, [dispatch]);

  return (
    <div style={{ minHeight: 'calc(100vh - 64px)' }}>
      <QueryHealthBanner />
      <QueryMetricsDashboard />
    </div>
  );
};

export default QueryMetricsPage;