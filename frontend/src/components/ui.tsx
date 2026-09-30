import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons, IoniconsIconName } from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, radius, space } from "@/src/fonts";

/** Bilingual text: Bangla first, English right under it. */
export function Bi({
  bn,
  en,
  size = 16,
  weight = "semibold",
  color,
  enColor,
  align,
  testID,
}: {
  bn: string;
  en: string;
  size?: number;
  weight?: "regular" | "semibold" | "bold";
  color?: string;
  enColor?: string;
  align?: TextStyle["textAlign"];
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View testID={testID}>
      <Text style={{ fontFamily: fonts[weight], fontSize: size, lineHeight: size * 1.45, color: color ?? colors.onSurface, textAlign: align }}>
        {bn}
      </Text>
      <Text
        style={{
          fontFamily: weight === "regular" ? fonts.regular : fonts.semibold,
          fontSize: Math.max(12, Math.round(size * 0.78)),
          lineHeight: Math.max(12, Math.round(size * 0.78)) * 1.35,
          color: enColor ?? colors.muted,
          textAlign: align,
        }}
      >
        {en}
      </Text>
    </View>
  );
}

type Variant = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  bn,
  en,
  icon,
  onPress,
  variant = "primary",
  loading,
  disabled,
  testID,
  style,
}: {
  bn: string;
  en?: string;
  icon?: IoniconsIconName;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  testID: string;
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const bg = { primary: colors.brandPrimary, secondary: colors.brandTertiary, danger: colors.error, ghost: "transparent" }[variant];
  const fg = { primary: colors.onBrandPrimary, secondary: colors.onBrandTertiary, danger: colors.onError, ghost: colors.brandPrimary }[variant];
  return (
    <Pressable
      testID={testID}
      disabled={disabled || loading}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        btn.base,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
        variant === "ghost" && { borderWidth: 1, borderColor: colors.border },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={20} color={fg} />}
          <View style={{ alignItems: "center" }}>
            <Text style={[btn.bn, { color: fg }]}>{bn}</Text>
            {en ? <Text style={[btn.en, { color: fg }]}>{en}</Text> : null}
          </View>
        </>
      )}
    </Pressable>
  );
}

const btn = StyleSheet.create({
  base: {
    minHeight: 56,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
  },
  bn: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 22 },
  en: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, opacity: 0.85 },
});

export function Card({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle | ViewStyle[]; testID?: string }) {
  const styles = useCardStyles();
  return (
    <View testID={testID} style={[styles.card, style as ViewStyle]}>
      {children}
    </View>
  );
}

const useCardStyles = makeStyles((c) => ({
  card: {
    backgroundColor: c.surface,
    borderRadius: radius.md,
    padding: space.lg,
    borderWidth: 1,
    borderColor: c.border,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
}));

export function ProviderAvatar({ provider, size = 40 }: { provider: string; size?: number }) {
  const { colors } = useTheme();
  const initials = provider === "bKash" ? "bK" : provider === "Nagad" ? "NG" : provider === "Rocket" ? "RK" : provider.slice(0, 2);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.brandTertiary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.34, color: colors.brandPrimary }}>{initials}</Text>
    </View>
  );
}

export function SectionTitle({ bn, en, right }: { bn: string; en: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: space.md }}>
      <Bi bn={bn} en={en} size={18} weight="bold" />
      {right}
    </View>
  );
}

export function IconCircle({ name, color, bg, size = 44 }: { name: IoniconsIconName; color: string; bg: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={name} size={size * 0.5} color={color} />
    </View>
  );
}

export function Chip({ label, sub, selected, onPress, testID }: { label: string; sub?: string; selected: boolean; onPress: () => void; testID: string }) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={{
        height: 36,
        flexShrink: 0,
        paddingHorizontal: space.md,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? colors.brandPrimary : colors.border,
        backgroundColor: selected ? colors.brandPrimary : colors.surface,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
      }}
    >
      <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: selected ? colors.onBrandPrimary : colors.onSurface }}>{label}</Text>
      {sub ? <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: selected ? colors.onBrandPrimary : colors.muted }}>{sub}</Text> : null}
    </Pressable>
  );
}
