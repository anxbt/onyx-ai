import type { Attachment } from "@/types";

import { supabase, supabaseUrl } from "./supabase";
import { analyzeUpload } from "./worker";

const IMAGE_BUCKET = "chat-images";
const FILE_BUCKET = "chat-files";
const MAX_IMAGE_DIMENSION = 512;
const IMAGE_QUALITY = 0.7;

export const documentAccept = ".pdf,.txt,.md,.json,.csv,.doc,.docx";

function generateStoragePath(userId: string, filename: string): string {
  return `${userId}/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
}

export function generateUploadAnalysisId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  const segment = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
  const variant = (8 + Math.floor(Math.random() * 4)).toString(16);
  return `${segment()}${segment()}-${segment()}-4${segment().slice(1)}-${variant}${segment().slice(1)}-${segment()}${segment()}${segment()}`;
}

export function attachmentFromFile(file: File): Attachment {
  const isImage = file.type.startsWith("image/");
  return {
    id: `${isImage ? "img" : "file"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    type: isImage ? "image" : "file",
    uri: URL.createObjectURL(file),
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  };
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
      if (!ctx) {
        reject(new Error("Canvas context failed"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas toBlob failed"));
            return;
          }
          resolve(URL.createObjectURL(blob));
        },
        "image/jpeg",
        IMAGE_QUALITY,
      );
    };
    img.onerror = () => resolve(uri);
    img.src = uri;
  });
}

export async function uploadToStorage(
  attachment: Attachment,
  userId: string,
  accessToken?: string,
  options: { analyze?: boolean } = {},
): Promise<Attachment | null> {
  if (!supabase || !supabaseUrl || !attachment.uri) return null;

  const bucket = attachment.type === "image" ? IMAGE_BUCKET : FILE_BUCKET;
  const storagePath = generateStoragePath(userId, attachment.name);
  let uriToUpload = attachment.uri;
  let resizedObjectUrl: string | null = null;

  try {
    if (attachment.type === "image") {
      uriToUpload = await resizeImageWeb(attachment.uri);
      if (uriToUpload !== attachment.uri) {
        resizedObjectUrl = uriToUpload;
      }
    }

    const response = await fetch(uriToUpload);
    if (!response.ok) {
      return null;
    }

    const body = await response.blob();
    const { error } = await supabase.storage.from(bucket).upload(storagePath, body, {
      contentType: attachment.mimeType,
      upsert: false,
    });

    if (error) {
      return null;
    }

    const remoteUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${storagePath}`;
    if (accessToken && options.analyze !== false) {
      analyzeUpload(
        { uploadId: generateUploadAnalysisId(), storagePath, mimeType: attachment.mimeType ?? "application/octet-stream" },
        accessToken,
      ).catch(() => {});
    }

    return {
      ...attachment,
      remoteUrl,
      uri: remoteUrl,
      storagePath,
    };
  } finally {
    if (resizedObjectUrl) {
      URL.revokeObjectURL(resizedObjectUrl);
    }
  }
}
