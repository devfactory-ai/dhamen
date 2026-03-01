/**
 * Reusable Header Component
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { colors, typography, spacing } from '@/theme';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBackPress?: () => void;
  rightAction?: React.ReactNode;
  variant?: 'primary' | 'transparent' | 'light';
  large?: boolean;
}

export function Header({
  title,
  subtitle,
  showBack = false,
  onBackPress,
  rightAction,
  variant = 'primary',
  large = false,
}: HeaderProps) {
  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      router.back();
    }
  };

  const isPrimary = variant === 'primary';
  const isLight = variant === 'light';

  return (
    <>
      <StatusBar
        barStyle={isPrimary ? 'light-content' : 'dark-content'}
        backgroundColor={isPrimary ? colors.primary[500] : 'transparent'}
      />
      <SafeAreaView
        edges={['top']}
        style={[
          styles.safeArea,
          isPrimary && styles.safeAreaPrimary,
          isLight && styles.safeAreaLight,
        ]}
      >
        <View style={[styles.container, large && styles.containerLarge]}>
          <View style={styles.leftSection}>
            {showBack && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={handleBack}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={[styles.backIcon, !isPrimary && styles.backIconDark]}>
                  ←
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.centerSection}>
            <Text
              style={[
                styles.title,
                large && styles.titleLarge,
                !isPrimary && styles.titleDark,
              ]}
              numberOfLines={1}
            >
              {title}
            </Text>
            {subtitle && (
              <Text
                style={[styles.subtitle, !isPrimary && styles.subtitleDark]}
                numberOfLines={1}
              >
                {subtitle}
              </Text>
            )}
          </View>

          <View style={styles.rightSection}>{rightAction}</View>
        </View>
      </SafeAreaView>
    </>
  );
}

// Simple header without SafeAreaView (for nested screens)
export function SimpleHeader({
  title,
  showBack = false,
  onBackPress,
  rightAction,
}: Omit<HeaderProps, 'variant' | 'large' | 'subtitle'>) {
  const handleBack = () => {
    if (onBackPress) {
      onBackPress();
    } else {
      router.back();
    }
  };

  return (
    <View style={styles.simpleContainer}>
      <View style={styles.leftSection}>
        {showBack && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.simpleTitle} numberOfLines={1}>
        {title}
      </Text>

      <View style={styles.rightSection}>{rightAction}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: 'transparent',
  },
  safeAreaPrimary: {
    backgroundColor: colors.primary[500],
  },
  safeAreaLight: {
    backgroundColor: colors.background.secondary,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    minHeight: 56,
  },
  containerLarge: {
    paddingVertical: spacing[5],
    minHeight: 72,
  },
  leftSection: {
    width: 48,
    alignItems: 'flex-start',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
  },
  rightSection: {
    width: 48,
    alignItems: 'flex-end',
  },
  backButton: {
    padding: spacing[1],
  },
  backIcon: {
    fontSize: 24,
    color: colors.text.inverse,
    fontWeight: '600',
  },
  backIconDark: {
    color: colors.text.primary,
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.inverse,
    textAlign: 'center',
  },
  titleLarge: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
  },
  titleDark: {
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.primary[200],
    marginTop: 2,
    textAlign: 'center',
  },
  subtitleDark: {
    color: colors.text.secondary,
  },

  // Simple header
  simpleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[4],
    paddingVertical: spacing[3],
    backgroundColor: colors.primary[500],
    minHeight: 56,
  },
  simpleTitle: {
    flex: 1,
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.inverse,
    textAlign: 'center',
  },
});
