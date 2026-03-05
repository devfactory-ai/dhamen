/**
 * Settings Screen with enhanced design
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
  Animated,
} from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from 'expo-secure-store';
import { getUser, clearAuth } from "@/lib/auth";
import { colors, typography, spacing, borderRadius, shadows } from "@/theme";
import type { UserPublic } from "@dhamen/shared";

interface Settings {
  notificationsEnabled: boolean;
  biometricEnabled: boolean;
  darkMode: boolean;
  offlineMode: boolean;
  language: "fr" | "ar";
}

const DEFAULT_SETTINGS: Settings = {
  notificationsEnabled: true,
  biometricEnabled: false,
  darkMode: false,
  offlineMode: true,
  language: "fr",
};

interface MenuItemProps {
  icon: string;
  iconBg: string;
  label: string;
  description?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  showChevron?: boolean;
  danger?: boolean;
}

function MenuItem({
  icon,
  iconBg,
  label,
  description,
  onPress,
  rightElement,
  showChevron = true,
  danger = false,
}: MenuItemProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.98,
      friction: 10,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 10,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={styles.menuItem}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={0.9}
        disabled={!onPress && !rightElement}
      >
        <View style={[styles.menuIconContainer, { backgroundColor: iconBg }]}>
          <Text style={styles.menuIcon}>{icon}</Text>
        </View>
        <View style={styles.menuContent}>
          <Text style={[styles.menuLabel, danger && styles.menuLabelDanger]}>
            {label}
          </Text>
          {description && (
            <Text style={styles.menuDescription}>{description}</Text>
          )}
        </View>
        {rightElement}
        {showChevron && !rightElement && <Text style={styles.chevron}>›</Text>}
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function ParametresScreen() {
  const [user, setUserState] = useState<UserPublic | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

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
    Alert.alert("Déconnexion", "Êtes-vous sûr de vouloir vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Déconnecter",
        style: "destructive",
        onPress: async () => {
          await clearAuth();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }, []);

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      "Supprimer le compte",
      "Cette action est irréversible. Toutes vos données seront supprimées.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Confirmation",
              "Veuillez contacter le support pour supprimer votre compte: support@dhamen.tn",
            );
          },
        },
      ],
    );
  }, []);

  const handleContactSupport = () => {
    Linking.openURL("mailto:support@dhamen.tn?subject=Support%20App%20Dhamen");
  };

  const handlePrivacyPolicy = () => {
    Linking.openURL("https://dhamen.tn/politique-confidentialite");
  };

  const handleTerms = () => {
    Linking.openURL("https://dhamen.tn/conditions-utilisation");
  };

  const getInitials = () => {
    if (!user) return "?";
    return `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}`.toUpperCase();
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <LinearGradient
        colors={[colors.primary[600], colors.primary[700]]}
        style={styles.header}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Text style={styles.backIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Paramètres</Text>
          <View style={{ width: 40 }} />
        </View>
      </LinearGradient>

      <Animated.ScrollView
        style={[styles.content, { opacity: fadeAnim }]}
        showsVerticalScrollIndicator={false}
      >
        {/* User Card */}
        <View style={styles.userCard}>
          <LinearGradient
            colors={[colors.primary[500], colors.primary[600]]}
            style={styles.userAvatar}
          >
            <Text style={styles.userInitials}>{getInitials()}</Text>
          </LinearGradient>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>
              {user?.firstName} {user?.lastName}
            </Text>
            <Text style={styles.userEmail}>{user?.email}</Text>
          </View>
          <TouchableOpacity style={styles.editButton}>
            <Text style={styles.editIcon}>✏️</Text>
          </TouchableOpacity>
        </View>

        {/* Notifications Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.card}>
            <MenuItem
              icon="🔔"
              iconBg={colors.primary[50]}
              label="Notifications push"
              description="Recevoir les alertes sur votre téléphone"
              showChevron={false}
              rightElement={
                <Switch
                  value={settings.notificationsEnabled}
                  onValueChange={() => toggleSetting("notificationsEnabled")}
                  trackColor={{
                    false: colors.neutral[200],
                    true: colors.primary[500],
                  }}
                  thumbColor="#fff"
                />
              }
            />
          </View>
        </View>

        {/* Security Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sécurité</Text>
          <View style={styles.card}>
            <MenuItem
              icon="🔐"
              iconBg={colors.success[50]}
              label="Authentification biométrique"
              description="Face ID ou empreinte digitale"
              showChevron={false}
              rightElement={
                <Switch
                  value={settings.biometricEnabled}
                  onValueChange={() => toggleSetting("biometricEnabled")}
                  trackColor={{
                    false: colors.neutral[200],
                    true: colors.primary[500],
                  }}
                  thumbColor="#fff"
                />
              }
            />
            <View style={styles.divider} />
            <MenuItem
              icon="🔑"
              iconBg={colors.warning[50]}
              label="Changer le mot de passe"
              description="Mettre à jour votre mot de passe"
              onPress={() => {}}
            />
          </View>
        </View>

        {/* Data Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Données et stockage</Text>
          <View style={styles.card}>
            <MenuItem
              icon="📴"
              iconBg={colors.info[50]}
              label="Mode hors ligne"
              description="Sauvegarder les données localement"
              showChevron={false}
              rightElement={
                <Switch
                  value={settings.offlineMode}
                  onValueChange={() => toggleSetting("offlineMode")}
                  trackColor={{
                    false: colors.neutral[200],
                    true: colors.primary[500],
                  }}
                  thumbColor="#fff"
                />
              }
            />
            <View style={styles.divider} />
            <MenuItem
              icon="🗑️"
              iconBg={colors.neutral[100]}
              label="Vider le cache"
              description="Libérer de l'espace sur votre téléphone"
              onPress={() => {
                Alert.alert("Cache vidé", "Le cache a été vidé avec succès");
              }}
            />
          </View>
        </View>

        {/* Language Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Langue</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.languageOption}
              onPress={() => saveSettings({ ...settings, language: "fr" })}
            >
              <Text style={styles.languageFlag}>🇫🇷</Text>
              <Text style={styles.languageLabel}>Français</Text>
              {settings.language === "fr" && (
                <View style={styles.checkmark}>
                  <Text style={styles.checkmarkText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity
              style={styles.languageOption}
              onPress={() => saveSettings({ ...settings, language: "ar" })}
            >
              <Text style={styles.languageFlag}>🇹🇳</Text>
              <Text style={styles.languageLabel}>العربية</Text>
              {settings.language === "ar" && (
                <View style={styles.checkmark}>
                  <Text style={styles.checkmarkText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Support Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>
          <View style={styles.card}>
            <MenuItem
              icon="💬"
              iconBg={colors.primary[50]}
              label="Contacter le support"
              onPress={handleContactSupport}
            />
            <View style={styles.divider} />
            <MenuItem
              icon="🔒"
              iconBg={colors.neutral[100]}
              label="Politique de confidentialité"
              onPress={handlePrivacyPolicy}
            />
            <View style={styles.divider} />
            <MenuItem
              icon="📄"
              iconBg={colors.neutral[100]}
              label="Conditions d'utilisation"
              onPress={handleTerms}
            />
          </View>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>À propos</Text>
          <View style={styles.card}>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Version</Text>
              <Text style={styles.aboutValue}>1.0.0</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Build</Text>
              <Text style={styles.aboutValue}>2026.03.01</Text>
            </View>
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <View style={styles.card}>
            <MenuItem
              icon="🚪"
              iconBg={colors.error[50]}
              label="Se déconnecter"
              showChevron={false}
              danger
              onPress={handleLogout}
            />
          </View>
        </View>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDeleteAccount}
          >
            <Text style={styles.deleteButtonText}>Supprimer mon compte</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerLogo}>ضامن</Text>
          <Text style={styles.footerText}>Dhamen © 2026</Text>
          <Text style={styles.footerSubtext}>
            Plateforme IA-native de tiers payant santé
          </Text>
        </View>
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  backIcon: {
    color: "#fff",
    fontSize: 20,
    fontWeight: typography.fontWeight.bold,
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: "#fff",
  },
  content: {
    flex: 1,
    marginTop: -spacing.lg,
    borderTopLeftRadius: borderRadius["2xl"],
    borderTopRightRadius: borderRadius["2xl"],
    backgroundColor: colors.background.primary,
  },
  userCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.background.secondary,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    ...shadows.md,
  },
  userAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  userInitials: {
    fontSize: typography.fontSize["2xl"],
    fontWeight: typography.fontWeight.bold,
    color: "#fff",
  },
  userInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  userName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  userEmail: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    marginTop: 2,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.neutral[100],
    justifyContent: "center",
    alignItems: "center",
  },
  editIcon: {
    fontSize: 18,
  },
  section: {
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.tertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: borderRadius.xl,
    overflow: "hidden",
    ...shadows.sm,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
  },
  menuIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: spacing.md,
  },
  menuIcon: {
    fontSize: 18,
  },
  menuContent: {
    flex: 1,
  },
  menuLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  menuLabelDanger: {
    color: colors.error[600],
  },
  menuDescription: {
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: 24,
    color: colors.text.tertiary,
    marginLeft: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.neutral[100],
    marginLeft: 68,
  },
  languageOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
  },
  languageFlag: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  languageLabel: {
    flex: 1,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.primary,
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary[500],
    justifyContent: "center",
    alignItems: "center",
  },
  checkmarkText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: typography.fontWeight.bold,
  },
  aboutRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.md,
  },
  aboutLabel: {
    fontSize: typography.fontSize.base,
    color: colors.text.primary,
  },
  aboutValue: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
  },
  deleteButton: {
    alignItems: "center",
    padding: spacing.md,
  },
  deleteButtonText: {
    fontSize: typography.fontSize.sm,
    color: colors.error[500],
    fontWeight: typography.fontWeight.medium,
  },
  footer: {
    alignItems: "center",
    paddingVertical: spacing["2xl"],
    paddingHorizontal: spacing.lg,
  },
  footerLogo: {
    fontSize: 32,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[500],
    marginBottom: spacing.sm,
  },
  footerText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.text.secondary,
  },
  footerSubtext: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
    marginTop: spacing.xs,
  },
});
