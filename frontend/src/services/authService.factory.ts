import { authService } from './authService';
import { cookieAuthService } from './authService.cookie';

// Determine which auth service to use based on environment variable
const useCookieAuth = import.meta.env.VITE_USE_COOKIE_AUTH === 'true';

// Export the appropriate service
export const activeAuthService = useCookieAuth ? cookieAuthService : authService;

// Re-export all methods from the active service
export const login = activeAuthService.login.bind(activeAuthService);
export const logout = activeAuthService.logout.bind(activeAuthService);
export const refreshToken = activeAuthService.refreshToken.bind(activeAuthService);
export const getProfile = activeAuthService.getProfile.bind(activeAuthService);
export const updateProfile = activeAuthService.updateProfile.bind(activeAuthService);
export const changePassword = activeAuthService.changePassword.bind(activeAuthService);
export const getCurrentAuthState = activeAuthService.getCurrentAuthState.bind(activeAuthService);
export const hasPermission = activeAuthService.hasPermission.bind(activeAuthService);
export const hasRole = activeAuthService.hasRole.bind(activeAuthService);
export const isAdmin = activeAuthService.isAdmin.bind(activeAuthService);
export const getAuthSource = activeAuthService.getAuthSource.bind(activeAuthService);
export const setupTokenRefresh = activeAuthService.setupTokenRefresh.bind(activeAuthService);

// Export the service instance itself for direct access
export default activeAuthService;