/**
 * Entry point - redirects to login or dashboard
 */
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { isAuthenticated } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';

export default function IndexScreen() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const authenticated = await isAuthenticated();
      if (authenticated) {
        // Restore tenant code for API routing
        const tenantCode = await SecureStore.getItemAsync('tenantCode');
        if (tenantCode) {
          apiClient.setTenantCode(tenantCode);
        }
        router.replace('/(main)/dashboard');
      } else {
        router.replace('/(auth)/login');
      }
      setLoading(false);
    }
    checkAuth();
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e3a5f',
  },
});
