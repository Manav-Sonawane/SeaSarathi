/**
 * compass.ts — CompassScreen translations. Only some languages have this
 * filled in (see screenTranslations.ts's getScreenText — missing languages
 * fall back to English for this namespace); that gap predates this split
 * and isn't something this refactor changes.
 */

export interface CompassText {
  title: string;
  subtitle: string;
  offlineBadge: string;
  onCourse: string;
  steerStarboard: string;
  steerPort: string;
  targetPortLabel: string;
  bearingLabel: string;
  distanceLabel: string;
  etaLabel: string;
  switchToNearest: string;
  selectPort: string;
  vhfDistressTitle: string;
  vhfChannel16: string;
  coastGuardHotline: string;
  emergencyCoords: string;
  maydayScriptTitle: string;
  maydayScript: string;
  calibrateHeading: string;
  manualHeadingNotice: string;
  returnToShoreCta: string;
}

export const COMPASS_TEXT: Partial<Record<string, CompassText>> = {
  en: {
      title: 'Marine Compass',
      subtitle: '100% Offline Emergency Return-to-Shore Navigation',
      offlineBadge: 'OFFLINE SATELLITE GPS',
      onCourse: 'ON COURSE — KEEP STEADY',
      steerStarboard: 'STEER STARBOARD (RIGHT)',
      steerPort: 'STEER PORT (LEFT)',
      targetPortLabel: 'Safe Shore Destination',
      bearingLabel: 'Bearing to Shore',
      distanceLabel: 'Distance',
      etaLabel: 'Estimated Time',
      switchToNearest: 'Switch to Nearest Safe Harbor',
      selectPort: 'Select Safe Harbor',
      vhfDistressTitle: 'VHF Emergency Distress Guide',
      vhfChannel16: 'VHF Channel 16 (156.8 MHz) Calling',
      coastGuardHotline: 'Coast Guard Emergency: 1554',
      emergencyCoords: 'VHF Radio GPS Coordinates',
      maydayScriptTitle: 'Emergency MAYDAY Protocol Script',
      maydayScript: 'MAYDAY, MAYDAY, MAYDAY. This is vessel [Name/ID]. Position: {coords}. Caught in severe sea calamity. Request immediate shore assistance.',
      calibrateHeading: 'Drag compass or tap to adjust heading',
      manualHeadingNotice: 'Using compass / manual helm orientation',
      returnToShoreCta: 'Return to Shore Compass',
    },
  ml: {
      title: 'മറൈൻ കോമ്പസ്',
      subtitle: 'ഓഫ്‌ലൈൻ അടിയന്തര തീരദേശ രക്ഷാ നാവിഗേഷൻ',
      offlineBadge: 'ഓഫ്‌ലൈൻ സാറ്റലൈറ്റ് ജിപിഎസ്',
      onCourse: 'ശരിയായ പാതയിൽ — നേരെ പോകുക',
      steerStarboard: 'വലത്തോട്ട് തിരിക്കുക (സ്റ്റാർബോർഡ്)',
      steerPort: 'ഇടത്തോട്ട് തിരിക്കുക (പോർട്ട്)',
      targetPortLabel: 'സുരക്ഷിത തുറമുഖം',
      bearingLabel: 'തീരത്തേക്കുള്ള ദിശ',
      distanceLabel: 'ദൂരം',
      etaLabel: 'എത്തിച്ചേരാൻ വേണ്ട സമയം',
      switchToNearest: 'അടുത്തുള്ള തുറമുഖം തിരഞ്ഞെടുക്കുക',
      selectPort: 'തുറമുഖം മാറ്റുക',
      vhfDistressTitle: 'വിഎച്ച്എഫ് അടിയന്തര സഹായം',
      vhfChannel16: 'വിഎച്ച്എഫ് ചാനൽ 16 (156.8 MHz) അടിയന്തര കോളിംഗ്',
      coastGuardHotline: 'കോസ്റ്റ് ഗാർഡ് എമർജൻസി: 1554',
      emergencyCoords: 'വിഎച്ച്എഫ് റേഡിയോ ജിപിഎസ് സ്ഥാനം',
      maydayScriptTitle: 'അടിയന്തര മേയ്ഡേ സന്ദേശം',
      maydayScript: 'മേയ്ഡേ, മേയ്ഡേ, മേയ്ഡേ. ഇത് ബോട്ട് [പേര്/ഐഡി]. സ്ഥാനം: {coords}. കടൽക്ഷോഭത്തിൽപ്പെട്ടു. അടിയന്തര സഹായം അഭ്യർത്ഥിക്കുന്നു.',
      calibrateHeading: 'കോമ്പസ് തിരിക്കാൻ ടാപ്പ് ചെയ്യുക അല്ലെങ്കിൽ ഡ്രാഗ് ചെയ്യുക',
      manualHeadingNotice: 'കോമ്പസ് ഓറിയന്റേഷൻ ഉപയോഗിക്കുന്നു',
      returnToShoreCta: 'തീരത്തേക്ക് മടങ്ങാനുള്ള കോമ്പസ്',
    },
  hi: {
      title: 'समुद्री कम्पास',
      subtitle: '100% ऑफलाइन तट वापसी नेविगेशन',
      offlineBadge: 'ऑफलाइन सैटेलाइट जीपीएस',
      onCourse: 'सही दिशा में — सीधे आगे बढ़ें',
      steerStarboard: 'दाएं मुड़ें (Starboard)',
      steerPort: 'बाएं मुड़ें (Port)',
      targetPortLabel: 'सुरक्षित बंदरगाह गंतव्य',
      bearingLabel: 'तट की दिशा (Bearing)',
      distanceLabel: 'दूरी',
      etaLabel: 'अनुमानित समय',
      switchToNearest: 'निकटतम सुरक्षित बंदरगाह चुनें',
      selectPort: 'बंदरगाह बदलें',
      vhfDistressTitle: 'VHF आपातकालीन संकट गाइड',
      vhfChannel16: 'VHF चैनल 16 (156.8 MHz) आपातकालीन कॉलिंग',
      coastGuardHotline: 'तटरक्षक आपातकालीन नंबर: 1554',
      emergencyCoords: 'VHF रेडियो GPS निर्देशांक',
      maydayScriptTitle: 'आपातकालीन MAYDAY प्रोटोकॉल',
      maydayScript: 'MAYDAY, MAYDAY, MAYDAY। यह नाव [नाम/आईडी] है। स्थान: {coords}। समुद्री संकट में हैं। तत्काल सहायता का अनुरोध है।',
      calibrateHeading: 'दिशा समायोजित करने के लिए घुमाएं',
      manualHeadingNotice: 'कम्पास दिशा निर्देशन सक्रिय',
      returnToShoreCta: 'तट वापसी कम्पास',
    },
};
