import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { AuthState, User, LoginRequest } from '@/types';
import { activeAuthService as authService } from '@/services/authService.factory';

// Initial state
const initialState: AuthState = {
  user: null,
  token: null,
  refreshToken: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,
};

// Async thunks
export const loginAsync = createAsyncThunk(
  'auth/login',
  async (credentials: LoginRequest, { rejectWithValue }) => {
    try {
      const response = await authService.login(credentials);
      if (response.success && (response as { data?: { user: User; accessToken?: string; refreshToken?: string } }).data) {
        return {
          user: (response as { data: { user: User } }).data.user,
          accessToken: (response as { data: { accessToken?: string } }).data.accessToken,
          refreshToken: (response as { data: { refreshToken?: string } }).data.refreshToken,
        };
      } else {
        return rejectWithValue(response.error || 'Login failed');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? (error.message || String(error)) : 'Operation failed');
    }
  }
);

export const logoutAsync = createAsyncThunk(
  'auth/logout',
  async () => {
    try {
      await authService.logout();
    } catch (error) {
      // Continue with logout even if server call fails
      console.warn('Logout server call failed:', error instanceof Error ? (error.message || String(error)) : 'Unknown error');
    }
  }
);

export const refreshTokenAsync = createAsyncThunk(
  'auth/refreshToken',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authService.refreshToken();
      if (response.success && (response as { data?: { user: User; accessToken?: string; refreshToken?: string } }).data) {
        return {
          accessToken: (response as { data: { accessToken?: string } }).data.accessToken,
          refreshToken: (response as { data: { refreshToken?: string } }).data.refreshToken,
        };
      } else {
        return rejectWithValue(response.error || 'Token refresh failed');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? (error.message || String(error)) : 'Operation failed');
    }
  }
);

export const getProfileAsync = createAsyncThunk(
  'auth/getProfile',
  async (_, { rejectWithValue }) => {
    try {
      const response = await authService.getProfile();
      if (response.success && (response as { data?: { user: User; accessToken?: string; refreshToken?: string } }).data) {
        return (response as { data: User }).data;
      } else {
        return rejectWithValue(response.error || 'Failed to get profile');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? (error.message || String(error)) : 'Operation failed');
    }
  }
);

export const updateProfileAsync = createAsyncThunk(
  'auth/updateProfile',
  async (profile: Partial<User>, { rejectWithValue }) => {
    try {
      const response = await authService.updateProfile(profile);
      if (response.success && (response as { data?: { user: User; accessToken?: string; refreshToken?: string } }).data) {
        return (response as { data: User }).data;
      } else {
        return rejectWithValue(response.error || 'Failed to update profile');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? (error.message || String(error)) : 'Operation failed');
    }
  }
);

export const changePasswordAsync = createAsyncThunk(
  'auth/changePassword',
  async ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }, { rejectWithValue }) => {
    try {
      const response = await authService.changePassword(currentPassword, newPassword);
      if (response.success) {
        return response.message || 'Password changed successfully';
      } else {
        return rejectWithValue(response.error || 'Failed to change password');
      }
    } catch (error) {
      return rejectWithValue(error instanceof Error ? (error.message || String(error)) : 'Operation failed');
    }
  }
);


// Auth slice
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    // Initialize auth state from localStorage
    initializeAuth: (state) => {
      const authState = authService.getCurrentAuthState();
      state.user = authState.user;
      state.token = authState.token;
      state.refreshToken = authState.refreshToken;
      state.isAuthenticated = authState.isAuthenticated;
      state.error = null;
    },
    
    // Set auth tokens
    setAuthTokens: (state, action: PayloadAction<{ user: User; accessToken?: string; refreshToken?: string }>) => {
      state.user = action.payload.user;
      state.token = action.payload.accessToken || null;
      state.refreshToken = action.payload.refreshToken || null;
      state.isAuthenticated = true;
      state.error = null;
      state.isLoading = false;
      
      // Store in localStorage
      if (action.payload.accessToken) {
        localStorage.setItem('accessToken', action.payload.accessToken);
        if (action.payload.refreshToken) {
          localStorage.setItem('refreshToken', action.payload.refreshToken);
        }
      }
      localStorage.setItem('user', JSON.stringify(action.payload.user));
    },
    
    // Clear auth state
    clearAuth: (state) => {
      state.user = null;
      state.token = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.error = null;
      state.isLoading = false;
    },
    
    // Set error
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    
    // Clear error
    clearError: (state) => {
      state.error = null;
    },
    
    // Update user data
    updateUser: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
        localStorage.setItem('user', JSON.stringify(state.user));
      }
    },
  },
  extraReducers: (builder) => {
    // Login
    builder
      .addCase(loginAsync.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload.user;
        state.token = action.payload.accessToken || null;
        state.refreshToken = action.payload.refreshToken || null;
        state.isAuthenticated = true;
        state.error = null;
      })
      .addCase(loginAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.isAuthenticated = false;
      });

    // Logout
    builder
      .addCase(logoutAsync.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(logoutAsync.fulfilled, (state) => {
        state.user = null;
        state.token = null;
        state.refreshToken = null;
        state.isAuthenticated = false;
        state.error = null;
        state.isLoading = false;
      })
      .addCase(logoutAsync.rejected, (state) => {
        // Clear state even on error
        state.user = null;
        state.token = null;
        state.refreshToken = null;
        state.isAuthenticated = false;
        state.isLoading = false;
      });

    // Refresh token
    builder
      .addCase(refreshTokenAsync.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(refreshTokenAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        state.token = action.payload.accessToken || null;
        state.refreshToken = action.payload.refreshToken || null;
        state.error = null;
      })
      .addCase(refreshTokenAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        // Don't clear auth on refresh failure - let the user try again
      });

    // Get profile
    builder
      .addCase(getProfileAsync.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(getProfileAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload;
        localStorage.setItem('user', JSON.stringify(action.payload));
        state.error = null;
      })
      .addCase(getProfileAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Update profile
    builder
      .addCase(updateProfileAsync.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(updateProfileAsync.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload;
        localStorage.setItem('user', JSON.stringify(action.payload));
        state.error = null;
      })
      .addCase(updateProfileAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Change password
    builder
      .addCase(changePasswordAsync.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(changePasswordAsync.fulfilled, (state) => {
        state.isLoading = false;
        state.error = null;
      })
      .addCase(changePasswordAsync.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

  },
});

export const {
  initializeAuth,
  clearAuth,
  setError,
  clearError,
  updateUser,
  setAuthTokens,
} = authSlice.actions;

// Selectors
export const selectAuth = (state: { auth: AuthState }) => state.auth;
export const selectUser = (state: { auth: AuthState }) => state.auth.user;
export const selectIsAuthenticated = (state: { auth: AuthState }) => state.auth.isAuthenticated;
export const selectAuthLoading = (state: { auth: AuthState }) => state.auth.isLoading;
export const selectAuthError = (state: { auth: AuthState }) => state.auth.error;

// Helper selectors
export const selectUserPermissions = (state: { auth: AuthState }) => state.auth.user?.permissions || [];
export const selectUserRoles = (state: { auth: AuthState }) => state.auth.user?.roles || [];
export const selectIsAdmin = (state: { auth: AuthState }) => {
  const roles = state.auth.user?.roles || [];
  return roles.includes('admin') || roles.includes('administrator');
};

export default authSlice.reducer;