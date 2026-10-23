import { beforeEach, describe, expect, it, vi } from "vitest";

const isNativePlatform = vi.fn();
const writeFile = vi.fn();
const share = vi.fn();
const canShare = vi.fn();

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
}));
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Encoding: { UTF8: "utf8" },
  Filesystem: { writeFile: (o: unknown) => writeFile(o) },
}));
vi.mock("@capacitor/share", () => ({
  Share: { share: (o: unknown) => share(o), canShare: () => canShare() },
}));

import { saveFile } from "@/app/misc/saveFile";

beforeEach(() => {
  vi.clearAllMocks();
  writeFile.mockResolvedValue({ uri: "file:///cache/a.txt" });
  share.mockResolvedValue({});
  canShare.mockResolvedValue({ value: true });
});

describe("saveFile on a native platform", () => {
  beforeEach(() => isNativePlatform.mockReturnValue(true));

  it("writes a string as utf8 to the cache and shares the uri", async () => {
    await saveFile("a.txt", "héllo", "text/plain");
    expect(writeFile).toHaveBeenCalledWith({
      path: "a.txt",
      data: "héllo",
      directory: "CACHE",
      encoding: "utf8",
    });
    expect(share).toHaveBeenCalledWith({
      title: "a.txt",
      files: ["file:///cache/a.txt"],
    });
  });

  it("writes a Blob as base64 with no encoding", async () => {
    await saveFile("a.bin", new Blob([new Uint8Array([104, 105])]), "x/y");
    const arg = writeFile.mock.calls[0][0];
    expect(arg.data).toBe(btoa("hi"));
    expect(arg.encoding).toBeUndefined();
    expect(arg.directory).toBe("CACHE");
  });

  it("encodes a large Blob without overflowing the stack", async () => {
    const big = new Uint8Array(500_000).fill(65);
    await saveFile("big.bin", new Blob([big]), "x/y");
    expect(writeFile.mock.calls[0][0].data.length).toBe(
      Math.ceil(500_000 / 3) * 4,
    );
  });

  it("falls back to url when files cannot be shared", async () => {
    canShare.mockResolvedValue({ value: false });
    await saveFile("a.txt", "x", "text/plain");
    expect(share).toHaveBeenCalledWith({
      title: "a.txt",
      url: "file:///cache/a.txt",
    });
  });

  it("treats a cancelled share sheet as success", async () => {
    share.mockRejectedValue(new Error("Share canceled"));
    await expect(saveFile("a.txt", "x", "text/plain")).resolves.toBeUndefined();
  });

  it("throws other share errors", async () => {
    share.mockRejectedValue(new Error("boom"));
    await expect(saveFile("a.txt", "x", "text/plain")).rejects.toThrow("boom");
  });
});

describe("saveFile elsewhere", () => {
  it("clicks a download anchor and revokes the url", async () => {
    isNativePlatform.mockReturnValue(false);
    vi.useFakeTimers();
    const anchor = { href: "", download: "", click: vi.fn() };
    vi.stubGlobal("document", {
      createElement: vi.fn(() => anchor),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
    });
    const create = vi.fn(() => "blob:abc");
    const revoke = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: create, revokeObjectURL: revoke });

    await saveFile("a.json", "{}", "application/json");

    expect(anchor.href).toBe("blob:abc");
    expect(anchor.download).toBe("a.json");
    expect(anchor.click).toHaveBeenCalledOnce();
    expect(writeFile).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:abc");
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
});
