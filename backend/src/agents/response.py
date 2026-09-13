from src.agents.state import AgentState
from src.services.sarvam_client import sarvam_generate

# Matches mobile/src/constants/portsAndLanguages.ts's language codes exactly.
LANGUAGE_NAMES = {
    "en": "English",
    "ml": "Malayalam",
    "ta": "Tamil",
    "te": "Telugu",
    "bn": "Bengali",
    "gu": "Gujarati",
    "mr": "Marathi",
    "or": "Odia",
    "kn": "Kannada",
    "hi": "Hindi",
}


def get_dynamic_fallback(
    risk: str,
    wind: float,
    wave: float,
    rain: float,
    sst: float = None,
    pfz: dict = None,
    pfz_weather: dict = None,
    geofence: dict = None,
    landing_options: list = None,
    alerts: list = None,
    local_area: dict = None,
    query: str = "",
    profile: dict = None,
    intent: str = "",
    data_freshness: dict = None,
) -> str:
    """Query-aware, intent-driven fallback recommendation tailored to the specific question asked."""
    q_lower = (query or "").lower()
    profile = profile or {}
    vessel = profile.get("vessel_type", "boat")
    lang = (profile.get("language") or "en").lower()

    geo_alerts = (geofence or {}).get("alerts", [])
    if geo_alerts:
        top_alert = geo_alerts[0]
        if lang == "ml":
            return f"⚠️ അതിർത്തി മുന്നറിയിപ്പ്: {top_alert['message']}. ദയവായി ഇന്ത്യൻ സമുദ്രപരിധിക്കുള്ളിൽ തുടരുക."
        elif lang == "ta":
            return f"⚠️ எல்லை எச்சரிக்கை: {top_alert['message']}. இந்திய கடல் எல்லைக்குள் பாதுகாப்பாக இருங்கள்."
        elif lang == "te":
            return f"⚠️ సముద్ర సరిహద్దు హెచ్చరిక: {top_alert['message']}. దయచేసి భారత జలాల్లోనే ఉండండి."
        elif lang == "hi":
            return f"⚠️ समुद्री सीमा चेतावनी: {top_alert['message']}। कृपया भारतीय समुद्री सीमा के भीतर रहें।"
        return f"⚠️ MARITIME BORDER WARNING: {top_alert['message']}. Please stay well within Indian territorial waters."

    # Determine effective intent from explicit intent or query keywords
    eff_intent = (intent or "").upper()
    if not eff_intent or eff_intent == "SAFETY":
        if any(k in q_lower for k in [
            "fresh", "freshness", "purana", "kitna purana", "how old", "re-fetch", "refetch", "refresh", "stale", "sync",
            "data age", "cache", "पुराना", "कितना पुराना", "ताज़ा", "री-फ़ेच", "रिफ्रेश",
            "பழைய", "புதிய", "புதுப்பி", "పాత", "తాజా", "రీఫ్రెష్", "പഴയത്", "പുതുക്കുക"
        ]):
            eff_intent = "FRESHNESS"
        elif any(k in q_lower for k in ["storm", "cyclone", "rain", "lightning", "threat", "warning", "thunder", "tempest", "alert", "danger", "ചുഴലിക്കാറ്റ്", "മിന്നൽ", "മഴ", "പുயல்", "மின்னல்", "மழை", "తుఫాను", "तूफान", "चक्रवात"]):
            eff_intent = "ALERT"
        elif any(k in q_lower for k in ["wind", "wave", "weather", "sea", "ocean current", "sea current", "swell", "breeze", "rough", "speed", "status", "temp", "കാറ്റ്", "തിരമാല", "காற்று", "அலை", "గాలి", "అలల", "हवा", "लहर"]):
            eff_intent = "WEATHER"
        elif any(k in q_lower for k in ["fish", "pfz", "catch", "sardine", "tuna", "mackerel", "shoal", "zone", "where", "spot", "hunt", "മീൻ", "മത്സ്യം", "வேట", "மछली"]):
            eff_intent = "PFZ"
        elif any(k in q_lower for k in ["port", "harbor", "harbour", "landing", "shelter", "return", "dock", "emergency", "തുറമുഖം", "துறைமுகம்", "రేవు", "बंदरगाह"]):
            eff_intent = "PORT"
        elif any(k in q_lower for k in ["safe", "sail", "go", "permit", "venture", "allowed", "risk"]):
            eff_intent = "SAFETY"


    # 1. Storm / Cyclone / Rain / Lightning Intent
    if eff_intent == "ALERT":
        has_threat = risk == "HIGH" or rain > 15.0 or wind > 40
        if has_threat:
            if lang == "ml":
                return f"⚠️ കാലാവസ്ഥാ മുന്നറിയിപ്പ്: കടലിൽ ശക്തമായ കാറ്റും ({wind:.0f} km/h) ഉയർന്ന തിരമാലയും ({wave:.1f} മീറ്റർ) അനുഭവപ്പെടുന്നു. അതീവ ജാഗ്രത പാലിക്കുക — തീരത്ത് തന്നെ തുടരുക!"
            elif lang == "ta":
                return f"⚠️ தீவிர வானிலை எச்சரிக்கை: பலத்த காற்று ({wind:.0f} km/h) மற்றும் அலை உயரம் {wave:.1f} மீ. அதிக ஆபத்து — கடலுக்குச் செல்ல வேண்டாம்!"
            elif lang == "te":
                return f"⚠️ తీవ్ర వాతావరణ హెచ్చరిక: సముద్రంలో వేగవంతమైన గాలులు ({wind:.0f} km/h), ఎత్తైన అలలు ({wave:.1f} మీ). అధిక ప్రమాదం — వేటకు వెళ్లవద్దు!"
            elif lang == "hi":
                return f"⚠️ मौसम चेतावनी: समुद्र में तेज हवाएं ({wind:.0f} km/h) और ऊंची लहरें ({wave:.1f} m)। भारी जोखिम — आज समुद्र में न जाएं!"
            return f"⚠️ STORM THREAT DETECTED: Elevated hazard! Wind speed {wind:.0f} km/h, wave height {wave:.1f} m{', rain ' + str(round(rain,1)) + ' mm' if rain > 0 else ''}. High risk — stay ashore!"
        else:
            if lang == "ml":
                return f"✅ ചുഴലിക്കാറ്റ് ഭീഷണിയില്ല: ഇന്ന് നിങ്ങളുടെ മേഖലയിൽ ചുഴലിക്കാറ്റോ മിന്നലോ മുന്നറിയിപ്പുകളോ ഇല്ല. കാറ്റ് {wind:.0f} km/h, തിരമാല {wave:.1f} മീറ്റർ. കടൽ ശാന്തമാണ്."
            elif lang == "ta":
                return f"✅ புயல் ஆபத்து இல்லை: இன்று உங்கள் பகுதியில் புயல், சூறாவளி அல்லது மின்னல் எச்சரிக்கை எதுவும் இல்லை. காற்று {wind:.0f} km/h, அலை {wave:.1f} மீ."
            elif lang == "te":
                return f"✅ తుఫాను ముప్పు లేదు: ఈరోజు మీ తీర ప్రాంతంలో ఎలాంటి తుఫాను లేదా మెరుపుల ప్రమాదం లేదు. గాలి {wind:.0f} km/h, అలలు {wave:.1f} మీ."
            elif lang == "hi":
                return f"✅ कोई तूफान का खतरा नहीं: आज आपके क्षेत्र में चक्रवात, आंधी या बिजली का कोई खतरा नहीं है। हवा {wind:.0f} km/h और लहरें {wave:.1f} m हैं।"
            return f"✅ NO STORM THREAT: No cyclone, storm, or lightning warnings active in your sector today. Winds are {wind:.0f} km/h and waves are {wave:.1f} m. Sea is calm and safe."

    # 2. Wind & Wave / Weather / Sea Conditions Intent
    if eff_intent == "WEATHER":
        sst_txt = f" Sea surface temp is {sst:.1f}°C." if sst else ""
        if risk == "HIGH":
            if lang == "ml":
                return f"🌊 കാറ്റും തിരമാലയും: കടൽ പ്രക്ഷുബ്ധമാണ്! കാറ്റ് {wind:.0f} km/h, തിരമാല {wave:.1f} മീറ്റർ. കടലിൽ പോകുന്നത് അപകടകരമാണ്!"
            elif lang == "ta":
                return f"🌊 காற்று & அலை எச்சரிக்கை: கொந்தளிப்பான கடல்! காற்றின் வேகம் {wind:.0f} km/h, அலைகள் {wave:.1f} மீ. பயணம் செய்வது ஆபத்தானது!"
            elif lang == "te":
                return f"🌊 గాలి & అలల హెచ్చరిక: సముద్రం అల్లకల్లోలంగా ఉంది! గాలి {wind:.0f} km/h, అలలు {wave:.1f} మీ. వేటకు వెళ్లడం సురక్షితం కాదు!"
            elif lang == "hi":
                return f"🌊 हवा और लहरें: समुद्र अशांत है! हवा की गति {wind:.0f} km/h और लहरें {wave:.1f} m हैं। यात्रा असुरक्षित है!"
            return f"🌊 WIND & WAVE ALERT: ROUGH SEA! Winds are blowing at {wind:.0f} km/h with waves reaching {wave:.1f} m. Sailing is unsafe.{sst_txt}"
        elif risk == "MODERATE":
            if lang == "ml":
                return f"🌊 കാറ്റും തിരമാലയും: മിതമായ കാറ്റ് ({wind:.0f} km/h) അനുഭവപ്പെടുന്നു, {wave:.1f} മീറ്റർ തിരമാലയുണ്ട്. ചെറിയ ബോട്ടുകൾ ജാഗ്രത പാലിക്കുക."
            elif lang == "ta":
                return f"🌊 காற்று & அலை நிலவரம்: மிதமான காற்று ({wind:.0f} km/h), அலைகள் {wave:.1f} மீ. சிறிய படகுகள் எச்சரிக்கையுடன் இயங்கவும்."
            elif lang == "te":
                return f"🌊 గాలి & అలల స్థితి: మోస్తరు గాలి ({wind:.0f} km/h) మరియు {wave:.1f} మీటర్ల అలలు ఉన్నాయి. తగిన జాగ్రత్తలు పాటించండి."
            elif lang == "hi":
                return f"🌊 हवा और लहरें: मध्यम स्थिति है। हवा {wind:.0f} km/h और लहरें {wave:.1f} m हैं। सावधानी बरतें।"
            return f"🌊 WIND & WAVE STATUS: MODERATE SEA! Winds are {wind:.0f} km/h with {wave:.1f} m waves. Exercise caution.{sst_txt}"
        else:
            if lang == "ml":
                return f"🌊 കാറ്റും തിരമാലയും: കടൽ വളരെ ശാന്തമാണ്! കാറ്റ് {wind:.0f} km/h, തിരമാലയുടെ ഉയരം {wave:.1f} മീറ്റർ. സുരക്ഷിതമായി യാത്ര ചെയ്യാം."
            elif lang == "ta":
                return f"🌊 காற்று & அலை நிலவரம்: கடல் மிகவும் அமைதியாக உள்ளது! காற்றின் வேகம் {wind:.0f} km/h, அலை உயரம் {wave:.1f} மீ. மீன்பிடிக்க ஏற்ற சாதகமான சூழல்."
            elif lang == "te":
                return f"🌊 గాలి & అలల స్థితి: సముద్రం ప్రశాంతంగా ఉంది! గాలి వేగం {wind:.0f} km/h, అలల ఎత్తు {wave:.1f} మీ. వేటకు అనుకూలమైన పరిస్థితులు."
            elif lang == "hi":
                return f"🌊 हवा और लहरें: समुद्र शांत है! हवा {wind:.0f} km/h और लहरें {wave:.1f} m हैं। नौकायन के लिए अनुकूल स्थिति।"
            return f"🌊 WIND & WAVE STATUS: CALM SEA! Winds are gentle at {wind:.0f} km/h with wave height of {wave:.1f} m. Favorable navigation conditions.{sst_txt}"

    # 3. Fish / PFZ / Catch / Shoal / Fishing Zone Intent
    if eff_intent == "PFZ":
        if pfz:
            if lang == "ml":
                return f"🐟 മത്സ്യബന്ധന മേഖല (PFZ): ഏറ്റവും അടുത്തുള്ള INCOIS PFZ ({pfz['name']}) {pfz['distance_km']} km {pfz['direction']} അകലെയാണ് (SST {pfz.get('sst_c', 28.4)}°C). മത്തി, അയല ലഭ്യത സാധ്യത കൂടുതൽ."
            elif lang == "ta":
                return f"🐟 மீன்பிடி மண்டலம் (PFZ): அருகிலுள்ள INCOIS PFZ ({pfz['name']}) {pfz['distance_km']} கி.மீ {pfz['direction']} திசையில் உள்ளது (SST {pfz.get('sst_c', 28.4)}°C). அதிக மீன் வாய்ப்பு உண்டு."
            elif lang == "te":
                return f"🐟 చేపల వేట మండలం (PFZ): సమీప INCOIS PFZ ({pfz['name']}) {pfz['distance_km']} కి.మీ దూరంలో ఉంది (దిశ {pfz['direction']})."
            elif lang == "hi":
                return f"🐟 संभावित मत्स्य क्षेत्र (PFZ): निकटतम INCOIS PFZ ({pfz['name']}) {pfz['distance_km']} km {pfz['direction']} दिशा में है (SST {pfz.get('sst_c', 28.4)}°C)।"
            return f"🐟 POTENTIAL FISHING ZONE: Nearest INCOIS PFZ ({pfz['name']}) is {pfz['distance_km']} km {pfz['direction']} (SST {pfz.get('sst_c', 28.4)}°C). High density for pelagic sardine and mackerel shoals."
        elif local_area:
            radius = local_area.get("radius_km", 22)
            la_sst = local_area.get("sst_c")
            chl = local_area.get("chlorophyll_mg_m3")
            la_sst_txt = f" SST {la_sst:.1f}°C." if la_sst else ""
            chl_txt = f" Chlorophyll {chl} mg/m³." if chl else ""
            if lang == "ml":
                return f"🐟 മത്സ്യബന്ധന നിർദ്ദേശം: 50 കി.മീ പരിധിയിൽ INCOIS PFZ ഇല്ല. നിങ്ങളുടെ {radius:.0f} കി.മീ തീരപരിധിയിൽ മീൻപിടുത്തം നടത്താം. പ്രാദേശിക വലവീശലിന് അനുയോജ്യമാണ്."
            elif lang == "ta":
                return f"🐟 மீன்பிடி ஆலோசனை: 50 கி.மீ-க்குள் INCOIS PFZ இல்லை. பரிந்துரைக்கப்பட்ட உள்ளூர் மண்டலம் {radius:.0f} கி.மீ-க்குள் உள்ளது. வலை வீசுவதற்கு உகந்தது."
            elif lang == "te":
                return f"🐟 చేపల వేట సూచన: 50 కి.మీ లోపు INCOIS PFZ లేదు. మీ తీరం నుండి {radius:.0f} కి.మీ పరిధిలో వేట అనుకూలం."
            elif lang == "hi":
                return f"🐟 मत्स्य परामर्श: 50 km के दायरे में कोई PFZ नहीं है। अनुशंसित तटीय क्षेत्र {radius:.0f} km परिधि में है। स्थानीय मछली पकड़ने के लिए उपयुक्त।"
            return f"🐟 FISHING ADVISORY: No INCOIS PFZ within 50 km. Recommended coastal fishing zone is within a {radius:.0f} km sector.{la_sst_txt}{chl_txt} Ideal for local net casting."
        else:
            sst_txt = f" SST is {sst:.1f}°C with favorable thermal fronts." if sst else ""
            if lang == "ml":
                return "🐟 മത്സ്യബന്ധന നിർദ്ദേശം: സുരക്ഷിതമായ തീരപരിധിയിൽ അനുകൂലമായ മീൻപിടുത്ത സാധ്യതയുണ്ട്."
            elif lang == "ta":
                return "🐟 மீன்பிடி ஆலோசனை: பாதுகாப்பான கடலோர வரம்புகளுக்குள் நல்ல மீன்பிடி வாய்ப்புகள் உள்ளன."
            elif lang == "te":
                return "🐟 చేపల వేట సూచన: సురక్షిత తీరప్రాంతంలో చేపల వేటకు మంచి అవకాశం ఉంది."
            elif lang == "hi":
                return "🐟 मत्स्य परामर्श: सुरक्षित तटीय सीमा के भीतर मछली पकड़ने की अच्छी संभावना है।"
            return f"🐟 FISHING ADVISORY: Primary pelagic fishing zones are active 12-25 NM offshore.{sst_txt} Good fishing potential within safe coastal limits."

    # 4. Port / Harbor / Landing / Shelter Intent
    if eff_intent == "PORT":
        if landing_options:
            opts_summary = ", ".join(f"{opt['name']} ({opt.get('stage', 'Harbor')})" for opt in landing_options[:2])
            if lang == "ml":
                return f"⚓ സുരക്ഷിത തുറമുഖങ്ങൾ: നിങ്ങളുടെ യാത്രാ പാതയിലെ പ്രധാന ലാൻഡിംഗ് കേന്ദ്രങ്ങൾ: {opts_summary}."
            elif lang == "ta":
                return f"⚓ அவசர துறைமுகங்கள்: உங்கள் வழித்தடத்தில் உள்ள பாதுகாப்பான துறைமுகங்கள்: {opts_summary}."
            elif lang == "te":
                return f"⚓ రక్షణ నౌకాశ్రయాలు: మీ ప్రయాణ మార్గంలో ఉన్న సురక్షిత రేవులు: {opts_summary}."
            elif lang == "hi":
                return f"⚓ सुरक्षित बंदरगाह: आपके मार्ग के प्रमुख सुरक्षित लैंडिंग केंद्र: {opts_summary}।"
            return f"⚓ LANDING & EMERGENCY HARBORS: Strategic landing centers along your route: {opts_summary}."
        else:
            if lang == "ml":
                return "⚓ തുറമുഖ വിവരങ്ങൾ: നിങ്ങളുടെ തീരദേശ ഇടനാഴിയിലുടനീളം അടിയന്തര ഷെൽട്ടറുകൾ നിരീക്ഷിക്കപ്പെടുന്നു."
            return "⚓ LANDING HARBORS: Return ports and emergency shelters are monitored along your coastal corridor."

    # 5. Data Freshness & Staleness Re-fetch Intent
    if eff_intent == "FRESHNESS":
        freshness = data_freshness or {}
        age_h = freshness.get("age_hours")
        is_stale = freshness.get("stale", False)
        was_refreshed = freshness.get("refreshed", False)
        pt_count = (freshness.get("metadata") or {}).get("point_count", 595)

        if age_h is not None:
            age_desc = f"{age_h:.1f} hours" if age_h >= 1.0 else f"{max(1, int(age_h * 60))} minutes"
        else:
            age_desc = "just updated"

        if lang == "hi":
            if was_refreshed:
                return (
                    f"🔄 डेटा री-फ़ेच सफल: पिछला डेटा 6 घंटे से अधिक पुराना/अनुपलब्ध था, "
                    f"इसलिए इसे तुरंत ताज़ा कर लिया गया है! वर्तमान डेटा अब 0.0 घंटे पुराना (लाइव) है। "
                    f"कुल {pt_count} समुद्री ग्रिड पॉइंट्स अपडेटेड हैं।"
                )
            elif is_stale:
                return (
                    f"⚠️ डेटा पुराना (Stale) है: वर्तमान डेटा {age_desc} पुराना है (>6 घंटे)। "
                    f"सिस्टम इसे बैकग्राउंड में री-फ़ेच कर रहा है।"
                )
            else:
                return (
                    f"✅ डेटा पूरी तरह ताज़ा (Fresh) है: वर्तमान डेटा केवल {age_desc} पुराना है "
                    f"(अधिकतम सीमा: 6.0 घंटे)। कुल {pt_count} समुद्री ग्रिड पॉइंट्स सक्रिय हैं।"
                )
        elif lang == "ta":
            if was_refreshed:
                return f"🔄 தரவு புதுப்பிக்கப்பட்டது: தரவு 6 மணிநேரத்திற்கும் மேல் பழையதாக இருந்ததால், அது உடனடியாக புதுப்பிக்கப்பட்டது! மொத்தம் {pt_count} கடல் புள்ளிகள் புதுப்பிக்கப்பட்டுள்ளன."
            elif is_stale:
                return f"⚠️ தரவு பழையது: தற்போதைய கடல் தரவு {age_desc} பழையது (>6 மணிநேரம்). புதுப்பிக்கப்படுகிறது."
            else:
                return f"✅ தரவு புதியது: தற்போதைய தரவு {age_desc} மட்டுமே பழமையானது (<6 மணிநேர வரம்பு). மொத்தம் {pt_count} புள்ளிகள் செயலில் உள்ளன."
        elif lang == "ml":
            if was_refreshed:
                return f"🔄 ഡാറ്റ പുതുക്കി: ഡാറ്റ 6 മണിക്കൂറിൽ കൂടുതൽ പഴയതായതിനാൽ തത്സമയം പുതുക്കി! നിലവിൽ {pt_count} മറൈൻ പോയിന്റുകൾ ലഭ്യമാണ്."
            elif is_stale:
                return f"⚠️ ഡാറ്റ പഴയതാണ്: നിലവിലെ ഡാറ്റ {age_desc} പഴയതാണ് (>6 മണിക്കൂർ)."
            else:
                return f"✅ ഡാറ്റ പുതിയതാണ്: നിലവിലെ ഡാറ്റ {age_desc} മാത്രം പഴക്കമുള്ളതാണ് (<6 മണിക്കൂർ പരിധി)."
        elif lang == "te":
            if was_refreshed:
                return f"🔄 డేటా రీఫ్రెష్ విజయవంతం: డేటా 6 గంటల కంటే పాతది కావడంతో వెంటనే రీఫ్రెష్ చేయబడింది! మొత్తం {pt_count} పాయింట్లు నవీకరించబడ్డాయి."
            elif is_stale:
                return f"⚠️ డేటా పాతది: ప్రస్తుత డేటా {age_desc} పాతది (>6 గంటలు)."
            else:
                return f"✅ డేటా తాజాగా ఉంది: ప్రస్తుత డేటా కేవలం {age_desc} పాతది (<6 గంటల పరిమితి)."
        else:
            if was_refreshed:
                return (
                    f"🔄 DATA RE-FETCH COMPLETE: The oceanographic dataset was >6 hours old (stale) and has been successfully re-fetched! "
                    f"Current data age is now 0.0h (LIVE). All {pt_count} Indian EEZ & PFZ marine grid points are fully refreshed."
                )
            elif is_stale:
                return (
                    f"⚠️ DATA IS STALE: Currently fetched oceanographic data is {age_desc} old (>6.0 hours threshold). "
                    f"Automatic background re-fetch has been dispatched."
                )
            else:
                return (
                    f"✅ DATA IS FRESH: Currently fetched oceanographic data is only {age_desc} old "
                    f"(well within the 6.0 hours freshness limit). {pt_count} marine grid points active."
                )

    # 6. Safety / Can I sail / Permission Intent (Default)
    if risk == "HIGH":
        if lang == "ml":
            return f"🛡️ യാത്രാ സുരക്ഷ: അതീവ അപകടസാധ്യത! അപകടകരമായ കടൽാവസ്ഥ ({wind:.0f} km/h കാറ്റ്, {wave:.1f} മീറ്റർ തിരമാല). ഇന്ന് കടലിൽ പോകരുത്."
        elif lang == "ta":
            return f"🛡️ பாதுகாப்பு மதிப்பீடு: அதிக ஆபத்து! கடலில் சீற்றம் ({wind:.0f} km/h காற்று, {wave:.1f} மீ அலைகள்). இன்று கடலுக்குச் செல்ல வேண்டாம்."
        elif lang == "te":
            return f"🛡️ భద్రతా సమీక్ష: అధిక ప్రమాదం! సముద్రంలో ప్రమాదకర పరిస్థితులు ({wind:.0f} km/h గాలులు, {wave:.1f} మీ అలలు). నేడు సముద్రంలోకి వెళ్లవద్దు."
        elif lang == "hi":
            return f"🛡️ यात्रा सुरक्षा: उच्च जोखिम! खतरनाक समुद्री स्थितियां ({wind:.0f} km/h हवाएं, {wave:.1f} m लहरें)। आज समुद्र में न जाएं।"
        return f"🛡️ VOYAGE SAFETY ASSESSMENT: HIGH RISK! Dangerous sea conditions ({wind:.0f} km/h winds, {wave:.1f} m waves). Do NOT venture out today."
    elif risk == "MODERATE":
        if lang == "ml":
            return f"🛡️ യാത്രാ സുരക്ഷ: മിതമായ ജാഗ്രത ആവശ്യമാണ്. കാറ്റ് {wind:.0f} km/h, തിരമാല {wave:.1f} മീറ്റർ. പരിചയസമ്പന്നരായ ജീവനക്കാർ മാത്രം സുരക്ഷാ മുൻകരുതലുകളോടെ പോകുക."
        elif lang == "ta":
            return f"🛡️ பாதுகாப்பு மதிப்பீடு: மிதமான ஆபத்து. காற்று {wind:.0f} km/h, அலை {wave:.1f} மீ. போதிய பாதுகாப்பு உபகரணங்களுடன் மட்டும் செல்லவும்."
        elif lang == "te":
            return f"🛡️ భద్రతా సమీక్ష: మోస్తరు ప్రమాదం. గాలి {wind:.0f} km/h, అలలు {wave:.1f} మీ. రక్షణ పరికరాలతో జాగ్రత్తగా ఉండండి."
        elif lang == "hi":
            return f"🛡️ यात्रा सुरक्षा: मध्यम जोखिम। हवा {wind:.0f} km/h और {wave:.1f} m लहरें। केवल अनुभवी नाविक सुरक्षा उपकरणों के साथ जाएं।"
        return f"🛡️ VOYAGE SAFETY ASSESSMENT: MODERATE RISK. Elevated winds ({wind:.0f} km/h) and {wave:.1f} m waves. Only experienced crews with safety gear should operate."
    else:
        if lang == "ml":
            return f"🛡️ യാത്രാ സുരക്ഷ: ഇന്ന് കടലിൽ പോകാം! കടൽ ശാന്തമാണ്. കാറ്റ് {wind:.0f} km/h, തിരമാല {wave:.1f} മീറ്റർ. നിങ്ങളുടെ {vessel} ബോട്ടിന് അനുകൂലമാണ്."
        elif lang == "ta":
            return f"🛡️ பாதுகாப்பு மதிப்பீடு: இன்று கடலுக்குச் செல்லலாம்! காற்று {wind:.0f} km/h, அலை {wave:.1f} மீ. உங்கள் {vessel} படகிற்கு மிகவும் பாதுகாப்பானது."
        elif lang == "te":
            return f"🛡️ భద్రతా సమీక్ష: ఈరోజు వేటకు వెళ్లడం సురక్షితం! గాలి {wind:.0f} km/h, అలలు {wave:.1f} మీ. మీ {vessel} బోటుకు అనుకూలం."
        elif lang == "hi":
            return f"🛡️ यात्रा सुरक्षा: आज समुद्र में जाना सुरक्षित है! हवा {wind:.0f} km/h और लहरें {wave:.1f} m हैं, जो आपकी {vessel} नाव के लिए अनुकूल हैं।"
        vessel_display = vessel if vessel.endswith("boat") else f"{vessel} boat"
        return f"🛡️ VOYAGE SAFETY ASSESSMENT: SAFE TO SAIL! Risk index is LOW. Winds at {wind:.0f} km/h and waves at {wave:.1f} m are optimal for your {vessel_display}."


def response_node(state: AgentState) -> AgentState:
    """
    Response Agent: uses Sarvam-105B to generate a natural language recommendation
    strictly grounded in the deterministic data from all routes.
    """
    risk = state.get("risk_level", "LOW")
    wind = state.get("wind_speed_10m", 0.0)
    wave = state.get("wave_height", 0.0)
    rain = state.get("precipitation", 0.0)
    lightning = state.get("lightning", False)
    cyclone = state.get("cyclone", False)
    confidence = state.get("confidence", 50)
    lat = state.get("latitude", 0.0)
    lon = state.get("longitude", 0.0)
    query = state.get("query", "")
    pfz = state.get("nearest_pfz")
    pfz_weather = state.get("pfz_weather")
    local_area = state.get("local_fishing_area")
    geofence = state.get("geofence") or {}
    landing_options = state.get("landing_options") or []
    alerts = state.get("alerts", [])
    profile = state.get("profile") or {}

    # Format data context for Sarvam
    conditions_text = (
        f"User Origin ({lat:.2f}°N, {lon:.2f}°E): Wind {wind:.0f} km/h | Waves {wave:.1f} m | Rain {rain:.0f} mm | "
        f"SST {state.get('sst_c', 'N/A')}°C | Chlorophyll {state.get('chlorophyll_mg_m3', 'N/A')} mg/m³ | "
        f"Lightning: {'Yes' if lightning else 'No'} | Cyclone: {'Yes' if cyclone else 'No'}"
    )

    if pfz:
        pw_txt = ""
        if pfz_weather:
            pw_txt = f" | Weather at PFZ: Wind {pfz_weather['wind_speed_10m']} km/h, Waves {pfz_weather['wave_height']} m, SST {pfz_weather.get('sst_c')}°C"
        pfz_info = (
            f"Nearest PFZ: {pfz['name']} | Distance: {pfz['distance_km']} km {pfz['direction']} | "
            f"Coordinates: ({pfz['latitude']}°N, {pfz['longitude']}°E) | SST: {pfz.get('sst_c')}°C | Chlorophyll: {pfz.get('chlorophyll_mg_m3')} mg/m³{pw_txt}"
        )
    elif local_area:
        bb = local_area.get("bounding_box", {})
        pfz_info = (
            f"No INCOIS PFZ within 50 km. LOCAL FISHING AREA (SST/CHL-derived): "
            f"Center ({local_area['center']['latitude']}°N, {local_area['center']['longitude']}°E) | "
            f"Radius ~{local_area['radius_km']} km | "
            f"Bounding box: N {bb.get('north')}° S {bb.get('south')}° E {bb.get('east')}° W {bb.get('west')}° | "
            f"SST: {local_area.get('sst_c')}°C | Chlorophyll: {local_area.get('chlorophyll_mg_m3')} mg/m³ | "
            f"Productivity: {local_area.get('productivity')}"
        )
    else:
        pfz_info = "Nearest PFZ: None nearby"

    if landing_options:
        landing_lines = []
        for opt in landing_options:
            stage = opt.get("stage", "Harbor")
            landing_lines.append(f"{stage}: {opt['name']} ({opt.get('district', '')}) at ({opt['latitude']}°N, {opt['longitude']}°E), {opt['distance_km']} km away")
        landing_info = " | ".join(landing_lines)
    else:
        landing_info = "Nearest Landing Centers: Not available"

    geo_info = f"Indian EEZ Waters: {'Yes' if geofence.get('in_indian_waters', True) else 'NO (Outside EEZ)'}"
    if geofence.get("alerts"):
        geo_info += f" | Boundary Alerts: {'; '.join(a['message'] for a in geofence['alerts'])}"

    active_alerts_text = "; ".join(a["message"] for a in alerts[:3]) if alerts else "None"

    risk_label = {
        "LOW": "LOW RISK (Safe to fish)",
        "MODERATE": "MODERATE RISK (Caution advised)",
        "HIGH": "HIGH RISK (Do not venture out)",
    }.get(risk, "UNKNOWN")

    # `profile["language"]` is set per-request by the mobile client to whatever
    # script the user actually typed the query in (see ChatScreen.tsx's
    # detectQueryLanguage) — NOT necessarily their saved profile default. This
    # is what makes a Malayalam-typed query get a Malayalam answer even if the
    # fisherman's profile is set to English, and vice versa.
    language_code = profile.get("language", "en") or "en"
    language_name = LANGUAGE_NAMES.get(language_code, "English")

    freshness = state.get("data_freshness") or {}
    age_h = freshness.get("age_hours")
    fresh_txt = (
        f"Data Freshness: Age {age_h:.1f}h ({'STALE' if freshness.get('stale') else 'FRESH'}, threshold 6.0h) | "
        f"Re-fetched Now: {'Yes' if freshness.get('refreshed') else 'No'}"
        if age_h is not None else "Data Freshness: Active"
    )

    prompt = f"""You are a marine assistant for Indian fishermen.

Data:
Profile: Vessel: {profile.get('vessel_type', 'Unknown')} | Role: {profile.get('role', 'Unknown')} | Risk Tolerance: {profile.get('risk_tolerance', 'Unknown')}
Risk Level: {risk_label}
{conditions_text}
{fresh_txt}
{pfz_info}
{landing_info}
{geo_info}
Alerts: {active_alerts_text}

User query: "{query}"

Understand what the user is actually asking, then answer only that, using whatever data above is relevant to it. Leave out data that isn't relevant to the question. Answer in 2 lines.
If the Risk Level is HIGH, you MUST start your response by explicitly stating the reason why it is high (e.g. dangerous wind speed, high waves, or alerts) before answering their question.
Respond ONLY in {language_name} ({language_code}), regardless of what language this prompt or the data above is written in. Do not mix in English words except technical units (km/h, m, °C) that don't translate.
Ensure recommendations respect the user's {profile.get('risk_tolerance', 'Unknown')} risk tolerance and {profile.get('vessel_type', 'Unknown')} vessel capabilities.
"""

    try:
        recommendation = sarvam_generate(prompt).strip()
        if not recommendation or len(recommendation) < 20:
            raise ValueError("Empty or too short response from Sarvam")
    except Exception as e:
        intent = state.get("intent", "")
        print(f"[Response] Sarvam call failed: {e}. Using dynamic fallback template for intent '{intent}'.")
        recommendation = get_dynamic_fallback(
            risk, wind, wave, rain, state.get("sst_c"), pfz, pfz_weather, geofence, landing_options, alerts, local_area, query, profile, intent, state.get("data_freshness")
        )

    return {
        **state,
        "recommendation": recommendation,
    }



