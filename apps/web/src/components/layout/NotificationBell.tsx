/**
 * NotificationBell Component
 *
 * Displays notification count and dropdown with recent notifications
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { apiClient } from '@/lib/api-client';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

interface Notification {
  id: string;
  type: 'EMAIL' | 'SMS' | 'PUSH' | 'IN_APP';
  eventType: string;
  title: string;
  body: string;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'READ';
  createdAt: string;
  entityType?: string;
  entityId?: string;
}

interface NotificationsResponse {
  notifications: Notification[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
}

const EVENT_TYPE_ICONS: Record<string, string> = {
  CLAIM_CREATED: '📋',
  CLAIM_APPROVED: '✅',
  CLAIM_REJECTED: '❌',
  BORDEREAU_READY: '📄',
  BORDEREAU_PAID: '💰',
  RECONCILIATION_MISMATCH: '⚠️',
  FRAUD_DETECTED: '🚨',
  SYSTEM_MAINTENANCE: '🔧',
};

export function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  // Fetch unread count
  const { data: countData } = useQuery({
    queryKey: ['notifications', 'count'],
    queryFn: async () => {
      const response = await apiClient.get<{ unreadCount: number }>('/notifications/count');
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    refetchInterval: 30000, // Poll every 30 seconds
  });

  // Fetch recent notifications
  const { data: notificationsData, isLoading } = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: async () => {
      const response = await apiClient.get<NotificationsResponse>('/notifications', {
        params: { limit: 10, unreadOnly: false },
      });
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: isOpen,
  });

  // Mark as read mutation
  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await apiClient.post(`/notifications/${notificationId}/read`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // Mark all as read mutation
  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.post('/notifications/read-all');
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const unreadCount = countData?.unreadCount || 0;
  const notifications = notificationsData?.notifications || [];

  const handleNotificationClick = (notification: Notification) => {
    if (notification.status !== 'READ') {
      markAsReadMutation.mutate(notification.id);
    }
    // TODO: Navigate to related entity if entityType and entityId exist
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between border-b p-3">
          <h4 className="font-semibold">Notifications</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
            >
              {markAllAsReadMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCheck className="mr-1 h-4 w-4" />
              )}
              Tout lire
            </Button>
          )}
        </div>

        <ScrollArea className="h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Bell className="h-10 w-10 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Aucune notification</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`w-full p-3 text-left hover:bg-muted/50 transition-colors ${
                    notification.status !== 'READ' ? 'bg-muted/30' : ''
                  }`}
                >
                  <div className="flex gap-3">
                    <span className="text-lg flex-shrink-0">
                      {EVENT_TYPE_ICONS[notification.eventType] || '📌'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-medium truncate ${
                          notification.status !== 'READ' ? 'text-foreground' : 'text-muted-foreground'
                        }`}>
                          {notification.title}
                        </p>
                        {notification.status !== 'READ' && (
                          <span className="h-2 w-2 bg-primary rounded-full flex-shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {notification.body}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(notification.createdAt), {
                          addSuffix: true,
                          locale: fr,
                        })}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        {notifications.length > 0 && (
          <div className="border-t p-2">
            <Button variant="ghost" className="w-full" size="sm" asChild>
              <a href="/settings">Voir toutes les notifications</a>
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
