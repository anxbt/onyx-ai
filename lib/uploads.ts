import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { supabase, supabaseUrl } from "@/lib/supabase";
import type { Attachment } from "@/types";

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = global.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const IMAGE_BUCKET = "chat-images";
const FILE_BUCKET = "chat-files";
const MAX_IMAGE_DIMENSION = 512;
const IMAGE_QUALITY = 0.7;

function generateStoragePath(userId: string, filename: string): string {
  const ts = Date.now();
  return `${userId}/${ts}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

async function resizeImageWeb(uri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let { width, height } = img;
      if (width <= MAX_IMAGE_DIMENSION && height <= MAX_IMAGE_DIMENSION) {
        resolve(uri);
        return;
      }
      const scale = Math.min(MAX_IMAGE_DIMENSION / width, MAX_IMAGE_DIMENSION / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas context failed")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error("Canvas toBlob failed")); return; }
        resolve(URL.createObjectURL(blob));
      }, "image/jpeg", IMAGE_QUALITY);
    };
    img.onerror = () => resolve(uri);
    img.src = uri;
  });
}

async function resizeIfNeeded(uri: string): Promise<string> {
  if (Platform.OS === "web") {
    try { return await resizeImageWeb(uri); } catch { return uri; }
  }
  try {
    const { manipulateAsync, SaveFormat } = await import("expo-image-manipulator");
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: MAX_IMAGE_DIMENSION } }],
      { compress: IMAGE_QUALITY, format: SaveFormat.JPEG },
    );
    return result.uri;
  } catch {
    return uri;
  }
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
    const uriToUpload = attachment.type === "image" ? await resizeIfNeeded(attachment.uri) : attachment.uri;

    let body: Uint8Array | Blob;
    if (Platform.OS === "web") {
      const response = await fetch(uriToUpload);
      if (!response.ok) {
        console.warn("Failed to fetch local file:", response.status);
        return null;
      }
      body = await response.blob();
    } else {
      const base64 = await FileSystem.readAsStringAsync(uriToUpload, {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (!base64 || base64.length === 0) {
        console.warn("Empty file body after base64 read");
        return null;
      }
      body = base64ToUint8Array(base64);
      if (body.byteLength === 0) {
        console.warn("Decoded zero-byte payload");
        return null;
      }
    }

    const { data, error } = await supabase.storage.from(bucket).upload(storagePath, body, {
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
