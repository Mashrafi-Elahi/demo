import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { api, NumberCheck, timeAgo, toBn } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, space } from "@/src/fonts";
import { Bi, Button, Chip } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { useSpeaker } from "@/src/audio";
import { usesNativeTabs } from "@/src/navigation";

const DEMO = ["01798765432", "01555123456", "01712345678"];

export default function Check() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const onErr = useCallback((m: string) => toast(m, "error"), [toast]);
  const { state, speak, stop } = useSpeaker(onErr);
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [num, setNum] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<NumberCheck | null>(null);
  const [err, setErr] = useState("");

  const check = async (n = num) => {
    setErr("");
    setRes(null);
    setLoading(true);
    try {
      const r = await api.checkNumber(n);
      setRes(r);
      Haptics.notificationAsync(
        r.level === "safe" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
      ).catch(() => {});
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const meta = res
    ? {
        safe: { icon: "shield-checkmark" as const, fg: colors.success, bg: colors.successTint, bn: "কোনো রিপোর্ট নেই", en: "No reports found", say: "এই নম্বরের বিরুদ্ধে কোনো রিপোর্ট নেই। তবুও সাবধানে টাকা পাঠান।" },
        caution: { icon: "alert-circle" as const, fg: colors.warning, bg: colors.warningTint, bn: "সাবধান", en: "Caution — reported before", say: `সাবধান! এই নম্বরটি ${res.report_count} বার রিপোর্ট করা হয়েছে। নিশ্চিত না হয়ে টাকা পাঠাবেন না।` },
        reported: { icon: "close-circle" as const, fg: colors.error, bg: colors.errorTint, bn: "অনেকে রিপোর্ট করেছেন!", en: "Reported by several people", say: `বিপদ! এই নম্বরটি ${res.report_count} জন প্রতারণার জন্য রিপোর্ট করেছেন। টাকা পাঠাবেন না।` },
      }[res.level]
    : null;

  return (
    <View style={styles.root} testID="check-screen">
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Bi bn="নম্বর যাচাই" en="Check before you send" size={22} weight="bold" />
      </View>
      <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: bottomChrome + space.xl }}>
        <Bi bn="টাকা পাঠানোর আগে প্রাপকের নম্বর শেয়ার্ড প্রতারণা ডাটাবেসে মিলিয়ে নিন" en="Match the recipient against reports pooled across bKash, Nagad & Rocket" size={14} weight="regular" />

        <View style={styles.inputWrap}>
          <Text style={styles.prefix}>+88</Text>
          <TextInput
            testID="check-number-input"
            value={num}
            onChangeText={(t) => setNum(t.replace(/[^\d]/g, "").slice(0, 11))}
            keyboardType="phone-pad"
            placeholder="01XXXXXXXXX"
            placeholderTextColor={colors.muted}
            style={styles.input}
            onSubmitEditing={() => check()}
          />
          {num ? (
            <Pressable testID="check-clear-button" onPress={() => { setNum(""); setRes(null); stop(); }} hitSlop={10}>
              <Ionicons name="close-circle" size={22} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>

        <View>
          <Text style={styles.demoLabel}>ডেমো নম্বর · Try demo numbers</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }} style={{ height: 40 }}>
            {DEMO.map((n) => (
              <Chip key={n} testID={`check-demo-${n}`} label={n} selected={num === n} onPress={() => { setNum(n); check(n); }} />
            ))}
          </ScrollView>
        </View>

        <Button testID="check-submit-button" icon="search" bn="নম্বর যাচাই করুন" en="Check number" loading={loading} disabled={num.length !== 11} onPress={() => check()} />

        {err ? (
          <View style={[styles.result, { backgroundColor: colors.errorTint }]} testID="check-error">
            <Text style={[styles.errText]}>{err}</Text>
          </View>
        ) : null}

        {loading && (
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.brandPrimary} />
            <Text style={styles.muted}>ডাটাবেস খোঁজা হচ্ছে · Checking database...</Text>
          </View>
        )}

        {res && meta && (
          <Animated.View entering={FadeInDown} style={[styles.result, { backgroundColor: meta.bg }]} testID={`check-result-${res.level}`}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <Ionicons name={meta.icon} size={44} color={meta.fg} />
              <View style={{ flex: 1 }}>
                <Bi bn={meta.bn} en={meta.en} size={20} weight="bold" color={meta.fg} enColor={colors.onSurfaceSecondary} />
              </View>
            </View>
            <Text style={styles.resNum}>{res.number}</Text>
            {res.level !== "safe" && (
              <View style={{ gap: space.sm }}>
                <Row icon="flag" text={`${toBn(res.report_count)} টি রিপোর্ট · ${res.report_count} reports`} />
                <Row icon="wallet" text={`প্রোভাইডার · ${res.providers.join(", ")}`} />
                {res.scam_types_bn.map((s, i) => (
                  <Row key={s} icon="pricetag" text={`${s} · ${res.scam_types[i]}`} />
                ))}
                {res.last_reported && <Row icon="time" text={`সর্বশেষ রিপোর্ট · Last reported ${timeAgo(res.last_reported)}`} />}
                {res.flagged_high_risk && (
                  <View style={styles.flag} testID="check-high-risk-badge">
                    <Ionicons name="skull" size={14} color={colors.onError} />
                    <Text style={styles.flagText}>উচ্চ ঝুঁকিপূর্ণ ওয়ালেট · High-risk wallet (human reviewed)</Text>
                  </View>
                )}
              </View>
            )}
            <Pressable testID="check-speak-result-button" onPress={() => (state === "idle" ? speak(meta.say) : stop())} style={styles.speak}>
              {state === "loading" ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : <Ionicons name={state === "speaking" ? "stop" : "volume-high"} size={18} color={colors.brandPrimary} />}
              <Text style={styles.speakText}>{state === "speaking" ? "থামুন · Stop" : "ফলাফল শুনুন · Hear result"}</Text>
            </Pressable>
          </Animated.View>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

function Row({ icon, text }: { icon: any; text: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
      <Ionicons name={icon} size={14} color={colors.onSurfaceTertiary} />
      <Text style={styles.rowText}>{text}</Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: space.lg, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: c.border },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: space.sm, height: 64, borderRadius: radius.md, borderWidth: 1.5, borderColor: c.borderStrong, paddingHorizontal: space.lg, backgroundColor: c.surface },
  prefix: { fontFamily: fonts.bold, fontSize: 20, color: c.muted },
  input: { flex: 1, fontFamily: fonts.bold, fontSize: 24, letterSpacing: 1, color: c.onSurface },
  demoLabel: { fontFamily: fonts.semibold, fontSize: 12, color: c.muted, marginBottom: 6 },
  result: { borderRadius: radius.lg, padding: space.lg, gap: space.md },
  resNum: { fontFamily: fonts.bold, fontSize: 18, color: c.onSurface, letterSpacing: 1 },
  rowText: { flex: 1, fontFamily: fonts.regular, fontSize: 13, color: c.onSurfaceSecondary },
  flag: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: c.error, paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.pill },
  flagText: { fontFamily: fonts.bold, fontSize: 11, color: c.onError },
  speak: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", height: 40, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: c.surface },
  speakText: { fontFamily: fonts.bold, fontSize: 13, color: c.brandPrimary },
  errText: { fontFamily: fonts.semibold, fontSize: 14, color: c.error },
  muted: { fontFamily: fonts.regular, fontSize: 13, color: c.muted },
}));
