import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler } from "react-native";
import { createAudioPlayer, setAudioModeAsync, AudioPlayer } from "expo-audio";
import { useFocusEffect } from "expo-router";
import { api, BASE } from "./api";

let player: AudioPlayer | null = null;
let seq = 0;

export function stopSpeaking() {
  seq++;
  try {
    player?.pause();
    player?.remove();
  } catch {
    // already released
  }
  player = null;
}

export type SpeakState = "idle" | "loading" | "speaking";

async function playText(text: string, onState: (s: SpeakState) => void) {
  stopSpeaking();
  const mySeq = seq;
  onState("loading");
  const { url } = await api.tts(text);
  if (mySeq !== seq) return;
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
  const p = createAudioPlayer({ uri: `${BASE}${url}` });
  player = p;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 90000);
    const sub = p.addListener("playbackStatusUpdate", (s) => {
      if (mySeq !== seq) {
        clearTimeout(timer);
        sub.remove();
        resolve();
        return;
      }
      if (s.playing) onState("speaking");
      if (s.didJustFinish) {
        clearTimeout(timer);
        sub.remove();
        resolve();
      }
    });
    p.play();
  });
  if (mySeq === seq) stopSpeaking();
}

/** Screen-scoped speaker: stops on blur, unmount and Android back. */
export function useSpeaker(onError?: (msg: string) => void) {
  const [state, setState] = useState<SpeakState>("idle");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        stopSpeaking();
        return false;
      });
      return () => {
        sub.remove();
        stopSpeaking();
      };
    }, []),
  );

  const speak = useCallback(
    async (text: string) => {
      const set = (s: SpeakState) => mounted.current && setState(s);
      try {
        await playText(text, set);
      } catch (e: any) {
        onError?.(e?.message || "Could not play voice");
      } finally {
        set("idle");
      }
    },
    [onError],
  );

  const stop = useCallback(() => {
    stopSpeaking();
    setState("idle");
  }, []);

  return { state, speak, stop };
}
