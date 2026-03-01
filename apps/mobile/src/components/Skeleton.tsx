/**
 * Skeleton Loading Components
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Animated,
  type ViewStyle,
  Dimensions,
} from 'react-native';
import { colors, borderRadius, spacing } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius: radius = borderRadius.md,
  style,
}: SkeletonProps) {
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    );
    animation.start();
    return () => animation.stop();
  }, [shimmerAnim]);

  const translateX = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-SCREEN_WIDTH, SCREEN_WIDTH],
  });

  return (
    <View
      style={[
        styles.skeleton,
        { width, height, borderRadius: radius },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.shimmer,
          { transform: [{ translateX }] },
        ]}
      />
    </View>
  );
}

// Card Skeleton
export function SkeletonCard({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.card, style]}>
      <View style={styles.cardHeader}>
        <Skeleton width={48} height={48} borderRadius={borderRadius.lg} />
        <View style={styles.cardHeaderText}>
          <Skeleton width="60%" height={16} style={styles.mb2} />
          <Skeleton width="40%" height={12} />
        </View>
      </View>
      <Skeleton width="100%" height={12} style={styles.mt3} />
      <Skeleton width="80%" height={12} style={styles.mt2} />
    </View>
  );
}

// List Item Skeleton
export function SkeletonListItem({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.listItem, style]}>
      <Skeleton width={44} height={44} borderRadius={borderRadius.full} />
      <View style={styles.listItemContent}>
        <Skeleton width="70%" height={14} style={styles.mb2} />
        <Skeleton width="50%" height={12} />
      </View>
      <Skeleton width={60} height={24} borderRadius={borderRadius.md} />
    </View>
  );
}

// Stats Card Skeleton
export function SkeletonStats({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.statsCard, style]}>
      <Skeleton width={40} height={40} borderRadius={borderRadius.lg} style={styles.mb2} />
      <Skeleton width={60} height={24} style={styles.mb1} />
      <Skeleton width={50} height={12} />
    </View>
  );
}

// Full Screen Skeleton for Dashboard
export function DashboardSkeleton() {
  return (
    <View style={styles.dashboardContainer}>
      {/* Header */}
      <View style={styles.dashboardHeader}>
        <View>
          <Skeleton width={80} height={14} style={styles.mb2} />
          <Skeleton width={150} height={20} />
        </View>
        <Skeleton width={44} height={44} borderRadius={borderRadius.full} />
      </View>

      {/* Stats Row */}
      <View style={styles.statsRow}>
        <SkeletonStats style={styles.statItem} />
        <SkeletonStats style={styles.statItem} />
        <SkeletonStats style={styles.statItem} />
      </View>

      {/* Feature Card */}
      <SkeletonCard style={styles.mt4} />

      {/* Action Cards */}
      <View style={styles.actionRow}>
        <View style={styles.actionCard}>
          <Skeleton width={40} height={40} borderRadius={borderRadius.lg} style={styles.mb2} />
          <Skeleton width="80%" height={14} style={styles.mb1} />
          <Skeleton width="60%" height={12} />
        </View>
        <View style={styles.actionCard}>
          <Skeleton width={40} height={40} borderRadius={borderRadius.lg} style={styles.mb2} />
          <Skeleton width="80%" height={14} style={styles.mb1} />
          <Skeleton width="60%" height={12} />
        </View>
      </View>

      {/* List */}
      <Skeleton width={120} height={16} style={[styles.mt4, styles.mb3]} />
      <SkeletonListItem />
      <SkeletonListItem style={styles.mt2} />
      <SkeletonListItem style={styles.mt2} />
    </View>
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.gray[200],
    overflow: 'hidden',
  },
  shimmer: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.gray[100],
    opacity: 0.5,
  },

  // Card
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardHeaderText: {
    flex: 1,
    marginLeft: spacing[3],
  },

  // List Item
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.lg,
    padding: spacing[3],
  },
  listItemContent: {
    flex: 1,
    marginLeft: spacing[3],
  },

  // Stats
  statsCard: {
    flex: 1,
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing[3],
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing[2],
  },
  statItem: {
    flex: 1,
  },

  // Dashboard
  dashboardContainer: {
    flex: 1,
    padding: spacing[4],
    backgroundColor: colors.background.primary,
  },
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing[5],
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
  },
  actionCard: {
    flex: 1,
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    alignItems: 'center',
  },

  // Utility
  mb1: { marginBottom: spacing[1] },
  mb2: { marginBottom: spacing[2] },
  mb3: { marginBottom: spacing[3] },
  mt2: { marginTop: spacing[2] },
  mt3: { marginTop: spacing[3] },
  mt4: { marginTop: spacing[4] },
});
