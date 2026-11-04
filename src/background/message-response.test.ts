import { describe, expect, it, vi } from "vitest";
import { replyToMapMessage } from "./message-response";

describe("map runtime message response", () => {
  it("keeps the channel open while a queued map request waits and returns its full result", async () => {
    let finish!: (result: unknown) => void;
    const operation = new Promise((resolve) => { finish = resolve; });
    const sendResponse = vi.fn();
    // A Chrome environment without Promise listener support only retains literal true.
    expect(replyToMapMessage(operation, sendResponse)).toBe(true);
    expect(sendResponse).not.toHaveBeenCalled();
    const result = { ok: true, view: { nodes: [{ id: "root" }], canUndo: true } };
    finish(result); await operation;
    expect(sendResponse).toHaveBeenCalledExactlyOnceWith(result);
  });

  it("delivers operation failures without replacing them with a connection error", async () => {
    const sendResponse = vi.fn();
    const result = { ok: false, error: "标签关闭失败" };
    replyToMapMessage(Promise.resolve(result), sendResponse);
    await Promise.resolve();
    expect(sendResponse).toHaveBeenCalledExactlyOnceWith(result);
  });

  it("returns a useful error when background initialization rejects", async () => {
    const sendResponse = vi.fn();
    replyToMapMessage(Promise.reject(new Error("数据库暂时不可用")), sendResponse);
    await Promise.resolve();
    expect(sendResponse).toHaveBeenCalledExactlyOnceWith({ ok: false, error: "数据库暂时不可用" });
  });
});
