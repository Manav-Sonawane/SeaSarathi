import { create } from 'zustand';
import { INDIAN_PORTS, INDIAN_LANGUAGES, PortInfo, LanguageInfo } from '../constants/portsAndLanguages';
import { profileAPI } from '../services/api';

export type VesselType = 'small' | 'medium' | 'large' | 'union';
export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';
export type UserRole = 'fisherman' | 'union_leader';

const getDeviceId = (): string => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      let id = window.localStorage.getItem('seasarathi_device_id');
      if (!id) {
        id = 'device_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
        window.localStorage.setItem('seasarathi_device_id', id);
      }
      return id;
    }
  } catch {
    // Fallback if localStorage unavailable
  }
  return 'device_seasarathi_default_01';
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
        return 15;
      case 'medium':
        return 35;
      case 'large':
        return 75;
      case 'union':
        return 100;
      default:
        return 35;
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
