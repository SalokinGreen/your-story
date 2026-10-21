import { describe, expect, it } from "vitest";
import { buildInviteLink, buildTextInvite } from "@/app/misc/multiplayer/invite";

describe("buildInviteLink", () => {
  it("puts the room code and backend in the query string GuidedStoryStart reads", () => {
    const link = new URL(buildInviteLink("https://example.com", "ABC234", "nostr"));
    expect(link.origin).toBe("https://example.com");
    expect(link.searchParams.get("join")).toBe("ABC234");
    expect(link.searchParams.get("provider")).toBe("nostr");
  });
});

describe("buildTextInvite", () => {
  it("names the room code and the connection by its Join a Game label", () => {
    const invite = buildTextInvite("ABC234", "torrent");
    expect(invite).toContain("Room code: ABC234");
    expect(invite).toContain("Connection: Default (BitTorrent)");
    expect(invite).toContain('"Join a Game"');
  });

  it("contains no link, since a native build's origin opens nothing for anyone else", () => {
    const invite = buildTextInvite("ABC234", "peerjs");
    expect(invite).not.toMatch(/https?:\/\/|localhost/);
    expect(invite).toContain("Connection: PeerJS Cloud");
  });
});
