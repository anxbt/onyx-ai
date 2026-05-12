import { Text, View } from "react-native";

import { Colors } from "@/constants/colors";
import type { Attachment } from "@/types";

interface AttachmentPreviewProps {
  attachments: Attachment[];
}

export function AttachmentPreview({ attachments }: AttachmentPreviewProps) {
  if (!attachments.length) {
    return null;
  }

  return (
    <View style={{ gap: 8 }}>
      {attachments.map((attachment) => (
        <View
          key={attachment.id}
          style={{
            backgroundColor: Colors.surfaceElevated,
            borderColor: Colors.border,
            borderRadius: 12,
            borderWidth: 1,
            padding: 10,
          }}
        >
          <Text style={{ color: Colors.textPrimary }}>{attachment.name}</Text>
        </View>
      ))}
    </View>
  );
}

