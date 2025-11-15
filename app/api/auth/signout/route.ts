import { NextResponse } from "next/server";
import { signOut } from "@/app/misc/auth";

export const runtime = "nodejs";

export async function POST() {
  const { error } = await signOut();

  if (error) {
    return NextResponse.json({ error }, { status: 500 });
  }

  return NextResponse.json({ message: "Signed out successfully" }, { status: 200 });
}
