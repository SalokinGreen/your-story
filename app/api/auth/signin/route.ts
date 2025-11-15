import { NextRequest, NextResponse } from "next/server";
import { signIn } from "@/app/misc/auth";

export const runtime = "nodejs";

interface SignInBody {
  email: string;
  password: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SignInBody;

    if (!body.email || !body.password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const { user, session, error } = await signIn(body);

    if (error) {
      return NextResponse.json({ error }, { status: 401 });
    }

    return NextResponse.json({ user, session }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}
