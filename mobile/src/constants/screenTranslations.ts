/**
 * screenTranslations.ts — aggregates per-screen translation namespaces
 * (each in src/constants/translations/*.ts) into the ScreenText shape the
 * rest of the app already imports via getScreenText(). Kept separate from
 * portsAndLanguages.ts's LanguageInfo.uiText (used by Chat/Dashboard) so
 * each screen's translation set can grow independently. Falls back to
 * English for any language code or namespace key not present.
 *
 * This file used to hold all namespaces x all 10 languages directly
 * (2300+ lines) — every new UI string for any screen meant editing this
 * one file, which made unrelated translation work collide constantly. Each
 * namespace now lives in its own file under translations/ instead.
 */
import { CommonText, COMMON_TEXT } from './translations/common';
import { PfzText, PFZ_TEXT } from './translations/pfz';
import { AlertsText, ALERTS_TEXT } from './translations/alerts';
import { MapText, MAP_TEXT } from './translations/map';
import { ProfileText, PROFILE_TEXT } from './translations/profile';
import { VoiceText, VOICE_TEXT } from './translations/voice';
import { DashboardText, DASHBOARD_TEXT } from './translations/dashboard';
import { ChatText, CHAT_TEXT } from './translations/chat';
import { CompassText, COMPASS_TEXT } from './translations/compass';

export interface ScreenText {
  common: CommonText;
  pfz: PfzText;
  alerts: AlertsText;
  map: MapText;
  profile: ProfileText;
  voice: VoiceText;
  dashboard: DashboardText;
  chat: ChatText;
  compass?: CompassText;
}

export const SCREEN_TEXT: Record<string, ScreenText> = {
  en: {
    common: COMMON_TEXT.en,
    pfz: PFZ_TEXT.en,
    alerts: ALERTS_TEXT.en,
    map: MAP_TEXT.en,
    profile: PROFILE_TEXT.en,
    voice: VOICE_TEXT.en,
    dashboard: DASHBOARD_TEXT.en,
    chat: CHAT_TEXT.en,
    compass: COMPASS_TEXT.en,
  },
  ml: {
    common: COMMON_TEXT.ml,
    pfz: PFZ_TEXT.ml,
    alerts: ALERTS_TEXT.ml,
    map: MAP_TEXT.ml,
    profile: PROFILE_TEXT.ml,
    voice: VOICE_TEXT.ml,
    dashboard: DASHBOARD_TEXT.ml,
    chat: CHAT_TEXT.ml,
    compass: COMPASS_TEXT.ml,
  },
  ta: {
    common: COMMON_TEXT.ta,
    pfz: PFZ_TEXT.ta,
    alerts: ALERTS_TEXT.ta,
    map: MAP_TEXT.ta,
    profile: PROFILE_TEXT.ta,
    voice: VOICE_TEXT.ta,
    dashboard: DASHBOARD_TEXT.ta,
    chat: CHAT_TEXT.ta,
    compass: COMPASS_TEXT.ta,
  },
  te: {
    common: COMMON_TEXT.te,
    pfz: PFZ_TEXT.te,
    alerts: ALERTS_TEXT.te,
    map: MAP_TEXT.te,
    profile: PROFILE_TEXT.te,
    voice: VOICE_TEXT.te,
    dashboard: DASHBOARD_TEXT.te,
    chat: CHAT_TEXT.te,
    compass: COMPASS_TEXT.te,
  },
  bn: {
    common: COMMON_TEXT.bn,
    pfz: PFZ_TEXT.bn,
    alerts: ALERTS_TEXT.bn,
    map: MAP_TEXT.bn,
    profile: PROFILE_TEXT.bn,
    voice: VOICE_TEXT.bn,
    dashboard: DASHBOARD_TEXT.bn,
    chat: CHAT_TEXT.bn,
    compass: COMPASS_TEXT.bn,
  },
  gu: {
    common: COMMON_TEXT.gu,
    pfz: PFZ_TEXT.gu,
    alerts: ALERTS_TEXT.gu,
    map: MAP_TEXT.gu,
    profile: PROFILE_TEXT.gu,
    voice: VOICE_TEXT.gu,
    dashboard: DASHBOARD_TEXT.gu,
    chat: CHAT_TEXT.gu,
    compass: COMPASS_TEXT.gu,
  },
  mr: {
    common: COMMON_TEXT.mr,
    pfz: PFZ_TEXT.mr,
    alerts: ALERTS_TEXT.mr,
    map: MAP_TEXT.mr,
    profile: PROFILE_TEXT.mr,
    voice: VOICE_TEXT.mr,
    dashboard: DASHBOARD_TEXT.mr,
    chat: CHAT_TEXT.mr,
    compass: COMPASS_TEXT.mr,
  },
  or: {
    common: COMMON_TEXT.or,
    pfz: PFZ_TEXT.or,
    alerts: ALERTS_TEXT.or,
    map: MAP_TEXT.or,
    profile: PROFILE_TEXT.or,
    voice: VOICE_TEXT.or,
    dashboard: DASHBOARD_TEXT.or,
    chat: CHAT_TEXT.or,
    compass: COMPASS_TEXT.or,
  },
  kn: {
    common: COMMON_TEXT.kn,
    pfz: PFZ_TEXT.kn,
    alerts: ALERTS_TEXT.kn,
    map: MAP_TEXT.kn,
    profile: PROFILE_TEXT.kn,
    voice: VOICE_TEXT.kn,
    dashboard: DASHBOARD_TEXT.kn,
    chat: CHAT_TEXT.kn,
    compass: COMPASS_TEXT.kn,
  },
  hi: {
    common: COMMON_TEXT.hi,
    pfz: PFZ_TEXT.hi,
    alerts: ALERTS_TEXT.hi,
    map: MAP_TEXT.hi,
    profile: PROFILE_TEXT.hi,
    voice: VOICE_TEXT.hi,
    dashboard: DASHBOARD_TEXT.hi,
    chat: CHAT_TEXT.hi,
    compass: COMPASS_TEXT.hi,
  },
};

export function getScreenText(code: string): ScreenText & { compass: CompassText } {
  const selected = SCREEN_TEXT[code];
  if (!selected || code === 'en') return SCREEN_TEXT.en as ScreenText & { compass: CompassText };
  return {
    ...SCREEN_TEXT.en,
    ...selected,
    compass: selected.compass || SCREEN_TEXT.en.compass!,
    common: { ...SCREEN_TEXT.en.common, ...selected.common },
    dashboard: { ...SCREEN_TEXT.en.dashboard, ...selected.dashboard },
    profile: { ...SCREEN_TEXT.en.profile, ...selected.profile },
    pfz: { ...SCREEN_TEXT.en.pfz, ...selected.pfz },
    alerts: { ...SCREEN_TEXT.en.alerts, ...selected.alerts },
    map: { ...SCREEN_TEXT.en.map, ...selected.map },
    voice: { ...SCREEN_TEXT.en.voice, ...selected.voice },
    chat: { ...SCREEN_TEXT.en.chat, ...selected.chat },
  };
}
export type { CompassText };
