/**
 * Notifications Screen with enhanced design
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Animated,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { usePushNotifications, setBadgeCount } from '@/hooks/usePushNotifications';
import { Skeleton } from '@/components/Skeleton';
import { colors, typography, spacing, borderRadius, shadows } from '@/theme';

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

function NotificationCard({
  notification,
  index,
  onPress,
}: {
  notification: Notification;
  index: number;
  onPress: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(50)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const isUnread = notification.status !== 'READ';

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        delay: index * 60,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        delay: index * 60,
        useNativeDriver: true,
      }),
    ]).start();
  }, [index, slideAnim, opacityAnim]);

  const getNotificationIcon = (eventType: string) => {
    if (eventType.includes('APPROUVEE')) return '✅';
    if (eventType.includes('REJETEE')) return '❌';
    if (eventType.includes('PAIEMENT')) return '💰';
    if (eventType.includes('INFO_REQUISE')) return 'ℹ️';
    if (eventType.includes('REMBOURSEMENT')) return '💳';
    return '🔔';
  };

  const getNotificationColors = (eventType: string) => {
    if (eventType.includes('APPROUVEE') || eventType.includes('PAIEMENT') || eventType.includes('REMBOURSEMENT'))
      return { bg: colors.success[50], color: colors.success[600] };
    if (eventType.includes('REJETEE'))
      return { bg: colors.error[50], color: colors.error[600] };
    if (eventType.includes('INFO_REQUISE'))
      return { bg: colors.warning[50], color: colors.warning[600] };
    return { bg: colors.primary[50], color: colors.primary[600] };
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "A l'instant";
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    if (diffDays < 7) return `Il y a ${diffDays}j`;
    return date.toLocaleDateString('fr-TN');
  };

  const notifColors = getNotificationColors(notification.eventType);

  return (
    <Animated.View
      style={[
        styles.notificationCardContainer,
        {
          transform: [{ translateX: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <TouchableOpacity
        style={[
          styles.notificationCard,
          isUnread && styles.unreadCard,
        ]}
        onPress={onPress}
        activeOpacity={0.7}
      >
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: notifColors.bg },
          ]}
        >
          <Text style={styles.iconText}>
            {getNotificationIcon(notification.eventType)}
          </Text>
        </View>
        <View style={styles.notificationContent}>
          <View style={styles.titleRow}>
            <Text
              style={[styles.notificationTitle, isUnread && styles.unreadText]}
              numberOfLines={1}
            >
              {notification.title}
            </Text>
            {isUnread && <View style={[styles.unreadDot, { backgroundColor: notifColors.color }]} />}
          </View>
          <Text style={styles.notificationBody} numberOfLines={4}>
            {notification.body}
          </Text>
          {notification.eventType.includes('REJETEE') && (
            <Text style={styles.actionHint}>Tapez pour voir les details</Text>
          )}
          <Text style={styles.notificationTime}>
            {formatDate(notification.createdAt)}
          </Text>
        </View>
        <View style={styles.chevronContainer}>
          <Text style={styles.chevron}>›</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

function LoadingSkeleton() {
  return (
    <View style={styles.listContainer}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={styles.skeletonCard}>
          <Skeleton width={48} height={48} borderRadius={24} />
          <View style={styles.skeletonContent}>
            <Skeleton width="70%" height={16} borderRadius={8} />
            <Skeleton width="100%" height={14} borderRadius={6} style={{ marginTop: 8 }} />
            <Skeleton width="30%" height={12} borderRadius={6} style={{ marginTop: 8 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function NotificationsScreen() {
  const queryClient = useQueryClient();
  const { isEnabled, requestPermission, registerToken } = usePushNotifications();
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  // Fetch notifications (poll every 10s for realtime feel)
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
    refetchInterval: 10000,
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
    const response = await apiClient.get<{ unreadCount: number }>(
      '/sante/notifications/count'
    );
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
    if (notification.status !== 'READ') {
      markAsReadMutation.mutate(notification.id);
    }

    if ((notification.entityType === 'DEMANDE' || notification.entityType === 'demande') && notification.entityId) {
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

  const notifications = data?.notifications || [];
  const unreadCount = notifications.filter((n) => n.status !== 'READ').length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <LinearGradient
        colors={[colors.primary[600], colors.primary[700]]}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Notifications</Text>
            {unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>
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
      </LinearGradient>

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* Permission Banner */}
        {showPermissionBanner && (
          <View style={styles.permissionBanner}>
            <View style={styles.permissionIconContainer}>
              <Text style={styles.permissionIcon}>🔔</Text>
            </View>
            <View style={styles.permissionContent}>
              <Text style={styles.permissionTitle}>Restez informé</Text>
              <Text style={styles.permissionText}>
                Activez les notifications pour suivre vos demandes en temps réel
              </Text>
            </View>
            <TouchableOpacity
              style={styles.enableButton}
              onPress={handleEnableNotifications}
            >
              <Text style={styles.enableButtonText}>Activer</Text>
            </TouchableOpacity>
          </View>
        )}

        {isLoading ? (
          <LoadingSkeleton />
        ) : (
          <FlatList
            data={notifications}
            renderItem={({ item, index }) => (
              <NotificationCard
                notification={item}
                index={index}
                onPress={() => handleNotificationPress(item)}
              />
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                colors={[colors.primary[500]]}
                tintColor={colors.primary[500]}
              />
            }
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconContainer}>
                  <Text style={styles.emptyIcon}>🔔</Text>
                </View>
                <Text style={styles.emptyText}>Aucune notification</Text>
                <Text style={styles.emptySubtext}>
                  Vous recevrez des notifications lorsque vos demandes seront
                  traitées
                </Text>
              </View>
            }
          />
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backIcon: {
    color: '#fff',
    fontSize: 20,
    fontWeight: typography.fontWeight.bold,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.md,
  },
  headerTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: '#fff',
  },
  badge: {
    backgroundColor: colors.error[500],
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    marginLeft: spacing.sm,
    minWidth: 24,
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
  },
  markAllButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  markAllText: {
    color: colors.primary[100],
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
  content: {
    flex: 1,
    marginTop: -spacing.lg,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    backgroundColor: colors.background.primary,
    overflow: 'hidden',
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning[50],
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.warning[200],
  },
  permissionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.warning[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  permissionIcon: {
    fontSize: 20,
  },
  permissionContent: {
    flex: 1,
  },
  permissionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.warning[800],
    marginBottom: 2,
  },
  permissionText: {
    fontSize: typography.fontSize.xs,
    color: colors.warning[700],
  },
  enableButton: {
    backgroundColor: colors.primary[500],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg,
    marginLeft: spacing.sm,
  },
  enableButtonText: {
    color: '#fff',
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  listContainer: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  notificationCardContainer: {
    marginBottom: spacing.md,
  },
  notificationCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    ...shadows.sm,
  },
  unreadCard: {
    backgroundColor: colors.primary[50],
    borderLeftWidth: 3,
    borderLeftColor: colors.primary[500],
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  iconText: {
    fontSize: 20,
  },
  notificationContent: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  notificationTitle: {
    flex: 1,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  unreadText: {
    fontWeight: typography.fontWeight.bold,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: spacing.sm,
  },
  notificationBody: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: 20,
    marginBottom: spacing.xs,
  },
  actionHint: {
    fontSize: typography.fontSize.xs,
    color: colors.primary[600],
    fontWeight: '500' as const,
    marginTop: 4,
  },
  notificationTime: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  chevronContainer: {
    justifyContent: 'center',
    paddingLeft: spacing.sm,
  },
  chevron: {
    fontSize: 24,
    color: colors.text.tertiary,
  },
  skeletonCard: {
    flexDirection: 'row',
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  skeletonContent: {
    flex: 1,
    marginLeft: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
    paddingHorizontal: spacing.xl,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.neutral[100],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyIcon: {
    fontSize: 36,
    opacity: 0.5,
  },
  emptyText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});
