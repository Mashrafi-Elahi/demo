import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { storage } from "@/src/utils/storage";
import { useTheme } from "@/src/theme";

export default function Index() {
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const { colors } = useTheme();

  useEffect(() => {
    storage.getItem("prohori_onboarded", false).then((v) => setOnboarded(!!v));
  }, []);

  if (onboarded === null) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }
  return <Redirect href={onboarded ? "/(tabs)" : "/onboarding"} />;
}
