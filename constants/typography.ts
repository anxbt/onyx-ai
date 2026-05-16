import { TextStyle } from "react-native";

const InterTight = "InterTight_400Regular";
const InterTightMedium = "InterTight_500Medium";
const InterTightSemiBold = "InterTight_600SemiBold";
const InterTightBold = "InterTight_700Bold";
const IBMPlexSans = "IBMPlexSans_400Regular";
const IBMPlexSansMedium = "IBMPlexSans_500Medium";
const JetBrainsMono = "JetBrainsMono_400Regular";
const JetBrainsMonoMedium = "JetBrainsMono_500Medium";
const JetBrainsMonoSemiBold = "JetBrainsMono_600SemiBold";

export const Typography: Record<string, TextStyle> = {
  displayLg: {
    fontFamily: InterTightSemiBold,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.02 * 24,
  },
  uiMedium: {
    fontFamily: InterTightMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  uiLabel: {
    fontFamily: InterTightMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.01 * 12,
  },
  bodyProse: {
    fontFamily: IBMPlexSans,
    fontSize: 15,
    lineHeight: 26,
  },
  bodyProseBold: {
    fontFamily: IBMPlexSansMedium,
    fontSize: 15,
    lineHeight: 26,
  },
  codeBlock: {
    fontFamily: JetBrainsMono,
    fontSize: 13,
    lineHeight: 20,
  },
  dataMono: {
    fontFamily: JetBrainsMonoSemiBold,
    fontSize: 12,
    lineHeight: 16,
    fontVariant: ["tabular-nums"],
  },
} as const;
