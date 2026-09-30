import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { api, CommunityReport, taka, timeAgo, toBn } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, space } from "@/src/fonts";
import { Bi, Button, Chip, ProviderAvatar } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";

const FILTERS = ["All", "bKash", "Nagad", "Rocket"];

export default function Reports() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const [reports, setReports] = useState<CommunityReport[] | null>(null);
  const [risk, setRisk] = useState<{ masked_number: string; report_count: number; providers: string[] }[]>([]);
  const [filter, setFilter] = useState("All");
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setErr("");
      const [r, h] = await Promise.all([api.reports(), api.highRisk()]);
      setReports(r);
      setRisk(h);
    } catch (e: any) {
      setErr(e.message);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const data = (reports ?? []).filter((r) => filter === "All" || r.provider === filter);

  const Header = (
    <View style={{ gap: space.lg, marginBottom: space.lg }}>
      <View style={styles.riskCard} testID="reports-high-risk-card">
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.md }}>
          <Ionicons name="skull-outline" size={20} color={colors.error} />
          <Bi bn="উচ্চ ঝুঁকিপূর্ণ ওয়ালেট" en="High-risk wallets (multi-report + human review)" size={15} />
        </View>
        {risk.map((w) => (
          <View key={w.masked_number} style={styles.riskRow}>
            <Text style={styles.riskNum}>{w.masked_number}</Text>
            <Text style={styles.riskProv}>{w.providers.join(" · ")}</Text>
            <View style={styles.riskBadge}>
              <Text style={styles.riskBadgeText}>{toBn(w.report_count)} রিপোর্ট</Text>
            </View>
          </View>
        ))}
      </View>
      <Bi bn="সাম্প্রতিক কমিউনিটি রিপোর্ট" en="Recent anonymized reports" size={18} weight="bold" />
    </View>
  );

  return (
    <View style={styles.root} testID="reports-screen">
      <View style={[styles.header, { paddingTop: insets.top + space.sm }]}>
        <Bi bn="কমিউনিটি সুরক্ষা" en="Community shield · shared across providers" size={22} weight="bold" />
      </View>
      <View style={styles.chipRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg, alignItems: "center" }}>
          {FILTERS.map((f) => (
            <Chip key={f} testID={`reports-filter-${f}`} label={f === "All" ? "সব · All" : f} selected={filter === f} onPress={() => setFilter(f)} />
          ))}
        </ScrollView>
      </View>

      {err ? (
        <View style={{ padding: space.lg, gap: space.md }} testID="reports-error">
          <Bi bn="ফিড লোড হয়নি" en={err} />
          <Button testID="reports-retry-button" variant="secondary" bn="আবার চেষ্টা" en="Retry" onPress={load} />
        </View>
      ) : reports === null ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: space.xxl }} />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(r) => r.id}
          ListHeaderComponent={Header}
          contentContainerStyle={{ padding: space.lg, paddingBottom: bottomChrome + space.xl }}
          ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brandPrimary} />}
          ListEmptyComponent={<Bi bn="এই প্রোভাইডারে কোনো রিপোর্ট নেই" en="No recent fraud reports" size={14} weight="regular" />}
          renderItem={({ item, index }) => (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 50)} style={styles.row} testID={`reports-row-${item.id}`}>
              <ProviderAvatar provider={item.provider} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.scam_type_bn}</Text>
                <Text style={styles.rowEn}>{item.scam_type}</Text>
                <Text style={styles.rowMeta}>{item.masked_number} · {item.area} · {timeAgo(item.time)}</Text>
              </View>
              <Text style={styles.rowAmt}>{taka(item.amount)}</Text>
            </Animated.View>
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: space.lg, paddingBottom: space.sm },
  chipRow: { height: 56, justifyContent: "center", borderBottomWidth: 1, borderBottomColor: c.border },
  riskCard: { borderRadius: radius.md, padding: space.lg, backgroundColor: c.errorTint },
  riskRow: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 6 },
  riskNum: { fontFamily: fonts.bold, fontSize: 15, color: c.onSurface, letterSpacing: 0.5 },
  riskProv: { flex: 1, fontFamily: fonts.regular, fontSize: 12, color: c.muted },
  riskBadge: { backgroundColor: c.error, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  riskBadgeText: { fontFamily: fonts.bold, fontSize: 11, color: c.onError },
  row: { flexDirection: "row", alignItems: "center", gap: space.md, padding: space.md, borderRadius: radius.md, backgroundColor: c.brandTertiary },
  rowTitle: { fontFamily: fonts.bold, fontSize: 14, color: c.onSurface },
  rowEn: { fontFamily: fonts.regular, fontSize: 12, color: c.onSurfaceTertiary },
  rowMeta: { fontFamily: fonts.regular, fontSize: 11, color: c.muted, marginTop: 2 },
  rowAmt: { fontFamily: fonts.bold, fontSize: 14, color: c.error },
}));
