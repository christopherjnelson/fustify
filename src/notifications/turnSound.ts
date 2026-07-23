type WebkitAudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

let context: AudioContext | null = null;
let unlockSubscriberCount = 0;
let unlockListening = false;

function audioContextConstructor(): typeof AudioContext | undefined {
  if (typeof window === 'undefined') return undefined;
  return (
    window.AudioContext ?? (window as WebkitAudioWindow).webkitAudioContext
  );
}

function ensureContext(): AudioContext | null {
  if (context !== null) return context;
  const AudioContextClass = audioContextConstructor();
  if (!AudioContextClass) return null;
  try {
    context = new AudioContextClass();
    return context;
  } catch {
    return null;
  }
}

function stopListeningForUnlock() {
  if (!unlockListening) return;
  window.removeEventListener('pointerdown', unlockAudio, true);
  window.removeEventListener('keydown', unlockAudio, true);
  unlockListening = false;
}

function unlockAudio() {
  const audioContext = ensureContext();
  if (audioContext === null) return;
  if (audioContext.state === 'running') return;
  void audioContext
    .resume()
    .then(() => undefined)
    .catch(() => undefined);
}

function listenForUnlock() {
  if (unlockListening || typeof window === 'undefined') return;
  window.addEventListener('pointerdown', unlockAudio, true);
  window.addEventListener('keydown', unlockAudio, true);
  unlockListening = true;
}

export function installTurnSoundUnlock(): () => void {
  unlockSubscriberCount += 1;
  listenForUnlock();
  return () => {
    unlockSubscriberCount = Math.max(0, unlockSubscriberCount - 1);
    if (unlockSubscriberCount === 0) stopListeningForUnlock();
  };
}

export function playTurnChime(): boolean {
  const audioContext = context;
  if (audioContext === null || audioContext.state !== 'running') return false;

  try {
    const now = audioContext.currentTime;
    const gain = audioContext.createGain();
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(659.25, now);
    oscillator.frequency.setValueAtTime(783.99, now + 0.11);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.addEventListener(
      'ended',
      () => {
        oscillator.disconnect();
        gain.disconnect();
      },
      { once: true },
    );
    oscillator.start(now);
    oscillator.stop(now + 0.31);
    return true;
  } catch {
    return false;
  }
}
