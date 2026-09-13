/**
 * voiceService.ts — plays back base64 WAV clips returned by the backend's
 * /voice/tts (Sarvam bulbul:v3). Each clip is written to a temp cache file
 * (expo-audio can't play a raw base64 string directly) and played in order,
 * one at a time — long responses come back as multiple clips (see
 * sarvam_client.py's SARVAM_TTS_MAX_CHARS chunking) rather than one merged
 * file, so this plays them back to back instead of expecting a single URI.
 */
import { File, Paths } from 'expo-file-system';
import { createAudioPlayer } from 'expo-audio';

// Longer than any realistic clip (TTS chunks are capped at 2500 characters
// server-side — see sarvam_client.py's SARVAM_TTS_MAX_CHARS — which even at
// a slow speaking pace is well under a minute), but bounded: without this,
// a clip that fails to decode/play on a given device (no error event exists
// on AudioStatus to catch that) hangs `didJustFinish` forever, and since
// ChatScreen gates its speak button on a single shared `speakingMessageId`,
// one stuck clip would lock that button for every message until the app
// restarts.
const CLIP_TIMEOUT_MS = 45000;

function playOneClip(base64: string, index: number): Promise<void> {
  return new Promise((resolve) => {
    const file = new File(Paths.cache, `sarvam_tts_${Date.now()}_${index}.wav`);
    try {
      file.write(base64, { encoding: 'base64' });
    } catch (err) {
      console.error('[voiceService] Failed to write TTS clip to disk:', err);
      resolve();
      return;
    }

    let settled = false;
    let subscription: { remove: () => void } | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const player = createAudioPlayer(file.uri);

    const finish = () => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      subscription?.remove();
      try {
        player.remove();
      } catch {
        // Already released — fine.
      }
      try {
        file.delete();
      } catch {
        // Cache cleanup best-effort — not fatal if it fails.
      }
      resolve();
    };

    timeoutId = setTimeout(() => {
      console.warn('[voiceService] TTS clip playback timed out — recovering instead of hanging.');
      finish();
    }, CLIP_TIMEOUT_MS);

    subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) finish();
    });
    player.play();
  });
}

export async function playTtsClips(base64Clips: string[]): Promise<void> {
  for (let i = 0; i < base64Clips.length; i++) {
    await playOneClip(base64Clips[i], i);
  }
}
