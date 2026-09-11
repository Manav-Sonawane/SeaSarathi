/**
 * networkStore.ts — App-wide connectivity state (UPDATE.md 3.4 "App Behaviour":
 * "No cellular signal → automatic switch to offline mode" / "Reconnects →
 * automatic sync with backend").
 *
 * This is a SIGNAL, not a gate: screens still always attempt their live API
 * call and fall back to cached data in the `catch` block regardless of what
 * this store says (NetInfo can be wrong — connected to Wi-Fi with no real
 * internet, captive portals, etc.). What this store adds on top:
 *   1. Skip the live call up front when we already know there's no
 *      connection, instead of waiting out a 60s axios timeout every time —
 *      that's the actual "automatic switch to offline mode" a fisherman
 *      would notice.
 *   2. Detect the offline → online transition to trigger a background
 *      bundle re-sync (see offlineService.ts's `autoResyncIfNeeded`).
 */
import { create } from 'zustand';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

interface NetworkState {
  isOnline: boolean;
  // null until the first NetInfo event arrives — treat as "assume online"
  // (never block the first live call attempt on an unknown state).
  hasSignal: boolean | null;
  initListener: () => () => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  isOnline: true,
  hasSignal: null,

  initListener: () => {
    const handle = (state: NetInfoState) => {
      // isInternetReachable can be null while NetInfo is still probing —
      // fall back to isConnected in that case rather than reading it as offline.
      const reachable = state.isInternetReachable ?? state.isConnected ?? true;
      set({ isOnline: reachable, hasSignal: state.isConnected });
    };
    const unsubscribe = NetInfo.addEventListener(handle);
    NetInfo.fetch().then(handle);
    return unsubscribe;
  },
}));
