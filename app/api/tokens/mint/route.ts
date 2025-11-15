import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mintTokens } from "@/app/misc/tokens";

export const runtime = "nodejs";

interface RequestBody {
  userId: string;
  amount: number;
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_KEY;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey || !supabaseServiceKey) {
    return NextResponse.json(
      { error: "Server not configured: missing Supabase credentials" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

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

  // Verify admin status using admin client
  const { data: adminData, error: adminError } = await supabaseAdmin.auth.admin.getUserById(user.id);
  
  if (adminError || !adminData?.user) {
    return NextResponse.json(
      { error: "Failed to verify admin status" },
      { status: 500 }
    );
  }

  const isAdmin = adminData.user.user_metadata?.role === 'admin' || adminData.user.app_metadata?.role === 'admin';
  
  if (!isAdmin) {
    return NextResponse.json(
      { error: "Unauthorized: Admin access required" },
      { status: 403 }
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

  const { userId, amount } = body;

  if (!userId || !amount) {
    return NextResponse.json(
      { error: "Missing required fields: userId, amount" },
      { status: 400 }
    );
  }

  if (amount <= 0) {
    return NextResponse.json(
      { error: "Amount must be positive" },
      { status: 400 }
    );
  }

  // Mint tokens (admin check is done above, pass admin client to bypass RLS)
  const result = await mintTokens(userId, amount, user.id, supabaseAdmin);

  if (!result.success) {
    return NextResponse.json(
      { error: result.error },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    message: `Successfully minted ${amount} token(s) for user`
  });
}
