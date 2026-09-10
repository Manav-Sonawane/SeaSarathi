export interface PortInfo {
  id: string;
  name: string;
  state: string;
  latitude: number;
  longitude: number;
  region: string;
  sea: 'Arabian Sea' | 'Bay of Bengal' | 'Andaman Sea' | 'Lakshadweep Sea';
}

export const INDIAN_PORTS: PortInfo[] = [
  // Kerala
  { id: 'kochi', name: 'Kochi', state: 'Kerala', latitude: 9.9312, longitude: 76.2673, region: 'Malabar Coast', sea: 'Arabian Sea' },
  { id: 'munambam', name: 'Munambam', state: 'Kerala', latitude: 10.1824, longitude: 76.1625, region: 'Ernakulam North', sea: 'Arabian Sea' },
  { id: 'kollam', name: 'Kollam (Neendakara)', state: 'Kerala', latitude: 8.9412, longitude: 76.5421, region: 'Travancore South', sea: 'Arabian Sea' },
  { id: 'vizhinjam', name: 'Vizhinjam', state: 'Kerala', latitude: 8.3742, longitude: 76.9932, region: 'Trivandrum Deep Sea', sea: 'Arabian Sea' },
  { id: 'beypore', name: 'Beypore', state: 'Kerala', latitude: 11.1633, longitude: 75.8041, region: 'Kozhikode Sector', sea: 'Arabian Sea' },
  { id: 'azhikkal', name: 'Azhikkal', state: 'Kerala', latitude: 11.9315, longitude: 75.3211, region: 'Kannur Coast', sea: 'Arabian Sea' },

  // Tamil Nadu
  { id: 'tuticorin', name: 'Tuticorin (Thoothukudi)', state: 'Tamil Nadu', latitude: 8.7642, longitude: 78.1348, region: 'Coromandel South', sea: 'Bay of Bengal' },
  { id: 'chennai', name: 'Chennai (Royapuram)', state: 'Tamil Nadu', latitude: 13.1205, longitude: 80.2941, region: 'Northern Coromandel', sea: 'Bay of Bengal' },
  { id: 'nagapattinam', name: 'Nagapattinam', state: 'Tamil Nadu', latitude: 10.7621, longitude: 79.8425, region: 'Cauvery Delta', sea: 'Bay of Bengal' },
  { id: 'cuddalore', name: 'Cuddalore', state: 'Tamil Nadu', latitude: 11.7511, longitude: 79.7720, region: 'Central Coromandel', sea: 'Bay of Bengal' },
  { id: 'kanyakumari', name: 'Kanyakumari', state: 'Tamil Nadu', latitude: 8.0883, longitude: 77.5385, region: 'Cape Comorin Apex', sea: 'Indian Ocean' as any },
  { id: 'rameswaram', name: 'Rameswaram', state: 'Tamil Nadu', latitude: 9.2876, longitude: 79.3129, region: 'Palk Bay', sea: 'Bay of Bengal' },

  // Gujarat
  { id: 'veraval', name: 'Veraval', state: 'Gujarat', latitude: 20.9042, longitude: 70.3721, region: 'Kathiawar Coast', sea: 'Arabian Sea' },
  { id: 'porbandar', name: 'Porbandar', state: 'Gujarat', latitude: 21.6421, longitude: 69.6012, region: 'Saurashtra West', sea: 'Arabian Sea' },
  { id: 'mangrol', name: 'Mangrol', state: 'Gujarat', latitude: 21.1245, longitude: 70.1134, region: 'Junagadh Sector', sea: 'Arabian Sea' },
  { id: 'okha', name: 'Okha', state: 'Gujarat', latitude: 22.4682, longitude: 69.0712, region: 'Gulf of Kutch', sea: 'Arabian Sea' },
  { id: 'kandla', name: 'Kandla (Mundra)', state: 'Gujarat', latitude: 23.0012, longitude: 70.2234, region: 'Kutch Inner Basin', sea: 'Arabian Sea' },

  // Maharashtra
  { id: 'mumbai', name: 'Mumbai (Sassoon Dock)', state: 'Maharashtra', latitude: 18.9214, longitude: 72.8245, region: 'Konkan Coast North', sea: 'Arabian Sea' },
  { id: 'ratnagiri', name: 'Ratnagiri', state: 'Maharashtra', latitude: 16.9912, longitude: 73.2842, region: 'South Konkan', sea: 'Arabian Sea' },
  { id: 'malvan', name: 'Malvan', state: 'Maharashtra', latitude: 16.0542, longitude: 73.4612, region: 'Sindhudurg Belt', sea: 'Arabian Sea' },
  { id: 'alibaug', name: 'Alibaug', state: 'Maharashtra', latitude: 18.6412, longitude: 72.8714, region: 'Raigad Coast', sea: 'Arabian Sea' },

  // Karnataka
  { id: 'mangalore', name: 'Mangalore (Old Port)', state: 'Karnataka', latitude: 12.8612, longitude: 74.8341, region: 'Canara South', sea: 'Arabian Sea' },
  { id: 'malpe', name: 'Malpe', state: 'Karnataka', latitude: 13.3521, longitude: 74.7012, region: 'Udupi Deep Sea', sea: 'Arabian Sea' },
  { id: 'karwar', name: 'Karwar', state: 'Karnataka', latitude: 14.8124, longitude: 74.1311, region: 'Uttara Kannada', sea: 'Arabian Sea' },

  // Andhra Pradesh
  { id: 'vizag', name: 'Visakhapatnam', state: 'Andhra Pradesh', latitude: 17.6868, longitude: 83.2185, region: 'Northern Circars', sea: 'Bay of Bengal' },
  { id: 'kakinada', name: 'Kakinada', state: 'Andhra Pradesh', latitude: 16.9812, longitude: 82.2541, region: 'Godavari Delta', sea: 'Bay of Bengal' },
  { id: 'machilipatnam', name: 'Machilipatnam', state: 'Andhra Pradesh', latitude: 16.1821, longitude: 81.1342, region: 'Krishna Estuary', sea: 'Bay of Bengal' },
  { id: 'krishnapatnam', name: 'Krishnapatnam', state: 'Andhra Pradesh', latitude: 14.2541, longitude: 80.1245, region: 'Nellore Belt', sea: 'Bay of Bengal' },

  // Odisha
  { id: 'paradip', name: 'Paradip', state: 'Odisha', latitude: 20.2642, longitude: 86.6712, region: 'Mahanadi Delta', sea: 'Bay of Bengal' },
  { id: 'dhamra', name: 'Dhamra', state: 'Odisha', latitude: 20.8012, longitude: 86.9741, region: 'Bhadrak Coast', sea: 'Bay of Bengal' },
  { id: 'gopalpur', name: 'Gopalpur', state: 'Odisha', latitude: 19.3124, longitude: 84.9125, region: 'Ganjam Sector', sea: 'Bay of Bengal' },

  // West Bengal
  { id: 'kakdwip', name: 'Kakdwip (Digha)', state: 'West Bengal', latitude: 21.8741, longitude: 88.1824, region: 'Sundarbans Outer', sea: 'Bay of Bengal' },
  { id: 'haldia', name: 'Haldia', state: 'West Bengal', latitude: 22.0621, longitude: 88.0612, region: 'Hooghly Estuary', sea: 'Bay of Bengal' },
  { id: 'sankarpur', name: 'Sankarpur', state: 'West Bengal', latitude: 21.6412, longitude: 87.5642, region: 'Purba Medinipur', sea: 'Bay of Bengal' },

  // Goa
  { id: 'mormugao', name: 'Mormugao', state: 'Goa', latitude: 15.4124, longitude: 73.8012, region: 'South Goa Basin', sea: 'Arabian Sea' },
  { id: 'panaji', name: 'Panaji (Malim)', state: 'Goa', latitude: 15.5012, longitude: 73.8341, region: 'Mandovi Estuary', sea: 'Arabian Sea' },

  // Island Territories
  { id: 'portblair', name: 'Port Blair', state: 'Andaman & Nicobar', latitude: 11.6234, longitude: 92.7264, region: 'Andaman Sea Ridge', sea: 'Andaman Sea' },
  { id: 'kavaratti', name: 'Kavaratti', state: 'Lakshadweep', latitude: 10.5621, longitude: 72.6412, region: 'Coral Atoll Ridge', sea: 'Lakshadweep Sea' },
];

export interface LanguageInfo {
  code: string;
  name: string;
  nativeName: string;
  greeting: string;
  presets: {
    safety: string;
    wind: string;
    cyclone: string;
  };
  uiText: {
    aiTitle: string;
    liveGps: string;
    oceanConditions: string;
    liveSensors: string;
    safeVoyage: string;
    moderateRisk: string;
    highRisk: string;
    viewMap: string;
    fishingZones: string;
    askPlaceholder: string;
    safetyAdvisoryHeader: string;
    metrics: {
      windSpeed: string;
      waveHeight: string;
      rainfall: string;
      lightning: string;
      cycloneWatch: string;
      confidence: string;
    };
    metricStatuses: {
      gentleBreeze: string;
      normalSwell: string;
      clearSky: string;
      noLightning: string;
      noCyclone: string;
      highCertainty: string;
    };
  };
  getAdvisory: (port: string, risk: string, wind: number, wave: number, range: number) => string;
}

export const INDIAN_LANGUAGES: LanguageInfo[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    greeting: 'SeaSarathi Fisherman Companion Active',
    presets: {
      safety: '🎣 Can I sail safely today?',
      wind: '🌊 Check wind & wave status',
      cyclone: '🌪 Any storm or cyclone threat?',
    },
    uiText: {
      aiTitle: 'SeaSarathi Companion',
      liveGps: 'LIVE BOAT GPS FIX',
      oceanConditions: 'Ocean & Weather Status',
      liveSensors: 'Realtime Sensors',
      safeVoyage: 'SAFE TO SAIL TODAY',
      moderateRisk: 'CAUTION: MODERATE SEA',
      highRisk: 'DANGER: DO NOT SAIL',
      viewMap: 'View Risk Map',
      fishingZones: 'Fishing Zones',
      askPlaceholder: 'Ask about sea safety, winds, waves, fish locations...',
      safetyAdvisoryHeader: 'FISHERMAN SAFETY ADVISORY',
      metrics: {
        windSpeed: 'WIND SPEED',
        waveHeight: 'WAVE (Hs)',
        rainfall: 'RAINFALL',
        lightning: 'LIGHTNING',
        cycloneWatch: 'CYCLONE WATCH',
        confidence: 'CATCH CONFIDENCE',
      },
      metricStatuses: {
        gentleBreeze: 'Gentle Breeze',
        normalSwell: 'Calm Sea Waves',
        clearSky: 'Clear Weather',
        noLightning: 'No Flash Threat',
        noCyclone: 'No Storm Threat',
        highCertainty: 'High Catch Confidence',
      },
    },
    getAdvisory: (port, risk, wind, wave, range) => {
      if (risk === 'HIGH') {
        return `🔴 DANGER: DO NOT SAIL! Severe rough seas with HIGH WAVES (${wave}m) and STRONG WINDS (${wind} km/h) off ${port}. Remain safely at harbor!`;
      }
      if (risk === 'MODERATE') {
        return `🟠 CAUTION REQUIRED! Moderate swell of ${wave}m and wind reaching ${wind} km/h off ${port}. Small boats should stay within 12 NM and carry lifejackets.`;
      }
      return `✅ SAFE TO SAIL TODAY! Sea conditions off ${port} are VERY CALM with GENTLE BREEZE (${wind} km/h) and MILD WAVES (${wave}m). Excellent conditions for net casting up to ${range} NM offshore.`;
    },
  },
  {
    code: 'ml',
    name: 'Malayalam',
    nativeName: 'മലയാളം',
    greeting: 'സീസാരഥി സുരക്ഷാ സഹായി സജ്ജമാണ്',
    presets: {
      safety: '🎣 ഇന്ന് കടലിൽ പോകാൻ സുരക്ഷിതമാണോ?',
      wind: '🌊 കാറ്റും തിരമാലയും അറിയുക',
      cyclone: '🌪 ചുഴലിക്കാറ്റ് മുന്നറിയിപ്പുണ്ടോ?',
    },
    uiText: {
      aiTitle: 'സീസാരഥി സഹായി',
      liveGps: 'തത്സമയ ബോട്ട് ജി.പി.എസ്',
      oceanConditions: 'കടലിലെ നിലവിലെ അവസ്ഥ',
      liveSensors: 'തത്സമയ സെൻസറുകൾ',
      safeVoyage: 'ഇന്ന് കടലിൽ പോകാം - സുരക്ഷിതമാണ്',
      moderateRisk: 'ശ്രദ്ധിക്കുക: കടലിൽ മിതമായ ഇളക്കം',
      highRisk: 'അപകട മുന്നറിയിപ്പ്: കടലിൽ പോകരുത്',
      viewMap: 'മാപ്പ് കാണുക',
      fishingZones: 'മത്സ്യബന്ധന മേഖലകൾ',
      askPlaceholder: 'കടൽ സുരക്ഷ, കാറ്റ്, തിരമാല ചോദിക്കൂ...',
      safetyAdvisoryHeader: 'മത്സ്യത്തൊഴിലാളി സുരക്ഷാ നിർദ്ദേശം',
      metrics: {
        windSpeed: 'കാറ്റിന്റെ വേഗത',
        waveHeight: 'തിരമാല ഉയരം',
        rainfall: 'മഴയുടെ അളവ്',
        lightning: 'മിന്നൽ മുന്നറിയിപ്പ്',
        cycloneWatch: 'ചുഴലിക്കാറ്റ് నిരീക്ഷണം',
        confidence: 'മീൻ ലഭ്യത ഉറപ്പ്',
      },
      metricStatuses: {
        gentleBreeze: 'ശാന്തമായ കാറ്റ്',
        normalSwell: 'സാധാരണ തിരമാല',
        clearSky: 'തെളിഞ്ഞ ആകാശം',
        noLightning: 'മിന്നൽ ഭീഷണിയില്ല',
        noCyclone: 'ചുഴലിക്കാറ്റ് ഭീഷണിയില്ല',
        highCertainty: 'ഉയർന്ന മീൻ ലഭ്യത',
      },
    },
    getAdvisory: (port, risk, wind, wave, range) => {
      if (risk === 'HIGH') {
        return `🔴 അപകടം: കടലിൽ പോകരുത്! ${port} മേഖലയിൽ ${wave} മീറ്റർ ഉയർന്ന തിരമാലയും ${wind} km/h ശക്തമായ കാറ്റുമുണ്ട്. തുറമുഖത്ത് തന്നെ തുടരുക!`;
      }
      if (risk === 'MODERATE') {
        return `🟠 ശ്രദ്ധിക്കുക! ${port} തീരത്ത് ${wave} മീറ്റർ തിരമാലയും ${wind} km/h കാറ്റുമുണ്ട്. ചെറിയ ബോട്ടുകൾ 12 നോട്ടിക്കൽ മൈലിനുള്ളിൽ നിൽക്കണം.`;
      }
      return `✅ ഇന്ന് കടലിൽ പോകാം! ${port} തീരത്ത് കടൽ വളരെ ശാന്തമാണ്. കാറ്റ് ${wind} km/h മാത്രമാണ്, തിരമാല ${wave} മീറ്റർ ശാന്തവുമാണ്. ${range} നോട്ടിക്കൽ മൈൽ വരെ മീൻപിടുത്തത്തിന് പോകാം.`;
    },
  },
  {
    code: 'ta',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    greeting: 'சீசாரதி கடல் பாதுகாப்பு வழிகாட்டி',
    presets: {
      safety: '🎣 இன்று மீன்பிடிக்க செல்லலாமா?',
      wind: '🌊 காற்று & அலை நிலவரம்',
      cyclone: '🌪 புயல் எச்சரிக்கை உள்ளதா?',
    },
    uiText: {
      aiTitle: 'சீசாரதி வழிகாட்டி',
      liveGps: 'நேரலை படகு ஜி.பி.எஸ்',
      oceanConditions: 'கடல் மற்றும் வானிலை நிலை',
      liveSensors: 'நேரலை சென்சார்கள்',
      safeVoyage: 'இன்று கடலுக்கு செல்ல பாதுகாப்பானது',
      moderateRisk: 'எச்சரிக்கை: மிதமான கடல் அலைகள்',
      highRisk: 'ஆபத்து: கடலுக்குச் செல்ல வேண்டாம்',
      viewMap: 'வரைபடத்தை காண்க',
      fishingZones: 'மீன்பிடி மண்டலங்கள்',
      askPlaceholder: 'கடல் பாதுகாப்பு, காற்று, அலைகள் பற்றி கேளுங்கள்...',
      safetyAdvisoryHeader: 'மீனவர் பாதுகாப்பு வழிகாட்டுதல்',
      metrics: {
        windSpeed: 'காற்றின் வேகம்',
        waveHeight: 'அலை உயரம்',
        rainfall: 'மழை அளவு',
        lightning: 'மின்னல் எச்சரிக்கை',
        cycloneWatch: 'புயல் கண்காணிப்பு',
        confidence: 'மீன் வாய்ப்பு உறுதி',
      },
      metricStatuses: {
        gentleBreeze: 'மிதமான தென்றல்',
        normalSwell: 'இயல்பான அலைகள்',
        clearSky: 'தெளிவான வானிலை',
        noLightning: 'மின்னல் ஆபத்து இல்லை',
        noCyclone: 'புயல் ஆபத்து இல்லை',
        highCertainty: 'அதிக மீன் வாய்ப்பு',
      },
    },
    getAdvisory: (port, risk, wind, wave, range) => {
      if (risk === 'HIGH') {
        return `🔴 ஆபத்து: கடலுக்குச் செல்லாதீர்கள்! ${port} பகுதியில் ${wave} மீட்டர் உயரமான அலைகளும் ${wind} km/h பலத்த காற்றும் வீசுகிறது!`;
      }
      if (risk === 'MODERATE') {
        return `🟠 எச்சரிக்கை! ${port} பகுதியில் ${wave} மீட்டர் அலையும் ${wind} km/h காற்றும் வீசுகிறது. சிறிய படகுகள் 12 மைலுக்குள் இருக்கவும்.`;
      }
      return `✅ இன்று கடலுக்குச் செல்லலாம்! ${port} கரையில் கடல் மிகவும் அமைதியாக உள்ளது. காற்று ${wind} km/h, அலை உயரம் ${wave} மீட்டர். ${range} நாட்டிக்கல் மைல் வரை மீன்பிடிக்கலாம்.`;
    },
  },
  {
    code: 'te',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    greeting: 'సీసారథి సముద్ర సహాయకుడు',
    presets: {
      safety: '🎣 ఈరోజు సముద్రంలోకి వెళ్లవచ్చా?',
      wind: '🌊 గాలి మరియు అలల వేగం ఎంత?',
      cyclone: '🌪 ఏదైనా తుఫాను హెచ్చరిక ఉందా?',
    },
    uiText: {
      aiTitle: 'సీసారథి గైడ్',
      liveGps: 'లైవ్ బోట్ జిపిఎస్',
      oceanConditions: 'సముద్రము మరియు వాతావరణం',
      liveSensors: 'లైవ్ సెన్సార్లు',
      safeVoyage: 'ఈరోజు వేటకు వెళ్లడం సురక్షితం',
      moderateRisk: 'జాగ్రత్త: మోస్తరు అలల ఉధృతి',
      highRisk: 'ప్రమాదం: వేటకు వెళ్లవద్దు',
      viewMap: 'మ్యాప్ చూడండి',
      fishingZones: 'చేపల వేట మండలాలు',
      askPlaceholder: 'వేట భద్రత, గాలి, అలల వివరాలు అడగండి...',
      safetyAdvisoryHeader: 'జాలరుల భద్రతా సూచనలు',
      metrics: {
        windSpeed: 'గాలి వేగం',
        waveHeight: 'అలల ఎత్తు',
        rainfall: 'వర్షపాతం',
        lightning: 'మెరుపుల హెచ్చరిక',
        cycloneWatch: 'తుఫాను పర్యవేక్షణ',
        confidence: 'చేపల లభ్యత నిశ్చితత',
      },
      metricStatuses: {
        gentleBreeze: 'సాధారణ గాలి',
        normalSwell: 'శాంతమైన అలలు',
        clearSky: 'తెలిమబ్బులు',
        noLightning: 'మెరుపుల ప్రమాదం లేదు',
        noCyclone: 'తుఫాను ప్రమాదం లేదు',
        highCertainty: 'మంచి చేపల లభ్యత',
      },
    },
    getAdvisory: (port, risk, wind, wave, range) => {
      if (risk === 'HIGH') {
        return `🔴 ప్రమాదం: వేటకు వెళ్లవద్దు! ${port} తీరంలో ${wave} మీటర్ల ఎత్తైన అలలు మరియు ${wind} km/h తీవ్రమైన గాలులు ఉన్నాయి.`;
      }
      if (risk === 'MODERATE') {
        return `🟠 జాగ్రత్త వహించండి! ${port} వద్ద అలల ఎత్తు ${wave} మీటర్లు, గాలి వేగం ${wind} km/h. చిన్న పడవలు 12 మైళ్లలోనే ఉండాలి.`;
      }
      return `✅ ఈరోజు వేటకు వెళ్లడం సురక్షితం! ${port} తీరంలో సముద్రం ప్రశాంతంగా ఉంది. గాలి వేగం ${wind} km/h, అలల ఎత్తు ${wave} మీటర్లు. మీరు ${range} నాటికల్ మైళ్ల వరకు వెళ్లవచ్చు.`;
    },
  },
  {
    code: 'bn',
    name: 'Bengali',
    nativeName: 'বাংলা',
    greeting: 'সীসারথি সামুদ্রিক সহায়ক',
    presets: {
      safety: '🎣 আজ কি মাছ ধরতে যাওয়া নিরাপদ?',
      wind: '🌊 বাতাস ও তরঙ্গের অবস্থা কি?',
      cyclone: '🌪 কোনো নিম্নচাপ বা ঝড়ের পূর্বাভাস আছে?',
    },
    uiText: {
      aiTitle: 'সীসারথি গাইড',
      liveGps: 'লাইভ বোট জিপিএস',
      oceanConditions: 'সমুদ্রের আবহাওয়া ও অবস্থা',
      liveSensors: 'লাইভ সেন্সর',
      safeVoyage: 'আজ সমুদ্রে যাওয়া নিরাপদ',
      moderateRisk: 'সতর্কতা: মাঝারি ঢেউয়ের প্রবাহ',
      highRisk: 'বিপদ: সমুদ্রে যাবেন না',
      viewMap: 'মানচিত্র দেখুন',
      fishingZones: 'মৎস্য শিকার অঞ্চল',
      askPlaceholder: 'মৎস্য শিকার নিরাপত্তা, বাতাস, তরঙ্গ সম্পর্কে জিজ্ঞাসা করুন...',
      safetyAdvisoryHeader: 'মৎস্যজীবী সুরক্ষা নির্দেশিকা',
      metrics: {
        windSpeed: 'বাতাসের গতি',
        waveHeight: 'ঢেউয়ের উচ্চতা',
        rainfall: 'বৃষ্টিপাত',
        lightning: 'বজ্রপাত সতর্কতা',
        cycloneWatch: 'ঘূর্ণিঝড় নজরদারি',
        confidence: 'মাছ পাওয়ার নিশ্চয়তা',
      },
      metricStatuses: {
        gentleBreeze: 'মৃদু বাতাস',
        normalSwell: 'স্বাভাবিক ঢেউ',
        clearSky: 'মেঘমুক্ত আকাশ',
        noLightning: 'বজ্রপাতের আশঙ্কা নেই',
        noCyclone: 'ঝড়ের আশঙ্কা নেই',
        highCertainty: 'প্রচুর মাছ পাওয়ার সম্ভাবনা',
      },
    },
    getAdvisory: (port, risk, wind, wave, range) => {
      if (risk === 'HIGH') {
        return `🔴 বিপদ: সমুদ্রে যাবেন না! ${port} উপকূলে ${wave} মিটার উঁচু ঢেউ ও ${wind} km/h প্রবল ঝড়ো হাওয়া বইছে। বন্দরেই অবস্থান করুন।`;
      }
      if (risk === 'MODERATE') {
        return `🟠 সতর্ক থাকুন! ${port} উপকূলে ${wave} মিটার ঢেউ এবং ${wind} km/h বাতাস প্রবাহিত হচ্ছে। ছোট ট্রলার ১২ মাইলের মধ্যে রাখুন।`;
      }
      return `✅ আজ সমুদ্রে যাওয়া সম্পূর্ণ নিরাপদ! ${port} উপকূলে সমুদ্র শান্ত রয়েছে। বাতাসের গতি ${wind} km/h এবং ঢেউ মাত্র ${wave} মিটার। ${range} নটিক্যাল মাইল পর্যন্ত মাছ ধরতে পারেন।`;
    },
  },
  {
    code: 'gu',
    name: 'Gujarati',
    nativeName: 'ગુજરાતી',
    greeting: 'સીસારથિ દરિયાઈ સાથી સક્રિય',
    presets: {
      safety: '🎣 આજે દરિયામાં જવું સલામત છે?',
      wind: '🌊 પવન અને મોજાની સ્થિતિ',
      cyclone: '🌪 વાવાઝોડાની કોઈ ચેતવણી છે?',
    },
    uiText: {
      aiTitle: 'સીસારથિ ગાઈડ',
      liveGps: 'લાઇવ બોટ જીપીએસ',
      oceanConditions: 'દરિયાઈ હવામાન સ્થિતિ',
      liveSensors: 'લાઇવ સેન્સર',
      safeVoyage: 'આજે દરિયામાં જવું સુરક્ષિત છે',
      moderateRisk: 'સાવધાની: મધ્યમ મોજાઓ',
      highRisk: 'ખતરો: દરિયામાં જશો નહીં',
      viewMap: 'નકશો જુઓ',
      fishingZones: 'માછીમારી ઝોન',
      askPlaceholder: 'દરિયાઈ સુરક્ષા, પવન અને મોજા વિશે પૂછો...',
      safetyAdvisoryHeader: 'માછીમાર સુરક્ષા માર્ગદર્શિકા',
      metrics: {
        windSpeed: 'પવનની ઝડપ',
        waveHeight: 'મોજાની ઊંચાઈ',
        rainfall: 'વરસાદ',
        lightning: 'વીજળી એલર્ટ',
        cycloneWatch: 'વાવાઝોડું વોચ',
        confidence: 'માછલી મળવાની ખાતરી',
      },
      metricStatuses: {
        gentleBreeze: 'ધીમો પવન',
        normalSwell: 'સામાન્ય મોજા',
        clearSky: 'સ્વચ્છ આકાશ',
        noLightning: 'વીજળીનો ભય નથી',
        noCyclone: 'વાવાઝોડાનો ભય નથી',
        highCertainty: 'સારી માછલી મળવાની શક્યતા',
      },
    },
    getAdvisory: (port, risk, wind, wave, range) => {
      if (risk === 'HIGH') {
        return `🔴 ખતરો: દરિયામાં જશો નહીં! ${port} કિનારે ${wave} મીટર ઊંચા મોજા અને ${wind} km/h જોરદાર પવન છે. બંદરે જ રહો!`;
      }
      if (risk === 'MODERATE') {
        return `🟠 સાવધાની રાખો! ${port} ખાતે ${wave} મીટર મોજા અને ${wind} km/h પવન છે. નાની બોટ 12 માઇલની અંદર જ રાખવી.`;
      }
      return `✅ આજે દરિયામાં જવું સુરક્ષિત છે! ${port} કાંઠે દરિયો શાંત છે. પવનની ઝડપ ${wind} km/h અને મોજા ${wave} મીટર છે. તમે ${range} નોટિકલ માઇલ સુધી જઈ શકો છો.`;
    },
  },
  {
    code: 'mr',
    name: 'Marathi',
    nativeName: 'मराठी',
    greeting: 'सीसारथी सागरी मार्गदर्शक',
    presets: {
      safety: '🎣 आज समुद्रात जाणे सुरक्षित आहे का?',
      wind: '🌊 वारा आणि लाटांची स्थिती सांगा',
      cyclone: '🌪 वादळाचा काही इशारा आहे का?',
    },
    uiText: {
      aiTitle: 'सीसारथी गाईड',
      liveGps: 'लाइव्ह बोट जीपीएस',
      oceanConditions: 'समुद्राची हवामान स्थिती',
      liveSensors: 'लाइव्ह सेन्सर्स',
      safeVoyage: 'आज समुद्रात जाणे सुरक्षित आहे',
      moderateRisk: 'काळजी घ्या: मध्यम लाटा',
      highRisk: 'धोका: समुद्रात जाऊ नका',
      viewMap: 'नकाशा पहा',
      fishingZones: 'मासेमारी क्षेत्रे',
      askPlaceholder: 'मासेमारी सुरक्षा, वारा व लाटांबद्दल विचारा...',
      safetyAdvisoryHeader: 'मासेमार सुरक्षा सल्ला',
      metrics: {
        windSpeed: 'वाऱ्याचा वेग',
        waveHeight: 'लाटांची उंची',
        rainfall: 'पाऊस',
        lightning: 'वीज इशारा',
        cycloneWatch: 'वादळ पाहणी',
        confidence: 'मासे मिळण्याची खात्री',
      },
      metricStatuses: {
        gentleBreeze: 'मंदावणारा वारा',
        normalSwell: 'शांत लाटा',
        clearSky: 'निरभ्र आकाश',
        noLightning: 'विजेचा धोका नाही',
        noCyclone: 'वादळाचा धोका नाही',
        highCertainty: 'उत्तम मासेमारी संधी',
      },
    },
    getAdvisory: (port, risk, wind, wave, range) => {
      if (risk === 'HIGH') {
        return `🔴 धोका: समुद्रात जाऊ नका! ${port} किनाऱ्यावर ${wave} मीटर उंच लाटा आणि ${wind} km/h जोरदार वारा आहे. बंदरातच राहा!`;
      }
      if (risk === 'MODERATE') {
        return `🟠 काळजी घ्या! ${port} भागात ${wave} मीटर लाटा आणि ${wind} km/h वारा आहे. लहान बोटी 12 मैलांच्या आतच ठेवा.`;
      }
      return `✅ आज समुद्रात जाणे पूर्णपणे सुरक्षित! ${port} किनाऱ्यावर समुद्र शांत आहे. वाऱ्याचा वेग ${wind} km/h आणि लाटा ${wave} मीटर आहेत. ${range} नॉटिकल मैलापर्यंत जाण्यास हरकत नाही.`;
    },
  },
  {
    code: 'or',
    name: 'Odia',
    nativeName: 'ଓଡ଼ିଆ',
    greeting: 'ସୀସାରଥୀ ସାମୁଦ୍ରିକ ସାଥୀ ସକ୍ରିୟ',
    presets: {
      safety: '🎣 ଆଜି ସମୁଦ୍ରକୁ ଯିବା ସୁରକ୍ଷିତ କି?',
      wind: '🌊 ପବନ ଓ ଲହଡ଼ିର ସ୍ଥିତି କଣ?',
      cyclone: '🌪 କୌଣସି ବାତ୍ୟା ସୂଚନା ଅଛି କି?',
    },
    uiText: {
      aiTitle: 'ସୀସାରଥୀ ଗାଇଡ୍',
      liveGps: 'ଲାଇଭ୍ ଡଙ୍ଗା ଜିପିଏସ',
      oceanConditions: 'ସମୁଦ୍ରର ଅବସ୍ଥା ଓ ପାଣିପାଗ',
      liveSensors: 'ଲାଇଭ୍ ସେନସର',
      safeVoyage: 'ଆଜି ସମୁଦ୍ରକୁ ଯିବା ସୁରକ୍ଷିତ',
      moderateRisk: 'ସତର୍କ ରୁହନ୍ତୁ: ମଧ୍ୟମ ଲହଡ଼ି',
      highRisk: 'ବିପଦ: ସମୁଦ୍ରକୁ ଯାଆନ୍ତୁ ନାହିଁ',
      viewMap: 'ମାନଚିତ୍ର ଦେଖନ୍ତୁ',
      fishingZones: 'ମାଛ ଧରା ଅଞ୍ଚଳ',
      askPlaceholder: 'ମାଛ ଧରା ସୁରକ୍ଷା, ପବନ, ଲହଡ଼ି ବିଷୟରେ ପଚାରନ୍ତୁ...',
      safetyAdvisoryHeader: 'ମତ୍ସ୍ୟଜୀବୀ ସୁରକ୍ଷା ପରାମର୍ଶ',
      metrics: {
        windSpeed: 'ପବନ ବେଗ',
        waveHeight: 'ଲହଡ଼ି ଉଚ୍ଚତା',
        rainfall: 'ବର୍ଷା',
        lightning: 'ବିଜୁଳି ସୂଚନା',
        cycloneWatch: 'ବାତ୍ୟା ନଜର',
        confidence: 'ମାଛ ମିଳିବା ନିଶ୍ଚିତତା',
      },
      metricStatuses: {
        gentleBreeze: 'ଧୀର ପବନ',
        normalSwell: 'ଶାନ୍ତ ଲହଡ଼ି',
        clearSky: 'ନିର୍ମଳ ଆକାଶ',
        noLightning: 'ବିଜୁଳି ଭୟ ନାହିଁ',
        noCyclone: 'ବାତ୍ୟା ଭୟ ନାହିଁ',
        highCertainty: 'ପ୍ରଚୁର ମାଛ ମିଳିବା ସମ୍ଭାବନା',
      },
    },
    getAdvisory: (port, risk, wind, wave, range) => {
      if (risk === 'HIGH') {
        return `🔴 ବିପଦ: ସମୁଦ୍ରକୁ ଯାଆନ୍ତୁ ନାହିଁ! ${port} ଉପକୂଳରେ ${wave} ମିଟର ଉଚ୍ଚ ଲହଡ଼ି ଓ ${wind} km/h ପ୍ରବଳ ପବନ ବହୁଛି।`;
      }
      if (risk === 'MODERATE') {
        return `🟠 ସତର୍କ ରୁହନ୍ତୁ! ${port} ନିକଟରେ ${wave} ମିଟର ଲହଡ଼ି ଓ ${wind} km/h ପବନ ବହୁଛି। ଛୋଟ ଡଙ୍ଗା 12 ମାଇଲ୍ ଭିତରେ ରଖନ୍ତୁ।`;
      }
      return `✅ ଆଜି ସମୁଦ୍ରକୁ ଯିବା ସୁରକ୍ଷିତ! ${port} କୂଳରେ ସମୁଦ୍ର ଶାନ୍ତ ଅଛି। ପବନ ବେଗ ${wind} km/h ଏବଂ ଲହଡ଼ି ${wave} ମିଟର। ଆପଣ ${range} ନଟିକାଲ ମାଇଲ୍ ପର୍ଯ୍ୟନ୍ତ ଯାଇପାରିବେ।`;
    },
  },
  {
    code: 'kn',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    greeting: 'ಸೀಸಾರಥಿ ಸಮುದ್ರ ಮಾರ್ಗದರ್ಶಿ',
    presets: {
      safety: '🎣 ಇಂದು ಮೀನುಗಾರಿಕೆಗೆ ಹೋಗುವುದು ಸುರಕ್ಷಿತವೇ?',
      wind: '🌊 ಗಾಳಿ ಮತ್ತು ಅಲೆಗಳ ಸ್ಥಿತಿ ತಿಳಿಸಿ',
      cyclone: '🌪 ಚಂಡಮಾರುತದ ಮುನ್ನೆಚ್ಚರಿಕೆ ಇದೆಯೇ?',
    },
    uiText: {
      aiTitle: 'ಸೀಸಾರಥಿ ಗೈಡ್',
      liveGps: 'ಲೈವ್ ದೋಣಿ ಜಿಪಿಎಸ್',
      oceanConditions: 'ಸಮುದ್ರ ಮತ್ತು ಹವಾಮಾನ ಸ್ಥಿತಿ',
      liveSensors: 'ಲೈವ್ ಸೆನ್ಸರ್‌ಗಳು',
      safeVoyage: 'ಇಂದು ಸಮುದ್ರಕ್ಕೆ ಹೋಗುವುದು ಸುರಕ್ಷಿತ',
      moderateRisk: 'ಎಚ್ಚರಿಕೆ: ಸಾಧಾರಣ ಅಲೆಗಳು',
      highRisk: 'ಅಪಾಯ: ಸಮುದ್ರಕ್ಕೆ ಹೋಗಬೇಡಿ',
      viewMap: 'ನಕ್ಷೆ ವೀಕ್ಷಿಸಿ',
      fishingZones: 'ಮೀನುಗಾರಿಕೆ ವಲಯಗಳು',
      askPlaceholder: 'ಮೀನುಗಾರಿಕೆ ಸುರಕ್ಷತೆ, ಗಾಳಿ, ಅಲೆಗಳ ಬಗ್ಗೆ ಕೇಳಿ...',
      safetyAdvisoryHeader: 'ಮೀನುಗಾರರ ಸುರಕ್ಷತಾ ಸಲಹೆ',
      metrics: {
        windSpeed: 'ಗಾಳಿಯ ವೇಗ',
        waveHeight: 'ಅಲೆಯ ಎತ್ತರ',
        rainfall: 'ಮಳೆ',
        lightning: 'ಮಿಂಚು ಮುನ್ನೆಚ್ಚರಿಕೆ',
        cycloneWatch: 'ಚಂಡಮಾರುತ ವೀಕ್ಷಣೆ',
        confidence: 'ಮೀನು ಸಿಗುವ ಭರವಸೆ',
      },
      metricStatuses: {
        gentleBreeze: 'ಶಾಂತ ಗಾಳಿ',
        normalSwell: 'ಸಾಮಾನ್ಯ ಅಲೆಗಳು',
        clearSky: 'ವಿಶಾಲ ಆಕಾಶ',
        noLightning: 'ಮಿಂಚಿನ ಭಯವಿಲ್ಲ',
        noCyclone: 'ಚಂಡಮಾರುತದ ಭಯವಿಲ್ಲ',
        highCertainty: 'ಹೆಚ್ಚು ಮೀನು ಸಿಗುವ ಸಾಧ್ಯತೆ',
      },
    },
    getAdvisory: (port, risk, wind, wave, range) => {
      if (risk === 'HIGH') {
        return `🔴 ಅಪಾಯ: ಸಮುದ್ರಕ್ಕೆ ಹೋಗಬೇಡಿ! ${port} ತೀರದಲ್ಲಿ ${wave} ಮೀಟರ್ ಎತ್ತರದ ಅಲೆಗಳು ಮತ್ತು ${wind} km/h ಬಿರುಗಾಳಿ ಇದೆ.`;
      }
      if (risk === 'MODERATE') {
        return `🟠 ಎಚ್ಚರವಿರಲಿ! ${port} ಭಾಗದಲ್ಲಿ ${wave} ಮೀಟರ್ ಅಲೆ ಮತ್ತು ${wind} km/h ಗಾಳಿ ಇದೆ. ಸಣ್ಣ ದೋಣಿಗಳು 12 ಮೈಲಿ ಒಳಗಡೆ ಇರಲಿ.`;
      }
      return `✅ ಇಂದು ಸಮುದ್ರಕ್ಕೆ ಹೋಗುವುದು ಸುರಕ್ಷಿತ! ${port} ತೀರದಲ್ಲಿ ಸಮುದ್ರ ಶಾಂತವಾಗಿದೆ. ಗಾಳಿಯ ವೇಗ ${wind} km/h, ಅಲೆ ಎತ್ತರ ${wave} ಮೀಟರ್. ${range} ನಾಟಿಕಲ್ ಮೈಲಿ ವರೆಗೆ ಹೋಗಬಹುದು.`;
    },
  },
  {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिंदी',
    greeting: 'सीसारथी समुद्री साथी सक्रिय',
    presets: {
      safety: '🎣 क्या आज समुद्र में जाना सुरक्षित है?',
      wind: '🌊 हवा और लहरों की स्थिति बताएं',
      cyclone: '🌪 क्या कोई तूफान या चक्रवात का खतरा है?',
    },
    uiText: {
      aiTitle: 'सीसारथी गाइड',
      liveGps: 'लाइव नाव जीपीएस',
      oceanConditions: 'समुद्र एवं मौसम की स्थिति',
      liveSensors: 'लाइव सेंसर',
      safeVoyage: 'आज समुद्र में जाना सुरक्षित है',
      moderateRisk: 'सावधानी: मध्यम लहरें',
      highRisk: 'खतरा: समुद्र में न जाएं',
      viewMap: 'मानचित्र देखें',
      fishingZones: 'मत्स्य पालन क्षेत्र',
      askPlaceholder: 'मछली पकड़ने की सुरक्षा, हवा, लहरों के बारे में पूछें...',
      safetyAdvisoryHeader: 'मछुआरा सुरक्षा सलाह',
      metrics: {
        windSpeed: 'हवा की गति',
        waveHeight: 'लहरों की ऊंचाई',
        rainfall: 'बारिश',
        lightning: 'बिजली अलर्ट',
        cycloneWatch: 'चक्रवात निगरानी',
        confidence: 'मछली मिलने का भरोसा',
      },
      metricStatuses: {
        gentleBreeze: 'हल्की हवा',
        normalSwell: 'शांत लहरें',
        clearSky: 'साफ मौसम',
        noLightning: 'बिजली का खतरा नहीं',
        noCyclone: 'तूफान का खतरा नहीं',
        highCertainty: 'उत्तम मछली मिलने का अवसर',
      },
    },
    getAdvisory: (port, risk, wind, wave, range) => {
      if (risk === 'HIGH') {
        return `🔴 खतरा: समुद्र में न जाएं! ${port} तट पर ${wave} मीटर ऊंची लहरें और ${wind} km/h तेज हवाएं चल रही हैं। बंदरगाह पर ही रहें!`;
      }
      if (risk === 'MODERATE') {
        return `🟠 सावधानी बरतें! ${port} के पास ${wave} मीटर लहरें और ${wind} km/h हवा चल रही है। छोटी नावें 12 मील के भीतर ही रहें।`;
      }
      return `✅ आज समुद्र में जाना पूरी तरह सुरक्षित है! ${port} तट पर समुद्र शांत है। हवा की गति ${wind} km/h और लहरें केवल ${wave} मीटर हैं। आप ${range} नॉटिकल मील तक जा सकते हैं।`;
    },
  },
];
