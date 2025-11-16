import { NextRequest, NextResponse } from "next/server";
import { resendConfirmationEmail } from "@/app/misc/auth";

export const runtime = "nodejs";

interface ResendBody {
  email: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ResendBody;

    if (!body.email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const { error } = await resendConfirmationEmail(body.email);

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
