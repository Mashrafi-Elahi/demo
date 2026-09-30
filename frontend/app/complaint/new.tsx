import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { api, Extracted, taka } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, space } from "@/src/fonts";
import { Bi, Button, Card } from "@/src/components/ui";
import { draftStore } from "@/src/draft";
import { stopSpeaking } from "@/src/audio";

const SAMPLE =
  "রাত দুইটার দিকে একজন ফোন করে বলল আমি বিকাশ লটারিতে ৫০ হাজার টাকা জিতেছি। সে একটা কোড চাইল, দেওয়ার পর আমার অ্যাকাউন্ট থেকে ৮৫০০ টাকা 01798765432 নম্বরে চলে গেছে।";

type Phase = "idle" | "listening" | "transcribing" | "extracting";

export default function NewComplaint() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const prefill = draftStore.get();

  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recState = useAudioRecorderState(recorder, 200);
  const [phase, setPhase] = useState<Phase>("idle");
  const [text, setText] = useState(prefill.description);
  const [micBlocked, setMicBlocked] = useState(false);
  const [photoBlocked, setPhotoBlocked] = useState(false);
  const [err, setErr] = useState("");
  const preparing = useRef(false);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ring = useSharedValue(1);
  useEffect(() => {
    if (phase === "listening") ring.value = withRepeat(withTiming(1.25, { duration: 600 }), -1, true);
    else {
      cancelAnimation(ring);
      ring.value = withTiming(1);
    }
  }, [phase, ring]);
  const ringStyle = useAnimatedStyle(() => ({ transform: [{ scale: ring.value }], opacity: 2 - ring.value }));

  useFocusEffect(
    useCallback(() => {
      getRecordingPermissionsAsync().then((p) => setMicBlocked(!p.granted && !p.canAskAgain)).catch(() => {});
      return () => {
        if (watchdog.current) clearTimeout(watchdog.current);
        try {
          if (recorder.isRecording) recorder.stop().catch(() => {});
        } catch {
          // already released
        }
      };
    }, [recorder]),
  );

  const startRecording = async () => {
    if (preparing.current) return;
    preparing.current = true;
    setErr("");
    try {
      stopSpeaking();
      let perm = await getRecordingPermissionsAsync();
      if (!perm.granted && perm.canAskAgain) perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setMicBlocked(!perm.canAskAgain);
        setErr("মাইক্রোফোনের অনুমতি প্রয়োজন · Microphone access is needed to record");
        return;
      }
      setMicBlocked(false);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase("listening");
      watchdog.current = setTimeout(() => stopRecording(), 120000);
    } catch (e: any) {
      setErr(`Recording failed: ${e?.message ?? e}`);
      setPhase("idle");
    } finally {
      preparing.current = false;
    }
  };

  const stopRecording = async () => {
    if (watchdog.current) clearTimeout(watchdog.current);
    try {
      await recorder.stop();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const uri = recorder.uri;
      if (!uri) throw new Error("No audio captured");
      setPhase("transcribing");
      const t = await api.transcribe(uri);
      if (!t) {
        setErr("কিছু শোনা যায়নি, আবার বলুন · Didn't catch that, please try again");
      } else {
        setText((prev) => (prev ? `${prev} ${t}` : t));
      }
    } catch (e: any) {
      setErr(e?.message || "Transcription failed");
    } finally {
      setPhase("idle");
    }
  };

  const goReview = (x: Extracted, description: string) => {
    const cur = draftStore.get();
    draftStore.merge({
      provider: cur.transactionId ? cur.provider : x.provider !== "Unknown" ? x.provider : cur.provider,
      trx_id: cur.trx_id || x.trx_id,
      amount: cur.amount || (x.amount ? String(x.amount) : ""),
      recipient_number: cur.recipient_number || x.recipient_number,
      time: cur.time || x.time,
      scam_type: x.scam_type,
      summary_bn: x.summary_bn,
      summary_en: x.summary_en,
      ai: x.ai,
      description,
    });
    router.push("/complaint/review");
  };

  const analyseText = async () => {
    if (!text.trim()) {
      setErr("ঘটনাটি বলুন বা লিখুন · Please describe what happened");
      return;
    }
    setErr("");
    setPhase("extracting");
    try {
      goReview(await api.extractText(text), text);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setPhase("idle");
    }
  };

  const pickScreenshot = async () => {
    setErr("");
    let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setPhotoBlocked(!perm.canAskAgain);
      setErr("স্ক্রিনশট বাছাই করতে ছবির অনুমতি দিন · Allow photo access to pick a screenshot");
      return;
    }
    setPhotoBlocked(false);
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.6 });
    if (res.canceled || !res.assets[0]?.base64) return;
    setPhase("extracting");
    try {
      goReview(await api.extractImage(res.assets[0].base64), text || "Details read from screenshot");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setPhase("idle");
    }
  };

  const secs = Math.floor((recState.durationMillis ?? 0) / 1000);
  const busy = phase === "transcribing" || phase === "extracting";

  return (
    <View style={styles.root} testID="complaint-new-screen">
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Pressable testID="complaint-back-button" onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <Bi bn="অভিযোগ করুন" en="File a complaint" size={18} weight="bold" />
      </View>

      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xl }}>
        {prefill.transactionId ? (
          <Card style={{ backgroundColor: colors.errorTint, borderColor: colors.errorTint }} testID="complaint-prefill-card">
            <Bi bn={`${prefill.provider} · ${taka(Number(prefill.amount))} → ${prefill.recipient_number}`} en={`TrxID ${prefill.trx_id} · details attached from the alert`} size={15} />
          </Card>
        ) : null}

        <View style={styles.micWrap}>
          <Bi bn="কী হয়েছিল, বাংলায় বলুন" en="Tell us what happened, in Bangla" size={18} weight="bold" align="center" />
          <View style={styles.micArea}>
            {phase === "listening" && <Animated.View style={[styles.micRing, ringStyle]} />}
            <Pressable
              testID="complaint-record-button"
              disabled={busy}
              onPress={() => (phase === "listening" ? stopRecording() : startRecording())}
              style={({ pressed }) => [styles.mic, { backgroundColor: phase === "listening" ? colors.error : colors.brandPrimary, transform: [{ scale: pressed ? 0.95 : 1 }], opacity: busy ? 0.5 : 1 }]}
            >
              {phase === "transcribing" ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Ionicons name={phase === "listening" ? "stop" : "mic"} size={40} color={colors.onBrandPrimary} />}
            </Pressable>
          </View>
          <Text style={styles.micHint} testID="complaint-record-status">
            {phase === "listening"
              ? `শুনছি... ০:${String(secs).padStart(2, "0")} · Listening — tap to stop`
              : phase === "transcribing"
                ? "লেখায় রূপান্তর হচ্ছে... · Transcribing"
                : "রেকর্ড করতে ট্যাপ করুন · Tap to record (mic permission asked once)"}
          </Text>
          {micBlocked && (
            <Button testID="complaint-mic-settings-button" variant="ghost" icon="settings-outline" bn="সেটিংসে অনুমতি দিন" en="Open Settings to allow mic" onPress={() => Linking.openSettings()} />
          )}
        </View>

        <View>
          <View style={styles.labelRow}>
            <Bi bn="বিবরণ" en="Description (voice text appears here)" size={14} />
            <Pressable testID="complaint-sample-button" onPress={() => setText(SAMPLE)} style={styles.sampleBtn}>
              <Text style={styles.sampleText}>ডেমো উদাহরণ · Sample</Text>
            </Pressable>
          </View>
          <TextInput
            testID="complaint-description-input"
            value={text}
            onChangeText={setText}
            multiline
            placeholder="যেমন: একজন ফোন করে পিন চাইল... / e.g. Someone called asking for my PIN..."
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
        </View>

        {err ? (
          <View style={styles.err} testID="complaint-error">
            <Ionicons name="alert-circle" size={18} color={colors.error} />
            <Text style={styles.errText}>{err}</Text>
          </View>
        ) : null}

        <Button testID="complaint-analyse-button" icon="sparkles-outline" bn="বিবরণ থেকে তথ্য বের করুন" en="Extract details with AI" loading={phase === "extracting"} disabled={busy || phase === "listening"} onPress={analyseText} />

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>অথবা · or</Text>
          <View style={styles.orLine} />
        </View>

        <Pressable testID="complaint-upload-screenshot-button" disabled={busy} onPress={pickScreenshot} style={({ pressed }) => [styles.upload, { opacity: pressed || busy ? 0.7 : 1 }]}>
          <Ionicons name="image-outline" size={28} color={colors.brandPrimary} />
          <View style={{ flex: 1 }}>
            <Bi bn="স্ক্রিনশট আপলোড করুন" en="Upload SMS / app screenshot — AI reads it" size={15} />
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.muted} />
        </Pressable>
        {photoBlocked && (
          <Button testID="complaint-photo-settings-button" variant="ghost" icon="settings-outline" bn="সেটিংসে অনুমতি দিন" en="Open Settings to allow photos" onPress={() => Linking.openSettings()} />
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: c.border },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  micWrap: { alignItems: "center", gap: space.md, paddingVertical: space.md },
  micArea: { width: 140, height: 140, alignItems: "center", justifyContent: "center" },
  micRing: { position: "absolute", width: 120, height: 120, borderRadius: 60, backgroundColor: c.errorTint },
  mic: { width: 104, height: 104, borderRadius: 52, alignItems: "center", justifyContent: "center", elevation: 3, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  micHint: { fontFamily: fonts.semibold, fontSize: 13, color: c.onSurfaceTertiary, textAlign: "center" },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: space.sm },
  sampleBtn: { paddingHorizontal: space.md, height: 32, justifyContent: "center", borderRadius: radius.pill, backgroundColor: c.brandTertiary },
  sampleText: { fontFamily: fonts.semibold, fontSize: 12, color: c.onBrandTertiary },
  input: { minHeight: 120, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, padding: space.md, fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: c.onSurface, textAlignVertical: "top" },
  err: { flexDirection: "row", gap: space.sm, backgroundColor: c.errorTint, padding: space.md, borderRadius: radius.md, alignItems: "center" },
  errText: { flex: 1, fontFamily: fonts.semibold, fontSize: 13, color: c.error },
  orRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  orLine: { flex: 1, height: 1, backgroundColor: c.border },
  orText: { fontFamily: fonts.semibold, fontSize: 12, color: c.muted },
  upload: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg, borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: c.brandSecondary, backgroundColor: c.brandTertiary },
}));
