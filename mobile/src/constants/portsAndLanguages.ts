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
    oceanConditions: string;
    safeVoyage: string;
    viewMap: string;
    fishingZones: string;
  };
}

export const INDIAN_LANGUAGES: LanguageInfo[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    greeting: 'SeaSarathi Intelligence Active',
    presets: {
      safety: '🎣 Safety Check',
      wind: '🌊 Wind & Waves',
      cyclone: '🌪 Cyclone Check',
    },
    uiText: {
      aiTitle: 'SeaSarathi Intelligence',
      oceanConditions: 'Ocean Conditions',
      safeVoyage: 'SAFE VOYAGE PERMITTED',
      viewMap: 'View Risk Map',
      fishingZones: 'Fishing Zones',
    },
  },
  {
    code: 'ml',
    name: 'Malayalam',
    nativeName: 'മലയാളം',
    greeting: 'സീസാരഥി സുരക്ഷാ സഹായി സജ്ജമാണ്',
    presets: {
      safety: '🎣 കൊച്ചി കടൽ സുരക്ഷ',
      wind: '🌊 കാറ്റും തിരമാലയും',
      cyclone: '🌪 ചുഴലിക്കാറ്റ് മുന്നറിയിപ്പ്',
    },
    uiText: {
      aiTitle: 'സീസാരഥി ഇന്റലിജൻസ്',
      oceanConditions: 'കടൽ അവസ്ഥ',
      safeVoyage: 'സുരക്ഷിതമായ യാത്ര സാധ്യമാണ്',
      viewMap: 'മാപ്പ് കാണുക',
      fishingZones: 'മത്സ്യബന്ധന മേഖലകൾ',
    },
  },
  {
    code: 'ta',
    name: 'Tamil',
    nativeName: 'தமிழ்',
    greeting: 'சீசாரதி கடல் பாதுகாப்பு தயார்',
    presets: {
      safety: '🎣 பாதுகாப்பு சோதனை',
      wind: '🌊 காற்று & அலைகள்',
      cyclone: '🌪 புயல் எச்சரிக்கை',
    },
    uiText: {
      aiTitle: 'சீசாரதி நுண்ணறிவு',
      oceanConditions: 'கடல் நிலைமைகள்',
      safeVoyage: 'பாதுகாப்பான பயணம்',
      viewMap: 'வரைபடத்தை காண்க',
      fishingZones: 'மீன்பிடி மண்டலங்கள்',
    },
  },
  {
    code: 'te',
    name: 'Telugu',
    nativeName: 'తెలుగు',
    greeting: 'సీసారథి సముద్ర భద్రతా సహాయకుడు',
    presets: {
      safety: '🎣 భద్రత తనిఖీ',
      wind: '🌊 గాలి & అలలు',
      cyclone: '🌪 తుఫాను హెచ్చరిక',
    },
    uiText: {
      aiTitle: 'సీసారథి ఇంటెలిజెన్స్',
      oceanConditions: 'సముద్ర పరిస్థితులు',
      safeVoyage: 'సురక్షిత ప్రయాణం అనుమతించబడింది',
      viewMap: 'మ్యాప్ చూడండి',
      fishingZones: 'చేపల వేట మండలాలు',
    },
  },
  {
    code: 'bn',
    name: 'Bengali',
    nativeName: 'বাংলা',
    greeting: 'সীসারথি সামুদ্রিক নিরাপত্তা সক্রিয়',
    presets: {
      safety: '🎣 নিরাপত্তা পরীক্ষা',
      wind: '🌊 বাতাস ও তরঙ্গ',
      cyclone: '🌪 ঘূর্ণিঝড় সতর্কতা',
    },
    uiText: {
      aiTitle: 'সীসারথি ইন্টেলিজেন্স',
      oceanConditions: 'সমুদ্রের অবস্থা',
      safeVoyage: 'নিরাপদ যাত্রা অনুমোদিত',
      viewMap: 'মানচিত্র দেখুন',
      fishingZones: 'মৎস্য শিকার অঞ্চল',
    },
  },
  {
    code: 'gu',
    name: 'Gujarati',
    nativeName: 'ગુજરાતી',
    greeting: 'સીસારથિ દરિયાઈ સુરક્ષા સક્રિય',
    presets: {
      safety: '🎣 સુરક્ષા તપાસ',
      wind: '🌊 પવન અને મોજા',
      cyclone: '🌪 વાવાઝોડું એલર્ટ',
    },
    uiText: {
      aiTitle: 'સીસારથિ ઇન્ટેલિજન્સ',
      oceanConditions: 'દરિયાઈ પરિસ્થિતિ',
      safeVoyage: 'સુરક્ષિત પ્રવાસ મંજૂર',
      viewMap: 'નકશો જુઓ',
      fishingZones: 'માછીમારી ઝોન',
    },
  },
  {
    code: 'mr',
    name: 'Marathi',
    nativeName: 'मराठी',
    greeting: 'सीसारथी सागरी सुरक्षा सक्रिय',
    presets: {
      safety: '🎣 सुरक्षा तपासणी',
      wind: '🌊 वारा व लाटा',
      cyclone: '🌪 वादळ इशारा',
    },
    uiText: {
      aiTitle: 'सीसारथी बुद्धिमत्ता',
      oceanConditions: 'समुद्राची स्थिती',
      safeVoyage: 'सुरक्षित प्रवास परवानगी',
      viewMap: 'नकाशा पहा',
      fishingZones: 'मासेमारी क्षेत्रे',
    },
  },
  {
    code: 'or',
    name: 'Odia',
    nativeName: 'ଓଡ଼ିଆ',
    greeting: 'ସୀସାରଥୀ ସାମୁଦ୍ରିକ ସୁରକ୍ଷା ସକ୍ରିୟ',
    presets: {
      safety: '🎣 ସୁରକ୍ଷା ଯାଞ୍ଚ',
      wind: '🌊 ପବନ ଓ ଲହଡ଼ି',
      cyclone: '🌪 ବାତ୍ୟା ସୂଚନା',
    },
    uiText: {
      aiTitle: 'ସୀସାରଥୀ ଇଣ୍ଟେଲିଜେନ୍ସ',
      oceanConditions: 'ସମୁଦ୍ର ସ୍ଥିତି',
      safeVoyage: 'ସୁରକ୍ଷିତ ଯାତ୍ରା',
      viewMap: 'ମାନଚିତ୍ର ଦେଖନ୍ତୁ',
      fishingZones: 'ମାଛ ଧରା ଅଞ୍ଚଳ',
    },
  },
  {
    code: 'kn',
    name: 'Kannada',
    nativeName: 'ಕನ್ನಡ',
    greeting: 'ಸೀಸಾರಥಿ ಸಮುದ್ರ ಸುರಕ್ಷತೆ ಸಕ್ರಿಯ',
    presets: {
      safety: '🎣 ಸುರಕ್ಷತಾ ಪರೀಕ್ಷೆ',
      wind: '🌊 ಗಾಳಿ ಮತ್ತು ಅಲೆಗಳು',
      cyclone: '🌪 ಚಂಡಮಾರುತ ಎಚ್ಚರಿಕೆ',
    },
    uiText: {
      aiTitle: 'ಸೀಸಾರಥಿ ಇಂಟೆಲಿಜೆನ್ಸ್',
      oceanConditions: 'ಸಮುದ್ರ ಸ್ಥಿತಿ',
      safeVoyage: 'ಸುರಕ್ಷಿತ ಪ್ರಯಾಣ',
      viewMap: 'ನಕ್ಷೆ ವೀಕ್ಷಿಸಿ',
      fishingZones: 'ಮೀನುಗಾರಿಕೆ ವಲಯಗಳು',
    },
  },
  {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिंदी',
    greeting: 'सीसारथी समुद्री सुरक्षा सक्रिय',
    presets: {
      safety: '🎣 सुरक्षा जांच',
      wind: '🌊 हवा और लहरें',
      cyclone: '🌪 चक्रवात अलर्ट',
    },
    uiText: {
      aiTitle: 'सीसारथी इंटेलिजेंस',
      oceanConditions: 'समुद्र की स्थिति',
      safeVoyage: 'सुरक्षित यात्रा की अनुमति',
      viewMap: 'मानचित्र देखें',
      fishingZones: 'मत्स्य पालन क्षेत्र',
    },
  },
];
