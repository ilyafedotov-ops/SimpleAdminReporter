import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Spin } from 'antd';
import { useAppSelector, useAppDispatch } from '@/store';
import { getProfileAsync } from '@/store/slices/authSlice';
import { activeAuthService as authService } from '@/services/authService.factory';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermissions?: string[];
  requiredRoles?: string[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermissions = [],
  requiredRoles = [],
}) => {
  const dispatch = useAppDispatch();
  const location = useLocation();
  const { isAuthenticated, user, isLoading, token } = useAppSelector(state => state.auth);

  useEffect(() => {
    // If we have a token but no user data, fetch the profile
    if (token && !user && !isLoading) {
      dispatch(getProfileAsync());
    }
  }, [dispatch, token, user, isLoading]);

  // Check if token is expired only if authenticated and using token-based auth
  // For cookie-based auth, token expiration is handled by the server
  if (isAuthenticated && 'isTokenExpired' in authService && typeof authService.isTokenExpired === 'function') {
    if (authService.isTokenExpired()) {
      // Clear auth state if token is expired
      authService.logout();
      return <Navigate to="/login" state={{ from: location }} replace />;
    }
  }
  
  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If still loading user data, show spinner
  if (isLoading || (token && !user)) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <Spin size="large" />
        <div style={{ color: '#666' }}>Loading user profile...</div>
      </div>
    );
  }

  // Check required permissions
  if (requiredPermissions.length > 0 && user) {
    const hasRequiredPermissions = requiredPermissions.every(permission =>
      user.permissions?.includes(permission)
    );
    
    if (!hasRequiredPermissions) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{ fontSize: '24px', color: '#ff4d4f' }}>Access Denied</div>
          <div style={{ color: '#666' }}>
            You don't have the required permissions to access this page.
          </div>
          <div style={{ color: '#999', fontSize: '12px' }}>
            Required permissions: {requiredPermissions.join(', ')}
          </div>
        </div>
      );
    }
  }

  // Check required roles
  if (requiredRoles.length > 0 && user) {
    const hasRequiredRoles = requiredRoles.some(role =>
      user.roles?.includes(role)
    );
    
    if (!hasRequiredRoles) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <div style={{ fontSize: '24px', color: '#ff4d4f' }}>Access Denied</div>
          <div style={{ color: '#666' }}>
            You don't have the required role to access this page.
          </div>
          <div style={{ color: '#999', fontSize: '12px' }}>
            Required roles: {requiredRoles.join(', ')}
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute;