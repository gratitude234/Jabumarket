// lib/extractMaterialContent.ts
// Server-side utility that turns uploaded study materials into text for NVIDIA,
// or inline file payloads for Gemini fallback. Supports PDF, images, DOCX, and PPTX.
// Never import this from a "use client" file.

import JSZip from "jszip";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import path from "node:path";
import { pathToFileURL } from "node:url";

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

const MIN_EXTRACTED_PDF_CHARS = 120;
let pdfWorkerConfigured = false;

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

function configurePdfWorker() {
  if (pdfWorkerConfigured) return;

  const workerPath = path.join(
    process.cwd(),
    "node_modules",
    "pdf-parse",
    "dist",
    "pdf-parse",
    "esm",
    "pdf.worker.mjs"
  );

  PDFParse.setWorker(pathToFileURL(workerPath).href);
  pdfWorkerConfigured = true;
}

async function extractDocxText(buffer: ArrayBuffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  const warnings = result.messages.filter((m) => m.type === "warning");
  if (warnings.length) {
    console.warn("[extractDocxText] mammoth warnings:", warnings.map((w) => w.message).join("; "));
  }
  return result.value.trim();
}

async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  configurePdfWorker();

  const parser = new PDFParse({
    data: Buffer.from(buffer),
    disableFontFace: true,
    useWorkerFetch: false,
  });

  try {
    const result = await parser.getText();
    return result.text.replace(/\s+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
  } finally {
    await parser.destroy();
  }
}

async function extractPptxText(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);

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
 * Extracts content from a study material buffer for AI generation.
 *
 * - Text PDFs    -> selectable text extracted for NVIDIA first
 * - Scanned PDFs -> inline file fallback for Gemini
 * - Images       -> inline file fallback for Gemini
 * - DOCX         -> text extracted with mammoth
 * - PPTX         -> slide text extracted from DrawingML XML via jszip
 */
export async function extractMaterialContent(
  buffer: ArrayBuffer,
  filePath: string
): Promise<MaterialContent> {
  const ext = getExt(filePath);

  if (ext === ".pdf") {
    try {
      const text = await extractPdfText(buffer);
      if (text.length >= MIN_EXTRACTED_PDF_CHARS) {
        return { kind: "text", text };
      }
    } catch (e: any) {
      console.warn("[extractMaterialContent] PDF text extraction failed; falling back to inline file:", e?.message);
    }

    return {
      kind: "inline",
      mimeType: "application/pdf",
      base64: Buffer.from(buffer).toString("base64"),
    };
  }

  if (IMAGE_MIME[ext]) {
    return {
      kind: "inline",
      mimeType: IMAGE_MIME[ext],
      base64: Buffer.from(buffer).toString("base64"),
    };
  }

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

  return {
    kind: "unsupported",
    message: `File type "${ext || "unknown"}" is not supported for AI features. Upload a PDF, image, DOCX, or PPTX.`,
  };
}

// Max characters of extracted text we send to AI providers to stay within token limits.
// Roughly 60,000 chars is about 15,000 tokens.
export const MAX_TEXT_CHARS = 60_000;

export function truncateText(text: string, maxChars = MAX_TEXT_CHARS): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[Document truncated - showing first portion only]";
}
