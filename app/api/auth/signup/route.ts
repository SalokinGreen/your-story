import { NextRequest, NextResponse } from "next/server";
import { signUp } from "@/app/misc/auth";

export const runtime = "nodejs";

interface SignUpBody {
  email: string;
  password: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SignUpBody;

    if (!body.email || !body.password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const { user, error } = await signUp(body);

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
