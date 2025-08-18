import React, { useEffect, useState } from 'react';
import { apiQueue } from '@/utils/apiQueue';

export const ApiQueueStatus: React.FC = () => {
  const [stats, setStats] = useState(apiQueue.getStats());
  
  useEffect(() => {
    const interval = setInterval(() => {
      setStats(apiQueue.getStats());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }
  
  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      background: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      padding: '8px 12px',
      borderRadius: '4px',
      fontSize: '12px',
      zIndex: 9999,
      fontFamily: 'monospace'
    }}>
      <div>Queue: {stats.queueLength}</div>
      <div>Active: {stats.activeRequests}</div>
      {stats.isRateLimited && (
        <div style={{ color: '#ff6b6b' }}>
          Rate limited until {new Date(stats.rateLimitedUntil).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};