import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import { INDIAN_PORTS, INDIAN_LANGUAGES, PortInfo, LanguageInfo } from '../constants/portsAndLanguages';
import { profileAPI } from '../services/api';

export type VesselType = 'small' | 'medium' | 'large' | 'union';
export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';
export type UserRole = 'fisherman' | 'union_leader';

const DEVICE_ID_FILENAME = 'seasarathi_device_id.txt';

// device_id doubles as this app's only access-control boundary: there's no
// separate auth layer, so POST/DELETE /profile trust whoever supplies the
// right device_id (see main.py's docstring on those endpoints). That makes
// it worth making hard to guess, not just unique — a single short
// Math.random() segment plus a timestamp (roughly guessable from an
// install date) wasn't. Concatenating multiple independent Math.random()
// draws isn't cryptographically secure, but at this length it's well
// beyond brute-forcing for what's actually at stake here (vessel prefs,
// no payment/PII) — matching the threat model, not overbuilding it with a
// full crypto RNG that would need a new native dependency and EAS rebuild.
function generateDeviceId(): string {
  const segment = () => Math.random().toString(36).substring(2, 10);
  return `device_${segment()}${segment()}${segment()}_${Date.now()}`;
}

// CRITICAL FIX: this used to check `window.localStorage` unconditionally and
// fall back to a single hardcoded constant ('device_seasarathi_default_01')
// whenever that check failed — which is EVERY native launch, since `window`
// never exists in React Native. Every real Android/iOS install was writing
// to the exact same backend profile record, overwriting whoever saved last.
//
// Fix: web keeps localStorage (synchronous, the right tool there). Native
// persists to a file via expo-file-system's synchronous API — chosen over
// AsyncStorage specifically because it's synchronous, so a real per-install
// ID is available immediately at store creation with no async race to
// reason about (AsyncStorage would require the store to start with a
// throwaway ID and swap it in later, risking an early syncWithBackend()
// call using the wrong one).
const getDeviceId = (): string => {
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      let id = window.localStorage.getItem('seasarathi_device_id');
      if (!id) {
        id = generateDeviceId();
        window.localStorage.setItem('seasarathi_device_id', id);
      }
      return id;
    } catch {
      // Fall through to file-based storage below.
    }
  }

  try {
    const file = new File(Paths.document, DEVICE_ID_FILENAME);
    if (file.exists) {
      const existing = file.textSync().trim();
      if (existing) return existing;
    }
    const id = generateDeviceId();
    file.write(id);
    return id;
  } catch {
    // Filesystem unavailable (shouldn't happen in practice) — at least
    // unique per app launch rather than a constant shared by every install.
    return generateDeviceId();
  }
};

export interface UserProfileState {
  deviceId: string;
  userId: string;
  userName: string;
  vesselType: VesselType;
  riskTolerance: RiskTolerance;
  operatingPort: string;
  portInfo: PortInfo;
  role: UserRole;
  language: string;
  isLoggedIn: boolean;
  isBackendSynced: boolean;
  
  setUserId: (userId: string) => void;
  setUserName: (userName: string) => void;
  setVesselType: (vessel: VesselType) => void;
  setRiskTolerance: (risk: RiskTolerance) => void;
  setOperatingPort: (portName: string) => void;
  setRole: (role: UserRole) => void;
  setLanguage: (langCode: string) => void;
  getVesselRangeKm: () => number;
  getLanguageInfo: () => LanguageInfo;
  loginWithProfile: (profile: any) => void;
  logout: () => void;
  signUp: (params: {
    name: string;
    operatingPort: string;
    vesselType: VesselType;
    role: UserRole;
    language: string;
    riskTolerance: RiskTolerance;
    password?: string;
  }) => Promise<{ success: boolean; userId?: string; error?: string }>;
  syncWithBackend: () => Promise<boolean>;
  loadFromBackend: () => Promise<boolean>;
}

const defaultPort = INDIAN_PORTS.find((p) => p.name === 'Kochi') || INDIAN_PORTS[0];

// Persisted locally (AsyncStorage) so a cold start — especially offline,
// where there's no backend to load from at all — comes back with the
// fisherman's real saved vessel/port/language instead of silently
// resetting to these hardcoded defaults (medium boat, Kochi, English)
// every single launch. loadFromBackend() (called once at RootNavigator
// mount) still reconciles with the server afterwards whenever online, so
// this is a local cache of the last-known-good profile, not the source of
// truth.
export const useUserStore = create<UserProfileState>()(
  persist(
    (set, get) => ({
      deviceId: getDeviceId(),
      userId: 'USR-KOC-4821',
      userName: 'Ramesh Kumar',
      vesselType: 'medium',
      riskTolerance: 'moderate',
      operatingPort: 'Kochi',
      portInfo: defaultPort,
      role: 'fisherman',
      language: 'en',
      isLoggedIn: true,
      isBackendSynced: false,

      setUserId: (userId) => set({ userId }),
      setUserName: (userName) => set({ userName }),
      setVesselType: (vesselType) => set({ vesselType }),
      setRiskTolerance: (riskTolerance) => set({ riskTolerance }),
      setOperatingPort: (portName) => {
        const found = INDIAN_PORTS.find((p) => p.name.toLowerCase() === portName.toLowerCase()) || INDIAN_PORTS[0];
        set({ operatingPort: found.name, portInfo: found });
      },
      setRole: (role) => set({ role }),
      setLanguage: (language) => set({ language }),

      loginWithProfile: (profile) => {
        const foundPort = INDIAN_PORTS.find((p) => p.name.toLowerCase() === profile.operating_port.toLowerCase()) || INDIAN_PORTS[0];
        set({
          userId: profile.user_id || '',
          userName: profile.name || 'Fisherman',
          deviceId: profile.device_id || get().deviceId,
          vesselType: (profile.vessel_type as VesselType) || 'medium',
          riskTolerance: (profile.risk_tolerance as RiskTolerance) || 'moderate',
          operatingPort: foundPort.name,
          portInfo: foundPort,
          role: (profile.role as UserRole) || 'fisherman',
          language: profile.language || 'en',
          isLoggedIn: true,
          isBackendSynced: true,
        });
      },

      logout: () => {
        set({ isLoggedIn: false });
      },

      signUp: async (params) => {
        const { deviceId } = get();
        const foundPort = INDIAN_PORTS.find((p) => p.name.toLowerCase() === params.operatingPort.toLowerCase()) || INDIAN_PORTS[0];
        try {
          const res = await profileAPI.upsertProfile({
            device_id: deviceId,
            name: params.name,
            password: params.password || 'SeaSarathi@2026',
            operating_port: foundPort.name,
            vessel_type: params.vesselType,
            role: params.role,
            language: params.language,
            risk_tolerance: params.riskTolerance,
          });

          set({
            userId: res.user_id,
            userName: res.name,
            vesselType: res.vessel_type as VesselType,
            riskTolerance: res.risk_tolerance as RiskTolerance,
            operatingPort: foundPort.name,
            portInfo: foundPort,
            role: res.role as UserRole,
            language: res.language,
            isLoggedIn: true,
            isBackendSynced: true,
          });
          return { success: true, userId: res.user_id };
        } catch (err: any) {
          return { success: false, error: err?.message || 'Sign up failed' };
        }
      },

      getVesselRangeKm: () => {
        const { vesselType } = get();
        switch (vesselType) {
          case 'small':
            return 9;
          case 'medium':
            return 22;
          case 'large':
            return 370;
          case 'union':
            return 500;
          default:
            return 22;
        }
      },

      getLanguageInfo: () => {
        const { language } = get();
        return INDIAN_LANGUAGES.find((l) => l.code === language) || INDIAN_LANGUAGES[0];
      },

      syncWithBackend: async () => {
        const { deviceId, userId, userName, vesselType, riskTolerance, operatingPort, role, language } = get();
        try {
          const res = await profileAPI.upsertProfile({
            device_id: deviceId,
            user_id: userId || undefined,
            name: userName,
            vessel_type: vesselType,
            risk_tolerance: riskTolerance,
            operating_port: operatingPort,
            role: role,
            language: language,
          });
          set({
            userId: res.user_id,
            userName: res.name,
            isBackendSynced: true,
          });
          return true;
        } catch {
          set({ isBackendSynced: false });
          return false;
        }
      },

      loadFromBackend: async () => {
        const { deviceId, userId } = get();
        const identifier = userId || deviceId;
        try {
          const profile = await profileAPI.getProfile(identifier);
          if (profile) {
            const foundPort = INDIAN_PORTS.find((p) => p.name.toLowerCase() === profile.operating_port.toLowerCase()) || INDIAN_PORTS[0];
            set({
              userId: profile.user_id,
              userName: profile.name,
              vesselType: profile.vessel_type as VesselType,
              riskTolerance: profile.risk_tolerance as RiskTolerance,
              operatingPort: foundPort.name,
              portInfo: foundPort,
              role: profile.role as UserRole,
              language: profile.language,
              isBackendSynced: true,
            });
            return true;
          }
        } catch {
          // Backend not reached or profile not yet created
        }
        return false;
      },
    }),
    {
      name: 'seasarathi-user-profile',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        userId: state.userId,
        userName: state.userName,
        vesselType: state.vesselType,
        riskTolerance: state.riskTolerance,
        operatingPort: state.operatingPort,
        portInfo: state.portInfo,
        role: state.role,
        language: state.language,
        isLoggedIn: state.isLoggedIn,
      }),
    }
  )
);

