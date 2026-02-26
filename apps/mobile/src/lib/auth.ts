/**
 * Auth utilities for SoinFlow Mobile
 */
import * as SecureStore from 'expo-secure-store';
import type { UserPublic, AuthTokens } from '@dhamen/shared';

export async function getUser(): Promise<UserPublic | null> {
  try {
    const userData = await SecureStore.getItemAsync('user');
    if (userData) {
      return JSON.parse(userData);
    }
    return null;
  } catch {
    return null;
  }
}

export async function setUser(user: UserPublic): Promise<void> {
  try {
    await SecureStore.setItemAsync('user', JSON.stringify(user));
  } catch {
    // Ignore storage errors
  }
}

export async function setTokens(tokens: AuthTokens): Promise<void> {
  try {
    await SecureStore.setItemAsync('accessToken', tokens.accessToken);
    await SecureStore.setItemAsync('refreshToken', tokens.refreshToken);
  } catch {
    // Ignore storage errors
  }
}

export async function clearAuth(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    await SecureStore.deleteItemAsync('user');
  } catch {
    // Ignore storage errors
  }
}

export async function isAuthenticated(): Promise<boolean> {
  try {
    const token = await SecureStore.getItemAsync('accessToken');
    return !!token;
  } catch {
    return false;
  }
}
