import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { api, Seller, toBn } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, space } from "@/src/fonts";
import { Bi } from "@/src/components/ui";

const VERDICT = {
  trusted: { bn: "বিশ্বস্ত বিক্রেতা", en: "Trusted seller — verified by Prohori", icon: "shield-checkmark" as const },
  neutral: { bn: "সাবধানে লেনদেন করুন", en: "Limited history — pay on delivery if possible", icon: "alert-circle" as const },
  risky: { bn: "ঝুঁকিপূর্ণ! আগে টাকা পাঠাবেন না", en: "Risky — do not send advance payment", icon: "close-circle" as const },
};

/** Trust profile for a personal wallet used for online / Facebook business. */
export function SellerCard({ seller, showFeedback = true, testID = "seller-card" }: { seller: Seller; showFeedback?: boolean; testID?: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [s, setS] = useState(seller);
  const [sending, setSending] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const tone = { trusted: [colors.success, colors.successTint], neutral: [colors.warning, colors.warningTint], risky: [colors.error, colors.errorTint] }[s.trust_level];
  const v = VERDICT[s.trust_level];

  const feedback = async (o: "delivered" | "not_delivered") => {
    setSending(o);
    try {
      setS(await api.sellerFeedback(s.number, o));
      setDone(true);
    } finally {
      setSending(null);
    }
  };

  return (
    <Animated.View entering={FadeInDown} style={styles.card} testID={testID}>
      <View style={styles.top}>
        <View style={[styles.score, { borderColor: tone[0] }]} testID={`${testID}-score`}>
          <Text style={[styles.scoreNum, { color: tone[0] }]}>{s.trust_score}</Text>
          <Text style={styles.scoreLbl}>/100</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text style={styles.name} numberOfLines={1}>{s.business_name}</Text>
            {s.verified && <Ionicons name="checkmark-circle" size={18} color={colors.brandPrimary} testID={`${testID}-verified-badge`} />}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Ionicons name="logo-facebook" size={13} color={colors.muted} />
            <Text style={styles.fb} numberOfLines={1}>{s.fb_page_url || "No page linked"}</Text>
          </View>
          <Text style={styles.fb}>{s.number} · {s.category || "Personal wallet"}</Text>
        </View>
      </View>

      <View style={[styles.verdict, { backgroundColor: tone[1] }]} testID={`${testID}-verdict-${s.trust_level}`}>
        <Ionicons name={v.icon} size={22} color={tone[0]} />
        <View style={{ flex: 1 }}>
          <Bi bn={v.bn} en={v.en} size={15} weight="bold" color={tone[0]} enColor={colors.onSurfaceSecondary} />
        </View>
      </View>

      <View style={styles.stats}>
        <Stat bn="যাচাই" en="Verified" value={s.verified ? "✓" : "✗"} color={s.verified ? colors.success : colors.error} />
        <Stat bn="সফল লেনদেন" en="Deals" value={toBn(s.successful_deals)} />
        <Stat bn="রেটিং" en="Rating" value={s.rating ? `${s.rating}★` : "—"} />
        <Stat bn="বয়স" en="Age" value={`${toBn(s.account_age_months)} মাস`} />
        <Stat bn="রিপোর্ট" en="Reports" value={toBn(s.fraud_reports + s.negative)} color={s.fraud_reports + s.negative > 0 ? colors.error : undefined} />
      </View>

      {showFeedback && (
        <View style={{ gap: space.sm }}>
          <Text style={styles.fbQ}>{done ? "ধন্যবাদ! আপনার মতামত যোগ হয়েছে · Thanks, feedback added" : "এই বিক্রেতার সাথে লেনদেন করেছেন? · Dealt with this seller?"}</Text>
          {!done && (
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <FbBtn testID={`${testID}-feedback-delivered`} icon="cube" label="পণ্য পেয়েছি · Got it" color={colors.success} bg={colors.successTint} loading={sending === "delivered"} onPress={() => feedback("delivered")} />
              <FbBtn testID={`${testID}-feedback-not-delivered`} icon="close" label="পাইনি · Not delivered" color={colors.error} bg={colors.errorTint} loading={sending === "not_delivered"} onPress={() => feedback("not_delivered")} />
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
}

function Stat({ bn, en, value, color }: { bn: string; en: string; value: string; color?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={[styles.statVal, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statBn} numberOfLines={1}>{bn}</Text>
      <Text style={styles.statEn}>{en}</Text>
    </View>
  );
}

function FbBtn({ icon, label, color, bg, onPress, loading, testID }: { icon: any; label: string; color: string; bg: string; onPress: () => void; loading: boolean; testID: string }) {
  const styles = useStyles();
  return (
    <Pressable testID={testID} onPress={onPress} disabled={loading} style={({ pressed }) => [styles.fbBtn, { backgroundColor: bg, opacity: pressed ? 0.8 : 1 }]}>
      {loading ? <ActivityIndicator size="small" color={color} /> : <Ionicons name={icon} size={16} color={color} />}
      <Text style={[styles.fbBtnText, { color }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  card: { borderRadius: radius.lg, padding: space.lg, gap: space.md, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border },
  top: { flexDirection: "row", alignItems: "center", gap: space.md },
  score: { width: 64, height: 64, borderRadius: 32, borderWidth: 4, alignItems: "center", justifyContent: "center" },
  scoreNum: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 24 },
  scoreLbl: { fontFamily: fonts.regular, fontSize: 10, color: c.muted, lineHeight: 12 },
  name: { flexShrink: 1, fontFamily: fonts.bold, fontSize: 17, color: c.onSurface },
  fb: { flexShrink: 1, fontFamily: fonts.regular, fontSize: 12, color: c.muted },
  verdict: { flexDirection: "row", alignItems: "center", gap: space.sm, padding: space.md, borderRadius: radius.md },
  stats: { flexDirection: "row", gap: 6 },
  stat: { flex: 1, alignItems: "center", paddingVertical: space.sm, borderRadius: radius.sm, backgroundColor: c.surfaceSecondary },
  statVal: { fontFamily: fonts.bold, fontSize: 14, color: c.onSurface },
  statBn: { fontFamily: fonts.semibold, fontSize: 10, color: c.onSurfaceSecondary },
  statEn: { fontFamily: fonts.regular, fontSize: 9, color: c.muted },
  fbQ: { fontFamily: fonts.semibold, fontSize: 12, color: c.onSurfaceTertiary },
  fbBtn: { flex: 1, height: 44, borderRadius: radius.md, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: space.sm },
  fbBtnText: { fontFamily: fonts.bold, fontSize: 12, flexShrink: 1 },
}));
