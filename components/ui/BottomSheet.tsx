import type { PropsWithChildren } from "react";
import { Modal, Pressable, View } from "react-native";

import { Colors } from "@/constants/colors";

interface BottomSheetProps extends PropsWithChildren {
  visible: boolean;
  onClose: () => void;
}

export function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.5)",
        }}
      >
        <Pressable>
          <View
            style={{
              backgroundColor: Colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 20,
              gap: 14,
            }}
          >
            {children}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

