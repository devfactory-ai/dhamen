/**
 * Main app layout with bottom tabs
 */
import { Tabs } from 'expo-router';
import { View, Text, StyleSheet } from 'react-native';

function TabIcon({ name, focused, icon }: { name: string; focused: boolean; icon: string }) {
  return (
    <View style={styles.tabIconContainer}>
      <Text style={[styles.tabIcon, focused && styles.tabIconFocused]}>{icon}</Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>{name}</Text>
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
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ focused }) => <TabIcon name="Accueil" focused={focused} icon="🏠" />,
        }}
      />
      <Tabs.Screen
        name="demandes"
        options={{
          title: 'Demandes',
          tabBarIcon: ({ focused }) => <TabIcon name="Demandes" focused={focused} icon="📋" />,
        }}
      />
      <Tabs.Screen
        name="carte"
        options={{
          title: 'Ma Carte',
          tabBarIcon: ({ focused }) => <TabIcon name="Carte" focused={focused} icon="💳" />,
        }}
      />
      <Tabs.Screen
        name="eligibility"
        options={{
          title: 'Eligibilite',
          tabBarIcon: ({ focused }) => <TabIcon name="Eligibilite" focused={focused} icon="✅" />,
        }}
      />
      <Tabs.Screen
        name="profil"
        options={{
          title: 'Profil',
          tabBarIcon: ({ focused }) => <TabIcon name="Profil" focused={focused} icon="👤" />,
        }}
      />
      {/* Hidden screens (accessible via navigation) */}
      <Tabs.Screen
        name="notifications"
        options={{
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="praticiens"
        options={{
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="parametres"
        options={{
          href: null, // Hide from tab bar
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 70,
    paddingBottom: 8,
    paddingTop: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  tabIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIcon: {
    fontSize: 22,
    marginBottom: 2,
    opacity: 0.5,
  },
  tabIconFocused: {
    opacity: 1,
  },
  tabLabel: {
    fontSize: 10,
    color: '#666',
  },
  tabLabelFocused: {
    color: '#1e3a5f',
    fontWeight: '600',
  },
});
