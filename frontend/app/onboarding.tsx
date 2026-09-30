import { ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, IoniconsIconName } from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, space } from "@/src/fonts";
import { Bi, Button, IconCircle } from "@/src/components/ui";
import { storage } from "@/src/utils/storage";

const HERO =
  "https://images.unsplash.com/photo-1585842630086-17ecd5af4496?crop=entropy&cs=srgb&fm=jpg&q=85&w=900";

const FEATURES: { icon: IoniconsIconName; bn: string; en: string }[] = [
  { icon: "chatbubble-ellipses-outline", bn: "লেনদেনের SMS দেখে সন্দেহজনক কিছু হলে সতর্ক করে", en: "Watches MFS SMS and warns on unusual transactions" },
  { icon: "mic-outline", bn: "বাংলায় বলে অভিযোগ করুন, এক ট্যাপে পাঠান", en: "File complaints by voice in Bangla, send in one tap" },
  { icon: "shield-checkmark-outline", bn: "টাকা পাঠানোর আগে নম্বর যাচাই করুন", en: "Check a number before you send money" },
];

export default function Onboarding() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const finish = async () => {
    await storage.setItem("prohori_onboarded", true);
    router.replace("/(tabs)");
  };

  return (
    <View style={styles.root} testID="onboarding-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: space.xl }} showsVerticalScrollIndicator={false}>
        <View style={styles.heroWrap}>
          <Image source={{ uri: HERO }} style={styles.hero} contentFit="cover" transition={300} />
          <LinearGradient colors={["transparent", colors.surface]} style={styles.fade} />
          <View style={[styles.brandPill, { top: insets.top + space.md }]}>
            <Ionicons name="shield-half" size={16} color={colors.onBrandPrimary} />
            <Text style={styles.brandPillText}>প্রহরী · PROHORI</Text>
          </View>
        </View>

        <View style={styles.body}>
          <Animated.View entering={FadeInDown.duration(400)}>
            <Bi bn="আপনার মোবাইল ওয়ালেটের পাহারাদার" en="A guard for your mobile wallet" size={26} weight="bold" />
          </Animated.View>

          <View style={{ gap: space.md, marginTop: space.xl }}>
            {FEATURES.map((f, i) => (
              <Animated.View key={f.icon} entering={FadeInDown.delay(120 + i * 90)} style={styles.feature}>
                <IconCircle name={f.icon} color={colors.brandPrimary} bg={colors.brandTertiary} size={40} />
                <View style={{ flex: 1 }}>
                  <Bi bn={f.bn} en={f.en} size={15} weight="semibold" />
                </View>
              </Animated.View>
            ))}
          </View>

          <Animated.View entering={FadeInDown.delay(450)} style={styles.privacy} testID="onboarding-privacy-note">
            <Ionicons name="lock-closed" size={18} color={colors.brandPrimary} />
            <View style={{ flex: 1 }}>
              <Bi
                bn="SMS শুধু আপনার ফোনেই পড়া হয়। কোনো ব্যক্তিগত তথ্য বাইরে যায় না।"
                en="SMS is read only on your phone. Only anonymized fraud reports are shared."
                size={13}
                weight="regular"
                color={colors.onBrandTertiary}
              />
            </View>
          </Animated.View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + space.lg }]}>
        <Button testID="onboarding-allow-sms-button" bn="SMS পড়ার অনুমতি দিন" en="Allow SMS monitoring" icon="shield-checkmark" onPress={finish} />
        <Text style={styles.demoNote}>Prototype: SMS reading is simulated with demo data</Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  heroWrap: { height: 300, backgroundColor: c.brandTertiary },
  hero: { width: "100%", height: "100%" },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 140 },
  brandPill: {
    position: "absolute",
    left: space.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: c.brandPrimary,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  brandPillText: { color: c.onBrandPrimary, fontFamily: fonts.bold, fontSize: 13 },
  body: { paddingHorizontal: space.xl, marginTop: -space.xl },
  feature: { flexDirection: "row", gap: space.md, alignItems: "center" },
  privacy: {
    marginTop: space.xl,
    flexDirection: "row",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: c.brandTertiary,
  },
  footer: { paddingHorizontal: space.xl, paddingTop: space.md, borderTopWidth: 1, borderTopColor: c.divider, backgroundColor: c.surface },
  demoNote: { textAlign: "center", marginTop: space.sm, fontFamily: fonts.regular, fontSize: 12, color: c.muted },
}));
