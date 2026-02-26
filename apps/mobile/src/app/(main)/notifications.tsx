/**
 * Notifications Screen for SoinFlow Mobile
 */
import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { usePushNotifications, setBadgeCount } from '@/hooks/usePushNotifications';

interface Notification {
  id: string;
  type: string;
  eventType: string;
  title: string;
  body: string;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ';
  entityType?: string;
  entityId?: string;
  createdAt: string;
}

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const { isEnabled, requestPermission, registerToken } = usePushNotifications();
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);

  // Fetch notifications
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['sante-notifications'],
    queryFn: async () => {
      const response = await apiClient.get<{
        notifications: Notification[];
        meta: { page: number; limit: number; total: number };
      }>('/sante/notifications');
      if (response.success) {
        return response.data;
      }
      return { notifications: [], meta: { page: 1, limit: 20, total: 0 } };
    },
  });

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      await apiClient.post(`/sante/notifications/${notificationId}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sante-notifications'] });
      updateBadge();
    },
  });

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post('/sante/notifications/read-all');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sante-notifications'] });
      setBadgeCount(0);
    },
  });

  // Update badge count
  const updateBadge = useCallback(async () => {
    const response = await apiClient.get<{ unreadCount: number }>('/sante/notifications/count');
    if (response.success) {
      setBadgeCount(response.data?.unreadCount || 0);
    }
  }, []);

  // Check if we need to show permission banner
  useEffect(() => {
    if (!isEnabled) {
      setShowPermissionBanner(true);
    }
  }, [isEnabled]);

  // Handle notification tap
  const handleNotificationPress = (notification: Notification) => {
    // Mark as read
    if (notification.status !== 'READ') {
      markAsReadMutation.mutate(notification.id);
    }

    // Navigate based on entity
    if (notification.entityType === 'DEMANDE' && notification.entityId) {
      router.push(`/(main)/demandes/${notification.entityId}`);
    }
  };

  // Handle enable notifications
  const handleEnableNotifications = async () => {
    const granted = await requestPermission();
    if (granted) {
      await registerToken();
      setShowPermissionBanner(false);
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'A l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    return date.toLocaleDateString('fr-TN');
  };

  // Get icon for notification type
  const getNotificationIcon = (eventType: string) => {
    if (eventType.includes('APPROUVEE')) return '\u2713';
    if (eventType.includes('REJETEE')) return '\u2717';
    if (eventType.includes('PAIEMENT')) return '\u20AC';
    if (eventType.includes('INFO_REQUISE')) return '\u2139';
    return '\u2709';
  };

  // Get color for notification type
  const getNotificationColor = (eventType: string) => {
    if (eventType.includes('APPROUVEE') || eventType.includes('PAIEMENT')) return '#28a745';
    if (eventType.includes('REJETEE')) return '#dc3545';
    if (eventType.includes('INFO_REQUISE')) return '#ffc107';
    return '#1e3a5f';
  };

  const notifications = data?.notifications || [];
  const unreadCount = notifications.filter((n) => n.status !== 'READ').length;

  const renderNotification = ({ item }: { item: Notification }) => {
    const isUnread = item.status !== 'READ';
    const icon = getNotificationIcon(item.eventType);
    const color = getNotificationColor(item.eventType);

    return (
      <TouchableOpacity
        style={[styles.notificationCard, isUnread && styles.unreadCard]}
        onPress={() => handleNotificationPress(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconContainer, { backgroundColor: color }]}>
          <Text style={styles.iconText}>{icon}</Text>
        </View>
        <View style={styles.notificationContent}>
          <Text style={[styles.notificationTitle, isUnread && styles.unreadText]}>
            {item.title}
          </Text>
          <Text style={styles.notificationBody} numberOfLines={2}>
            {item.body}
          </Text>
          <Text style={styles.notificationTime}>{formatDate(item.createdAt)}</Text>
        </View>
        {isUnread && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>&larr;</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {unreadCount > 0 && (
          <TouchableOpacity
            style={styles.markAllButton}
            onPress={() => markAllAsReadMutation.mutate()}
            disabled={markAllAsReadMutation.isPending}
          >
            <Text style={styles.markAllText}>Tout lire</Text>
          </TouchableOpacity>
        )}
      </View>

      {showPermissionBanner && (
        <View style={styles.permissionBanner}>
          <Text style={styles.permissionText}>
            Activez les notifications pour recevoir des alertes sur vos demandes
          </Text>
          <TouchableOpacity
            style={styles.enableButton}
            onPress={handleEnableNotifications}
          >
            <Text style={styles.enableButtonText}>Activer</Text>
          </TouchableOpacity>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1e3a5f" />
        </View>
      ) : (
        <FlatList
          data={notifications}
          renderItem={renderNotification}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              colors={['#1e3a5f']}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🔔</Text>
              <Text style={styles.emptyText}>Aucune notification</Text>
              <Text style={styles.emptySubtext}>
                Vous recevrez des notifications lorsque vos demandes seront traitees
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1e3a5f',
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 24,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  markAllButton: {
    padding: 8,
  },
  markAllText: {
    color: '#a0c4e8',
    fontSize: 14,
  },
  permissionBanner: {
    backgroundColor: '#fff3cd',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#ffc107',
  },
  permissionText: {
    flex: 1,
    color: '#856404',
    fontSize: 14,
  },
  enableButton: {
    backgroundColor: '#1e3a5f',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 4,
    marginLeft: 12,
  },
  enableButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContainer: {
    padding: 16,
    flexGrow: 1,
  },
  notificationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  unreadCard: {
    backgroundColor: '#f0f7ff',
    borderLeftWidth: 3,
    borderLeftColor: '#1e3a5f',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  unreadText: {
    fontWeight: '700',
  },
  notificationBody: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    lineHeight: 20,
  },
  notificationTime: {
    fontSize: 12,
    color: '#999',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#1e3a5f',
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
