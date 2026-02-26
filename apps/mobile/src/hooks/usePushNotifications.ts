/**
 * Push Notifications Hook
 *
 * Handles push notification permissions, registration, and listeners
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { apiClient } from '@/lib/api-client';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export interface PushNotificationState {
  token: string | null;
  isEnabled: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface UsePushNotificationsReturn extends PushNotificationState {
  requestPermission: () => Promise<boolean>;
  registerToken: () => Promise<boolean>;
  unregisterToken: () => Promise<void>;
}

/**
 * Get push notification token
 */
async function getPushToken(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  try {
    // Get existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Push notification permission not granted');
      return null;
    }

    // Get Expo push token
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    return tokenData.data;
  } catch (error) {
    console.error('Failed to get push token:', error);
    return null;
  }
}

/**
 * Get device name and info
 */
function getDeviceInfo(): { name: string; info: Record<string, unknown> } {
  return {
    name: Device.modelName || Device.deviceName || 'Unknown',
    info: {
      brand: Device.brand,
      manufacturer: Device.manufacturer,
      modelId: Device.modelId,
      osName: Device.osName,
      osVersion: Device.osVersion,
      deviceType: Device.deviceType,
    },
  };
}

/**
 * Hook for managing push notifications
 */
export function usePushNotifications(): UsePushNotificationsReturn {
  const [state, setState] = useState<PushNotificationState>({
    token: null,
    isEnabled: false,
    isLoading: true,
    error: null,
  });

  const notificationListener = useRef<Notifications.EventSubscription>();
  const responseListener = useRef<Notifications.EventSubscription>();

  // Request notification permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      if (!Device.isDevice) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Push notifications require a physical device',
        }));
        return false;
      }

      const { status } = await Notifications.requestPermissionsAsync();
      const granted = status === 'granted';

      setState((prev) => ({
        ...prev,
        isEnabled: granted,
        isLoading: false,
        error: granted ? null : 'Permission refusee',
      }));

      return granted;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: 'Erreur lors de la demande de permission',
      }));
      return false;
    }
  }, []);

  // Register token with backend
  const registerToken = useCallback(async (): Promise<boolean> => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const token = await getPushToken();
      if (!token) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Impossible d\'obtenir le token de notification',
        }));
        return false;
      }

      const { name, info } = getDeviceInfo();
      const platform = Platform.OS as 'ios' | 'android';

      const response = await apiClient.post('/sante/notifications/subscribe', {
        token,
        platform,
        deviceName: name,
        deviceInfo: info,
      });

      if (response.success) {
        setState({
          token,
          isEnabled: true,
          isLoading: false,
          error: null,
        });
        return true;
      }

      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: response.error?.message || 'Erreur d\'inscription',
      }));
      return false;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: 'Erreur lors de l\'inscription aux notifications',
      }));
      return false;
    }
  }, []);

  // Unregister token from backend
  const unregisterToken = useCallback(async (): Promise<void> => {
    if (!state.token) return;

    try {
      await apiClient.post('/sante/notifications/unsubscribe', {
        token: state.token,
      });

      setState((prev) => ({
        ...prev,
        token: null,
        isEnabled: false,
      }));
    } catch (error) {
      console.error('Failed to unregister token:', error);
    }
  }, [state.token]);

  // Initialize on mount
  useEffect(() => {
    let isMounted = true;

    const initializeNotifications = async () => {
      // Check existing permission
      const { status } = await Notifications.getPermissionsAsync();
      const isEnabled = status === 'granted';

      if (isMounted) {
        setState((prev) => ({
          ...prev,
          isEnabled,
          isLoading: false,
        }));
      }

      // If enabled, get token
      if (isEnabled) {
        const token = await getPushToken();
        if (token && isMounted) {
          setState((prev) => ({ ...prev, token }));
        }
      }

      // Set up notification channel for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'SoinFlow',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#1e3a5f',
        });
      }
    };

    initializeNotifications();

    // Handle received notifications
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification.request.content);
    });

    // Handle notification responses (when user taps)
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      console.log('Notification tapped:', data);

      // Navigate based on notification type
      if (data?.eventType) {
        const eventType = data.eventType as string;
        if (eventType.startsWith('SANTE_DEMANDE_') && data.demandeId) {
          router.push(`/(main)/demandes/${data.demandeId}`);
        } else if (eventType === 'SANTE_BORDEREAU_GENERE') {
          // Navigate to notifications or bordereaux
          router.push('/(main)/notifications');
        } else {
          // Default: go to notifications
          router.push('/(main)/notifications');
        }
      }
    });

    return () => {
      isMounted = false;
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  return {
    ...state,
    requestPermission,
    registerToken,
    unregisterToken,
  };
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(): Promise<number> {
  try {
    const response = await apiClient.get<{ unreadCount: number }>('/sante/notifications/count');
    if (response.success) {
      return response.data?.unreadCount || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Set badge count on app icon
 */
export async function setBadgeCount(count: number): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch (error) {
    console.error('Failed to set badge count:', error);
  }
}
