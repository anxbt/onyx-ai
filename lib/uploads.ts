import { supabase, supabaseUrl } from "@/lib/supabase";
import type { Attachment } from "@/types";

const IMAGE_BUCKET = "chat-images";
const FILE_BUCKET = "chat-files";

function generateStoragePath(userId: string, filename: string): string {
  const ts = Date.now();
  return `${userId}/${ts}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

export async function pickImageFromCamera(): Promise<Attachment | null> {
  try {
    const { launchCameraAsync } = await import("expo-image-picker");
    const result = await launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.75,
      allowsEditing: true,
    });

    if (result.canceled || !result.assets?.length) return null;

    const asset = result.assets[0];
    return {
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: asset.fileName ?? `photo-${Date.now()}.jpg`,
      type: "image",
      uri: asset.uri,
      mimeType: asset.mimeType ?? "image/jpeg",
      sizeBytes: asset.fileSize ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function pickImageFromGallery(): Promise<Attachment | null> {
  try {
    const { launchImageLibraryAsync } = await import("expo-image-picker");
    const result = await launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.75,
      allowsEditing: true,
    });

    if (result.canceled || !result.assets?.length) return null;

    const asset = result.assets[0];
    return {
      id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: asset.fileName ?? `image-${Date.now()}.jpg`,
      type: "image",
      uri: asset.uri,
      mimeType: asset.mimeType ?? "image/jpeg",
      sizeBytes: asset.fileSize ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function pickDocument(): Promise<Attachment | null> {
  try {
    const { getDocumentAsync } = await import("expo-document-picker");
    const result = await getDocumentAsync({
      type: [
        "application/pdf",
        "text/plain",
        "text/markdown",
        "application/json",
        "text/csv",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets?.length) return null;

    const asset = result.assets[0];
    return {
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: asset.name,
      type: "file",
      uri: asset.uri,
      mimeType: asset.mimeType ?? "application/octet-stream",
      sizeBytes: asset.size ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function uploadToStorage(
  attachment: Attachment,
  userId: string,
): Promise<Attachment | null> {
  if (!supabase || !attachment.uri) return null;

  const bucket = attachment.type === "image" ? IMAGE_BUCKET : FILE_BUCKET;
  const storagePath = generateStoragePath(userId, attachment.name);

  try {
    const response = await fetch(attachment.uri);
    if (!response.ok) {
      console.warn("Failed to fetch local file:", response.status);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const blob = new Blob([arrayBuffer], { type: attachment.mimeType });

    const { data, error } = await supabase.storage.from(bucket).upload(storagePath, blob, {
      contentType: attachment.mimeType,
      upsert: false,
    });

    if (error) {
      console.warn("Storage upload failed:", error.message);
      return null;
    }

    const remoteUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}`;

    return {
      ...attachment,
      remoteUrl,
      uri: remoteUrl,
    };
  } catch (err) {
    console.warn("Upload error:", err);
    return null;
  }
}

export async function analyzeUpload(
  uploadId: string,
  storagePath: string,
  mimeType: string,
  accessToken: string,
  workerUrl?: string,
): Promise<void> {
  const baseUrl = (workerUrl || process.env.EXPO_PUBLIC_WORKER_URL || "http://localhost:8787").replace(/\/+$/, "");

  fetch(`${baseUrl}/upload/analyze`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ uploadId, storagePath, mimeType }),
  }).catch(() => {
    // fire-and-forget
  });
}

export function getPublicUrl(bucket: string, path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}
