import { Platform } from "react-native";

/**
 * Copy text to clipboard. Works on native (via expo-clipboard if available)
 * and falls back to the Web Clipboard API on web.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (Platform.OS === "web") {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Try to use expo-clipboard if available
    try {
      // Dynamic require to avoid hard dependency
      const ExpoClipboard = require("expo-clipboard");
      await ExpoClipboard.setStringAsync(text);
      return true;
    } catch {
      // Fallback: try react-native Clipboard (deprecated but may exist)
      const RNClipboard = require("react-native").Clipboard;
      if (RNClipboard) {
        RNClipboard.setString(text);
        return true;
      }
    }
  } catch {
    // Silently fail
  }
  return false;
}
