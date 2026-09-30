import { Platform } from "react-native";
import { Tabs } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { usesNativeTabs } from "@/src/navigation";
import { useTheme } from "@/src/theme";
import { fonts } from "@/src/fonts";

export default function TabsLayout() {
  const { colors } = useTheme();

  if (usesNativeTabs) {
    return (
      <NativeTabs tintColor={colors.brandPrimary}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf="house.fill" />
          <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="check">
          <NativeTabs.Trigger.Icon sf="checkmark.shield.fill" />
          <NativeTabs.Trigger.Label>Check</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="reports">
          <NativeTabs.Trigger.Icon sf="person.3.fill" />
          <NativeTabs.Trigger.Label>Reports</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings">
          <NativeTabs.Trigger.Icon sf="gearshape.fill" />
          <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  const icon = (on: any, off: any) => {
    const TabIcon = ({ focused, color, size }: { focused: boolean; color: any; size: number }) => (
      <Ionicons name={focused ? on : off} size={size - 2} color={color} />
    );
    return TabIcon;
  };

  return (
    <Tabs
      screenListeners={{ tabPress: () => Haptics.selectionAsync().catch(() => {}) }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarButtonTestID: "tab-home", tabBarIcon: icon("home", "home-outline") }} />
      <Tabs.Screen name="check" options={{ title: "Check", tabBarButtonTestID: "tab-check", tabBarIcon: icon("shield-checkmark", "shield-checkmark-outline") }} />
      <Tabs.Screen name="reports" options={{ title: "Reports", tabBarButtonTestID: "tab-reports", tabBarIcon: icon("people", "people-outline") }} />
      <Tabs.Screen name="settings" options={{ title: "Settings", tabBarButtonTestID: "tab-settings", tabBarIcon: icon("settings", "settings-outline") }} />
    </Tabs>
  );
}
