import React from 'react';
import { Layout, Row, Col, Card, Typography } from 'antd';
import { useAppSelector } from '@/store';
import { selectTheme } from '@/store/slices/uiSlice';

const { Content } = Layout;
const { Title, Text } = Typography;

interface AuthLayoutProps {
  children: React.ReactNode;
}

const AuthLayout: React.FC<AuthLayoutProps> = ({ children }) => {
  const theme = useAppSelector(selectTheme);
  const darkMode = theme.darkMode;
  
  return (
    <Layout style={{ minHeight: '100vh', background: darkMode ? '#1a1a1a' : '#f5f5f5' }}>
      <Content style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', minHeight: '100vh' }}>
        <Row justify="center" style={{ width: '100%', maxWidth: 1200 }}>
          <Col xs={22} sm={18} md={14} lg={10} xl={8}>
            <div style={{ textAlign: 'center', marginBottom: 32 }}>
              {/* Logo */}
              <div
                style={{
                  fontSize: '48px',
                  fontWeight: 'bold',
                  color: darkMode ? '#f1f5f9' : '#1e293b',
                  marginBottom: 8,
                }}
              >
                AD
              </div>
              <Title
                level={2}
                style={{
                  color: darkMode ? '#f1f5f9' : '#1e293b',
                  margin: 0,
                  fontSize: '24px',
                  fontWeight: 300,
                }}
              >
                Reporting Application
              </Title>
              <Text
                style={{
                  color: darkMode ? '#94a3b8' : '#64748b',
                  fontSize: '14px',
                  display: 'block',
                  marginTop: 8,
                }}
              >
                Active Directory • Azure AD • Office 365
              </Text>
            </div>

            <Card
              style={{
                borderRadius: 12,
                boxShadow: darkMode 
                  ? '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.2)'
                  : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                border: darkMode ? '1px solid rgba(148, 163, 184, 0.1)' : '1px solid rgba(255, 255, 255, 0.5)',
                width: '100%',
                background: darkMode ? 'rgba(30, 41, 59, 0.8)' : 'rgba(255, 255, 255, 0.8)',
                backdropFilter: 'blur(12px)',
              }}
              styles={{ 
                body: {
                  padding: '32px 24px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch'
                }
              }}
            >
              {children}
            </Card>

            {/* Footer */}
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <Text
                style={{
                  color: darkMode ? '#64748b' : '#94a3b8',
                  fontSize: '12px',
                }}
              >
                © 2024 AD Reporting Application. All rights reserved.
              </Text>
            </div>
          </Col>
        </Row>
      </Content>
    </Layout>
  );
};

export default AuthLayout;