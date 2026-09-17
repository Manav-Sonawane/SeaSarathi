/**
 * common.ts — "common" namespace translations, split out of the old
 * monolithic screenTranslations.ts so editing this screen's copy never
 * requires opening (or risking a collision in) every other screen's file.
 * Aggregated back together by screenTranslations.ts's getScreenText().
 */

export interface CommonText {
    showingCurrentLocation: string;
    showingHomePort: string;
  }

export const COMMON_TEXT: Record<string, CommonText> = {
  en: {
      showingCurrentLocation: 'Showing: {name} (Current Location)',
      showingHomePort: 'Showing: {name} (Home Port)',
    },
  ml: {
      showingCurrentLocation: 'കാണിക്കുന്നത്: {name} (നിലവിലെ സ്ഥാനം)',
      showingHomePort: 'കാണിക്കുന്നത്: {name} (ഹോം പോർട്ട്)',
    },
  ta: {
      showingCurrentLocation: 'காட்டப்படுவது: {name} (தற்போதைய இருப்பிடம்)',
      showingHomePort: 'காட்டப்படுவது: {name} (வீட்டு துறைமுகம்)',
    },
  te: {
      showingCurrentLocation: 'చూపిస్తోంది: {name} (ప్రస్తుత స్థానం)',
      showingHomePort: 'చూపిస్తోంది: {name} (హోమ్ పోర్ట్)',
    },
  bn: {
      showingCurrentLocation: 'দেখানো হচ্ছে: {name} (বর্তমান অবস্থান)',
      showingHomePort: 'দেখানো হচ্ছে: {name} (হোম পোর্ট)',
    },
  gu: {
      showingCurrentLocation: 'બતાવી રહ્યું છે: {name} (વર્તમાન સ્થાન)',
      showingHomePort: 'બતાવી રહ્યું છે: {name} (હોમ પોર્ટ)',
    },
  mr: {
      showingCurrentLocation: 'दाखवत आहे: {name} (सध्याचे स्थान)',
      showingHomePort: 'दाखवत आहे: {name} (होम पोर्ट)',
    },
  or: {
      showingCurrentLocation: 'ଦେଖାଉଛି: {name} (ବର୍ତ୍ତମାନ ଅବସ୍ଥାନ)',
      showingHomePort: 'ଦେଖାଉଛି: {name} (ହୋମ୍ ପୋର୍ଟ)',
    },
  kn: {
      showingCurrentLocation: 'ತೋರಿಸಲಾಗುತ್ತಿದೆ: {name} (ಪ್ರಸ್ತುತ ಸ್ಥಳ)',
      showingHomePort: 'ತೋರಿಸಲಾಗುತ್ತಿದೆ: {name} (ಹೋಮ್ ಪೋರ್ಟ್)',
    },
  hi: {
      showingCurrentLocation: 'दिखा रहे हैं: {name} (वर्तमान स्थान)',
      showingHomePort: 'दिखा रहे हैं: {name} (होम पोर्ट)',
    },
};
