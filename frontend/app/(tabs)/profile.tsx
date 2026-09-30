import { useCallback, useEffect, useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { api, Complaint, taka, timeAgo } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, space } from "@/src/fonts";
import { Bi, Button, Card } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { storage } from "@/src/utils/storage";
import { usesNativeTabs } from "@/src/navigation";

const TOGGLES = [
  { key: "voice_alerts", bn: "বাংলা ভয়েস সতর্কতা", en: "Bangla voice alerts" },
  { key: "sms_monitor", bn: "SMS পর্যবেক্ষণ", en: "SMS monitoring (on-device)" },
  { key: "share_reports", bn: "বেনামে রিপোর্ট শেয়ার", en: "Share anonymized reports" },
];

export default function Settings() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [prefs, setPrefs] = useState<Record<string, boolean>>({ voice_alerts: true, sms_monitor: true, share_reports: true });
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    Promise.all(TOGGLES.map((t) => storage.getItem<boolean>(`pref_${t.key}`, true))).then((v) =>
      setPrefs(Object.fromEntries(TOGGLES.map((t, i) => [t.key, v[i] ?? true]))),
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      api.complaints().then(setComplaints).catch(() => {});
    }, []),
  );

  const toggle = (k: string, v: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    setPrefs((p) => ({ ...p, [k]: v }));
    storage.setItem(`pref_${k}`, v);
  };

  const reset = async () => {
    setResetting(true);
    try {
      await api.resetDemo();
      setComplaints([]);
      toast("ডেমো ডেটা রিসেট হয়েছে · Demo data reset", "success");
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setResetting(false);
    }
  };

  return (
    <View style={styles.root} testID="settings-screen">
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Bi bn="সেটিংস" en="Settings" size={22} weight="bold" />
      </View>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl, paddingBottom: bottomChrome + space.xl }}>
        <Card style={{ padding: 0 }}>
          {TOGGLES.map((t, i) => (
            <View key={t.key} style={[styles.row, i > 0 && styles.divider]}>
              <View style={{ flex: 1 }}>
                <Bi bn={t.bn} en={t.en} size={15} />
              </View>
              <Switch
                testID={`settings-toggle-${t.key}`}
                value={prefs[t.key]}
                onValueChange={(v) => toggle(t.key, v)}
                trackColor={{ true: colors.brandSecondary, false: colors.surfaceTertiary }}
                thumbColor={colors.surface}
              />
            </View>
          ))}
        </Card>

        <View>
          <Bi bn="আমার অভিযোগ" en={`My complaints (${complaints.length})`} size={18} weight="bold" />
          <View style={{ gap: space.sm, marginTop: space.md }}>
            {complaints.length === 0 ? (
              <Text style={styles.muted} testID="settings-no-complaints">এখনো কোনো অভিযোগ নেই · No complaints yet</Text>
            ) : (
              complaints.map((c) => (
                <View key={c.id} style={styles.complaint} testID={`settings-complaint-${c.id}`}>
                  <Ionicons name="document-text" size={20} color={colors.brandPrimary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cTitle}>{c.provider} · {taka(c.amount)} · {c.reference}</Text>
                    <Text style={styles.muted}>{c.scam_type} · {timeAgo(c.created_at)}</Text>
                  </View>
                  <View style={styles.sentPill}>
                    <Text style={styles.sentText}>Sent</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </View>

        <Card style={{ backgroundColor: colors.brandTertiary, borderColor: colors.brandTertiary }}>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Ionicons name="lock-closed" size={18} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Bi bn="গোপনীয়তা: SMS ফোনেই বিশ্লেষণ হয়, শুধু বেনামী রিপোর্ট শেয়ার হয়" en="Privacy: SMS is analysed on-device; only anonymized reports are pooled" size={13} weight="regular" color={colors.onBrandTertiary} />
            </View>
          </View>
        </Card>

        <View style={{ gap: space.sm }}>
          <Button testID="settings-reset-demo-button" variant="secondary" icon="refresh" bn="ডেমো ডেটা রিসেট" en="Reset demo data" loading={resetting} onPress={reset} />
          <Button
            testID="settings-replay-onboarding-button"
            variant="ghost"
            icon="play-circle-outline"
            bn="অনবোর্ডিং আবার দেখুন"
            en="Replay onboarding"
            onPress={async () => {
              await storage.setItem("prohori_onboarded", false);
              router.replace("/onboarding");
            }}
          />
        </View>
        <Text style={[styles.muted, { textAlign: "center" }]}>PROHORI prototype · Digital Safety, Security & Privacy</Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: { paddingHorizontal: space.lg, paddingBottom: space.md, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg },
  divider: { borderTopWidth: 1, borderTopColor: c.divider },
  complaint: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: c.surface },
  cTitle: { fontFamily: fonts.semibold, fontSize: 14, color: c.onSurface },
  muted: { fontFamily: fonts.regular, fontSize: 12, color: c.muted },
  sentPill: { backgroundColor: c.successTint, paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
  sentText: { fontFamily: fonts.bold, fontSize: 11, color: c.success },
}));
