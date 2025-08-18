import { createSlice, PayloadAction, createSelector } from '@reduxjs/toolkit';
import { ThemeConfig } from '@/types';

interface UIState {
  // Theme and appearance
  theme: ThemeConfig;
  
  // Layout
  sidebarCollapsed: boolean;
  sidebarVisible: boolean;
  
  // Modals and drawers
  modals: {
    reportBuilder: boolean;
    userProfile: boolean;
    settings: boolean;
    reportPreview: boolean;
    exportOptions: boolean;
    confirmDialog: boolean;
  };
  
  // Loading states for global operations
  globalLoading: boolean;
  loadingMessage: string;
  
  // Toast Notifications (temporary)
  notifications: Array<{
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
    duration?: number;
    timestamp: number;
  }>;
  
  // Persistent Notifications (from backend)
  persistentNotifications: {
    unreadCount: number;
    totalCount: number;
    highPriorityUnread: number;
    recentCount: number;
    lastFetched: number | null;
  };
  
  // Breadcrumbs
  breadcrumbs: Array<{
    title: string;
    path?: string;
  }>;
  
  // Page state
  currentPage: string;
  pageTitle: string;
  
  // Table states (for consistent table experience)
  tableStates: Record<string, {
    pageSize: number;
    sortField?: string;
    sortOrder?: 'asc' | 'desc';
    filters: Record<string, string | number | boolean | string[]>;
    selectedRows: string[];
  }>;
  
  // Dialog state
  confirmDialog: {
    visible: boolean;
    title: string;
    content: string;
    onConfirm?: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
    type?: 'info' | 'warning' | 'error';
  };
  
  // Tour/help state
  showTour: boolean;
  tourStep: number;
  showHelp: boolean;
  
  // Performance monitoring
  performanceMetrics: {
    lastPageLoadTime?: number;
    lastApiCallTime?: number;
    errorCount: number;
  };
}

const initialState: UIState = {
  theme: {
    primaryColor: '#1890ff',
    darkMode: false,
    compactMode: false,
  },
  
  sidebarCollapsed: false,
  sidebarVisible: true,
  
  modals: {
    reportBuilder: false,
    userProfile: false,
    settings: false,
    reportPreview: false,
    exportOptions: false,
    confirmDialog: false,
  },
  
  globalLoading: false,
  loadingMessage: '',
  
  notifications: [],
  
  persistentNotifications: {
    unreadCount: 0,
    totalCount: 0,
    highPriorityUnread: 0,
    recentCount: 0,
    lastFetched: null,
  },
  
  breadcrumbs: [],
  
  currentPage: '',
  pageTitle: '',
  
  tableStates: {},
  
  confirmDialog: {
    visible: false,
    title: '',
    content: '',
    confirmText: 'OK',
    cancelText: 'Cancel',
    type: 'info',
  },
  
  showTour: false,
  tourStep: 0,
  showHelp: false,
  
  performanceMetrics: {
    errorCount: 0,
  },
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    // Theme actions
    setTheme: (state, action: PayloadAction<Partial<ThemeConfig>>) => {
      state.theme = { ...state.theme, ...action.payload };
      // Save to localStorage
      localStorage.setItem('theme', JSON.stringify(state.theme));
    },
    
    toggleDarkMode: (state) => {
      state.theme.darkMode = !state.theme.darkMode;
      localStorage.setItem('theme', JSON.stringify(state.theme));
    },
    
    toggleCompactMode: (state) => {
      state.theme.compactMode = !state.theme.compactMode;
      localStorage.setItem('theme', JSON.stringify(state.theme));
    },
    
    // Layout actions
    toggleSidebar: (state) => {
      state.sidebarCollapsed = !state.sidebarCollapsed;
      localStorage.setItem('sidebarCollapsed', JSON.stringify(state.sidebarCollapsed));
    },
    
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload;
      localStorage.setItem('sidebarCollapsed', JSON.stringify(state.sidebarCollapsed));
    },
    
    setSidebarVisible: (state, action: PayloadAction<boolean>) => {
      state.sidebarVisible = action.payload;
    },
    
    // Modal actions
    openModal: (state, action: PayloadAction<keyof UIState['modals']>) => {
      state.modals[action.payload] = true;
    },
    
    closeModal: (state, action: PayloadAction<keyof UIState['modals']>) => {
      state.modals[action.payload] = false;
    },
    
    closeAllModals: (state) => {
      Object.keys(state.modals).forEach((key) => {
        state.modals[key as keyof UIState['modals']] = false;
      });
    },
    
    // Loading actions
    setGlobalLoading: (state, action: PayloadAction<{ loading: boolean; message?: string }>) => {
      state.globalLoading = action.payload.loading;
      state.loadingMessage = action.payload.message || '';
    },
    
    // Notification actions
    addNotification: (state, action: PayloadAction<{
      type: 'success' | 'error' | 'warning' | 'info';
      title: string;
      message: string;
      duration?: number;
    }>) => {
      const notification = {
        id: Date.now().toString(),
        timestamp: Date.now(),
        duration: action.payload.duration || 4000,
        ...action.payload,
      };
      state.notifications.push(notification);
    },
    
    removeNotification: (state, action: PayloadAction<string>) => {
      state.notifications = state.notifications.filter(n => n.id !== action.payload);
    },
    
    clearNotifications: (state) => {
      state.notifications = [];
    },
    
    // Persistent notification actions
    setPersistentNotificationStats: (state, action: PayloadAction<{
      unreadCount: number;
      totalCount: number;
      highPriorityUnread: number;
      recentCount: number;
    }>) => {
      state.persistentNotifications = {
        ...action.payload,
        lastFetched: Date.now(),
      };
    },
    
    updateUnreadCount: (state, action: PayloadAction<number>) => {
      state.persistentNotifications.unreadCount = Math.max(0, action.payload);
    },
    
    decrementUnreadCount: (state, action: PayloadAction<number>) => {
      const decrement = action.payload || 1;
      state.persistentNotifications.unreadCount = Math.max(0, state.persistentNotifications.unreadCount - decrement);
    },
    
    incrementUnreadCount: (state, action: PayloadAction<number>) => {
      const increment = action.payload || 1;
      state.persistentNotifications.unreadCount += increment;
    },
    
    // Breadcrumb actions
    setBreadcrumbs: (state, action: PayloadAction<Array<{ title: string; path?: string }>>) => {
      state.breadcrumbs = action.payload;
    },
    
    addBreadcrumb: (state, action: PayloadAction<{ title: string; path?: string }>) => {
      state.breadcrumbs.push(action.payload);
    },
    
    clearBreadcrumbs: (state) => {
      state.breadcrumbs = [];
    },
    
    // Page actions
    setCurrentPage: (state, action: PayloadAction<{ page: string; title: string }>) => {
      state.currentPage = action.payload.page;
      state.pageTitle = action.payload.title;
      document.title = `${action.payload.title} - AD Reporting App`;
    },
    
    // Table state actions
    setTableState: (state, action: PayloadAction<{
      tableId: string;
      state: Partial<UIState['tableStates'][string]>;
    }>) => {
      const { tableId, state: tableState } = action.payload;
      state.tableStates[tableId] = {
        ...state.tableStates[tableId],
        ...tableState,
      };
    },
    
    clearTableState: (state, action: PayloadAction<string>) => {
      delete state.tableStates[action.payload];
    },
    
    // Confirm dialog actions
    showConfirmDialog: (state, action: PayloadAction<{
      title: string;
      content: string;
      onConfirm?: () => void;
      onCancel?: () => void;
      confirmText?: string;
      cancelText?: string;
      type?: 'info' | 'warning' | 'error';
    }>) => {
      state.confirmDialog = {
        visible: true,
        confirmText: 'OK',
        cancelText: 'Cancel',
        type: 'info',
        ...action.payload,
      };
    },
    
    hideConfirmDialog: (state) => {
      state.confirmDialog.visible = false;
    },
    
    // Tour actions
    startTour: (state) => {
      state.showTour = true;
      state.tourStep = 0;
    },
    
    nextTourStep: (state) => {
      state.tourStep += 1;
    },
    
    prevTourStep: (state) => {
      state.tourStep = Math.max(0, state.tourStep - 1);
    },
    
    endTour: (state) => {
      state.showTour = false;
      state.tourStep = 0;
    },
    
    toggleHelp: (state) => {
      state.showHelp = !state.showHelp;
    },
    
    // Performance tracking
    recordPageLoadTime: (state, action: PayloadAction<number>) => {
      state.performanceMetrics.lastPageLoadTime = action.payload;
    },
    
    recordApiCallTime: (state, action: PayloadAction<number>) => {
      state.performanceMetrics.lastApiCallTime = action.payload;
    },
    
    incrementErrorCount: (state) => {
      state.performanceMetrics.errorCount += 1;
    },
    
    resetErrorCount: (state) => {
      state.performanceMetrics.errorCount = 0;
    },
    
    // Initialize UI state from localStorage
    initializeUI: (state) => {
      try {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
          state.theme = { ...state.theme, ...JSON.parse(savedTheme) };
        }
        
        const savedSidebarState = localStorage.getItem('sidebarCollapsed');
        if (savedSidebarState !== null) {
          state.sidebarCollapsed = JSON.parse(savedSidebarState);
        }
      } catch (error) {
        console.warn('Failed to load UI state from localStorage:', error);
      }
    },
  },
});

export const {
  setTheme,
  toggleDarkMode,
  toggleCompactMode,
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
  setPersistentNotificationStats,
  updateUnreadCount,
  decrementUnreadCount,
  incrementUnreadCount,
  setBreadcrumbs,
  addBreadcrumb,
  clearBreadcrumbs,
  setCurrentPage,
  setTableState,
  clearTableState,
  showConfirmDialog,
  hideConfirmDialog,
  startTour,
  nextTourStep,
  prevTourStep,
  endTour,
  toggleHelp,
  recordPageLoadTime,
  recordApiCallTime,
  incrementErrorCount,
  resetErrorCount,
  initializeUI,
} = uiSlice.actions;

// Selectors
export const selectUI = (state: { ui: UIState }) => state.ui;
export const selectTheme = (state: { ui: UIState }) => state.ui.theme;

// Base selectors for memoization
const selectSidebarCollapsed = (state: { ui: UIState }) => state.ui.sidebarCollapsed;
const selectSidebarVisible = (state: { ui: UIState }) => state.ui.sidebarVisible;
const selectGlobalLoadingFlag = (state: { ui: UIState }) => state.ui.globalLoading;
const selectLoadingMessage = (state: { ui: UIState }) => state.ui.loadingMessage;
const selectCurrentPageValue = (state: { ui: UIState }) => state.ui.currentPage;
const selectPageTitle = (state: { ui: UIState }) => state.ui.pageTitle;

// Memoized selectors
export const selectSidebarState = createSelector(
  [selectSidebarCollapsed, selectSidebarVisible],
  (collapsed, visible) => ({ collapsed, visible })
);

export const selectModals = (state: { ui: UIState }) => state.ui.modals;

export const selectGlobalLoading = createSelector(
  [selectGlobalLoadingFlag, selectLoadingMessage],
  (loading, message) => ({ loading, message })
);

export const selectNotifications = (state: { ui: UIState }) => state.ui.notifications;
export const selectPersistentNotifications = (state: { ui: UIState }) => state.ui.persistentNotifications;
export const selectBreadcrumbs = (state: { ui: UIState }) => state.ui.breadcrumbs;

export const selectCurrentPage = createSelector(
  [selectCurrentPageValue, selectPageTitle],
  (page, title) => ({ page, title })
);
export const selectTableState = (tableId: string) => (state: { ui: UIState }) => 
  state.ui.tableStates[tableId] || {
    pageSize: 20,
    filters: {},
    selectedRows: [],
  };
// Base selectors for tour state
const selectShowTour = (state: { ui: UIState }) => state.ui.showTour;
const selectTourStep = (state: { ui: UIState }) => state.ui.tourStep;
const selectShowHelp = (state: { ui: UIState }) => state.ui.showHelp;

export const selectConfirmDialog = (state: { ui: UIState }) => state.ui.confirmDialog;

export const selectTourState = createSelector(
  [selectShowTour, selectTourStep, selectShowHelp],
  (showTour, tourStep, showHelp) => ({ showTour, tourStep, showHelp })
);

export const selectPerformanceMetrics = (state: { ui: UIState }) => state.ui.performanceMetrics;

export type { UIState };
export default uiSlice.reducer;