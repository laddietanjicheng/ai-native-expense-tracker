import { describe, expect, it } from "vitest";
import { parseSseFrame, splitSseBuffer } from "./sse";

describe("splitSseBuffer", () => {
  it("splits multiple complete frames from one chunk", () => {
    const { frames, rest } = splitSseBuffer('event: text\ndata: {"text":"a"}\n\nevent: text\ndata: {"text":"b"}\n\n');
    expect(frames).toEqual(['event: text\ndata: {"text":"a"}', 'event: text\ndata: {"text":"b"}']);
    expect(rest).toBe("");
  });

  it("keeps a partial trailing frame as rest", () => {
    const { frames, rest } = splitSseBuffer('event: text\ndata: {"text":"a"}\n\nevent: text\ndata: {"tex');
    expect(frames).toEqual(['event: text\ndata: {"text":"a"}']);
    expect(rest).toBe('event: text\ndata: {"tex');
  });

  it("normalizes CRLF line endings", () => {
    const { frames } = splitSseBuffer('event: done\r\ndata: {}\r\n\r\n');
    expect(frames).toEqual(["event: done\ndata: {}"]);
  });

  it("returns an empty rest when the buffer ends exactly on a frame boundary", () => {
    const { frames, rest } = splitSseBuffer('event: done\ndata: {}\n\n');
    expect(frames).toEqual(["event: done\ndata: {}"]);
    expect(rest).toBe("");
  });
});

describe("parseSseFrame", () => {
  it("parses event and JSON data", () => {
    expect(parseSseFrame('event: status\ndata: {"text":"Looking..."}')).toEqual({
      event: "status",
      data: { text: "Looking..." },
    });
  });

  it("defaults to event 'message' when no event line is present", () => {
    expect(parseSseFrame('data: {"text":"hi"}')).toEqual({ event: "message", data: { text: "hi" } });
  });

  it("returns null for a frame with no data line", () => {
    expect(parseSseFrame("event: status")).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseSseFrame("event: text\ndata: not-json")).toBeNull();
  });
});
