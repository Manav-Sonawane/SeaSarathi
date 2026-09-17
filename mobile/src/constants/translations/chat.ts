/**
 * chat.ts — "chat" namespace translations, split out of the old
 * monolithic screenTranslations.ts so editing this screen's copy never
 * requires opening (or risking a collision in) every other screen's file.
 * Aggregated back together by screenTranslations.ts's getScreenText().
 */

export interface ChatText {
    lowRisk: string;
    moderateRisk: string;
    highRisk: string;
    safetyIndexSuffix: string;
    youLabel: string;
    onlineLabel: string;
    loadingText: string;
    autoRefreshedLabel: string;
    offlineModePrefix: string;
    freshnessButtonLabel: string;
    freshnessQuery: string;
  }

export const CHAT_TEXT: Record<string, ChatText> = {
  en: {
      lowRisk: 'LOW RISK',
      moderateRisk: 'MODERATE RISK',
      highRisk: 'HIGH RISK',
      safetyIndexSuffix: '/100 SAFETY INDEX',
      youLabel: 'You',
      onlineLabel: 'ONLINE',
      loadingText: 'Fetching localized ocean conditions...',
      autoRefreshedLabel: 'Auto-Refreshed',
      offlineModePrefix: 'OFFLINE mode (last updated:',
      freshnessButtonLabel: 'Data Freshness (<6h)',
      freshnessQuery: 'How old is the currently fetched data? If it is more than 6 hours old, re-fetch it.',
    },
  ml: {
      lowRisk: 'കുറഞ്ഞ അപകടസാധ്യത',
      moderateRisk: 'മിതമായ അപകടസാധ്യത',
      highRisk: 'ഉയർന്ന അപകടസാധ്യത',
      safetyIndexSuffix: '/100 സുരക്ഷാ സൂചിക',
      youLabel: 'നിങ്ങൾ',
      onlineLabel: 'ഓൺലൈൻ',
      loadingText: 'പ്രാദേശിക കടൽ അവസ്ഥ ലഭ്യമാക്കുന്നു...',
      autoRefreshedLabel: 'സ്വയമേവ പുതുക്കി',
      offlineModePrefix: 'ഓഫ്‌ലൈൻ മോഡ് (അവസാനം പുതുക്കിയത്:',
      freshnessButtonLabel: 'ഡാറ്റ പുതുമ (<6മ)',
      freshnessQuery: 'നിലവിലെ ഡാറ്റ എത്ര പഴയതാണ്? 6 മണിക്കൂറിലധികം പഴയതാണെങ്കിൽ വീണ്ടും ലഭ്യമാക്കുക.',
    },
  ta: {
      lowRisk: 'குறைந்த ஆபத்து',
      moderateRisk: 'மிதமான ஆபத்து',
      highRisk: 'அதிக ஆபத்து',
      safetyIndexSuffix: '/100 பாதுகாப்பு குறியீடு',
      youLabel: 'நீங்கள்',
      onlineLabel: 'ஆன்லைன்',
      loadingText: 'உள்ளூர் கடல் நிலைமைகளை பெறுகிறது...',
      autoRefreshedLabel: 'தானாக புதுப்பிக்கப்பட்டது',
      offlineModePrefix: 'ஆஃப்லைன் பயன்முறை (கடைசியாக புதுப்பிக்கப்பட்டது:',
      freshnessButtonLabel: 'தரவு புதுமை (<6ம)',
      freshnessQuery: 'தற்போதைய தரவு எவ்வளவு பழையது? 6 மணி நேரத்திற்கும் மேலாக பழையதாக இருந்தால் மீண்டும் பெறவும்.',
    },
  te: {
      lowRisk: 'తక్కువ ప్రమాదం',
      moderateRisk: 'మధ్యస్థ ప్రమాదం',
      highRisk: 'అధిక ప్రమాదం',
      safetyIndexSuffix: '/100 భద్రతా సూచిక',
      youLabel: 'మీరు',
      onlineLabel: 'ఆన్‌లైన్',
      loadingText: 'స్థానిక సముద్ర పరిస్థితులను పొందుతోంది...',
      autoRefreshedLabel: 'స్వయంచాలకంగా రిఫ్రెష్ చేయబడింది',
      offlineModePrefix: 'ఆఫ్‌లైన్ మోడ్ (చివరిగా నవీకరించబడింది:',
      freshnessButtonLabel: 'డేటా తాజాదనం (<6గం)',
      freshnessQuery: 'ప్రస్తుత డేటా ఎంత పాతది? 6 గంటలకు మించి పాతదైతే మళ్లీ పొందండి.',
    },
  bn: {
      lowRisk: 'কম ঝুঁকি',
      moderateRisk: 'মাঝারি ঝুঁকি',
      highRisk: 'উচ্চ ঝুঁকি',
      safetyIndexSuffix: '/১০০ নিরাপত্তা সূচক',
      youLabel: 'আপনি',
      onlineLabel: 'অনলাইন',
      loadingText: 'স্থানীয় সমুদ্র পরিস্থিতি আনা হচ্ছে...',
      autoRefreshedLabel: 'স্বয়ংক্রিয়ভাবে রিফ্রেশ হয়েছে',
      offlineModePrefix: 'অফলাইন মোড (সর্বশেষ আপডেট:',
      freshnessButtonLabel: 'ডেটার সতেজতা (<৬ঘ)',
      freshnessQuery: 'বর্তমান তথ্য কত পুরনো? যদি ৬ ঘণ্টার বেশি পুরনো হয় তবে আবার আনুন।',
    },
  gu: {
      lowRisk: 'ઓછું જોખમ',
      moderateRisk: 'મધ્યમ જોખમ',
      highRisk: 'વધુ જોખમ',
      safetyIndexSuffix: '/100 સુરક્ષા સૂચકાંક',
      youLabel: 'તમે',
      onlineLabel: 'ઓનલાઇન',
      loadingText: 'સ્થાનિક દરિયાઈ સ્થિતિ મેળવી રહ્યા છીએ...',
      autoRefreshedLabel: 'આપમેળે તાજું કરાયું',
      offlineModePrefix: 'ઓફલાઇન મોડ (છેલ્લે અપડેટ થયું:',
      freshnessButtonLabel: 'ડેટા તાજગી (<6ક)',
      freshnessQuery: 'હાલનો ડેટા કેટલો જૂનો છે? જો 6 કલાકથી વધુ જૂનો હોય તો ફરીથી મેળવો.',
    },
  mr: {
      lowRisk: 'कमी धोका',
      moderateRisk: 'मध्यम धोका',
      highRisk: 'जास्त धोका',
      safetyIndexSuffix: '/100 सुरक्षा निर्देशांक',
      youLabel: 'तुम्ही',
      onlineLabel: 'ऑनलाइन',
      loadingText: 'स्थानिक सागरी परिस्थिती मिळवत आहे...',
      autoRefreshedLabel: 'आपोआप रिफ्रेश केले',
      offlineModePrefix: 'ऑफलाइन मोड (शेवटचे अद्यतन:',
      freshnessButtonLabel: 'डेटा ताजेपणा (<6ता)',
      freshnessQuery: 'सध्याचा डेटा किती जुना आहे? 6 तासांपेक्षा जुना असल्यास पुन्हा मिळवा.',
    },
  or: {
      lowRisk: 'କମ ବିପଦ',
      moderateRisk: 'ମଧ୍ୟମ ବିପଦ',
      highRisk: 'ଅଧିକ ବିପଦ',
      safetyIndexSuffix: '/100 ସୁରକ୍ଷା ସୂଚକ',
      youLabel: 'ଆପଣ',
      onlineLabel: 'ଅନଲାଇନ',
      loadingText: 'ସ୍ଥାନୀୟ ସାମୁଦ୍ରିକ ସ୍ଥିତି ଆଣୁଛି...',
      autoRefreshedLabel: 'ସ୍ୱୟଂଚାଳିତ ଭାବେ ରିଫ୍ରେଶ୍ ହେଲା',
      offlineModePrefix: 'ଅଫଲାଇନ ମୋଡ୍ (ଶେଷ ଅଦ୍ୟତନ:',
      freshnessButtonLabel: 'ତଥ୍ୟ ସତେଜତା (<6ଘ)',
      freshnessQuery: 'ବର୍ତ୍ତମାନର ତଥ୍ୟ କେତେ ପୁରୁଣା? ଯଦି 6 ଘଣ୍ଟାରୁ ଅଧିକ ପୁରୁଣା ହୋଇଥାଏ, ପୁନଃ ଆଣନ୍ତୁ।',
    },
  kn: {
      lowRisk: 'ಕಡಿಮೆ ಅಪಾಯ',
      moderateRisk: 'ಮಧ್ಯಮ ಅಪಾಯ',
      highRisk: 'ಹೆಚ್ಚಿನ ಅಪಾಯ',
      safetyIndexSuffix: '/100 ಸುರಕ್ಷತಾ ಸೂಚ್ಯಂಕ',
      youLabel: 'ನೀವು',
      onlineLabel: 'ಆನ್‌ಲೈನ್',
      loadingText: 'ಸ್ಥಳೀಯ ಸಮುದ್ರ ಪರಿಸ್ಥಿತಿಗಳನ್ನು ಪಡೆಯುತ್ತಿದೆ...',
      autoRefreshedLabel: 'ಸ್ವಯಂಚಾಲಿತವಾಗಿ ರಿಫ್ರೆಶ್ ಆಗಿದೆ',
      offlineModePrefix: 'ಆಫ್‌ಲೈನ್ ಮೋಡ್ (ಕೊನೆಯದಾಗಿ ನವೀಕರಿಸಲಾಗಿದೆ:',
      freshnessButtonLabel: 'ದತ್ತಾಂಶ ತಾಜಾತನ (<6ಗಂ)',
      freshnessQuery: 'ಪ್ರಸ್ತುತ ದತ್ತಾಂಶ ಎಷ್ಟು ಹಳೆಯದು? 6 ಗಂಟೆಗಳಿಗಿಂತ ಹಳೆಯದಾಗಿದ್ದರೆ ಮತ್ತೆ ಪಡೆಯಿರಿ.',
    },
  hi: {
      lowRisk: 'कम जोखिम',
      moderateRisk: 'मध्यम जोखिम',
      highRisk: 'अधिक जोखिम',
      safetyIndexSuffix: '/100 सुरक्षा सूचकांक',
      youLabel: 'आप',
      onlineLabel: 'ऑनलाइन',
      loadingText: 'स्थानीय समुद्री स्थिति प्राप्त हो रही है...',
      autoRefreshedLabel: 'स्वचालित रूप से रीफ्रेश किया गया',
      offlineModePrefix: 'ऑफलाइन मोड (अंतिम अपडेट:',
      freshnessButtonLabel: 'डेटा ताज़गी (<6घं)',
      freshnessQuery: 'वर्तमान डेटा कितना पुराना है? यदि 6 घंटे से अधिक पुराना है तो री-फ़ेच करें।',
    },
};
