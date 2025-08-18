import { describe, it, expect, beforeEach, vi } from 'vitest';
import { configureStore, Store } from '@reduxjs/toolkit';
import uiReducer, {
  UIState,
  toggleSidebar,
  setSidebarCollapsed,
  setSidebarVisible,
  openModal,
  closeModal,
  closeAllModals,
  setGlobalLoading,
  addNotification,
  removeNotification,
  clearNotifications,
  setBreadcrumbs,
  setCurrentPage,
  setTableState,
  setTheme,
  toggleDarkMode,
  showConfirmDialog,
  hideConfirmDialog,
  selectUI,
  selectTheme,
  selectSidebarState,
  selectGlobalLoading,
  selectNotifications,
  selectBreadcrumbs,
  selectTableState,
} from './uiSlice';

interface TestRootState {
  ui: UIState;
}

describe('uiSlice', () => {
  let store: Store<TestRootState>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        ui: uiReducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: {
            // Ignore these action types for serialization checks
            ignoredActions: ['ui/showConfirmDialog'],
            // Ignore these field paths in the state
            ignoredPaths: ['ui.confirmDialog.onConfirm', 'ui.confirmDialog.onCancel'],
          },
        }),
    });
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = store.getState();
      expect(state.ui.theme).toEqual({
        primaryColor: '#1890ff',
        darkMode: false,
        compactMode: false,
      });
      expect(state.ui.sidebarCollapsed).toBe(false);
      expect(state.ui.sidebarVisible).toBe(true);
      expect(state.ui.globalLoading).toBe(false);
      expect(state.ui.notifications).toEqual([]);
      expect(state.ui.breadcrumbs).toEqual([]);
      expect(state.ui.currentPage).toBe('');
    });
  });

  describe('sidebar actions', () => {
    it('should toggle sidebar collapsed state', () => {
      store.dispatch(toggleSidebar());
      expect(store.getState().ui.sidebarCollapsed).toBe(true);
      
      store.dispatch(toggleSidebar());
      expect(store.getState().ui.sidebarCollapsed).toBe(false);
    });

    it('should set sidebar collapsed state', () => {
      store.dispatch(setSidebarCollapsed(true));
      expect(store.getState().ui.sidebarCollapsed).toBe(true);
      
      store.dispatch(setSidebarCollapsed(false));
      expect(store.getState().ui.sidebarCollapsed).toBe(false);
    });

    it('should set sidebar visibility', () => {
      store.dispatch(setSidebarVisible(false));
      expect(store.getState().ui.sidebarVisible).toBe(false);
      
      store.dispatch(setSidebarVisible(true));
      expect(store.getState().ui.sidebarVisible).toBe(true);
    });
  });

  describe('modal actions', () => {
    it('should open specific modal', () => {
      store.dispatch(openModal('reportBuilder'));
      expect(store.getState().ui.modals.reportBuilder).toBe(true);
      
      store.dispatch(openModal('settings'));
      expect(store.getState().ui.modals.settings).toBe(true);
    });

    it('should close specific modal', () => {
      store.dispatch(openModal('reportBuilder'));
      store.dispatch(closeModal('reportBuilder'));
      expect(store.getState().ui.modals.reportBuilder).toBe(false);
    });

    it('should close all modals', () => {
      store.dispatch(openModal('reportBuilder'));
      store.dispatch(openModal('settings'));
      store.dispatch(openModal('userProfile'));
      
      store.dispatch(closeAllModals());
      
      const state = store.getState();
      expect(state.ui.modals.reportBuilder).toBe(false);
      expect(state.ui.modals.settings).toBe(false);
      expect(state.ui.modals.userProfile).toBe(false);
    });
  });

  describe('loading actions', () => {
    it('should set global loading with message', () => {
      store.dispatch(setGlobalLoading({ loading: true, message: 'Loading data...' }));
      
      const state = store.getState();
      expect(state.ui.globalLoading).toBe(true);
      expect(state.ui.loadingMessage).toBe('Loading data...');
    });

    it('should clear global loading', () => {
      store.dispatch(setGlobalLoading({ loading: true, message: 'Loading...' }));
      store.dispatch(setGlobalLoading({ loading: false, message: '' }));
      
      const state = store.getState();
      expect(state.ui.globalLoading).toBe(false);
      expect(state.ui.loadingMessage).toBe('');
    });
  });

  describe('notification actions', () => {
    it('should add notification with timestamp', () => {
      const now = Date.now();
      vi.setSystemTime(now);
      
      store.dispatch(addNotification({
        type: 'success',
        title: 'Success',
        message: 'Operation completed',
        duration: 5000,
      }));
      
      const state = store.getState();
      expect(state.ui.notifications).toHaveLength(1);
      expect(state.ui.notifications[0]).toMatchObject({
        type: 'success',
        title: 'Success',
        message: 'Operation completed',
        duration: 5000,
        timestamp: now,
      });
      expect(state.ui.notifications[0].id).toBeDefined();
      
      vi.useRealTimers();
    });

    it('should remove notification by id', () => {
      store.dispatch(addNotification({
        type: 'info',
        title: 'Info',
        message: 'Test message',
      }));
      
      const notificationId = store.getState().ui.notifications[0].id;
      store.dispatch(removeNotification(notificationId));
      
      expect(store.getState().ui.notifications).toHaveLength(0);
    });

    it('should clear all notifications', () => {
      store.dispatch(addNotification({ type: 'info', title: 'Test 1', message: 'Message 1' }));
      store.dispatch(addNotification({ type: 'warning', title: 'Test 2', message: 'Message 2' }));
      store.dispatch(addNotification({ type: 'error', title: 'Test 3', message: 'Message 3' }));
      
      store.dispatch(clearNotifications());
      
      expect(store.getState().ui.notifications).toEqual([]);
    });
  });

  describe('navigation actions', () => {
    it('should set breadcrumbs', () => {
      const breadcrumbs = [
        { title: 'Home', path: '/' },
        { title: 'Reports', path: '/reports' },
        { title: 'Report Builder' },
      ];
      
      store.dispatch(setBreadcrumbs(breadcrumbs));
      expect(store.getState().ui.breadcrumbs).toEqual(breadcrumbs);
    });

    it('should set current page', () => {
      store.dispatch(setCurrentPage({ page: 'reports', title: 'Reports' }));
      
      const state = store.getState();
      expect(state.ui.currentPage).toBe('reports');
      expect(state.ui.pageTitle).toBe('Reports');
    });
  });

  describe('table state actions', () => {
    it('should update table state', () => {
      const tableState = {
        pageSize: 20,
        sortField: 'name',
        sortOrder: 'asc' as const,
      };
      
      store.dispatch(setTableState({ tableId: 'reports-table', state: tableState }));
      
      const state = store.getState();
      expect(state.ui.tableStates['reports-table']).toMatchObject(tableState);
    });

    it('should update partial table state', () => {
      store.dispatch(setTableState({ 
        tableId: 'users-table', 
        state: { pageSize: 10 } 
      }));
      
      store.dispatch(setTableState({ 
        tableId: 'users-table', 
        state: { sortField: 'email', sortOrder: 'desc' } 
      }));
      
      const state = store.getState();
      expect(state.ui.tableStates['users-table']).toMatchObject({
        pageSize: 10,
        sortField: 'email',
        sortOrder: 'desc',
      });
    });
  });

  describe('theme actions', () => {
    it('should set theme', () => {
      const newTheme = {
        primaryColor: '#52c41a',
        darkMode: true,
        compactMode: true,
      };
      
      store.dispatch(setTheme(newTheme));
      expect(store.getState().ui.theme).toEqual(newTheme);
    });

    it('should toggle dark mode', () => {
      expect(store.getState().ui.theme.darkMode).toBe(false);
      
      store.dispatch(toggleDarkMode());
      expect(store.getState().ui.theme.darkMode).toBe(true);
      
      store.dispatch(toggleDarkMode());
      expect(store.getState().ui.theme.darkMode).toBe(false);
    });
  });

  describe('confirm dialog actions', () => {
    it('should show confirm dialog', () => {
      const onConfirm = vi.fn();
      const onCancel = vi.fn();
      
      store.dispatch(showConfirmDialog({
        title: 'Confirm Delete',
        content: 'Are you sure?',
        onConfirm,
        onCancel,
      }));
      
      const state = store.getState();
      expect(state.ui.confirmDialog.visible).toBe(true);
      expect(state.ui.confirmDialog.title).toBe('Confirm Delete');
      expect(state.ui.confirmDialog.content).toBe('Are you sure?');
    });

    it('should hide confirm dialog', () => {
      store.dispatch(showConfirmDialog({
        title: 'Test',
        content: 'Test message',
      }));
      
      store.dispatch(hideConfirmDialog());
      
      const state = store.getState();
      expect(state.ui.confirmDialog.visible).toBe(false);
    });
  });

  describe('selectors', () => {
    beforeEach(() => {
      store.dispatch(setTheme({ primaryColor: '#ff0000', darkMode: true, compactMode: false }));
      store.dispatch(setSidebarCollapsed(true));
      store.dispatch(addNotification({ type: 'info', title: 'Test', message: 'Test' }));
      store.dispatch(setBreadcrumbs([{ title: 'Home' }]));
    });

    it('should select UI state', () => {
      const state = store.getState();
      const ui = selectUI(state);
      expect(ui).toBe(state.ui);
    });

    it('should select theme', () => {
      const state = store.getState();
      const theme = selectTheme(state);
      expect(theme).toEqual({
        primaryColor: '#ff0000',
        darkMode: true,
        compactMode: false,
      });
    });

    it('should select sidebar state', () => {
      const state = store.getState();
      const sidebarState = selectSidebarState(state);
      expect(sidebarState).toEqual({
        collapsed: true,
        visible: true,
      });
    });

    it('should select global loading state', () => {
      const state = store.getState();
      const loading = selectGlobalLoading(state);
      expect(loading).toEqual({
        loading: false,
        message: '',
      });
    });

    it('should select notifications', () => {
      const state = store.getState();
      const notifications = selectNotifications(state);
      expect(notifications).toHaveLength(1);
    });

    it('should select breadcrumbs', () => {
      const state = store.getState();
      const breadcrumbs = selectBreadcrumbs(state);
      expect(breadcrumbs).toEqual([{ title: 'Home' }]);
    });

    it('should select table state', () => {
      store.dispatch(setTableState({ 
        tableId: 'test-table', 
        state: { pageSize: 25 } 
      }));
      
      const state = store.getState();
      const tableState = selectTableState('test-table')(state);
      expect(tableState).toMatchObject({ pageSize: 25 });
    });

    it('should return default table state when not found', () => {
      const state = store.getState();
      const tableState = selectTableState('non-existent')(state);
      expect(tableState).toEqual({ 
        pageSize: 20,
        filters: {},
        selectedRows: [],
      });
    });
  });
});