import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/misc/auth";

export const runtime = "nodejs";

export async function GET() {
  const { user, error } = await getCurrentUser();

  if (error) {
    return NextResponse.json({ error }, { status: 401 });
  }

  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  return NextResponse.json({ user }, { status: 200 });
}
