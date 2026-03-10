/**
 * Main app layout with modern bottom tab bar
 */
import { useEffect, useRef } from 'react';
import { Tabs } from 'expo-router';
import { View, StyleSheet, Animated, Platform, Dimensions, Text } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TAB_COUNT = 5;
const TAB_WIDTH = SCREEN_WIDTH / TAB_COUNT;

interface TabIconProps {
  label: string;
  focused: boolean;
  iconName: keyof typeof Ionicons.glyphMap;
  activeIconName: keyof typeof Ionicons.glyphMap;
}

function TabIcon({ label, focused, iconName, activeIconName }: TabIconProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: focused ? 1.08 : 1,
      friction: 7,
      tension: 100,
      useNativeDriver: true,
    }).start();
  }, [focused, scaleAnim]);

  return (
    <View style={styles.tabIconContainer}>
      <Animated.View
        style={[
          styles.iconPill,
          focused && styles.iconPillActive,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <Ionicons
          name={focused ? activeIconName : iconName}
          size={22}
          color={focused ? colors.primary[500] : colors.text.tertiary}
        />
      </Animated.View>
      <Text
        style={[styles.tabLabel, focused && styles.tabLabelActive]}
        numberOfLines={1}
      >
        {label}
      </Text>
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
            <BlurView intensity={90} tint="systemChromeMaterialLight" style={StyleSheet.absoluteFill} />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.tabBarBg]} />
          ),
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              label="Accueil"
              focused={focused}
              iconName="home-outline"
              activeIconName="home"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="demandes"
        options={{
          title: 'Demandes',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              label="Demandes"
              focused={focused}
              iconName="document-text-outline"
              activeIconName="document-text"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="carte"
        options={{
          title: 'Ma Carte',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              label="Carte"
              focused={focused}
              iconName="card-outline"
              activeIconName="card"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="eligibility"
        options={{
          title: 'Eligibilite',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              label="Eligibilite"
              focused={focused}
              iconName="shield-checkmark-outline"
              activeIconName="shield-checkmark"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profil',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              label="Profil"
              focused={focused}
              iconName="person-outline"
              activeIconName="person"
            />
          ),
        }}
      />
      {/* Hidden screens (accessible via navigation) */}
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="praticiens" options={{ href: null }} />
      <Tabs.Screen name="parametres" options={{ href: null }} />
      <Tabs.Screen name="garanties" options={{ href: null }} />
      <Tabs.Screen name="remboursements" options={{ href: null }} />
      <Tabs.Screen name="bulletins" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute',
    height: Platform.OS === 'ios' ? 85 : 64,
    paddingBottom: Platform.OS === 'ios' ? 24 : 6,
    paddingTop: 6,
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : '#ffffff',
    borderTopWidth: 0,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
  },
  tabBarBg: {
    backgroundColor: '#ffffff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: TAB_WIDTH,
    paddingTop: 2,
  },
  iconPill: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 48,
    height: 32,
    borderRadius: 16,
  },
  iconPillActive: {
    backgroundColor: `${colors.primary[500]}12`,
  },
  tabLabel: {
    fontSize: 10,
    color: colors.text.tertiary,
    marginTop: 3,
    fontWeight: typography.fontWeight.medium,
    letterSpacing: 0.1,
  },
  tabLabelActive: {
    color: colors.primary[500],
    fontWeight: typography.fontWeight.semibold,
  },
});
