import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { giftTokens } from "@/app/misc/tokens";

export const runtime = "nodejs";

interface RequestBody {
  toUserId: string;
  amount: number;
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json(
      { error: "Server not configured: missing Supabase credentials" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get authentication token from request headers
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json(
      { error: "Authentication required", code: "AUTH_REQUIRED" },
      { status: 401 }
    );
  }

  // Verify the user's session
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );

  if (authError || !user) {
    return NextResponse.json(
      { error: "Invalid or expired session", code: "AUTH_INVALID" },
      { status: 401 }
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { toUserId, amount } = body;

  if (!toUserId || !amount) {
    return NextResponse.json(
      { error: "Missing required fields: toUserId, amount" },
      { status: 400 }
    );
  }

  if (amount <= 0) {
    return NextResponse.json(
      { error: "Amount must be positive" },
      { status: 400 }
    );
  }

  // Gift tokens
  const result = await giftTokens(user.id, toUserId, amount);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    message: `Successfully gifted ${amount} token(s)`
  });
}
