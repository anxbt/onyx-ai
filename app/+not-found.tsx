import { Link } from "expo-router";
import { Text, View } from "react-native";

import { Button } from "@/components/ui/Button";
import { Colors } from "@/constants/colors";

export default function NotFoundScreen() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: Colors.background,
        justifyContent: "center",
        padding: 24,
      }}
    >
      <Text style={{ color: Colors.textPrimary, fontSize: 24, fontWeight: "700", marginBottom: 12 }}>
        Screen not found
      </Text>
      <Text style={{ color: Colors.textSecondary, fontSize: 15, marginBottom: 20 }}>
        This route does not exist yet in the current checkpoint.
      </Text>
      <Link asChild href="/(tabs)">
        <Button label="Go home" />
      </Link>
    </View>
  );
}
