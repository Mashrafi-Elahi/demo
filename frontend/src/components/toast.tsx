import React, { createContext, useCallback, useContext, useRef, useState } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { useTheme } from "@/src/theme";
import { fonts } from "@/src/fonts";

type Kind = "success" | "error" | "info";
type Toast = { id: number; msg: string; kind: Kind };
const Ctx = createContext<(msg: string, kind?: Kind) => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const show = useCallback((msg: string, kind: Kind = "info") => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), msg, kind });
    timer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const icon = toast?.kind === "success" ? "checkmark-circle" : toast?.kind === "error" ? "alert-circle" : "information-circle";
  const iconColor = toast?.kind === "success" ? colors.success : toast?.kind === "error" ? colors.error : colors.onSurfaceInverse;

  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <Animated.View
          key={toast.id}
          entering={FadeInUp}
          exiting={FadeOutUp}
          testID="toast-message"
          style={[styles.toast, { top: insets.top + 8, backgroundColor: colors.surfaceInverse }]}
        >
          <Ionicons name={icon} size={20} color={iconColor} />
          <Text style={[styles.text, { color: colors.onSurfaceInverse }]}>{toast.msg}</Text>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    zIndex: 1000,
    elevation: 8,
  },
  text: { flex: 1, fontFamily: fonts.semibold, fontSize: 14 },
});
