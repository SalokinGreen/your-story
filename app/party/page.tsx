import type { Metadata } from "next";
import PartyController from "./PartyController";

export const metadata: Metadata = {
  title: "Endless Adventure · table",
};

// The phone controller for party mode. The desktop app serves this page to
// phones on the home network (see src-tauri/src/party_server.rs); it is not a
// public page and has no link from the rest of the app.
export default function PartyPage() {
  return <PartyController />;
}
