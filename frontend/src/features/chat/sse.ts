export interface SseFrame {
  event: string;
  data: unknown;
}

/**
 * Splits an accumulated buffer into complete `\n\n`-terminated SSE frames plus
 * whatever partial frame is left over (handles chunks split mid-frame and
 * multiple frames arriving in one chunk). Normalizes CRLF to LF first.
 */
export function splitSseBuffer(buffer: string): { frames: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const rest = parts.pop() ?? "";
  return { frames: parts.filter((part) => part.length > 0), rest };
}

/** Parses one `event: <kind>\ndata: <json>` frame. Returns null if it has no data line or invalid JSON. */
export function parseSseFrame(frame: string): SseFrame | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trim());
    }
  }
  if (dataLines.length === 0) return null;
  try {
    return { event, data: JSON.parse(dataLines.join("\n")) };
  } catch {
    return null;
  }
}
