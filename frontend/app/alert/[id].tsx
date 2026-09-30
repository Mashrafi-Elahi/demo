import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { api, taka, toBn, Transaction } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, space } from "@/src/fonts";
import { Bi, Button, Card, ProviderAvatar } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { useSpeaker } from "@/src/audio";
import { draftStore } from "@/src/draft";

export default function AlertScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const onErr = useCallback((m: string) => toast(m, "error"), [toast]);
  const { state, speak, stop } = useSpeaker(onErr);
  const [txn, setTxn] = useState<Transaction | null>(null);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const autoPlayed = useRef(false);

  const pulse = useSharedValue(1);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1.15, { duration: 700 }), -1, true);
  }, [pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const voiceText = (t: Transaction) =>
    `সতর্কতা! প্রহরী বলছে। আপনার ${t.provider} অ্যাকাউন্ট থেকে ${Math.round(t.amount)} টাকা একটি অপরিচিত নম্বরে পাঠানো হয়েছে। এটি কি আপনি করেছেন? না করে থাকলে এখনই রিপোর্ট করুন।`;

  useEffect(() => {
    api
      .transaction(id)
      .then((t) => {
        setTxn(t);
        if (!autoPlayed.current) {
          autoPlayed.current = true;
          speak(voiceText(t));
        }
      })
      .catch((e) => setError(e.message));
  }, [id, speak]);

  const close = () => {
    stop();
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)");
  };

  const confirmMine = async () => {
    if (!txn) return;
    setConfirming(true);
    try {
      await api.confirmMine(txn.id);
      toast("ধন্যবাদ! Marked as yours — Prohori will learn this pattern", "success");
      close();
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setConfirming(false);
    }
  };

  const report = () => {
    if (!txn) return;
    stop();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    draftStore.reset({
      transactionId: txn.id,
      provider: txn.provider,
      trx_id: txn.trx_id,
      amount: String(txn.amount),
      recipient_number: txn.counterparty,
      time: new Date(txn.time).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }),
    });
    router.replace("/complaint/new");
  };

  return (
    <View style={styles.root} testID="alert-screen">
      <View style={[styles.top, { paddingTop: insets.top + space.sm }]}>
        <Text style={styles.topLabel}>প্রহরী সতর্কতা · Prohori alert</Text>
        <Pressable testID="alert-close-button" onPress={close} hitSlop={10} style={styles.closeBtn}>
          <Ionicons name="close" size={22} color={colors.onSurface} />
        </Pressable>
      </View>

      {error ? (
        <View style={{ padding: space.xl }}>
          <Bi bn="সতর্কতা লোড হয়নি" en={error} />
        </View>
      ) : !txn ? (
        <ActivityIndicator color={colors.error} style={{ marginTop: space.xxxl }} />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xl }}>
            <Animated.View entering={FadeInDown} style={{ alignItems: "center", gap: space.md, paddingTop: space.md }}>
              <Animated.View style={[styles.warnHalo, pulseStyle]}>
                <View style={styles.warnIcon}>
                  <Ionicons name="warning" size={36} color={colors.onError} />
                </View>
              </Animated.View>
              <Bi bn="সন্দেহজনক লেনদেন!" en="Suspicious transaction detected" size={24} weight="bold" align="center" testID="alert-title" />
              <Text style={styles.amount} testID="alert-amount">{taka(txn.amount)}</Text>
              <View style={styles.toRow}>
                <ProviderAvatar provider={txn.provider} size={28} />
                <Text style={styles.toText} testID="alert-recipient">{txn.type} → {txn.counterparty}</Text>
              </View>
              <View style={styles.riskPill} testID="alert-risk-score">
                <Text style={styles.riskText}>ঝুঁকি স্কোর {toBn(txn.risk_score)}% · Risk {txn.risk_score}%</Text>
              </View>
            </Animated.View>

            <Pressable
              testID="alert-play-voice-button"
              onPress={() => (state === "idle" ? speak(voiceText(txn)) : stop())}
              style={({ pressed }) => [styles.voiceBtn, { opacity: pressed ? 0.85 : 1 }]}
            >
              {state === "loading" ? <ActivityIndicator color={colors.brandPrimary} /> : <Ionicons name={state === "speaking" ? "stop-circle" : "volume-high"} size={26} color={colors.brandPrimary} />}
              <Bi
                bn={state === "speaking" ? "বাজছে... থামাতে ট্যাপ করুন" : state === "loading" ? "ভয়েস তৈরি হচ্ছে..." : "বাংলায় সতর্কবার্তা শুনুন"}
                en={state === "speaking" ? "Playing — tap to stop" : "Play Bangla voice alert"}
                size={15}
                color={colors.onBrandTertiary}
              />
            </Pressable>

            <Card testID="alert-reasons-card">
              <Bi bn="কেন সন্দেহজনক?" en="Why Prohori flagged this" size={16} weight="bold" />
              <View style={{ gap: space.md, marginTop: space.md }}>
                {txn.reasons_en.map((r, i) => (
                  <View key={r} style={{ flexDirection: "row", gap: space.sm }}>
                    <Ionicons name="alert-circle" size={18} color={colors.warning} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Bi bn={txn.reasons_bn[i] ?? ""} en={r} size={14} weight="regular" />
                    </View>
                  </View>
                ))}
              </View>
            </Card>

            <Card style={{ backgroundColor: colors.surfaceSecondary }} testID="alert-sms-card">
              <Text style={styles.smsLabel}>SMS · {txn.provider}</Text>
              <Text style={styles.sms}>{txn.sms}</Text>
            </Card>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
            <Text style={styles.question}>এটি কি আপনি করেছেন? · Was this you?</Text>
            <Button testID="alert-report-button" variant="danger" icon="megaphone" bn="না, রিপোর্ট করুন" en="No, report this" onPress={report} />
            <Button testID="alert-confirm-mine-button" variant="ghost" bn="হ্যাঁ, আমি করেছি" en="Yes, it was me" loading={confirming} onPress={confirmMine} style={{ marginTop: space.sm }} />
          </View>
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.lg, paddingBottom: space.sm },
  topLabel: { fontFamily: fonts.semibold, fontSize: 13, color: c.muted },
  closeBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  warnHalo: { width: 96, height: 96, borderRadius: 48, backgroundColor: c.errorTint, alignItems: "center", justifyContent: "center" },
  warnIcon: { width: 68, height: 68, borderRadius: 34, backgroundColor: c.error, alignItems: "center", justifyContent: "center" },
  amount: { fontFamily: fonts.bold, fontSize: 40, lineHeight: 52, color: c.onSurface },
  toRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  toText: { fontFamily: fonts.semibold, fontSize: 15, color: c.onSurfaceSecondary },
  riskPill: { backgroundColor: c.errorTint, paddingHorizontal: space.md, paddingVertical: 4, borderRadius: radius.pill },
  riskText: { fontFamily: fonts.bold, fontSize: 12, color: c.error },
  voiceBtn: { flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: c.brandTertiary, borderRadius: radius.md, padding: space.lg, minHeight: 64 },
  smsLabel: { fontFamily: fonts.bold, fontSize: 12, color: c.muted, marginBottom: 4 },
  sms: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: c.onSurfaceSecondary },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
  question: { fontFamily: fonts.bold, fontSize: 14, color: c.onSurface, textAlign: "center", marginBottom: space.md },
}));
