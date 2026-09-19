# Android Audit — SeaSarathi

Scope: `mobile/` (Expo SDK 57 / RN 0.86, new architecture, Hermes) and the `backend/` endpoints the
app depends on. Goal: find what breaks or misleads on an **installed Android APK**, then make an APK
buildable and testable. Setup steps: [ANDROID_BUILD.md](ANDROID_BUILD.md).

**Not verified on hardware.** No device/emulator, `adb`, or EAS login was available. Verified instead:
`tsc --noEmit`, `expo-doctor` (21/21), a Metro Android bundle export, `app.config.js` resolution for
preview builds (http / https / missing URL), backend import + geofence tests, and payload-size/fidelity
measurements for the geometry change. Treat the device checklist in ANDROID_BUILD.md §5 as the real test.

## A. Fixed in this change

| # | Sev | Finding | Fix |
|---|---|---|---|
| 1 | **Blocker** | **GPS and compass never worked on native.** Compass and Profile used `navigator.geolocation` (doesn't exist in RN), the compass used web-only `window.DeviceOrientationEvent`, `expo-location` wasn't installed, and the manifest had no location permission. | New `services/locationService.ts` on `expo-location` (permission flow, 15 s timeout, last-known fast path, heading sensor); wired into Compass + Profile; location plugin added in `app.config.js` (foreground only). |
| 2 | **High (safety)** | With no fix, the Compass silently showed a fabricated "≈10 NM offshore" position with a realistic distance/bearing/ETA, labelled "CALAMITY SAFE MODE". | Status line now states *no GPS: permission denied / turn on location / acquiring fix — position simulated*. (The simulated fallback itself is kept as a demo aid — see §B.) |
| 3 | **Blocker** | **Release APK had no reachable backend.** Outside dev, `api.ts` fell back to `10.0.2.2`/`localhost`; and Android 9+ blocks `http://` in release builds. `.env` isn't uploaded to EAS. | `EXPO_PUBLIC_API_URL` is now the build-time source of truth; EAS preview/production builds **fail fast** if it's unset; cleartext is enabled only when the URL is `http://`; splash prints the URL on timeout; `eas.json` profiles bound to EAS environments. |
| 4 | **High** | **Edge-to-edge layout broken.** RN's `SafeAreaView` is a plain `View` on Android and the build is edge-to-edge → content under the status bar; tab bar hard-coded to 56 px sat under the gesture bar. | `SafeAreaProvider` in `App.tsx`; all 8 screens use `react-native-safe-area-context`; tab bar = 56 + bottom inset (DESIGN.md's 56 preserved). |
| 5 | **High** | **Keyboard covered inputs.** No `KeyboardAvoidingView` in Chat; Auth only avoided on iOS; `adjustResize` doesn't apply edge-to-edge. | `KeyboardAvoidingView behavior="padding"` in Chat and Auth. |
| 6 | **Blocker (offline)** | **Offline download could not succeed on Android.** Bundle included ~23 MB of raw GeoJSON, written as a single AsyncStorage value (Android caps the DB at ~6 MB by default), after a 23 MB download with a 90 s timeout. | Server sends simplified geometry: bundle static part **~23 MB → 1.06 MB**. Client keeps geometry in SQLite only and re-attaches it on read; AsyncStorage holds the small dynamic part. |
| 7 | **High (perf)** | **Map open downloaded ~16.6 MB and drew ~137k coordinate points as native polylines** (EEZ 86k, boundaries 17k, PFZ 34k) plus 1,223 custom-view markers → jank/ANR/OOM on mid-range phones. | Simplified server-side: polyline points **137k → ~13k** (EEZ 86k→12.5k, boundaries 16.8k→156, PFZ 34k→451); `/geojson/boundaries` now **0.24 MB**, `/geojson/pfz` 0.02 MB; native landing pins capped to the nearest 150. Max geometric deviation ≤ 0.94 km, feature types/properties unchanged, geofence untouched. |
| 8 | Med | **Rehydration race.** `loadFromBackend()` ran on mount before AsyncStorage rehydrated, using default identity `USR-KOC-4821` (a seeded demo account) and briefly rendering the wrong screen. | `RootNavigator` waits for persist hydration before rendering and before the first sync. |
| 9 | Med | Adaptive icon config dropped the foreground/background/monochrome images that exist in `assets/` → launcher icon would be a flat colour. | Restored in `app.config.js`. |
| 10 | Low | `allowBackup` on: restoring to a new phone would clone the per-install device id → two devices, one profile. | `allowBackup: false`. |
| 11 | Low | `eas.json` used `appVersionSource: local` with `autoIncrement` + a dynamic `app.config.js` (EAS can't write versionCode back). | Switched to `remote`. |
| 12 | Low | Unused `react-native-vector-icons` (+types) shipped native fonts twice; Expo patch drift flagged by doctor. | Removed; `expo install --fix`. |

## B. Open — needs your decision or is out of scope of this change

**Security (matters as soon as the backend is exposed through a tunnel/server for APK testing)**
1. `POST /auth/login` skips the password check when the password is empty (`if request.password and …`).
2. `GET /profiles` lists every account (names, user IDs); `DELETE /profile/{id}` and `POST /profile` are unauthenticated. Together with #1 this is enumerate → log in as anyone → delete.
3. Passwords stored **plaintext** in SQLite; default password `SeaSarathi@2026` (server default, client sign-up default, 3 seeded demo accounts).
4. **The Google Maps API key you're currently using is in git history, and that history is on GitHub.** Verified: the key in `mobile/.env` appears in commits `84ec9f3`, `6d50e0d` and `a3b93d0` (the "hide" commit only removed it from the tree), all reachable from `origin/main` (`github.com/Manav-Sonawane/SeaSarathi`). Whether the repo is public wasn't checked — assume the key is exposed. **Rotate it**, and restrict the new one (Android apps: package `com.seasarathi.app` + signing SHA-1; API: Maps SDK for Android only). It's also in your local, gitignored `android/` manifest.

**Safety-of-information**
5. `POST /chat` returns a hard-coded `LOW` risk "conditions look acceptable" stub if the agent graph failed to import (`routers/chat.py`). It should fail (503), not reassure.
6. `chatAPI.sendMessage` (`api.ts`) substitutes 18 km/h wind / 1.2 m waves / 85 % confidence / `LOW` when fields are missing — fabricated values shown as data.
7. Compass simulated-position fallback (item A2) still exists; consider hiding distance/bearing/ETA when there's no fix.

**Product / decisions**
8. Fresh install defaults to `isLoggedIn: true` as demo user "Ramesh Kumar", so the Auth screen is skipped until someone logs out. Intentional demo mode? Also: PRD.md §2.2 lists *user accounts/login* as out of scope while `AuthScreen` exists (PRD drift per CLAUDE.md rule 2).
9. Dashboard calls `/data/freshness?auto_refresh=true` on mount and every 5 min — any client can trigger the ~90 s Copernicus refresh on the server.
10. Release APK is signed with the **debug keystore** (fine for testing; needs a real keystore for Play).
11. `components/Header.tsx` is unused dead code with hard-coded "GPS LOCK / Kochi Harbor" text.
12. Voice upload sends `audio/m4a` (non-standard; should be `audio/mp4`). Backend keys off the filename so it likely works — verify on device.

**Backend deployment**
13. EXECUTION.md Day 5 calls for a Dockerfile (none exists) and says `python:3.10`; `requirements.txt` pins numpy 2.5 / pandas 3.0, which most likely need Python ≥ 3.11 (your venv is 3.12). Not added here because it can't be tested on this machine.
14. Cold start: `/health/ready` gates on the Copernicus grid (`data/dynamic/`, gitignored) — a fresh deploy takes ~90 s+ and needs `COPERNICUS_*` credentials; the app's splash gives up after ~60 s and lets users continue.
15. Web-only paths (`WebGoogleMap`, `mapCacheDb.web.ts`, DeviceOrientation) are unaffected but untested here.
