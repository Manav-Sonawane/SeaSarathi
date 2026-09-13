import { create } from 'zustand';
import { File, Paths } from 'expo-file-system';
import { INDIAN_PORTS, INDIAN_LANGUAGES, PortInfo, LanguageInfo } from '../constants/portsAndLanguages';
import { profileAPI } from '../services/api';

export type VesselType = 'small' | 'medium' | 'large' | 'union';
export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';
export type UserRole = 'fisherman' | 'union_leader';

const DEVICE_ID_FILENAME = 'seasarathi_device_id.txt';

function generateDeviceId(): string {
  return 'device_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
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
  vesselType: VesselType;
  riskTolerance: RiskTolerance;
  operatingPort: string;
  portInfo: PortInfo;
  role: UserRole;
  language: string;
  isBackendSynced: boolean;
  
  setVesselType: (vessel: VesselType) => void;
  setRiskTolerance: (risk: RiskTolerance) => void;
  setOperatingPort: (portName: string) => void;
  setRole: (role: UserRole) => void;
  setLanguage: (langCode: string) => void;
  getVesselRangeKm: () => number;
  getLanguageInfo: () => LanguageInfo;
  syncWithBackend: () => Promise<boolean>;
  loadFromBackend: () => Promise<boolean>;
}

const defaultPort = INDIAN_PORTS.find((p) => p.name === 'Kochi') || INDIAN_PORTS[0];

export const useUserStore = create<UserProfileState>((set, get) => ({
  deviceId: getDeviceId(),
  vesselType: 'medium',
  riskTolerance: 'moderate',
  operatingPort: 'Kochi',
  portInfo: defaultPort,
  role: 'fisherman',
  language: 'en',
  isBackendSynced: false,

  setVesselType: (vesselType) => set({ vesselType }),
  setRiskTolerance: (riskTolerance) => set({ riskTolerance }),
  setOperatingPort: (portName) => {
    const found = INDIAN_PORTS.find((p) => p.name.toLowerCase() === portName.toLowerCase()) || INDIAN_PORTS[0];
    set({ operatingPort: found.name, portInfo: found });
  },
  setRole: (role) => set({ role }),
  setLanguage: (language) => set({ language }),

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
    const { deviceId, vesselType, riskTolerance, operatingPort, role, language } = get();
    try {
      await profileAPI.upsertProfile({
        device_id: deviceId,
        vessel_type: vesselType,
        risk_tolerance: riskTolerance,
        operating_port: operatingPort,
        role: role,
        language: language,
      });
      set({ isBackendSynced: true });
      return true;
    } catch {
      set({ isBackendSynced: false });
      return false;
    }
  },

  loadFromBackend: async () => {
    const { deviceId } = get();
    try {
      const profile = await profileAPI.getProfile(deviceId);
      if (profile) {
        const foundPort = INDIAN_PORTS.find((p) => p.name.toLowerCase() === profile.operating_port.toLowerCase()) || INDIAN_PORTS[0];
        set({
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
}));
