/**
 * Reusable Card Component with multiple variants
 */
import React from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { colors, borderRadius, spacing, shadows } from '@/theme';

type CardVariant = 'elevated' | 'outlined' | 'filled' | 'glass';

interface CardProps {
  children: React.ReactNode;
  variant?: CardVariant;
  onPress?: () => void;
  style?: ViewStyle;
  padding?: keyof typeof spacing;
  borderColor?: string;
}

export function Card({
  children,
  variant = 'elevated',
  onPress,
  style,
  padding = 4,
  borderColor,
}: CardProps) {
  const cardStyles = [
    styles.base,
    styles[variant],
    { padding: spacing[padding] },
    borderColor && { borderColor, borderWidth: 1 },
    style,
  ];

  if (onPress) {
    return (
      <TouchableOpacity
        style={cardStyles}
        onPress={onPress}
        activeOpacity={0.7}
      >
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={cardStyles}>{children}</View>;
}

// Feature Card with icon and accent color
interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  accentColor?: string;
  onPress?: () => void;
  style?: ViewStyle;
}

export function FeatureCard({
  icon,
  title,
  subtitle,
  accentColor = colors.primary[500],
  onPress,
  style,
}: FeatureCardProps) {
  const Container = onPress ? TouchableOpacity : View;

  return (
    <Container
      style={[styles.featureCard, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.featureIconContainer, { backgroundColor: `${accentColor}15` }]}>
        {icon}
      </View>
      <View style={styles.featureContent}>
        <View style={styles.featureTextContent}>
          <View style={[styles.featureAccent, { backgroundColor: accentColor }]} />
          <View>
            <View style={styles.featureTitle}>
              <View style={styles.featureTitleText}>{title}</View>
            </View>
            {subtitle && (
              <View style={styles.featureSubtitle}>{subtitle}</View>
            )}
          </View>
        </View>
      </View>
    </Container>
  );
}

// Stats Card
interface StatsCardProps {
  value: string | number;
  label: string;
  icon?: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
  color?: string;
  onPress?: () => void;
  style?: ViewStyle;
}

export function StatsCard({
  value,
  label,
  icon,
  trend,
  color = colors.primary[500],
  onPress,
  style,
}: StatsCardProps) {
  const Container = onPress ? TouchableOpacity : View;

  return (
    <Container
      style={[styles.statsCard, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      {icon && (
        <View style={[styles.statsIconContainer, { backgroundColor: `${color}15` }]}>
          {icon}
        </View>
      )}
      <View style={[styles.statsValue, { color }]}>{value}</View>
      <View style={styles.statsLabel}>{label}</View>
      {trend && (
        <View style={[styles.statsTrend, trend.isPositive ? styles.trendPositive : styles.trendNegative]}>
          {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
        </View>
      )}
    </Container>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  elevated: {
    backgroundColor: colors.background.secondary,
    ...shadows.md,
  },
  outlined: {
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  filled: {
    backgroundColor: colors.gray[100],
  },
  glass: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    ...shadows.sm,
  },

  // Feature Card
  featureCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    ...shadows.md,
  },
  featureIconContainer: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing[3],
  },
  featureContent: {
    flex: 1,
  },
  featureTextContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureAccent: {
    width: 3,
    height: 32,
    borderRadius: 2,
    marginRight: spacing[3],
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
    marginBottom: 2,
  },
  featureTitleText: {},
  featureSubtitle: {
    fontSize: 13,
    color: colors.text.secondary,
  },

  // Stats Card
  statsCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    padding: spacing[4],
    alignItems: 'center',
    minWidth: 100,
    ...shadows.md,
  },
  statsIconContainer: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  statsValue: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 2,
  },
  statsLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  statsTrend: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: spacing[1],
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  trendPositive: {
    backgroundColor: colors.success.light,
    color: colors.success.dark,
  },
  trendNegative: {
    backgroundColor: colors.error.light,
    color: colors.error.dark,
  },
});
