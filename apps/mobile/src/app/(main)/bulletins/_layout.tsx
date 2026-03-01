/**
 * Bulletins nested navigation layout
 */
import { Stack } from 'expo-router';

export default function BulletinsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
