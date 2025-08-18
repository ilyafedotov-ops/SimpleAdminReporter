import React from 'react';
import { Spin, Typography } from 'antd';
import { useAppSelector } from '@/store';
import { selectGlobalLoading } from '@/store/slices/uiSlice';

const { Text } = Typography;

const GlobalLoading: React.FC = () => {
  const { loading, message } = useAppSelector(selectGlobalLoading);

  if (!loading) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(2px)',
      }}
    >
      <Spin size="large" />
      {message && (
        <Text
          style={{
            marginTop: 16,
            fontSize: '16px',
            color: '#666',
          }}
        >
          {message}
        </Text>
      )}
    </div>
  );
};

export default GlobalLoading;