/**
 * Settings Screen for SoinFlow Mobile
 */
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { getUser, clearAuth } from '@/lib/auth';
import type { UserPublic } from '@dhamen/shared';

interface Settings {
  notificationsEnabled: boolean;
  biometricEnabled: boolean;
  darkMode: boolean;
  offlineMode: boolean;
  language: 'fr' | 'ar';
}

const DEFAULT_SETTINGS: Settings = {
  notificationsEnabled: true,
  biometricEnabled: false,
  darkMode: false,
  offlineMode: true,
  language: 'fr',
};

export default function ParametresScreen() {
  const [user, setUserState] = useState<UserPublic | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    getUser().then(setUserState);
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const stored = await SecureStore.getItemAsync('app_settings');
      if (stored) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      }
    } catch {
      // Use defaults
    }
  };

  const saveSettings = async (newSettings: Settings) => {
    setSettings(newSettings);
    try {
      await SecureStore.setItemAsync('app_settings', JSON.stringify(newSettings));
    } catch {
      // Ignore
    }
  };

  const toggleSetting = (key: keyof Settings) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    saveSettings(newSettings);
  };

  const handleLogout = useCallback(async () => {
    Alert.alert(
      'Deconnexion',
      'Etes-vous sur de vouloir vous deconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Deconnecter',
          style: 'destructive',
          onPress: async () => {
            await clearAuth();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  }, []);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Supprimer le compte',
      'Cette action est irreversible. Toutes vos donnees seront supprimees.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Confirmation',
              'Veuillez contacter le support pour supprimer votre compte: support@dhamen.tn'
            );
          },
        },
      ]
    );
  }, []);

  const handleContactSupport = () => {
    Linking.openURL('mailto:support@dhamen.tn?subject=Support%20App%20Dhamen');
  };

  const handlePrivacyPolicy = () => {
    Linking.openURL('https://dhamen.tn/politique-confidentialite');
  };

  const handleTerms = () => {
    Linking.openURL('https://dhamen.tn/conditions-utilisation');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>← Retour</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Parametres</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Compte</Text>

          <View style={styles.card}>
            <View style={styles.userInfo}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </Text>
              </View>
              <View>
                <Text style={styles.userName}>
                  {user?.firstName} {user?.lastName}
                </Text>
                <Text style={styles.userEmail}>{user?.email}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>

          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View>
                <Text style={styles.settingLabel}>Notifications push</Text>
                <Text style={styles.settingDescription}>
                  Recevoir les alertes sur votre telephone
                </Text>
              </View>
              <Switch
                value={settings.notificationsEnabled}
                onValueChange={() => toggleSetting('notificationsEnabled')}
                trackColor={{ false: '#ccc', true: '#1e3a5f' }}
              />
            </View>
          </View>
        </View>

        {/* Security Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Securite</Text>

          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View>
                <Text style={styles.settingLabel}>Authentification biometrique</Text>
                <Text style={styles.settingDescription}>
                  Face ID ou empreinte digitale
                </Text>
              </View>
              <Switch
                value={settings.biometricEnabled}
                onValueChange={() => toggleSetting('biometricEnabled')}
                trackColor={{ false: '#ccc', true: '#1e3a5f' }}
              />
            </View>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.settingRowTouchable}>
              <View>
                <Text style={styles.settingLabel}>Changer le mot de passe</Text>
                <Text style={styles.settingDescription}>
                  Mettre a jour votre mot de passe
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Data & Storage Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Donnees et stockage</Text>

          <View style={styles.card}>
            <View style={styles.settingRow}>
              <View>
                <Text style={styles.settingLabel}>Mode hors ligne</Text>
                <Text style={styles.settingDescription}>
                  Sauvegarder les donnees pour acces hors ligne
                </Text>
              </View>
              <Switch
                value={settings.offlineMode}
                onValueChange={() => toggleSetting('offlineMode')}
                trackColor={{ false: '#ccc', true: '#1e3a5f' }}
              />
            </View>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.settingRowTouchable}>
              <View>
                <Text style={styles.settingLabel}>Vider le cache</Text>
                <Text style={styles.settingDescription}>
                  Liberer de l'espace sur votre telephone
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Language Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Langue</Text>

          <View style={styles.card}>
            <TouchableOpacity
              style={styles.settingRowTouchable}
              onPress={() => saveSettings({ ...settings, language: 'fr' })}
            >
              <Text style={styles.settingLabel}>Francais</Text>
              {settings.language === 'fr' && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity
              style={styles.settingRowTouchable}
              onPress={() => saveSettings({ ...settings, language: 'ar' })}
            >
              <Text style={styles.settingLabel}>العربية</Text>
              {settings.language === 'ar' && <Text style={styles.checkmark}>✓</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* Support Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>

          <View style={styles.card}>
            <TouchableOpacity style={styles.settingRowTouchable} onPress={handleContactSupport}>
              <Text style={styles.settingLabel}>Contacter le support</Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.settingRowTouchable} onPress={handlePrivacyPolicy}>
              <Text style={styles.settingLabel}>Politique de confidentialite</Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.settingRowTouchable} onPress={handleTerms}>
              <Text style={styles.settingLabel}>Conditions d'utilisation</Text>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* App Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>A propos</Text>

          <View style={styles.card}>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Version</Text>
              <Text style={styles.settingValue}>1.0.0</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Build</Text>
              <Text style={styles.settingValue}>2025.02.26</Text>
            </View>
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <View style={styles.card}>
            <TouchableOpacity style={styles.dangerButton} onPress={handleLogout}>
              <Text style={styles.dangerButtonText}>Se deconnecter</Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.card, { marginTop: 12 }]}>
            <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteAccount}>
              <Text style={styles.deleteButtonText}>Supprimer mon compte</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Dhamen © 2025</Text>
          <Text style={styles.footerSubtext}>
            Plateforme IA-native de tiers payant sante
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1e3a5f',
  },
  backButton: {
    marginRight: 16,
  },
  backText: {
    color: '#a0c4e8',
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1e3a5f',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#fff',
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  settingRowTouchable: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  settingLabel: {
    fontSize: 16,
    color: '#333',
  },
  settingDescription: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
    maxWidth: 240,
  },
  settingValue: {
    fontSize: 16,
    color: '#666',
  },
  chevron: {
    fontSize: 20,
    color: '#ccc',
  },
  checkmark: {
    fontSize: 18,
    color: '#1e3a5f',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginLeft: 16,
  },
  dangerButton: {
    padding: 16,
    alignItems: 'center',
  },
  dangerButtonText: {
    fontSize: 16,
    color: '#dc3545',
    fontWeight: '500',
  },
  deleteButton: {
    padding: 16,
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 16,
    color: '#dc3545',
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
    padding: 32,
  },
  footerText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  footerSubtext: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
});
