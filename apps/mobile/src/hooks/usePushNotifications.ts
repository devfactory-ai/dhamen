/**
 * Push Notifications Hook
 *
 * Handles push notification permissions, registration, and listeners.
 * Gracefully degrades in Expo Go where remote notifications are unavailable.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { apiClient } from '@/lib/api-client';

// In Expo Go SDK 53+, expo-notifications require() itself throws.
// Only load in development builds (not Expo Go).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Notifications: any = null;
let isExpoGo = true;
try {
  const Constants = require('expo-constants').default;
  isExpoGo = Constants.appOwnership === 'expo';
} catch {
  // assume Expo Go if we can't check
}

if (!isExpoGo) {
  try {
    Notifications = require('expo-notifications');
    Notifications?.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    console.warn('expo-notifications not available');
  }
}

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
  if (!Notifications || !Device.isDevice) {
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    // Remote push tokens are not available in Expo Go SDK 53+
    if (isExpoGo) {
      console.warn('Push notifications: Remote push not available in Expo Go, use a development build');
      return null;
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId || projectId === 'dhamen-local-dev') {
      console.warn('Push notifications: No valid EAS projectId configured, skipping token registration');
      return null;
    }
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    return tokenData.data;
  } catch (error) {
    console.warn('Failed to get push token:', error);
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
    isLoading: false,
    error: Notifications ? null : 'Notifications non disponibles dans Expo Go',
  });

  const notificationListener = useRef<{ remove(): void }>();
  const responseListener = useRef<{ remove(): void }>();

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!Notifications) return false;
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
    } catch {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: 'Erreur lors de la demande de permission',
      }));
      return false;
    }
  }, []);

  const registerToken = useCallback(async (): Promise<boolean> => {
    if (!Notifications) return false;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const token = await getPushToken();
      if (!token) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: "Impossible d'obtenir le token de notification",
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
        setState({ token, isEnabled: true, isLoading: false, error: null });
        return true;
      }

      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: response.error?.message || "Erreur d'inscription",
      }));
      return false;
    } catch {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "Erreur lors de l'inscription aux notifications",
      }));
      return false;
    }
  }, []);

  const unregisterToken = useCallback(async (): Promise<void> => {
    if (!state.token) return;

    try {
      await apiClient.post('/sante/notifications/unsubscribe', {
        token: state.token,
      });

      setState((prev) => ({ ...prev, token: null, isEnabled: false }));
    } catch (error) {
      console.error('Failed to unregister token:', error);
    }
  }, [state.token]);

  useEffect(() => {
    if (!Notifications) return;

    let isMounted = true;

    const initializeNotifications = async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        const isEnabled = status === 'granted';

        if (isMounted) {
          setState((prev) => ({ ...prev, isEnabled, isLoading: false }));
        }

        if (isEnabled) {
          const token = await getPushToken();
          if (token && isMounted) {
            setState((prev) => ({ ...prev, token }));
          }
        }

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'SoinFlow',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#1e3a5f',
          });
        }
      } catch {
        // Notifications not available
      }
    };

    initializeNotifications();

    try {
      notificationListener.current = Notifications.addNotificationReceivedListener(
        (notification) => {
          console.log('Notification received:', notification.request.content);
        }
      );

      responseListener.current = Notifications.addNotificationResponseReceivedListener(
        (response) => {
          const data = response.notification.request.content.data;
          if (data?.eventType) {
            const eventType = data.eventType as string;
            if (eventType.startsWith('SANTE_DEMANDE_') && data.demandeId) {
              router.push(`/(main)/demandes/${data.demandeId}`);
            } else {
              router.push('/(main)/notifications');
            }
          }
        }
      );
    } catch {
      // Listeners not available
    }

    return () => {
      isMounted = false;
      notificationListener.current?.remove();
      responseListener.current?.remove();
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
  if (!Notifications) return;
  try {
    await Notifications.setBadgeCountAsync(count);
  } catch {
    // Not available
  }
}
