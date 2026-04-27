// lib/extractMaterialContent.ts
// Server-side utility that turns any uploaded study material into content
// Gemini can understand. Supports PDF, images, DOCX, and PPTX.
// Never import this from a "use client" file.

import mammoth from "mammoth";
import JSZip from "jszip";

export type InlineContent = {
  kind: "inline";
  mimeType: string;
  base64: string;
};

export type TextContent = {
  kind: "text";
  text: string;
};

export type UnsupportedContent = {
  kind: "unsupported";
  message: string;
};

export type MaterialContent = InlineContent | TextContent | UnsupportedContent;

const IMAGE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function getExt(filePath: string): string {
  const p = (filePath ?? "").toLowerCase();
  const i = p.lastIndexOf(".");
  return i >= 0 ? p.slice(i) : "";
}

export function getMimeType(filePath: string): string {
  const ext = getExt(filePath);
  if (ext === ".pdf") return "application/pdf";
  if (IMAGE_MIME[ext]) return IMAGE_MIME[ext];
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "application/octet-stream";
}

export function isGeminiInlineSupported(filePath: string): boolean {
  const ext = getExt(filePath);
  return ext === ".pdf" || !!IMAGE_MIME[ext];
}

async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  const warnings = result.messages.filter((m) => m.type === "warning");
  if (warnings.length) {
    console.warn("[extractDocxText] mammoth warnings:", warnings.map((w) => w.message).join("; "));
  }
  return result.value.trim();
}

async function extractPptxText(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);

  // Collect all slide XML files in slide order
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)?.[1] ?? "0", 10);
      const nb = parseInt(b.match(/(\d+)/)?.[1] ?? "0", 10);
      return na - nb;
    });

  const slideTexts: string[] = [];

  for (const slideName of slideFiles) {
    const xml = await zip.files[slideName].async("string");

    // Extract text from DrawingML <a:t> elements
    const texts = Array.from(xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g))
      .map((m) =>
        m[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim()
      )
      .filter(Boolean);

    if (texts.length) {
      const slideNum = slideFiles.indexOf(slideName) + 1;
      slideTexts.push(`[Slide ${slideNum}]\n${texts.join(" ")}`);
    }
  }

  return slideTexts.join("\n\n");
}

/**
 * Extracts content from a study material buffer so it can be sent to Gemini.
 *
 * - PDF / images → returned as base64 inline_data (Gemini reads them natively)
 * - DOCX         → text extracted with mammoth
 * - PPTX         → slide text extracted from DrawingML XML via jszip
 * - anything else → UnsupportedContent with a user-friendly message
 */
export async function extractMaterialContent(
  buffer: ArrayBuffer,
  filePath: string
): Promise<MaterialContent> {
  const ext = getExt(filePath);

  // ── PDF ────────────────────────────────────────────────────────────────────
  if (ext === ".pdf") {
    return {
      kind: "inline",
      mimeType: "application/pdf",
      base64: Buffer.from(buffer).toString("base64"),
    };
  }

  // ── Images ─────────────────────────────────────────────────────────────────
  if (IMAGE_MIME[ext]) {
    return {
      kind: "inline",
      mimeType: IMAGE_MIME[ext],
      base64: Buffer.from(buffer).toString("base64"),
    };
  }

  // ── DOCX ──────────────────────────────────────────────────────────────────
  if (ext === ".docx") {
    try {
      const text = await extractDocxText(buffer);
      if (!text) {
        return { kind: "unsupported", message: "The DOCX file appears to be empty or has no readable text." };
      }
      return { kind: "text", text };
    } catch (e: any) {
      console.error("[extractMaterialContent] DOCX error:", e?.message);
      return { kind: "unsupported", message: "Could not read the DOCX file." };
    }
  }

  // ── PPTX ──────────────────────────────────────────────────────────────────
  if (ext === ".pptx") {
    try {
      const text = await extractPptxText(buffer);
      if (!text) {
        return { kind: "unsupported", message: "The PPTX file appears to be empty or has no readable text." };
      }
      return { kind: "text", text };
    } catch (e: any) {
      console.error("[extractMaterialContent] PPTX error:", e?.message);
      return { kind: "unsupported", message: "Could not read the PPTX file." };
    }
  }

  // ── Unsupported ────────────────────────────────────────────────────────────
  return {
    kind: "unsupported",
    message: `File type "${ext || "unknown"}" is not supported for AI features. Upload a PDF, image, DOCX, or PPTX.`,
  };
}

// Max characters of extracted text we send to Gemini to stay within token limits.
// ~60 000 chars ≈ 15 000 tokens — well within Gemini Flash-Lite's context window.
export const MAX_TEXT_CHARS = 60_000;

export function truncateText(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  return text.slice(0, MAX_TEXT_CHARS) + "\n\n[Document truncated — showing first portion only]";
}
