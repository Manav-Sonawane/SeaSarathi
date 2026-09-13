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

    const player = createAudioPlayer(file.uri);
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        subscription.remove();
        player.remove();
        try {
          file.delete();
        } catch {
          // Cache cleanup best-effort — not fatal if it fails.
        }
        resolve();
      }
    });
    player.play();
  });
}

export async function playTtsClips(base64Clips: string[]): Promise<void> {
  for (let i = 0; i < base64Clips.length; i++) {
    await playOneClip(base64Clips[i], i);
  }
}
