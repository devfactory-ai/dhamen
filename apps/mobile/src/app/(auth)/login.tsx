/**
 * Login Screen for Dhamen Mobile
 * Enhanced UX with biometric support and better visual design
 */
import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Keyboard,
  ScrollView,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { apiClient } from '@/lib/api-client';
import { setTokens, setUser, getStoredCredentials, storeCredentials } from '@/lib/auth';
import { colors, typography, spacing, borderRadius, shadows } from '@/theme';
import type { UserPublic, AuthTokens } from '@dhamen/shared';

interface LoginResponse {
  requiresMfa: boolean;
  mfaToken?: string;
  tokens?: AuthTokens;
  user?: UserPublic;
  tenantCode?: string | null;
}

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [hasBiometrics, setHasBiometrics] = useState(false);
  const [biometricType, setBiometricType] = useState<'fingerprint' | 'facial' | null>(null);

  // Animations
  const logoScale = useRef(new Animated.Value(1)).current;
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    // Animate form entrance
    Animated.parallel([
      Animated.timing(formOpacity, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(formTranslateY, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();

    // Check biometric availability
    checkBiometrics();
  }, []);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardWillShow', () => {
      Animated.timing(logoScale, {
        toValue: 0.8,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
    const hideSubscription = Keyboard.addListener('keyboardWillHide', () => {
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, [logoScale]);

  const checkBiometrics = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();

    if (compatible && enrolled) {
      setHasBiometrics(true);
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType('facial');
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricType('fingerprint');
      }
    }
  };

  const handleBiometricLogin = async () => {
    try {
      const credentials = await getStoredCredentials();
      if (!credentials) {
        Alert.alert(
          'Biometrie',
          'Veuillez d\'abord vous connecter avec vos identifiants pour activer la connexion biometrique.'
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Connectez-vous avec votre empreinte',
        cancelLabel: 'Annuler',
        fallbackLabel: 'Utiliser le mot de passe',
      });

      if (result.success) {
        setEmail(credentials.email);
        setPassword(credentials.password);
        handleLogin(credentials.email, credentials.password);
      }
    } catch {
      // Biometric auth failed silently
    }
  };

  const handleLogin = async (loginEmail?: string, loginPassword?: string) => {
    const finalEmail = loginEmail || email;
    const finalPassword = loginPassword || password;

    if (!finalEmail || !finalPassword) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.post<LoginResponse>('/auth/login', {
        email: finalEmail,
        password: finalPassword,
      });

      if (response.success && response.data) {
        if (response.data.requiresMfa) {
          router.push({
            pathname: '/(auth)/mfa',
            params: { token: response.data.mfaToken },
          });
        } else if (response.data.tokens && response.data.user) {
          await setTokens(response.data.tokens);
          await setUser(response.data.user);

          // Sync tokens to API client memory cache
          await apiClient.setTokens(
            response.data.tokens.accessToken,
            response.data.tokens.refreshToken,
          );

          // Set tenant code for multi-tenant API routing
          if (response.data.tenantCode) {
            apiClient.setTenantCode(response.data.tenantCode);
            await SecureStore.setItemAsync('tenantCode', response.data.tenantCode);
          }

          // Store credentials for biometric login
          if (hasBiometrics) {
            await storeCredentials(finalEmail, finalPassword);
          }

          router.replace('/(main)/dashboard');
        }
      } else {
        setError(response.error?.message || 'Email ou mot de passe incorrect');
      }
    } catch {
      setError('Erreur de connexion au serveur');
    } finally {
      setIsLoading(false);
    }
  };

  const getBiometricIcon = () => {
    if (biometricType === 'facial') return '👤';
    return '👆';
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo & Brand */}
          <Animated.View style={[styles.logoContainer, { transform: [{ scale: logoScale }] }]}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoIcon}>🏥</Text>
            </View>
            <Text style={styles.brandName}>Dhamen</Text>
            <Text style={styles.brandTagline}>Votre sante, notre priorite</Text>
          </Animated.View>

          {/* Login Form */}
          <Animated.View
            style={[
              styles.formContainer,
              {
                opacity: formOpacity,
                transform: [{ translateY: formTranslateY }],
              },
            ]}
          >
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Connexion</Text>
              <Text style={styles.formSubtitle}>
                Accedez a votre espace sante
              </Text>

              {/* Email Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <View style={[styles.inputContainer, error && styles.inputError]}>
                  <Text style={styles.inputIcon}>📧</Text>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={(text) => {
                      setEmail(text);
                      setError(null);
                    }}
                    placeholder="votre@email.com"
                    placeholderTextColor={colors.text.tertiary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    editable={!isLoading}
                  />
                </View>
              </View>

              {/* Password Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Mot de passe</Text>
                <View style={[styles.inputContainer, error && styles.inputError]}>
                  <Text style={styles.inputIcon}>🔒</Text>
                  <TextInput
                    style={styles.input}
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      setError(null);
                    }}
                    placeholder="Votre mot de passe"
                    placeholderTextColor={colors.text.tertiary}
                    secureTextEntry={!showPassword}
                    autoComplete="password"
                    editable={!isLoading}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(!showPassword)}
                    style={styles.eyeButton}
                  >
                    <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Forgot Password */}
              <TouchableOpacity style={styles.forgotButton}>
                <Text style={styles.forgotText}>Mot de passe oublie?</Text>
              </TouchableOpacity>

              {/* Error Message */}
              {error && (
                <View style={styles.errorContainer}>
                  <Text style={styles.errorIcon}>⚠️</Text>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              {/* Login Button */}
              <TouchableOpacity
                style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
                onPress={() => handleLogin()}
                disabled={isLoading}
                activeOpacity={0.8}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.loginButtonText}>Se connecter</Text>
                )}
              </TouchableOpacity>

              {/* Biometric Login */}
              {hasBiometrics && (
                <View style={styles.biometricSection}>
                  <View style={styles.divider}>
                    <View style={styles.dividerLine} />
                    <Text style={styles.dividerText}>ou</Text>
                    <View style={styles.dividerLine} />
                  </View>

                  <TouchableOpacity
                    style={styles.biometricButton}
                    onPress={handleBiometricLogin}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.biometricIcon}>{getBiometricIcon()}</Text>
                    <Text style={styles.biometricText}>
                      {biometricType === 'facial'
                        ? 'Connexion par Face ID'
                        : 'Connexion par empreinte'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </Animated.View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Securise par</Text>
            <Text style={styles.footerBrand}>Dhamen Assurances</Text>
            <Text style={styles.versionText}>v1.0.0</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary[500],
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing[5],
    paddingTop: spacing[6],
    paddingBottom: spacing[10],
  },

  // Logo
  logoContainer: {
    alignItems: 'center',
    marginBottom: spacing[6],
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[3],
  },
  logoIcon: {
    fontSize: 40,
  },
  brandName: {
    fontSize: typography.fontSize['4xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.inverse,
    letterSpacing: 1,
  },
  brandTagline: {
    fontSize: typography.fontSize.base,
    color: colors.primary[200],
    marginTop: spacing[1],
  },

  // Form
  formContainer: {
    flex: 1,
  },
  formCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius['2xl'],
    padding: spacing[6],
    ...shadows.xl,
  },
  formTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    textAlign: 'center',
  },
  formSubtitle: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    textAlign: 'center',
    marginTop: spacing[1],
    marginBottom: spacing[6],
  },

  // Input
  inputGroup: {
    marginBottom: spacing[4],
  },
  inputLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
    marginBottom: spacing[2],
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray[50],
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.border.light,
    paddingHorizontal: spacing[4],
    minHeight: 56,
  },
  inputError: {
    borderColor: colors.error.main,
    backgroundColor: colors.error.light,
  },
  inputIcon: {
    fontSize: 18,
    marginRight: spacing[3],
  },
  input: {
    flex: 1,
    fontSize: typography.fontSize.md,
    color: colors.text.primary,
    paddingVertical: spacing[4],
  },
  eyeButton: {
    padding: spacing[2],
    marginLeft: spacing[2],
  },
  eyeIcon: {
    fontSize: 18,
  },

  // Forgot Password
  forgotButton: {
    alignSelf: 'flex-end',
    marginBottom: spacing[4],
  },
  forgotText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary[500],
    fontWeight: typography.fontWeight.medium,
  },

  // Error
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.error.light,
    borderRadius: borderRadius.md,
    padding: spacing[3],
    marginBottom: spacing[4],
  },
  errorIcon: {
    fontSize: 16,
    marginRight: spacing[2],
  },
  errorText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.error.dark,
  },

  // Login Button
  loginButton: {
    backgroundColor: colors.primary[500],
    borderRadius: borderRadius.lg,
    paddingVertical: spacing[4],
    alignItems: 'center',
    ...shadows.md,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.inverse,
  },

  // Biometric
  biometricSection: {
    marginTop: spacing[5],
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing[4],
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border.light,
  },
  dividerText: {
    paddingHorizontal: spacing[3],
    fontSize: typography.fontSize.sm,
    color: colors.text.tertiary,
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray[100],
    borderRadius: borderRadius.lg,
    paddingVertical: spacing[4],
    borderWidth: 1,
    borderColor: colors.border.light,
  },
  biometricIcon: {
    fontSize: 24,
    marginRight: spacing[3],
  },
  biometricText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },

  // Footer
  footer: {
    alignItems: 'center',
    marginTop: spacing[8],
  },
  footerText: {
    fontSize: typography.fontSize.xs,
    color: colors.primary[300],
  },
  footerBrand: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[200],
    marginTop: 2,
  },
  versionText: {
    fontSize: typography.fontSize.xs,
    color: colors.primary[400],
    marginTop: spacing[1],
  },
});
