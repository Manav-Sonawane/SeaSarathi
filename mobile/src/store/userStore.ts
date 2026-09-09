import { create } from 'zustand';
import { INDIAN_PORTS, INDIAN_LANGUAGES, PortInfo, LanguageInfo } from '../constants/portsAndLanguages';

export type VesselType = 'small' | 'medium' | 'large' | 'union';
export type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';
export type UserRole = 'fisherman' | 'union_leader';

export interface UserProfileState {
  vesselType: VesselType;
  riskTolerance: RiskTolerance;
  operatingPort: string;
  portInfo: PortInfo;
  role: UserRole;
  language: string;
  
  setVesselType: (vessel: VesselType) => void;
  setRiskTolerance: (risk: RiskTolerance) => void;
  setOperatingPort: (portName: string) => void;
  setRole: (role: UserRole) => void;
  setLanguage: (langCode: string) => void;
  getVesselRangeKm: () => number;
  getLanguageInfo: () => LanguageInfo;
}

const defaultPort = INDIAN_PORTS.find((p) => p.name === 'Kochi') || INDIAN_PORTS[0];

export const useUserStore = create<UserProfileState>((set, get) => ({
  vesselType: 'medium',
  riskTolerance: 'moderate',
  operatingPort: 'Kochi',
  portInfo: defaultPort,
  role: 'fisherman',
  language: 'en',

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
}));
