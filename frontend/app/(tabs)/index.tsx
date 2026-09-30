import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { api, Stats, taka, timeAgo, toBn, Transaction } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, space } from "@/src/fonts";
import { Bi, Button, Card, IconCircle, ProviderAvatar, SectionTitle } from "@/src/components/ui";
import { useToast } from "@/src/components/toast";
import { usesNativeTabs } from "@/src/navigation";
import { draftStore } from "@/src/draft";

const STATUS: Record<string, { bn: string; en: string }> = {
  pending_review: { bn: "যাচাই বাকি", en: "Needs review" },
  confirmed_mine: { bn: "আপনি নিশ্চিত করেছেন", en: "Confirmed by you" },
  reported: { bn: "রিপোর্ট করা হয়েছে", en: "Reported" },
};

export default function Home() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;

  const [txns, setTxns] = useState<Transaction[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [simulating, setSimulating] = useState(false);

  const load = useCallback(async () => {
    try {
      setError("");
      const [t, s] = await Promise.all([api.transactions(), api.stats()]);
      setTxns(t);
      setStats(s);
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const simulate = async () => {
    setSimulating(true);
    try {
      const t = await api.simulateSms();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      router.push(`/alert/${t.id}`);
    } catch (e: any) {
      toast(e.message, "error");
    } finally {
      setSimulating(false);
    }
  };

  const alerts = (txns ?? []).filter((t) => t.suspicious);
  const normal = (txns ?? []).filter((t) => !t.suspicious);

  return (
    <View style={styles.root} testID="home-screen">
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <IconCircle name="shield-half" color={colors.onBrandPrimary} bg={colors.brandPrimary} size={36} />
          <Bi bn="প্রহরী" en="Prohori" size={20} weight="bold" />
        </View>
        <Pressable testID="home-report-fraud-button" onPress={() => { draftStore.reset(); router.push("/complaint/new"); }} style={styles.headerBtn} hitSlop={8}>
          <Ionicons name="megaphone-outline" size={18} color={colors.error} />
          <Text style={styles.headerBtnText}>রিপোর্ট · Report</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: space.lg, paddingBottom: bottomChrome + space.xl, gap: space.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brandPrimary} />}
      >
        <Animated.View entering={FadeInDown.duration(350)}>
          <View style={styles.status} testID="home-status-card">
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <IconCircle name="shield-checkmark" color={colors.onBrandPrimary} bg={colors.brandSecondary} size={48} />
              <View style={{ flex: 1 }}>
                <Bi bn="পাহারা চালু আছে" en="Monitoring active · bKash, Nagad, Rocket" size={18} weight="bold" color={colors.onBrandPrimary} enColor={colors.brandTertiary} />
              </View>
              <View style={styles.liveDot} />
            </View>
            <View style={styles.statsRow}>
              <StatBox label="লেনদেন স্ক্যান" en="Scanned" value={stats ? toBn(stats.monitored) : "–"} testID="stat-scanned" />
              <StatBox label="সতর্কতা" en="Alerts" value={stats ? toBn(stats.alerts) : "–"} testID="stat-alerts" />
              <StatBox label="ঝুঁকিপূর্ণ ওয়ালেট" en="High-risk" value={stats ? toBn(stats.high_risk_wallets) : "–"} testID="stat-high-risk" />
            </View>
          </View>
        </Animated.View>

        <Card style={styles.demoCard} testID="home-demo-card">
          <View style={{ flexDirection: "row", gap: space.md, alignItems: "center", marginBottom: space.md }}>
            <IconCircle name="chatbox-ellipses-outline" color={colors.warning} bg={colors.warningTint} size={40} />
            <View style={{ flex: 1 }}>
              <Bi bn="ডেমো: একটি লেনদেনের SMS আসুক" en="Demo: receive a transaction SMS" size={15} />
            </View>
          </View>
          <Button testID="home-simulate-sms-button" bn="SMS সিমুলেট করুন" en="Simulate incoming SMS" icon="flash-outline" loading={simulating} onPress={simulate} />
        </Card>

        <View style={styles.quickRow}>
          <QuickAction testID="home-quick-check" icon="search" bn="নম্বর যাচাই" en="Check number" onPress={() => router.push("/check")} />
          <QuickAction testID="home-quick-complaint" icon="mic" bn="ভয়েসে অভিযোগ" en="Voice complaint" onPress={() => { draftStore.reset(); router.push("/complaint/new"); }} />
        </View>

        {error ? (
          <Card testID="home-error">
            <Bi bn="তথ্য আনা যায়নি" en={error} size={15} />
            <Button testID="home-retry-button" variant="secondary" bn="আবার চেষ্টা করুন" en="Retry" onPress={load} style={{ marginTop: space.md }} />
          </Card>
        ) : txns === null ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: space.xl }} />
        ) : (
          <>
            {alerts.length > 0 && (
              <View>
                <SectionTitle bn="সাম্প্রতিক সতর্কতা" en="Recent alerts" />
                <FlatList
                  horizontal
                  data={alerts}
                  keyExtractor={(t) => t.id}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: space.md }}
                  style={{ marginHorizontal: -space.lg }}
                  ListHeaderComponent={<View style={{ width: space.lg - space.md }} />}
                  ListFooterComponent={<View style={{ width: space.lg - space.md }} />}
                  renderItem={({ item }) => (
                    <Pressable testID={`home-alert-card-${item.id}`} onPress={() => router.push(`/alert/${item.id}`)} style={({ pressed }) => [styles.alertCard, { opacity: pressed ? 0.85 : 1 }]}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                        <IconCircle name="warning" color={colors.onError} bg={colors.error} size={32} />
                        <Text style={styles.risk}>ঝুঁকি {toBn(item.risk_score)}%</Text>
                      </View>
                      <Text style={styles.alertAmount}>{taka(item.amount)}</Text>
                      <Text style={styles.alertTo} numberOfLines={1}>→ {item.counterparty}</Text>
                      <View style={styles.statusPill}>
                        <Text style={styles.statusText}>{STATUS[item.status]?.bn} · {STATUS[item.status]?.en}</Text>
                      </View>
                    </Pressable>
                  )}
                />
              </View>
            )}

            <View>
              <SectionTitle bn="সাম্প্রতিক লেনদেন" en="Recent transactions" />
              {normal.length === 0 ? (
                <Bi bn="কোনো লেনদেন নেই" en="No recent transactions to monitor" size={14} weight="regular" />
              ) : (
                <Card style={{ padding: 0 }}>
                  {normal.map((t, i) => (
                    <View key={t.id} testID={`home-txn-row-${t.id}`} style={[styles.txnRow, i > 0 && styles.txnDivider]}>
                      <ProviderAvatar provider={t.provider} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.txnTitle} numberOfLines={1}>{t.counterparty}</Text>
                        <Text style={styles.txnSub}>{t.provider} · {t.type} · {timeAgo(t.time)}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[styles.txnAmt, { color: t.type === "Received" ? colors.success : colors.onSurface }]}>
                          {t.type === "Received" ? "+" : "−"}{taka(t.amount)}
                        </Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                          <Ionicons name="checkmark-circle" size={12} color={colors.success} />
                          <Text style={styles.txnOk}>Normal</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </Card>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatBox({ label, en, value, testID }: { label: string; en: string; value: string; testID: string }) {
  const styles = useStyles();
  return (
    <View style={styles.statBox} testID={testID}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.statEn}>{en}</Text>
    </View>
  );
}

function QuickAction({ icon, bn, en, onPress, testID }: { icon: any; bn: string; en: string; onPress: () => void; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} style={({ pressed }) => [styles.quick, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
      <IconCircle name={icon} color={colors.brandPrimary} bg={colors.surface} size={40} />
      <Bi bn={bn} en={en} size={15} />
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  headerBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: space.md, height: 40, borderRadius: radius.pill, backgroundColor: c.errorTint },
  headerBtnText: { fontFamily: fonts.bold, fontSize: 13, color: c.error },
  status: { backgroundColor: c.brandPrimary, borderRadius: radius.lg, padding: space.lg },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#7BE39A" },
  statsRow: { flexDirection: "row", gap: space.sm, marginTop: space.lg },
  statBox: { flex: 1, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: radius.md, padding: space.md },
  statValue: { fontFamily: fonts.bold, fontSize: 22, color: c.onBrandPrimary },
  statLabel: { fontFamily: fonts.semibold, fontSize: 12, color: c.onBrandPrimary },
  statEn: { fontFamily: fonts.regular, fontSize: 11, color: c.brandTertiary },
  demoCard: { borderStyle: "dashed", borderColor: c.warning },
  quickRow: { flexDirection: "row", gap: space.md },
  quick: { flex: 1, backgroundColor: c.brandTertiary, borderRadius: radius.md, padding: space.lg, gap: space.md },
  alertCard: { width: 200, backgroundColor: c.surface, borderRadius: radius.md, padding: space.lg, borderWidth: 1, borderColor: c.errorTint, gap: 4 },
  risk: { fontFamily: fonts.bold, fontSize: 12, color: c.error },
  alertAmount: { fontFamily: fonts.bold, fontSize: 22, color: c.onSurface, marginTop: space.sm },
  alertTo: { fontFamily: fonts.regular, fontSize: 13, color: c.onSurfaceTertiary },
  statusPill: { alignSelf: "flex-start", marginTop: space.sm, backgroundColor: c.surfaceSecondary, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  statusText: { fontFamily: fonts.semibold, fontSize: 11, color: c.onSurfaceSecondary },
  txnRow: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.lg },
  txnDivider: { borderTopWidth: 1, borderTopColor: c.divider },
  txnTitle: { fontFamily: fonts.semibold, fontSize: 15, color: c.onSurface },
  txnSub: { fontFamily: fonts.regular, fontSize: 12, color: c.muted },
  txnAmt: { fontFamily: fonts.bold, fontSize: 15 },
  txnOk: { fontFamily: fonts.regular, fontSize: 11, color: c.success },
}));
