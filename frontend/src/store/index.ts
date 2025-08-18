/* eslint-disable @typescript-eslint/no-explicit-any */
import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import authSlice from './slices/authSlice';
import reportsSlice from './slices/reportsSlice';
import querySlice from './slices/querySlice';
import uiSlice from './slices/uiSlice';

// Custom middleware to catch undefined actions
const undefinedActionMiddleware = (store: any) => (next: any) => (action: any) => {
  if (action === undefined || action === null) {
    console.error('Attempted to dispatch undefined action');
    console.error('Current state:', store.getState());
    console.trace();
    // Return a no-op action to prevent the error
    return next({ type: '@@redux/NOOP' });
  }
  if (!action.type) {
    console.error('Action missing type:', action);
    console.trace();
    return next({ type: '@@redux/INVALID_ACTION', payload: action });
  }
  return next(action);
};

export const store = configureStore({
  reducer: {
    auth: authSlice,
    reports: reportsSlice,
    query: querySlice,
    ui: uiSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }).concat(undefinedActionMiddleware),
  devTools: import.meta.env.DEV,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export default store;