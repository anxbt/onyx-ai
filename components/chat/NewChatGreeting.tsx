import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Colors } from "@/constants/colors";
import { Spacing } from "@/constants/spacing";
import { Typography } from "@/constants/typography";
import { pickStarterPrompts } from "@/constants/starter-prompts";
import { buildGreeting } from "@/lib/greeting";

interface NewChatGreetingProps {
  // First name / display name. Pass null/undefined to fall back to "there".
  name: string | null | undefined;
  // Tap handler for the starter chips — should pre-fill the input.
  onPickPrompt: (text: string) => void;
}

export function NewChatGreeting({ name, onPickPrompt }: NewChatGreetingProps) {
  // useMemo with [] so the same 3 prompts persist across re-renders while the
  // user is on the empty state. A re-mount (new chat) picks a fresh trio.
  const prompts = useMemo(() => pickStarterPrompts(3), []);
  const greeting = useMemo(() => buildGreeting(name), [name]);

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: "center",
        paddingHorizontal: Spacing.lg,
        paddingVertical: Spacing.xxl,
        gap: Spacing.xl,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Greeting text */}
      <View style={{ gap: 4, alignItems: "center" }}>
        <Text
          style={[
            Typography.displayLg,
            { color: Colors.textPrimary, textAlign: "center" },
          ]}
        >
          {greeting.line1}
        </Text>
        <Text
          style={[
            Typography.bodyProse,
            {
              color: Colors.textSecondary,
              textAlign: "center",
              opacity: 0.8,
            },
          ]}
        >
          {greeting.line2}
        </Text>
      </View>

      {/* Starter prompt chips */}
      <View style={{ gap: Spacing.sm }}>
        {prompts.map((text) => (
          <Pressable
            key={text}
            onPress={() => onPickPrompt(text)}
            style={{
              backgroundColor: Colors.surface,
              borderWidth: 1,
              borderColor: Colors.borderHairline,
              borderRadius: Spacing.radius.container,
              paddingHorizontal: Spacing.lg,
              paddingVertical: Spacing.md,
            }}
            hitSlop={4}
          >
            <Text
              style={[
                Typography.bodyProse,
                { color: Colors.textPrimary },
              ]}
            >
              {text}
            </Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
