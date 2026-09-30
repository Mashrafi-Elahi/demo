import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn } from "react-native-reanimated";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { api, PROVIDERS, SCAM_TYPES, taka } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, space } from "@/src/fonts";
import { Bi, Button, Card, Chip } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { useSpeaker } from "@/src/audio";
import { Draft, draftStore } from "@/src/draft";

const STEPS = [
  { bn: "অভিযোগ খসড়া তৈরি", en: "Drafting complaint" },
  { bn: "প্রোভাইডারের কাছে পাঠানো", en: "Sending to provider" },
  { bn: "শেয়ার্ড সতর্কতা পুলে যোগ", en: "Adding to shared warning pool" },
];

export default function Review() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const onErr = useCallback((m: string) => toast(m, "error"), [toast]);
  const { state, speak, stop } = useSpeaker(onErr);
  const [d, setD] = useState<Draft>(draftStore.get());
  const [step, setStep] = useState(-1);

  const set = (k: keyof Draft) => (v: string) => setD((p) => ({ ...p, [k]: v }));
  const scamBn = SCAM_TYPES.find((s) => s.en === d.scam_type)?.bn ?? d.scam_type;

  const readback = () => {
    if (state !== "idle") return stop();
    speak(
      `আপনার অভিযোগের তথ্য: প্রোভাইডার ${d.provider}। লেনদেন আইডি ${d.trx_id.split("").join(" ") || "জানা নেই"}। পরিমাণ ${d.amount || "জানা নেই"} টাকা। প্রাপকের নম্বর ${d.recipient_number.split("").join(" ") || "জানা নেই"}। প্রতারণার ধরন ${scamBn}। সব ঠিক থাকলে পাঠান বাটনে চাপুন।`,
    );
  };

  const send = async () => {
    stop();
    if (!d.trx_id && !d.recipient_number) {
      toast("TrxID বা প্রাপকের নম্বর দিন · Add TrxID or recipient number", "error");
      return;
    }
    try {
      for (let i = 0; i < STEPS.length; i++) {
        setStep(i);
        await new Promise((r) => setTimeout(r, 650));
      }
      const c = await api.createComplaint({
        provider: d.provider,
        trx_id: d.trx_id,
        amount: Number(d.amount) || 0,
        recipient_number: d.recipient_number,
        time: d.time,
        scam_type: d.scam_type,
        description: d.description,
        transaction_id: d.transactionId,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      draftStore.reset();
      router.replace({ pathname: "/complaint/sent", params: { id: c.id, ref: c.reference, provider: c.provider } });
    } catch (e: any) {
      setStep(-1);
      toast(e.message, "error");
    }
  };

  const preview = `প্রতি: ${d.provider} গ্রাহক সেবা\nবিষয়: প্রতারণার অভিযোগ – TrxID ${d.trx_id || "N/A"}\n\nলেনদেন আইডি: ${d.trx_id || "N/A"}\nপরিমাণ: ${d.amount ? taka(Number(d.amount)) : "N/A"}\nপ্রাপক: ${d.recipient_number || "N/A"}\nসময়: ${d.time || "N/A"}\nধরন: ${scamBn}\n\nঅনুগ্রহ করে প্রাপকের ওয়ালেট বন্ধ করে টাকা ফেরতের ব্যবস্থা করুন।`;

  return (
    <View style={styles.root} testID="complaint-review-screen">
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Pressable testID="review-back-button" onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Bi bn="তথ্য যাচাই করুন" en="Review extracted details" size={18} weight="bold" />
        </View>
        <Pressable testID="review-readback-button" onPress={readback} style={styles.readBtn}>
          {state === "loading" ? <ActivityIndicator size="small" color={colors.brandPrimary} /> : <Ionicons name={state === "speaking" ? "stop" : "volume-high"} size={18} color={colors.brandPrimary} />}
          <Text style={styles.readText}>{state === "speaking" ? "থামুন" : "শুনুন"}</Text>
        </Pressable>
      </View>

      <KeyboardAwareScrollView bottomOffset={120} contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: 140 }}>
        <View style={[styles.aiBanner, !d.ai && { backgroundColor: colors.warningTint }]} testID="review-ai-banner">
          <Ionicons name={d.ai ? "sparkles" : "flask-outline"} size={18} color={d.ai ? colors.brandPrimary : colors.warning} />
          <View style={{ flex: 1 }}>
            <Bi
              bn={d.ai ? "AI তথ্যগুলো বের করেছে — ভুল থাকলে ঠিক করুন" : "ডেমো মোড: নিয়ম-ভিত্তিক পার্সার ব্যবহার হয়েছে"}
              en={d.summary_en || (d.ai ? "AI extracted these — edit anything that's wrong" : "Demo mode: offline parser used")}
              size={13}
              weight="regular"
            />
          </View>
        </View>

        <View>
          <Text style={styles.label}>প্রোভাইডার · Provider</Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {PROVIDERS.map((p) => (
              <Chip key={p} testID={`review-provider-${p}`} label={p} selected={d.provider === p} onPress={() => set("provider")(p)} />
            ))}
          </View>
        </View>

        <Field testID="review-trxid-input" label="লেনদেন আইডি · Transaction ID" value={d.trx_id} onChange={set("trx_id")} autoCapitalize="characters" />
        <Field testID="review-amount-input" label="পরিমাণ (৳) · Amount" value={d.amount} onChange={set("amount")} keyboardType="numeric" />
        <Field testID="review-recipient-input" label="প্রাপকের নম্বর · Recipient wallet" value={d.recipient_number} onChange={set("recipient_number")} keyboardType="phone-pad" />
        <Field testID="review-time-input" label="সময় · Time" value={d.time} onChange={set("time")} />

        <View>
          <Text style={styles.label}>প্রতারণার ধরন · Scam type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingRight: space.lg }} style={{ height: 40 }}>
            {SCAM_TYPES.map((s, i) => (
              <Chip key={s.en} testID={`review-scam-${i}`} label={s.bn} selected={d.scam_type === s.en} onPress={() => set("scam_type")(s.en)} />
            ))}
          </ScrollView>
        </View>

        <Card testID="review-draft-card">
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.sm }}>
            <Ionicons name="document-text-outline" size={18} color={colors.brandPrimary} />
            <Text style={styles.draftTitle}>খসড়া অভিযোগ · Auto-drafted complaint</Text>
          </View>
          <Text style={styles.draft}>{preview}</Text>
          <Text style={styles.draftNote}>English copy is attached automatically · ইংরেজি কপিও যাবে</Text>
        </Card>
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ opened: insets.bottom }}>
        <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
          <Button testID="review-send-button" icon="send" bn={`এক ট্যাপে ${d.provider}-এ পাঠান`} en="Send complaint in one tap" loading={step >= 0} onPress={send} />
        </View>
      </KeyboardStickyView>

      {step >= 0 && (
        <Animated.View entering={FadeIn} style={styles.overlay} testID="review-progress-overlay">
          <View style={styles.overlayCard}>
            {STEPS.map((s, i) => (
              <View key={s.en} style={{ flexDirection: "row", alignItems: "center", gap: space.md, opacity: i <= step ? 1 : 0.35 }}>
                {i < step ? <Ionicons name="checkmark-circle" size={24} color={colors.success} /> : i === step ? <ActivityIndicator color={colors.brandPrimary} /> : <Ionicons name="ellipse-outline" size={24} color={colors.muted} />}
                <Bi bn={s.bn} en={s.en} size={15} />
              </View>
            ))}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function Field({ label, value, onChange, testID, keyboardType, autoCapitalize }: { label: string; value: string; onChange: (v: string) => void; testID: string; keyboardType?: any; autoCapitalize?: any }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.fieldWrap}>
        <TextInput testID={testID} value={value} onChangeText={onChange} keyboardType={keyboardType} autoCapitalize={autoCapitalize} placeholder="—" placeholderTextColor={colors.muted} style={styles.field} />
        <Ionicons name="pencil" size={14} color={colors.muted} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingBottom: space.md, borderBottomWidth: 1, borderBottomColor: c.border },
  backBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  readBtn: { flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: c.brandTertiary },
  readText: { fontFamily: fonts.bold, fontSize: 13, color: c.brandPrimary },
  aiBanner: { flexDirection: "row", gap: space.sm, padding: space.md, borderRadius: radius.md, backgroundColor: c.brandTertiary },
  label: { fontFamily: fonts.semibold, fontSize: 13, color: c.onSurfaceTertiary, marginBottom: 6 },
  fieldWrap: { flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceSecondary, borderRadius: radius.md, paddingHorizontal: space.md },
  field: { flex: 1, height: 50, fontFamily: fonts.semibold, fontSize: 16, color: c.onSurface },
  draftTitle: { fontFamily: fonts.bold, fontSize: 14, color: c.onSurface },
  draft: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 21, color: c.onSurfaceSecondary },
  draftNote: { fontFamily: fonts.regular, fontSize: 11, color: c.muted, marginTop: space.sm },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: space.xl },
  overlayCard: { width: "100%", backgroundColor: c.surface, borderRadius: radius.lg, padding: space.xl, gap: space.lg },
}));
