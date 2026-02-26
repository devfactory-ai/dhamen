/**
 * Main app stack layout
 */
import { Stack } from 'expo-router';

export default function MainLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="demandes" />
      <Stack.Screen name="profil" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="praticiens" />
    </Stack>
  );
}
