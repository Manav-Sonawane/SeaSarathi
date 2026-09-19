# SeaSarathi — Android APK: Setup & Architecture

How to get a testable APK onto a phone, and how the pieces fit together when the app is
an **installed APK** rather than an Expo dev session. Findings from the audit that led to
these changes are in [ANDROID_AUDIT.md](ANDROID_AUDIT.md).

## 1. Architecture (APK mode)

```
 Android phone (installed APK)                       Your PC / a server
┌──────────────────────────────────┐              ┌─────────────────────────────┐
│ React Native (Hermes, new arch)  │   HTTPS      │ FastAPI  backend/main.py     │
│  Screens ─ Zustand stores        │ ───────────► │  routers → LangGraph agents  │
│  services/api.ts  (axios)        │  EXPO_PUBLIC │  Copernicus grid, IMD scrape │
│   baseURL = EXPO_PUBLIC_API_URL  │  _API_URL    │  Open-Meteo, Sarvam (STT/TTS)│
│                                  │  (build-time)│  SQLite profiles             │
│ On-device                        │              └─────────────────────────────┘
│  • AsyncStorage: profile, small  │
│    offline bundle (forecast, SST)│      Sensors (no network needed)
│  • SQLite: PFZ / boundaries /    │      • expo-location → GPS + compass heading
│    landing-center geometry       │      • expo-audio    → mic (voice queries)
│  • Google Maps SDK (needs key)   │
└──────────────────────────────────┘
```

Key differences from `expo start` that shape the setup:

| Concern | Dev session | Installed APK |
|---|---|---|
| Backend address | auto-detected from Metro host (`api.ts`) | **fixed at build time** via `EXPO_PUBLIC_API_URL` — changing it = rebuild |
| Plain `http://` | allowed (debug manifest) | **blocked** by Android unless the build enables it (`app.config.js` does this automatically only when the URL is `http://`) |
| Maps key | Expo Go substitutes its own | must be your key, restricted to package + **signing-cert SHA-1** |
| Permissions | dev client asks | declared in the manifest by `app.config.js` plugins (location, microphone) |
| Layout | — | Android draws **edge-to-edge**; every screen needs safe-area insets (`SafeAreaProvider` in `App.tsx`) |

The offline bundle (`POST /offline/sync-bundle`) is split on the phone: the small dynamic part
(forecast, SST/chl, geofence status) goes in AsyncStorage; the map geometry goes to SQLite
(`services/mapCacheDb.ts`) and is re-attached on read. The backend now simplifies that
geometry (`utils/geojson_store.py`, ≤ ~0.9 km deviation) — the safety geofence still uses
the full-resolution files server-side.

## 2. One-time prerequisites

- Node 20+ (you have 24), JDK 17+ (you have 21) — needed only for **local** builds.
- An Expo account (free) for EAS cloud builds: `npx eas-cli login`.
- A Google Maps API key with **Maps SDK for Android** enabled (see `mobile/.env.example`).
- Backend reachable from the phone (next section).

## 3. Make the backend reachable from the phone

Start the backend bound to all interfaces (the default `127.0.0.1` rejects other devices):

```powershell
cd backend
.\venv\Scripts\Activate.ps1
uvicorn main:app --host 0.0.0.0 --port 8000
```

Wait for `GET /health/ready` to return `"ready": true` (the Copernicus grid takes ~90 s on a cold start).

Then pick one:

**A. Tunnel — recommended** (works on any network, gives you `https://`):
```powershell
ngrok http 8000        # copy the https://….ngrok-free.app URL
```
**B. Same Wi-Fi:** use `http://<your-PC-LAN-IP>:8000` and allow inbound TCP 8000 in Windows Firewall.
The build enables cleartext traffic automatically for an `http://` URL.

> ⚠ Whatever you expose has **unauthenticated profile endpoints** (see audit §Security). Don't leave a
> public tunnel running unattended, and don't put real fisherman data behind it.

## 4. Build the APK

### Option 1 — EAS cloud build (no Android SDK needed)

```powershell
cd mobile
npx eas-cli login
npx eas-cli init            # only if the project isn't linked yet (projectId is already in app.config.js)

# build-time config lives in the EAS "preview" environment (gitignored .env is NOT uploaded)
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_API_URL `
    --value https://abc123.ngrok-free.app --visibility plaintext
npx eas-cli env:create --environment preview --name EXPO_PUBLIC_GOOGLE_MAPS_API_KEY `
    --value <your-key> --visibility plaintext

npm run build:apk           # = eas build --platform android --profile preview
```
The build fails immediately with a clear message if `EXPO_PUBLIC_API_URL` isn't set. When it
finishes EAS prints a download URL/QR — open it on the phone and install (allow "install
unknown apps" for your browser). First build asks to generate an Android keystore: accept.

### Option 2 — local Gradle build

`android/` in this repo is generated and stale — regenerate it, don't reuse it. Needs
`ANDROID_HOME` set and the SDK's `platform-tools` + a platform/build-tools installed
(this machine has `%LOCALAPPDATA%\Android\Sdk` but no `platform-tools`, so `adb` is missing —
install "Android SDK Platform-Tools" via Android Studio's SDK Manager first).

```powershell
cd mobile
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:EXPO_PUBLIC_API_URL = "https://abc123.ngrok-free.app"
$env:EXPO_PUBLIC_GOOGLE_MAPS_API_KEY = "<your-key>"
npx expo prebuild --platform android --clean
cd android
.\gradlew.bat assembleRelease
# → android\app\build\outputs\apk\release\app-release.apk
adb install -r app\build\outputs\apk\release\app-release.apk
```
The release build is signed with the debug keystore (Expo's default) — fine for sideloading and
testing, **not** for Play Store. If you restrict the Maps key by SHA-1, add the debug keystore's
SHA-1 (`keytool -list -v -keystore android\app\debug.keystore -alias androiddebugkey -storepass android`).

## 5. Verify before you hand the APK to anyone

Checks that were run on this codebase (no device was available):
`npx tsc --noEmit` ✔ · `npx expo-doctor` ✔ · `npx expo export --platform android` (Metro/Hermes bundle) ✔ ·
backend import + geofence tests ✔ · `app.config.js` resolved for preview with http/https/missing URL ✔.
**Not verified:** an actual install on a device/emulator — do the checklist below on the first APK.

On the phone:
1. Airplane mode **off**, open the app → splash should reach the app within ~60 s. If it says
   "Taking longer than usual", the line under it prints the backend URL the APK was built with.
2. Tabs sit above the gesture/nav bar; nothing hides under the status bar.
3. **Compass** → allow location → status changes to *OFFLINE SATELLITE GPS ACTIVE* and the dial follows
   the phone's heading. (Denied → it says so and labels the position as simulated.)
4. **Profile → Use my current location** → nearest landing site is found.
5. **Chat** → type a question; the keyboard must not cover the input bar. Mic button → permission → transcript.
6. **Map** → tiles render (blank grey = Maps key / SHA-1 problem), PFZ + boundary lines and ≤150 landing pins.
7. **Profile → Download offline bundle** (online) → then Airplane mode → Chat/Dashboard/PFZ/Alerts answer from cache with an "offline" marker.
8. Force-stop and reopen while logged in → you stay logged in (no flash of the wrong screen).

Debug a misbehaving APK: `adb logcat *:S ReactNativeJS:V` shows JS errors. If you need the dev menu
and hot reload against the APK, build the `development` profile instead
(`npx eas-cli build --platform android --profile development`).

## 6. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Splash never finishes; "Backend: NOT CONFIGURED" | Build had no `EXPO_PUBLIC_API_URL` (local build). Set it and rebuild. |
| Splash never finishes; backend URL shown is right | Backend not reachable (firewall / not started with `--host 0.0.0.0` / tunnel stopped), or grid still warming — check `/health/ready` from the phone's browser. |
| `Network Error` on an `http://` backend | Cleartext blocked → rebuild with the `http://` URL set (config enables it) or use the https tunnel. |
| Map is grey/blank, rest works | Maps key missing, "Maps SDK for Android" not enabled, or key restricted to a different signing SHA-1. |
| Compass says "position simulated" | Location permission denied, or system Location is off. |
| Build: `eas build` says `EXPO_PUBLIC_API_URL is not set` | Intended — run the `eas env:create` commands in §4. |
| Want a smaller APK | Set `android.buildArchs` via `expo-build-properties` to `["arm64-v8a"]` (physical phones only — breaks x86_64 emulators) and enable minification once the app is stable on device. |
