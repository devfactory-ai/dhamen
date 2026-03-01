/**
 * Main app layout with enhanced bottom tabs
 */
import { useEffect, useRef } from 'react';
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, typography, spacing, shadows } from '@/theme';

interface TabIconProps {
  name: string;
  focused: boolean;
  icon: string;
  activeIcon: string;
}

function TabIcon({ name, focused, icon, activeIcon }: TabIconProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(focused ? 1 : 0.6)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: focused ? 1.1 : 1,
        friction: 5,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: focused ? 1 : 0.6,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, [focused, scaleAnim, opacityAnim]);

  return (
    <View style={styles.tabIconContainer}>
      <Animated.View
        style={[
          styles.iconWrapper,
          focused && styles.iconWrapperActive,
          { transform: [{ scale: scaleAnim }], opacity: opacityAnim },
        ]}
      >
        <Text style={styles.tabIcon}>{focused ? activeIcon : icon}</Text>
      </Animated.View>
      <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>{name}</Text>
      {focused && <View style={styles.activeIndicator} />}
    </View>
  );
}

export default function MainLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarShowLabel: false,
        tabBarBackground: () =>
          Platform.OS === 'ios' ? (
            <BlurView intensity={80} tint="light" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.tabBarBackground]} />
          ),
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="Accueil" focused={focused} icon="🏠" activeIcon="🏡" />
          ),
        }}
      />
      <Tabs.Screen
        name="demandes"
        options={{
          title: 'Demandes',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="Demandes" focused={focused} icon="📋" activeIcon="📝" />
          ),
        }}
      />
      <Tabs.Screen
        name="carte"
        options={{
          title: 'Ma Carte',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="Carte" focused={focused} icon="💳" activeIcon="💎" />
          ),
        }}
      />
      <Tabs.Screen
        name="eligibility"
        options={{
          title: 'Eligibilite',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="Eligibilite" focused={focused} icon="✅" activeIcon="✨" />
          ),
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profil',
          tabBarIcon: ({ focused }) => (
            <TabIcon name="Profil" focused={focused} icon="👤" activeIcon="😊" />
          ),
        }}
      />
      {/* Hidden screens (accessible via navigation) */}
      <Tabs.Screen
        name="notifications"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="praticiens"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="parametres"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="garanties"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="remboursements"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="bulletins"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    height: Platform.OS === 'ios' ? 88 : 70,
    paddingBottom: Platform.OS === 'ios' ? 28 : 8,
    paddingTop: 12,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : colors.background.secondary,
    borderTopWidth: 0,
    ...shadows.lg,
  },
  tabBarBackground: {
    backgroundColor: colors.background.secondary,
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  iconWrapperActive: {
    backgroundColor: `${colors.primary[500]}15`,
  },
  tabIcon: {
    fontSize: 22,
  },
  tabLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
    marginTop: 2,
    fontWeight: typography.fontWeight.medium,
  },
  tabLabelFocused: {
    color: colors.primary[500],
    fontWeight: typography.fontWeight.semibold,
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -8,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary[500],
  },
});
