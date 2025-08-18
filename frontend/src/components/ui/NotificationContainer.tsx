import React, { useEffect } from 'react';
import { notification } from 'antd';
import { useAppSelector, useAppDispatch } from '@/store';
import { removeNotification, selectNotifications } from '@/store/slices/uiSlice';

const NotificationContainer: React.FC = () => {
  const dispatch = useAppDispatch();
  const notifications = useAppSelector(selectNotifications);
  const [api, contextHolder] = notification.useNotification();

  useEffect(() => {
    notifications.forEach((notif) => {
      api[notif.type]({
        message: notif.title,
        description: notif.message,
        duration: notif.duration ? notif.duration / 1000 : 4,
        key: notif.id,
        onClose: () => {
          dispatch(removeNotification(notif.id));
        },
      });
    });

    // Auto-remove notifications after they're shown
    const timeouts = notifications.map((notif) => {
      const duration = notif.duration || 4000;
      return setTimeout(() => {
        dispatch(removeNotification(notif.id));
      }, duration);
    });

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [notifications, api, dispatch]);

  return <>{contextHolder}</>;
};

export default NotificationContainer;