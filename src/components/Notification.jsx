import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  IoCheckmarkCircle,
  IoAlertCircle,
  IoWarning,
  IoInformation,
  IoClose,
} from 'react-icons/io5';
import { ThemeContext } from '../contexts/ThemeContext.jsx';
import './Notification.css';
import './NotificationAction.css';

export const NotificationContext = createContext();

export const useNotification = () => {
  const context = useContext(NotificationContext);

  /* A clear error beats a silent "cannot read property of undefined". */
  if (!context) {
    throw new Error('useNotification must be used inside <NotificationProvider>.');
  }

  return context;
};

/* Never stack more than this many toasts on screen. */
const MAX_VISIBLE = 4;

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  /* id -> timeout handle, so every timer can be cancelled properly. */
  const timersRef = useRef(new Map());

  const clearTimer = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const removeNotification = useCallback(
    (id) => {
      clearTimer(id);
      setNotifications((prev) => prev.filter((item) => item.id !== id));
    },
    [clearTimer]
  );

  const startTimer = useCallback(
    (id, duration) => {
      clearTimer(id);
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setNotifications((prev) => prev.filter((item) => item.id !== id));
      }, duration);
      timersRef.current.set(id, timer);
    },
    [clearTimer]
  );

  const addNotification = useCallback(
    (type, message, details = null, duration = 4000, action = null) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

      setNotifications((prev) => {
        /* Same type + same message already showing? Refresh it instead
           of stacking a duplicate (double clicks, StrictMode, retries).
           A toast carrying an action is never merged — two deletes each
           need their own Undo, otherwise the second one silently
           replaces the first and one product can never be restored. */
        const duplicate = action
          ? null
          : prev.find((item) => item.type === type && item.message === message);

        if (duplicate) {
          startTimer(duplicate.id, duration);
          return prev;
        }

        const next = [...prev, { id, type, message, details, duration, action }];

        /* Drop the oldest toasts beyond the cap and kill their timers. */
        if (next.length > MAX_VISIBLE) {
          next.slice(0, next.length - MAX_VISIBLE).forEach((item) => clearTimer(item.id));
          return next.slice(-MAX_VISIBLE);
        }

        return next;
      });

      startTimer(id, duration);
      return id;
    },
    [startTimer, clearTimer]
  );

  /* Pause the countdown while the pointer rests on a toast. */
  const pauseNotification = useCallback((id) => clearTimer(id), [clearTimer]);

  const resumeNotification = useCallback(
    (id, duration) => startTimer(id, duration ?? 4000),
    [startTimer]
  );

  /* Cancel every pending timer when the provider unmounts. */
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  /* useMemo keeps the context value stable so consumers do not
     re-render on every provider render. */
  const notify = useMemo(
    () => ({
      success: (msg, duration) => addNotification('success', msg, null, duration),
      error: (msg, details, duration) =>
        addNotification('error', msg, details, duration || 7000),
      warning: (msg, duration) => addNotification('warning', msg, null, duration),
      info: (msg, duration) => addNotification('info', msg, null, duration),

      /* A toast with a single inline action — used for "Deleted · Undo".
         It lives longer than a plain toast because the user has to read
         it and decide before it disappears. */
      action: (msg, { label, onAction, duration = 7000, type = 'info' } = {}) =>
        addNotification(type, msg, null, duration, { label, onAction }),
    }),
    [addNotification]
  );

  const value = useMemo(
    () => ({ notify, removeNotification }),
    [notify, removeNotification]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationContainer
        notifications={notifications}
        removeNotification={removeNotification}
        pauseNotification={pauseNotification}
        resumeNotification={resumeNotification}
      />
    </NotificationContext.Provider>
  );
};

/* ----------------------------------------------------------------
   Single toast
   ---------------------------------------------------------------- */
const NotificationItem = ({
  notification,
  onClose,
  onPause,
  onResume,
  isDarkMode,
}) => {
  const { type, message, details, action } = notification;

  const icons = {
    success: <IoCheckmarkCircle />,
    error: <IoAlertCircle />,
    warning: <IoWarning />,
    info: <IoInformation />,
  };

  const titleMap = {
    success: 'Success!',
    error: 'Error!',
    warning: 'Warning!',
    info: 'Info',
  };

  return (
    <div
      className={`notification-item ${type} ${isDarkMode ? 'dark' : 'light'}`}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onFocus={onPause}
      onBlur={onResume}
    >
      <div className="notification-icon">{icons[type] || icons.info}</div>

      <div className="notification-body">
        <p className="notification-title">{titleMap[type]}</p>
        <p className="notification-message">{message}</p>

        {details && (
          <details className="notification-details">
            <summary>Technical Details</summary>
            <pre>{typeof details === 'string' ? details : JSON.stringify(details, null, 2)}</pre>
          </details>
        )}

        {action && (
          <button
            type="button"
            className="notification-action"
            onClick={() => {
              action.onAction?.();
              /* Close straight away — leaving a spent Undo on screen
                 invites a second click that would undo nothing. */
              onClose();
            }}
          >
            {action.label}
          </button>
        )}
      </div>

      <button className="notification-close" onClick={onClose} aria-label="Dismiss notification">
        <IoClose />
      </button>
    </div>
  );
};

/* ----------------------------------------------------------------
   Toast stack
   ---------------------------------------------------------------- */
const NotificationContainer = ({
  notifications,
  removeNotification,
  pauseNotification,
  resumeNotification,
}) => {
  const themeContext = useContext(ThemeContext);
  const isDarkMode = themeContext?.isDarkMode ?? false;

  if (notifications.length === 0) return null;

  return (
    <div
      className={`notification-container ${isDarkMode ? 'dark' : 'light'}`}
      role="region"
      aria-label="Notifications"
    >
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          isDarkMode={isDarkMode}
          onClose={() => removeNotification(notification.id)}
          onPause={() => pauseNotification(notification.id)}
          onResume={() => resumeNotification(notification.id, notification.duration)}
        />
      ))}
    </div>
  );
};

export default NotificationProvider;
