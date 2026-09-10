import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useUserStore, VesselType, RiskTolerance, UserRole } from '../store/userStore';
import { INDIAN_PORTS, INDIAN_LANGUAGES } from '../constants/portsAndLanguages';
import { profileAPI } from '../services/api';
import {
  downloadOfflineBundle,
  getBundleMeta,
  clearOfflineBundle,
  BundleMeta,
} from '../services/offlineService';

export function ProfileScreen() {
  const {
    deviceId,
    vesselType,
    riskTolerance,
    operatingPort,
    portInfo,
    role,
    language,
    isBackendSynced,
    setVesselType,
    setRiskTolerance,
    setOperatingPort,
    setRole,
    setLanguage,
    getVesselRangeKm,
    syncWithBackend,
    loadFromBackend,
  } = useUserStore();

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [selectedStateFilter, setSelectedStateFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [bundleMeta, setBundleMeta] = useState<BundleMeta | null>(null);
  const [downloadingBundle, setDownloadingBundle] = useState(false);
  const [bundleError, setBundleError] = useState('');

  useEffect(() => {
    loadFromBackend();
    getBundleMeta().then(setBundleMeta);
  }, []);

  const handleDownloadBundle = async () => {
    setDownloadingBundle(true);
    setBundleError('');
    try {
      const meta = await downloadOfflineBundle(portInfo.latitude, portInfo.longitude, 5);
      setBundleMeta(meta);
      setToastMessage(`Offline bundle ready (${meta.sizeMb} MB, valid ${new Date(meta.validUntil).toLocaleDateString()}).`);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch {
      setBundleError('Could not download — check your connection and try again before sailing.');
    } finally {
      setDownloadingBundle(false);
    }
  };

  const handleClearBundle = async () => {
    await clearOfflineBundle();
    setBundleMeta(null);
  };

  const statesList = ['All', 'Kerala', 'Tamil Nadu', 'Gujarat', 'Maharashtra', 'Karnataka', 'Andhra Pradesh', 'Odisha', 'West Bengal', 'Goa', 'Islands'];

  const filteredPorts = INDIAN_PORTS.filter((port) => {
    const matchesState =
      selectedStateFilter === 'All' ||
      (selectedStateFilter === 'Islands'
        ? port.state.includes('Andaman') || port.state.includes('Lakshadweep')
        : port.state === selectedStateFilter);

    const matchesSearch =
      port.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      port.state.toLowerCase().includes(searchQuery.toLowerCase()) ||
      port.region.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesState && matchesSearch;
  });

  const handleSave = async () => {
    setSaving(true);
    await syncWithBackend();
    setSaving(false);
    setToastMessage('Profile preferences saved successfully!');
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3500);
  };

  const handleResetProfile = async () => {
    try {
      await profileAPI.deleteProfile(deviceId);
      setToastMessage('Profile preferences reset successfully.');
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch {
      // Already cleared or offline
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header Profile Title */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarBox}>
            <MaterialCommunityIcons name="account-cog-outline" size={28} color={colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.profileName}>Fisherman Profile & Settings</Text>
            <Text style={styles.profileSub}>
              Active Port: {portInfo.name} ({portInfo.state}) • Range: {getVesselRangeKm()} km
            </Text>
            <Text style={styles.deviceIdText}>
              ID: <Text style={{ fontFamily: 'monospace' }}>{deviceId}</Text>
            </Text>
          </View>
        </View>

        {/* Success Toast */}
        {savedSuccess && (
          <View style={styles.toast}>
            <Ionicons name="checkmark-circle" size={18} color={colors.white} />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        )}

        {/* Section 1: Vessel Type & Capacity */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="sail-boat" size={20} color={colors.primary} />
            <Text style={styles.cardTitle}>Vessel Type & Capability</Text>
          </View>
          <Text style={styles.cardDesc}>
            Current Operating Limit: <Text style={styles.boldText}>{getVesselRangeKm()} km offshore</Text>
          </Text>

          <View style={styles.optionsGrid}>
            <TouchableOpacity
              style={[styles.vesselBtn, vesselType === 'small' && styles.vesselBtnActive]}
              onPress={() => setVesselType('small')}
            >
              <MaterialCommunityIcons
                name="sail-boat"
                size={22}
                color={vesselType === 'small' ? colors.white : colors.primary}
              />
              <Text style={[styles.vesselTitle, vesselType === 'small' && styles.vesselTitleActive]}>
                Small Boat
              </Text>
              <Text style={[styles.vesselSub, vesselType === 'small' && styles.vesselSubActive]}>
                15 km limit
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.vesselBtn, vesselType === 'medium' && styles.vesselBtnActive]}
              onPress={() => setVesselType('medium')}
            >
              <MaterialCommunityIcons
                name="ferry"
                size={22}
                color={vesselType === 'medium' ? colors.white : colors.primary}
              />
              <Text style={[styles.vesselTitle, vesselType === 'medium' && styles.vesselTitleActive]}>
                Medium Boat
              </Text>
              <Text style={[styles.vesselSub, vesselType === 'medium' && styles.vesselSubActive]}>
                35 km limit
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.vesselBtn, vesselType === 'large' && styles.vesselBtnActive]}
              onPress={() => setVesselType('large')}
            >
              <MaterialCommunityIcons
                name="ship-wheel"
                size={22}
                color={vesselType === 'large' ? colors.white : colors.primary}
              />
              <Text style={[styles.vesselTitle, vesselType === 'large' && styles.vesselTitleActive]}>
                Large Trawler
              </Text>
              <Text style={[styles.vesselSub, vesselType === 'large' && styles.vesselSubActive]}>
                75 km limit
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.vesselBtn, vesselType === 'union' && styles.vesselBtnActive]}
              onPress={() => setVesselType('union')}
            >
              <MaterialCommunityIcons
                name="account-group"
                size={22}
                color={vesselType === 'union' ? colors.white : colors.primary}
              />
              <Text style={[styles.vesselTitle, vesselType === 'union' && styles.vesselTitleActive]}>
                Union Fleet
              </Text>
              <Text style={[styles.vesselSub, vesselType === 'union' && styles.vesselSubActive]}>
                100 km limit
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section 2: Home Operating Port (All Indian Coastal Ports) */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="location-outline" size={20} color={colors.primary} />
            <Text style={styles.cardTitle}>Home Operating Port (All Indian Ports)</Text>
          </View>
          <Text style={styles.cardDesc}>
            Selected Port:{' '}
            <Text style={styles.boldText}>
              📍 {portInfo.name} ({portInfo.state} • {portInfo.sea})
            </Text>
          </Text>

          {/* Search Input */}
          <View style={styles.searchBox}>
            <Ionicons name="search" size={16} color={colors.onSurfaceVariant} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by port name, state, or region..."
              placeholderTextColor={colors.onSurfaceVariant}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color={colors.onSurfaceVariant} />
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Coastal State Filter Row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stateRow}>
            {statesList.map((st) => (
              <TouchableOpacity
                key={st}
                style={[styles.stateChip, selectedStateFilter === st && styles.stateChipActive]}
                onPress={() => setSelectedStateFilter(st)}
              >
                <Text style={[styles.stateText, selectedStateFilter === st && styles.stateTextActive]}>
                  {st}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Ports Horizontal Chips List */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.portRow}>
            {filteredPorts.map((p) => {
              const isActive = operatingPort === p.name;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.portChip, isActive && styles.portChipActive]}
                  onPress={() => setOperatingPort(p.name)}
                >
                  <Text style={[styles.portText, isActive && styles.portTextActive]}>
                    📍 {p.name}
                  </Text>
                  <Text style={[styles.portSubText, isActive && styles.portSubTextActive]}>
                    {p.state}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Selected Port Location Card */}
          <View style={styles.selectedPortBanner}>
            <MaterialCommunityIcons name="compass-rose" size={20} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.portBannerTitle}>
                {portInfo.name} Port Reticle ({portInfo.latitude.toFixed(2)}° N, {portInfo.longitude.toFixed(2)}° E)
              </Text>
              <Text style={styles.portBannerSub}>
                Region: {portInfo.region} • Sea: {portInfo.sea}
              </Text>
            </View>
          </View>
        </View>

        {/* Section 3: Risk Tolerance */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialIcons name="security" size={20} color={colors.primary} />
            <Text style={styles.cardTitle}>Risk Profile</Text>
          </View>

          <View style={styles.segmentedRow}>
            {(['conservative', 'moderate', 'aggressive'] as RiskTolerance[]).map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.segmentBtn, riskTolerance === r && styles.segmentBtnActive]}
                onPress={() => setRiskTolerance(r)}
              >
                <Text style={[styles.segmentText, riskTolerance === r && styles.segmentTextActive]}>
                  {r.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Section 4: Operating Role */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="people-outline" size={20} color={colors.primary} />
            <Text style={styles.cardTitle}>Operating Role</Text>
          </View>

          <View style={styles.segmentedRow}>
            <TouchableOpacity
              style={[styles.segmentBtn, role === 'fisherman' && styles.segmentBtnActive]}
              onPress={() => setRole('fisherman')}
            >
              <Text style={[styles.segmentText, role === 'fisherman' && styles.segmentTextActive]}>
                INDIVIDUAL FISHERMAN
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.segmentBtn, role === 'union_leader' && styles.segmentBtnActive]}
              onPress={() => setRole('union_leader')}
            >
              <Text style={[styles.segmentText, role === 'union_leader' && styles.segmentTextActive]}>
                UNION LEADER
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Section 5: Voice & Advisory Language (All Regional Languages of India) */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="language-outline" size={20} color={colors.primary} />
            <Text style={styles.cardTitle}>Voice & Advisory Language (Regional Languages)</Text>
          </View>

          <View style={styles.optionsGrid}>
            {INDIAN_LANGUAGES.map((item) => {
              const isActive = language === item.code;
              return (
                <TouchableOpacity
                  key={item.code}
                  style={[styles.langBtn, isActive && styles.langBtnActive]}
                  onPress={() => setLanguage(item.code)}
                >
                  <Text style={[styles.langNativeText, isActive && styles.langTextActive]}>
                    {item.nativeName}
                  </Text>
                  <Text style={[styles.langSubText, isActive && styles.langSubTextActive]}>
                    {item.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Section 6: Deep Sea Offline Bundle */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="cloud-download-outline" size={20} color={colors.primary} />
            <Text style={styles.cardTitle}>Deep Sea Offline Bundle</Text>
          </View>
          <Text style={styles.cardDesc}>
            50+ km offshore there is usually no signal. Download a bundle before sailing so chat and
            fishing zones still work with cached data — live answers are always used first whenever
            there's a connection; this only kicks in if a live request fails.
          </Text>

          {bundleMeta ? (
            <View style={styles.bundleStatusBox}>
              <Ionicons name="checkmark-circle" size={16} color={colors.secondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.bundleStatusTitle}>
                  {bundleMeta.sizeMb} MB cached • {bundleMeta.tripDays}-day forecast
                </Text>
                <Text style={styles.bundleStatusSub}>
                  Downloaded {new Date(bundleMeta.createdAt).toLocaleString()} • Valid until{' '}
                  {new Date(bundleMeta.validUntil).toLocaleDateString()}
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.bundleStatusBox}>
              <Ionicons name="alert-circle-outline" size={16} color={colors.onSurfaceVariant} />
              <Text style={styles.bundleStatusSub}>No offline bundle downloaded yet.</Text>
            </View>
          )}

          {bundleError ? <Text style={styles.bundleErrorText}>{bundleError}</Text> : null}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <TouchableOpacity
              style={[styles.btnPrimarySmall, downloadingBundle && { opacity: 0.8 }]}
              onPress={handleDownloadBundle}
              disabled={downloadingBundle}
            >
              {downloadingBundle ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Ionicons name="cloud-download-outline" size={16} color={colors.white} />
              )}
              <Text style={styles.btnPrimarySmallText}>
                {downloadingBundle
                  ? 'Downloading (can take ~30s)...'
                  : bundleMeta
                  ? 'Refresh Bundle'
                  : 'Download Offline Bundle'}
              </Text>
            </TouchableOpacity>

            {bundleMeta && (
              <TouchableOpacity style={styles.btnSecondarySmall} onPress={handleClearBundle}>
                <Ionicons name="trash-outline" size={16} color={colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Save Preferences Button */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.8 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Ionicons name="checkmark-done-circle-outline" size={18} color={colors.white} />
          )}
          <Text style={styles.saveBtnText}>
            {saving ? 'Saving Preferences...' : 'Save Preferences'}
          </Text>
        </TouchableOpacity>

        {/* Reset Profile */}
        <TouchableOpacity style={styles.resetBtn} onPress={handleResetProfile}>
          <Ionicons name="trash-outline" size={16} color={colors.error} />
          <Text style={styles.resetBtnText}>Reset Profile Preferences</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.primaryContainer,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  avatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileName: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.white,
  },
  profileSub: {
    fontSize: 11,
    color: colors.onPrimaryContainer,
    marginTop: 2,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.secondary,
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  toastText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
    flex: 1,
  },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.onSurface,
  },
  cardDesc: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginBottom: 12,
  },
  boldText: {
    fontWeight: '800',
    color: colors.primary,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: colors.onSurface,
  },
  stateRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  stateChip: {
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 6,
  },
  stateChipActive: {
    backgroundColor: colors.primary,
  },
  stateText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  stateTextActive: {
    color: colors.white,
  },
  portRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  portChip: {
    backgroundColor: colors.surfaceContainerLow,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginRight: 8,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
  },
  portChipActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primaryContainer,
  },
  portText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.onSurface,
  },
  portTextActive: {
    color: colors.white,
  },
  portSubText: {
    fontSize: 10,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  portSubTextActive: {
    color: colors.onPrimaryContainer,
  },
  selectedPortBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surfaceContainerHigh,
    borderRadius: 10,
    padding: 10,
  },
  portBannerTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  portBannerSub: {
    fontSize: 10,
    color: colors.onSurfaceVariant,
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  vesselBtn: {
    width: '48%',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.surfaceContainerHigh,
  },
  vesselBtnActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primaryContainer,
  },
  vesselTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.onSurface,
    marginTop: 6,
  },
  vesselTitleActive: {
    color: colors.white,
  },
  vesselSub: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  vesselSubActive: {
    color: colors.onPrimaryContainer,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLow,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: colors.primaryContainer,
  },
  segmentText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.onSurfaceVariant,
  },
  segmentTextActive: {
    color: colors.white,
  },
  langBtn: {
    width: '48%',
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
  },
  langBtnActive: {
    backgroundColor: colors.primaryContainer,
    borderColor: colors.primaryContainer,
  },
  langNativeText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.onSurface,
  },
  langTextActive: {
    color: colors.white,
  },
  langSubText: {
    fontSize: 10,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  langSubTextActive: {
    color: colors.onPrimaryContainer,
  },
  deviceIdText: {
    fontSize: 10,
    color: colors.onPrimaryContainer,
    marginTop: 4,
    opacity: 0.9,
  },
  bundleStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: 10,
    padding: 10,
  },
  bundleStatusTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.onSurface,
  },
  bundleStatusSub: {
    fontSize: 11,
    color: colors.onSurfaceVariant,
    marginTop: 2,
  },
  bundleErrorText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.error,
    marginTop: 8,
  },
  btnPrimarySmall: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    height: 42,
    borderRadius: 8,
  },
  btnPrimarySmallText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.white,
  },
  btnSecondarySmall: {
    width: 42,
    height: 42,
    borderRadius: 8,
    backgroundColor: colors.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtn: {
    backgroundColor: colors.secondary,
    height: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.white,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginTop: 8,
  },
  resetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.error,
  },
});
