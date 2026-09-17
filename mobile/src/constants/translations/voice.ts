/**
 * voice.ts — "voice" namespace translations, split out of the old
 * monolithic screenTranslations.ts so editing this screen's copy never
 * requires opening (or risking a collision in) every other screen's file.
 * Aggregated back together by screenTranslations.ts's getScreenText().
 */

export interface VoiceText {
    listening: string;
    transcribing: string;
    micPermissionDenied: string;
  }

export const VOICE_TEXT: Record<string, VoiceText> = {
  en: {
      listening: 'Listening…',
      transcribing: 'Transcribing…',
      micPermissionDenied: 'Microphone permission denied — enable it in Settings to use voice input.',
    },
  ml: {
      listening: 'കേൾക്കുന്നു…',
      transcribing: 'എഴുതി മാറ്റുന്നു…',
      micPermissionDenied: 'മൈക്രോഫോൺ അനുമതി നിഷേധിച്ചു — സെറ്റിംഗ്സിൽ അനുവദിക്കുക.',
    },
  ta: {
      listening: 'கேட்கிறது…',
      transcribing: 'எழுத்தாக மாற்றுகிறது…',
      micPermissionDenied: 'மைக்ரோஃபோன் அனுமதி மறுக்கப்பட்டது — அமைப்புகளில் அனுமதிக்கவும்.',
    },
  te: {
      listening: 'వింటోంది…',
      transcribing: 'వ్రాస్తోంది…',
      micPermissionDenied: 'మైక్రోఫోన్ అనుమతి తిరస్కరించబడింది — సెట్టింగ్‌లలో అనుమతించండి.',
    },
  bn: {
      listening: 'শুনছে…',
      transcribing: 'লিখে ফেলা হচ্ছে…',
      micPermissionDenied: 'মাইক্রোফোন অনুমতি প্রত্যাখ্যাত — সেটিংসে অনুমতি দিন।',
    },
  gu: {
      listening: 'સાંભળી રહ્યું છે…',
      transcribing: 'લખી રહ્યું છે…',
      micPermissionDenied: 'માઇક્રોફોન પરવાનગી નકારાઈ — સેટિંગ્સમાં મંજૂરી આપો.',
    },
  mr: {
      listening: 'ऐकत आहे…',
      transcribing: 'लिहित आहे…',
      micPermissionDenied: 'मायक्रोफोन परवानगी नाकारली — सेटिंग्जमध्ये परवानगी द्या.',
    },
  or: {
      listening: 'ଶୁଣୁଛି…',
      transcribing: 'ଲେଖୁଛି…',
      micPermissionDenied: 'ମାଇକ୍ରୋଫୋନ୍ ଅନୁମତି ମନା କରାଗଲା — ସେଟିଂସରେ ଅନୁମତି ଦିଅନ୍ତୁ।',
    },
  kn: {
      listening: 'ಕೇಳುತ್ತಿದೆ…',
      transcribing: 'ಬರೆಯುತ್ತಿದೆ…',
      micPermissionDenied: 'ಮೈಕ್ರೊಫೋನ್ ಅನುಮತಿ ನಿರಾಕರಿಸಲಾಗಿದೆ — ಸೆಟ್ಟಿಂಗ್‌ಗಳಲ್ಲಿ ಅನುಮತಿಸಿ.',
    },
  hi: {
      listening: 'सुन रहा है…',
      transcribing: 'लिख रहा है…',
      micPermissionDenied: 'माइक्रोफ़ोन अनुमति अस्वीकृत — सेटिंग्स में अनुमति दें।',
    },
};
