import React, { useState } from 'react';
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
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';
import { colors } from '../theme/colors';
import { useUserStore, VesselType, RiskTolerance, UserRole } from '../store/userStore';
import { INDIAN_PORTS, INDIAN_LANGUAGES } from '../constants/portsAndLanguages';
import { profileAPI } from '../services/api';

export function AuthScreen() {
  const {
    loginWithProfile,
    signUp,
  } = useUserStore();

  type AuthView = 'landing' | 'signup' | 'login';
  const [view, setView] = useState<AuthView>('landing');

  const navigateTo = (nextView: AuthView) => {
    setErrorMsg('');
    setSuccessMsg('');
    setView(nextView);
  };
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Sign Up Form Fields (Preseeded with authentic default values)
  const [name, setName] = useState('Ramesh Kumar');
  const [selectedPort, setSelectedPort] = useState('Kochi');
  const [vesselType, setVesselType] = useState<VesselType>('medium');
  const [role, setRole] = useState<UserRole>('fisherman');
  const [language, setLanguage] = useState('en');
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance>('moderate');
  const [password, setPassword] = useState('SeaSarathi@2026');
  const [showPassword, setShowPassword] = useState(false);

  // Sign In Form Fields
  const [customUserId, setCustomUserId] = useState('');
  const [loginPassword, setLoginPassword] = useState('SeaSarathi@2026');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // State and Port selection (User enters state, then selects port from dropdown)
  const [stateName, setStateName] = useState('Kerala');
  const [isPortDropdownOpen, setIsPortDropdownOpen] = useState(false);

  const COASTAL_STATES = [
    'Kerala',
    'Tamil Nadu',
    'Gujarat',
    'Maharashtra',
    'Karnataka',
    'Andhra Pradesh',
    'Odisha',
    'West Bengal',
    'Goa',
    'Andaman & Nicobar',
    'Lakshadweep',
  ];

  // Matched coastal state name
  const matchedState =
    COASTAL_STATES.find(
      (s) => s.toLowerCase() === stateName.trim().toLowerCase()
    ) ||
    COASTAL_STATES.find(
      (s) => s.toLowerCase().includes(stateName.trim().toLowerCase())
    ) ||
    stateName.trim();

  // All ports present in the entered/matched coastal state
  const portsInState = INDIAN_PORTS.filter(
    (p) =>
      p.state.toLowerCase() === (matchedState || stateName).trim().toLowerCase() ||
      p.state.toLowerCase().includes(stateName.trim().toLowerCase())
  );

  const currentPortInfo =
    INDIAN_PORTS.find((p) => p.name.toLowerCase() === selectedPort.toLowerCase()) ||
    INDIAN_PORTS[0];

  const handleStateChange = (input: string) => {
    setStateName(input);
    const matched = COASTAL_STATES.find(
      (s) => s.toLowerCase() === input.trim().toLowerCase()
    );
    if (matched) {
      const ports = INDIAN_PORTS.filter(
        (p) => p.state.toLowerCase() === matched.toLowerCase()
      );
      if (ports.length > 0) {
        const stillValid = ports.some(
          (p) => p.name.toLowerCase() === selectedPort.toLowerCase()
        );
        if (!stillValid) {
          setSelectedPort(ports[0].name);
        }
      }
    }
  };

  // Sign Up Handler
  const handleSignUpSubmit = async () => {
    setErrorMsg('');
    setSuccessMsg('');

    if (!name.trim()) {
      setErrorMsg('Full Name is required');
      return;
    }
    if (!selectedPort.trim()) {
      setErrorMsg('Home Port is required');
      return;
    }
    if (!vesselType) {
      setErrorMsg('Boat Size is required');
      return;
    }
    if (!role) {
      setErrorMsg('Role is required');
      return;
    }
    if (!language) {
      setErrorMsg('Language Preference is required');
      return;
    }
    if (!riskTolerance) {
      setErrorMsg('Risk Profile is required');
      return;
    }
    if (!password.trim()) {
      setErrorMsg('Password is required');
      return;
    }

    setLoading(true);
    try {
      const res = await signUp({
        name: name.trim(),
        operatingPort: selectedPort,
        vesselType,
        role,
        language,
        riskTolerance,
        password: password.trim(),
      });

      if (res.success) {
        setSuccessMsg(`Account created! Assigned ID: ${res.userId}`);
      } else {
        setErrorMsg(res.error || 'Registration failed');
      }
    } catch (e: any) {
      setErrorMsg(e?.message || 'Network error during sign up');
    } finally {
      setLoading(false);
    }
  };

  // Sign In Handler
  const handleCustomLogin = async () => {
    setErrorMsg('');
    setSuccessMsg('');

    if (!customUserId.trim()) {
      setErrorMsg('Please enter your Unique User ID');
      return;
    }
    if (!loginPassword.trim()) {
      setErrorMsg('Please enter your Password');
      return;
    }

    setLoading(true);
    try {
      const profile = await profileAPI.login(customUserId.trim(), loginPassword.trim());
      if (profile) {
        loginWithProfile(profile);
      } else {
        setErrorMsg(`No profile found for ID "${customUserId}"`);
      }
    } catch (err: any) {
      const detail =
        err?.response?.data?.detail ||
        err?.message ||
        `Authentication failed for ID "${customUserId}"`;
      setErrorMsg(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#071E3D" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            view === 'landing' && styles.landingScrollContent,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {/* 1. LANDING PAGE VIEW */}
          {view === 'landing' && (
            <View style={styles.landingContainer}>
              {/* Central Hero Card - Center Aligned */}
              <View style={styles.landingHeroCard}>
                <View style={styles.brandCenterCol}>
                  <View style={styles.brandIconBoxCenter}>
                    <MaterialCommunityIcons name="ship-wheel" size={38} color={colors.white} />
                  </View>
                  <Text style={styles.brandTitleCenter}>SeaSarathi</Text>
                  <Text style={styles.brandSubtitleCenter}>
                    Marine Decision Support & Safety Platform
                  </Text>
                </View>

                {/* Direct Action Buttons */}
                <View style={styles.modeTabs}>
                  <TouchableOpacity
                    style={[styles.modeTab, styles.modeTabActive]}
                    onPress={() => navigateTo('signup')}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="person-add-outline"
                      size={16}
                      color={colors.white}
                    />
                    <Text style={[styles.modeTabText, styles.modeTabTextActive]}>
                      Create Account
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.modeTab}
                    onPress={() => navigateTo('login')}
                    activeOpacity={0.85}
                  >
                    <Ionicons
                      name="log-in-outline"
                      size={16}
                      color="#8DA9C4"
                    />
                    <Text style={styles.modeTabText}>
                      Quick Sign In
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* 2. QUICK SIGN IN PAGE */}
          {view === 'login' && (
            <View style={styles.pageContentContainer}>
              {/* Top Navigation Bar */}
              <View style={styles.pageTopNav}>
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => navigateTo('landing')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="arrow-back" size={20} color={colors.white} />
                </TouchableOpacity>

                <View style={styles.pageHeaderCenter}>
                  <Text style={styles.pageHeaderTitle}>Quick Sign In</Text>
                </View>

                <View style={{ width: 38 }} />
              </View>

              {/* Toast Messages */}
              {errorMsg ? (
                <View style={styles.errorToast}>
                  <Ionicons name="alert-circle" size={18} color="#FFD2D2" />
                  <Text style={styles.errorToastText}>{errorMsg}</Text>
                </View>
              ) : null}

              {successMsg ? (
                <View style={styles.successToast}>
                  <Ionicons name="checkmark-circle" size={18} color="#D1FADF" />
                  <Text style={styles.successToastText}>{successMsg}</Text>
                </View>
              ) : null}

              <View style={styles.formContainer}>
                <View style={styles.formHeaderRow}>
                  <Text style={styles.formTitle}>Sign In With Unique ID</Text>
                  <Ionicons name="lock-closed" size={18} color={colors.primary} />
                </View>
                <Text style={styles.loginHelperText}>
                  Enter your unique Marine Fisher ID and password to access your dashboard.
                </Text>

                {/* 1. Unique User ID */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Ionicons name="card-outline" size={16} color={colors.primary} />
                    <Text style={styles.label}>
                      Unique User ID <Text style={styles.star}>*</Text>
                    </Text>
                  </View>
                  <TextInput
                    style={styles.textInput}
                    placeholder="e.g. USR-KOC-4821"
                    placeholderTextColor={colors.onSurfaceVariant}
                    value={customUserId}
                    onChangeText={setCustomUserId}
                    autoCapitalize="characters"
                  />
                </View>

                {/* 2. Password Field Below Unique User ID */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Ionicons name="key-outline" size={16} color={colors.primary} />
                    <Text style={styles.label}>
                      Password <Text style={styles.star}>*</Text>
                    </Text>
                  </View>
                  <View style={styles.passwordWrapper}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="Enter your password"
                      placeholderTextColor={colors.onSurfaceVariant}
                      value={loginPassword}
                      onChangeText={setLoginPassword}
                      secureTextEntry={!showLoginPassword}
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowLoginPassword(!showLoginPassword)}
                    >
                      <Ionicons
                        name={showLoginPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color={colors.onSurfaceVariant}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Sign In Submit Button */}
                <TouchableOpacity
                  style={[styles.submitBtn, loading && { opacity: 0.7 }]}
                  onPress={handleCustomLogin}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <>
                      <Ionicons name="log-in-outline" size={20} color={colors.white} />
                      <Text style={styles.submitBtnText}>Sign In to Dashboard</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.switchModeLink}
                  onPress={() => navigateTo('signup')}
                >
                  <Text style={styles.switchModeLinkText}>
                    Don't have an account? <Text style={styles.boldText}>Create New Account →</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* 3. CREATE ACCOUNT PAGE */}
          {view === 'signup' && (
            <View style={styles.pageContentContainer}>
              {/* Top Navigation Bar */}
              <View style={styles.pageTopNav}>
                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => navigateTo('landing')}
                  activeOpacity={0.8}
                >
                  <Ionicons name="arrow-back" size={20} color={colors.white} />
                </TouchableOpacity>

                <View style={styles.pageHeaderCenter}>
                  <Text style={styles.pageHeaderTitle}>Create Account</Text>
                </View>

                <View style={{ width: 38 }} />
              </View>

              {/* Toast Messages */}
              {errorMsg ? (
                <View style={styles.errorToast}>
                  <Ionicons name="alert-circle" size={18} color="#FFD2D2" />
                  <Text style={styles.errorToastText}>{errorMsg}</Text>
                </View>
              ) : null}

              {successMsg ? (
                <View style={styles.successToast}>
                  <Ionicons name="checkmark-circle" size={18} color="#D1FADF" />
                  <Text style={styles.successToastText}>{successMsg}</Text>
                </View>
              ) : null}

              <View style={styles.formContainer}>
                {/* 1. Full Name */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Ionicons name="person" size={15} color={colors.primary} />
                    <Text style={styles.label}>
                      Full Name <Text style={styles.star}>*</Text>
                    </Text>
                  </View>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Enter your full name"
                    placeholderTextColor={colors.onSurfaceVariant}
                    value={name}
                    onChangeText={setName}
                  />
                </View>

                {/* 2. Home Port / Landing Center with State Scroll & Dropdown Menu */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Ionicons name="location" size={15} color={colors.primary} />
                    <Text style={styles.label}>
                      Home Port / Landing Center <Text style={styles.star}>*</Text>
                    </Text>
                  </View>

                  {/* State Selection */}
                  <Text style={styles.fieldSubLabel}>State:</Text>

                  {/* Quick-Select Coastal State Chips (Scroll) */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stateChipsRow}>
                    {COASTAL_STATES.map((st) => {
                      const isActive = matchedState.toLowerCase() === st.toLowerCase();
                      return (
                        <TouchableOpacity
                          key={st}
                          style={[styles.stateChip, isActive && styles.stateChipActive]}
                          onPress={() => handleStateChange(st)}
                        >
                          <Text style={[styles.stateChipText, isActive && styles.stateChipTextActive]}>
                            {st}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Ports in that State */}
                  <Text style={[styles.fieldSubLabel, { marginTop: 10 }]}>
                    Ports in {matchedState || 'State'}:
                  </Text>

                  {portsInState.length > 0 ? (
                    <View style={styles.dropdownWrapper}>
                      {/* Dropdown Toggle Button */}
                      <TouchableOpacity
                        style={[
                          styles.dropdownTrigger,
                          isPortDropdownOpen && styles.dropdownTriggerActive,
                        ]}
                        onPress={() => setIsPortDropdownOpen(!isPortDropdownOpen)}
                        activeOpacity={0.8}
                      >
                        <View style={styles.dropdownTriggerLeft}>
                          <MaterialCommunityIcons name="anchor" size={18} color={colors.primary} />
                          <Text style={styles.dropdownTriggerText}>
                            {selectedPort ? selectedPort : `Select a port in ${matchedState}...`}
                          </Text>
                        </View>
                        <Ionicons
                          name={isPortDropdownOpen ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color={colors.primary}
                        />
                      </TouchableOpacity>

                      {/* Dropdown Menu Options */}
                      {isPortDropdownOpen && (
                        <View style={styles.dropdownMenu}>
                          <View style={styles.dropdownMenuHeader}>
                            <Text style={styles.dropdownMenuHeaderText}>
                              {portsInState.length} ports in {matchedState} • Tap to select
                            </Text>
                          </View>
                          <ScrollView
                            style={styles.dropdownScroll}
                            nestedScrollEnabled={true}
                            keyboardShouldPersistTaps="handled"
                          >
                            {portsInState.map((port) => {
                              const isSelected =
                                selectedPort.toLowerCase() === port.name.toLowerCase();
                              return (
                                <TouchableOpacity
                                  key={port.id}
                                  style={[
                                    styles.dropdownItem,
                                    isSelected && styles.dropdownItemActive,
                                  ]}
                                  onPress={() => {
                                    setSelectedPort(port.name);
                                    setIsPortDropdownOpen(false);
                                  }}
                                >
                                  <View style={{ flex: 1 }}>
                                    <Text
                                      style={[
                                        styles.dropdownItemTitle,
                                        isSelected && styles.dropdownItemTitleActive,
                                      ]}
                                    >
                                      {port.name}
                                    </Text>
                                    <Text style={styles.dropdownItemSub}>
                                      {port.region} • {port.sea}
                                    </Text>
                                  </View>
                                  {isSelected ? (
                                    <Ionicons name="checkmark-circle" size={18} color="#21BF96" />
                                  ) : (
                                    <Ionicons
                                      name="radio-button-off"
                                      size={16}
                                      color="rgba(255,255,255,0.3)"
                                    />
                                  )}
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  ) : (
                    <View style={styles.noPortsBox}>
                      <Ionicons name="alert-circle-outline" size={16} color="#FFB020" />
                      <Text style={styles.noPortsBoxText}>
                        No ports found for "{stateName}". Please enter or select a coastal state above.
                      </Text>
                    </View>
                  )}
                </View>

                {/* 3. Boat Size (Vessel Type) */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <MaterialCommunityIcons name="sail-boat" size={17} color={colors.primary} />
                    <Text style={styles.label}>
                      Boat Size & Capacity <Text style={styles.star}>*</Text>
                    </Text>
                  </View>
                  <View style={styles.gridTwoCols}>
                    <TouchableOpacity
                      style={[styles.choiceCard, vesselType === 'small' && styles.choiceCardActive]}
                      onPress={() => setVesselType('small')}
                    >
                      <MaterialCommunityIcons
                        name="sail-boat"
                        size={20}
                        color={vesselType === 'small' ? colors.white : colors.primary}
                      />
                      <Text style={[styles.choiceTitle, vesselType === 'small' && styles.choiceTitleActive]}>
                        Small Boat
                      </Text>
                      <Text style={[styles.choiceSub, vesselType === 'small' && styles.choiceSubActive]}>
                        Traditional • 9 km
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.choiceCard, vesselType === 'medium' && styles.choiceCardActive]}
                      onPress={() => setVesselType('medium')}
                    >
                      <MaterialCommunityIcons
                        name="ferry"
                        size={20}
                        color={vesselType === 'medium' ? colors.white : colors.primary}
                      />
                      <Text style={[styles.choiceTitle, vesselType === 'medium' && styles.choiceTitleActive]}>
                        Medium Boat
                      </Text>
                      <Text style={[styles.choiceSub, vesselType === 'medium' && styles.choiceSubActive]}>
                        Motorized • 22 km
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.choiceCard, vesselType === 'large' && styles.choiceCardActive]}
                      onPress={() => setVesselType('large')}
                    >
                      <MaterialCommunityIcons
                        name="ship-wheel"
                        size={20}
                        color={vesselType === 'large' ? colors.white : colors.primary}
                      />
                      <Text style={[styles.choiceTitle, vesselType === 'large' && styles.choiceTitleActive]}>
                        Large Trawler
                      </Text>
                      <Text style={[styles.choiceSub, vesselType === 'large' && styles.choiceSubActive]}>
                        Individual/Crew • 370 km
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.choiceCard, vesselType === 'union' && styles.choiceCardActive]}
                      onPress={() => setVesselType('union')}
                    >
                      <MaterialCommunityIcons
                        name="account-group"
                        size={20}
                        color={vesselType === 'union' ? colors.white : colors.primary}
                      />
                      <Text style={[styles.choiceTitle, vesselType === 'union' && styles.choiceTitleActive]}>
                        Union Fleet
                      </Text>
                      <Text style={[styles.choiceSub, vesselType === 'union' && styles.choiceSubActive]}>
                        Multiple vessels • 500 km
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 4. Operating Role */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Ionicons name="people" size={16} color={colors.primary} />
                    <Text style={styles.label}>
                      Operating Role <Text style={styles.star}>*</Text>
                    </Text>
                  </View>
                  <View style={styles.roleSegmentRow}>
                    <TouchableOpacity
                      style={[styles.roleBtn, role === 'fisherman' && styles.roleBtnActive]}
                      onPress={() => setRole('fisherman')}
                    >
                      <MaterialCommunityIcons
                        name="account"
                        size={18}
                        color={role === 'fisherman' ? colors.white : colors.primary}
                      />
                      <Text style={[styles.roleBtnText, role === 'fisherman' && styles.roleBtnTextActive]}>
                        Individual Fisherman
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.roleBtn, role === 'union_leader' && styles.roleBtnActive]}
                      onPress={() => setRole('union_leader')}
                    >
                      <MaterialCommunityIcons
                        name="account-tie"
                        size={18}
                        color={role === 'union_leader' ? colors.white : colors.primary}
                      />
                      <Text style={[styles.roleBtnText, role === 'union_leader' && styles.roleBtnTextActive]}>
                        Union Leader
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 5. Language Preference */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Ionicons name="language" size={16} color={colors.primary} />
                    <Text style={styles.label}>
                      Language Preference (Voice & Text) <Text style={styles.star}>*</Text>
                    </Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.langPickerRow}>
                    {INDIAN_LANGUAGES.map((l) => {
                      const isSelected = language === l.code;
                      return (
                        <TouchableOpacity
                          key={l.code}
                          style={[styles.langChip, isSelected && styles.langChipActive]}
                          onPress={() => setLanguage(l.code)}
                        >
                          <Text style={[styles.langNative, isSelected && styles.langNativeActive]}>
                            {l.nativeName}
                          </Text>
                          <Text style={[styles.langEn, isSelected && styles.langEnActive]}>
                            {l.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* 6. Risk Tolerance Profile */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Ionicons name="shield-half" size={16} color={colors.primary} />
                    <Text style={styles.label}>
                      Risk Profile & Advisory Sensitivity <Text style={styles.star}>*</Text>
                    </Text>
                  </View>
                  <View style={styles.riskRow}>
                    <TouchableOpacity
                      style={[styles.riskCard, riskTolerance === 'conservative' && styles.riskCardActive]}
                      onPress={() => setRiskTolerance('conservative')}
                    >
                      <Ionicons
                        name="shield-checkmark"
                        size={18}
                        color={riskTolerance === 'conservative' ? colors.white : '#21BF96'}
                      />
                      <Text style={[styles.riskTitle, riskTolerance === 'conservative' && styles.riskTitleActive]}>
                        Safety First
                      </Text>
                      <Text style={[styles.riskSub, riskTolerance === 'conservative' && styles.riskSubActive]}>
                        Max precaution • Safe returns
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.riskCard, riskTolerance === 'moderate' && styles.riskCardActive]}
                      onPress={() => setRiskTolerance('moderate')}
                    >
                      <Ionicons
                        name="speedometer"
                        size={18}
                        color={riskTolerance === 'moderate' ? colors.white : '#0D6EFD'}
                      />
                      <Text style={[styles.riskTitle, riskTolerance === 'moderate' && styles.riskTitleActive]}>
                        Standard
                      </Text>
                      <Text style={[styles.riskSub, riskTolerance === 'moderate' && styles.riskSubActive]}>
                        Balanced fishing vs weather
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.riskCard, riskTolerance === 'aggressive' && styles.riskCardActive]}
                      onPress={() => setRiskTolerance('aggressive')}
                    >
                      <Ionicons
                        name="flame"
                        size={18}
                        color={riskTolerance === 'aggressive' ? colors.white : '#FF6B6B'}
                      />
                      <Text style={[styles.riskTitle, riskTolerance === 'aggressive' && styles.riskTitleActive]}>
                        Experienced
                      </Text>
                      <Text style={[styles.riskSub, riskTolerance === 'aggressive' && styles.riskSubActive]}>
                        Deep water expedition
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* 7. Password Field */}
                <View style={styles.inputGroup}>
                  <View style={styles.labelRow}>
                    <Ionicons name="key-outline" size={16} color={colors.primary} />
                    <Text style={styles.label}>
                      Password <Text style={styles.star}>*</Text>
                    </Text>
                  </View>
                  <View style={styles.passwordWrapper}>
                    <TextInput
                      style={styles.passwordInput}
                      placeholder="Create a password"
                      placeholderTextColor={colors.onSurfaceVariant}
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                    />
                    <TouchableOpacity
                      style={styles.eyeBtn}
                      onPress={() => setShowPassword(!showPassword)}
                    >
                      <Ionicons
                        name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                        size={20}
                        color={colors.onSurfaceVariant}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Submit Registration Button */}
                <TouchableOpacity
                  style={[styles.submitBtn, loading && { opacity: 0.7 }]}
                  onPress={handleSignUpSubmit}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color={colors.white} size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={20} color={colors.white} />
                      <Text style={styles.submitBtnText}>Create Account & Generate User ID</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.switchModeLink}
                  onPress={() => navigateTo('login')}
                >
                  <Text style={styles.switchModeLinkText}>
                    Already have an account? <Text style={styles.boldText}>Sign In with ID →</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#071E3D',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  heroCard: {
    backgroundColor: '#0B2545',
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  badgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  govBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(33, 191, 150, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  govBadgeText: {
    color: '#21BF96',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  chipPill: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  chipPillText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  brandIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandTitle: {
    color: colors.white,
    fontSize: 22,
    fontWeight: '900',
  },
  brandSubtitle: {
    color: '#8DA9C4',
    fontSize: 12,
    fontWeight: '600',
  },
  modeTabs: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 4,
    gap: 6,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  modeTabActive: {
    backgroundColor: colors.primary,
  },
  modeTabText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8DA9C4',
  },
  modeTabTextActive: {
    color: colors.white,
  },
  landingScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  landingContainer: {
    width: '100%',
    maxWidth: 440,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  landingHeroCard: {
    width: '100%',
    backgroundColor: '#0B2545',
    borderRadius: 22,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 6,
    alignItems: 'center',
  },
  brandCenterCol: {
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  brandIconBoxCenter: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  brandTitleCenter: {
    color: colors.white,
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  brandSubtitleCenter: {
    color: '#8DA9C4',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  pageContentContainer: {
    width: '100%',
    maxWidth: 520,
    alignSelf: 'center',
  },
  pageTopNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  pageHeaderCenter: {
    alignItems: 'center',
  },
  pageHeaderTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.white,
  },
  pageSwitchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
  },
  pageSwitchBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8DA9C4',
  },
  formContainer: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: 20,
    padding: 18,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  formHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceContainerLow,
  },
  formTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.onSurface,
  },
  requiredIndicator: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.error,
  },
  inputGroup: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.onSurface,
  },
  star: {
    color: colors.error,
    fontWeight: '900',
  },
  textInput: {
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.onSurface,
    fontWeight: '600',
  },
  passwordWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 13,
    color: colors.onSurface,
    fontWeight: '600',
  },
  eyeBtn: {
    padding: 6,
  },
  selectedPortBadge: {
    backgroundColor: 'rgba(33, 191, 150, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(33, 191, 150, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  selectedPortBadgeText: {
    fontSize: 11,
    color: '#21BF96',
    fontWeight: '600',
  },
  selectedPortBold: {
    fontWeight: '800',
    color: colors.white,
  },
  fieldSubLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8DA9C4',
    marginBottom: 5,
  },
  stateInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 8,
  },
  stateTextInput: {
    flex: 1,
    fontSize: 12,
    color: colors.onSurface,
    padding: 0,
  },
  stateChipsRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  stateChip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 6,
  },
  stateChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  stateChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8DA9C4',
  },
  stateChipTextActive: {
    color: colors.white,
    fontWeight: '800',
  },
  dropdownWrapper: {
    position: 'relative',
    zIndex: 10,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownTriggerActive: {
    borderColor: colors.primary,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  dropdownTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  dropdownTriggerText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.onSurface,
  },
  dropdownMenu: {
    backgroundColor: '#0E2E50',
    borderWidth: 1,
    borderColor: colors.primary,
    borderTopWidth: 0,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    overflow: 'hidden',
    maxHeight: 220,
  },
  dropdownMenuHeader: {
    backgroundColor: 'rgba(13, 110, 253, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  dropdownMenuHeaderText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#8DA9C4',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dropdownScroll: {
    maxHeight: 180,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(13, 110, 253, 0.2)',
  },
  dropdownItemTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.white,
  },
  dropdownItemTitleActive: {
    color: '#5BC0BE',
  },
  dropdownItemSub: {
    fontSize: 10,
    color: '#8DA9C4',
    marginTop: 2,
  },
  noPortsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 176, 32, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 176, 32, 0.3)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  noPortsBoxText: {
    fontSize: 11,
    color: '#FFB020',
    flex: 1,
  },
  boldText: {
    fontWeight: '800',
    color: colors.primary,
  },
  gridTwoCols: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  choiceCard: {
    width: '48%',
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  choiceCardActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  choiceTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.onSurface,
    marginTop: 4,
  },
  choiceTitleActive: {
    color: colors.white,
  },
  choiceSub: {
    fontSize: 10,
    color: colors.onSurfaceVariant,
  },
  choiceSubActive: {
    color: colors.onPrimaryContainer,
  },
  roleSegmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
    paddingVertical: 10,
    borderRadius: 10,
  },
  roleBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  roleBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.onSurface,
  },
  roleBtnTextActive: {
    color: colors.white,
  },
  langPickerRow: {
    flexDirection: 'row',
  },
  langChip: {
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    marginRight: 6,
    alignItems: 'center',
  },
  langChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  langNative: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.onSurface,
  },
  langNativeActive: {
    color: colors.white,
  },
  langEn: {
    fontSize: 9,
    color: colors.onSurfaceVariant,
  },
  langEnActive: {
    color: colors.onPrimaryContainer,
  },
  riskRow: {
    flexDirection: 'row',
    gap: 6,
  },
  riskBtn: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  riskBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  riskBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.onSurface,
  },
  riskBtnTextActive: {
    color: colors.white,
  },
  riskCard: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
    padding: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  riskCardActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  riskTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.onSurface,
    marginTop: 4,
  },
  riskTitleActive: {
    color: colors.white,
  },
  riskSub: {
    fontSize: 9,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    marginTop: 2,
  },
  riskSubActive: {
    color: colors.onPrimaryContainer,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0F52BA',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 10,
  },
  submitBtnText: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  switchModeLink: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  switchModeLinkText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
  },
  loginHelperText: {
    fontSize: 12,
    color: colors.onSurfaceVariant,
    marginBottom: 14,
  },
  errorToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#991B1B',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  errorToastText: {
    color: '#FEE2E2',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
  successToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#065F46',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  successToastText: {
    color: '#D1FAE5',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },
});
