import { Image, Text, View } from "react-native";

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
            padding: 8,
          }}
        >
          {attachment.type === "image" && attachment.uri ? (
            <Image
              source={{ uri: attachment.uri }}
              style={{
                width: 80,
                height: 60,
                borderRadius: 8,
                backgroundColor: Colors.surface,
              }}
              resizeMode="cover"
            />
          ) : null}
          <Text style={{ color: Colors.textPrimary, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
            {attachment.name}
          </Text>
        </View>
      ))}
    </View>
  );
}

