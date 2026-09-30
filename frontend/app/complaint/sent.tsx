import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, { ZoomIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { api, Complaint } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, space } from "@/src/fonts";
import { Bi, Button, Card, Chip } from "@/src/components/ui";

export default function Sent() {
  const { id, ref, provider } = useLocalSearchParams<{ id: string; ref: string; provider: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [c, setC] = useState<Complaint | null>(null);
  const [lang, setLang] = useState<"bn" | "en">("bn");

  useEffect(() => {
    api.complaints().then((list) => setC(list.find((x) => x.id === id) ?? null)).catch(() => {});
  }, [id]);

  return (
    <View style={styles.root} testID="complaint-sent-screen">
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingTop: insets.top + space.xxl, gap: space.lg }}>
        <View style={{ alignItems: "center", gap: space.md }}>
          <Animated.View entering={ZoomIn.springify()} style={styles.check}>
            <Ionicons name="checkmark" size={48} color={colors.onBrandPrimary} />
          </Animated.View>
          <Bi bn={`অভিযোগ ${provider}-এ পাঠানো হয়েছে`} en={`Complaint sent to ${provider}`} size={22} weight="bold" align="center" testID="sent-title" />
          <View style={styles.refPill} testID="sent-reference">
            <Text style={styles.refText}>রেফারেন্স · Ref: {ref}</Text>
          </View>
        </View>

        <Animated.View entering={FadeInDown.delay(200)}>
          <Card style={{ backgroundColor: colors.brandTertiary, borderColor: colors.brandTertiary }} testID="sent-shared-pool-card">
            <View style={{ flexDirection: "row", gap: space.md }}>
              <Ionicons name="people" size={22} color={colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <Bi bn="আপনার রিপোর্ট অন্যদের রক্ষা করবে" en="Your anonymized report now warns others before they send money to this number" size={15} color={colors.onBrandTertiary} />
              </View>
            </View>
          </Card>
        </Animated.View>

        {c && (
          <Card testID="sent-draft-card">
            <View style={{ flexDirection: "row", gap: space.sm, marginBottom: space.md }}>
              <Chip testID="sent-lang-bn" label="বাংলা" selected={lang === "bn"} onPress={() => setLang("bn")} />
              <Chip testID="sent-lang-en" label="English" selected={lang === "en"} onPress={() => setLang("en")} />
            </View>
            <Text style={styles.draft}>{lang === "bn" ? c.draft_bn : c.draft_en}</Text>
          </Card>
        )}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <Button testID="sent-home-button" bn="হোমে ফিরুন" en="Back to home" icon="home-outline" onPress={() => router.replace("/(tabs)")} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  check: { width: 88, height: 88, borderRadius: 44, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  refPill: { backgroundColor: c.surfaceSecondary, paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill },
  refText: { fontFamily: fonts.bold, fontSize: 13, color: c.onSurfaceSecondary },
  draft: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 21, color: c.onSurfaceSecondary },
  footer: { paddingHorizontal: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: c.border },
}));
