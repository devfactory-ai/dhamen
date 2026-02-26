/**
 * Demandes stack layout
 */
import { Stack } from 'expo-router';

export default function DemandesLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="nouvelle" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
