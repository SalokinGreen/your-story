import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { deductTokens } from "@/app/misc/tokens";

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
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  // Verify requesting user
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (authError || !user) {
    return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
  }

  // Verify admin role
  const { data: adminData, error: adminError } = await supabaseAdmin.auth.admin.getUserById(user.id);
  if (adminError || !adminData?.user) {
    return NextResponse.json({ error: "Failed to verify admin status" }, { status: 500 });
  }
  const isAdmin = adminData.user.user_metadata?.role === 'admin' || adminData.user.app_metadata?.role === 'admin';
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized: Admin access required" }, { status: 403 });
  }

  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { userId, amount } = body;
  if (!userId || !amount || amount <= 0) {
    return NextResponse.json({ error: "Missing or invalid fields: userId, amount" }, { status: 400 });
  }

  // Admin deducts tokens from target user
  const result = await deductTokens(userId, amount, supabaseAdmin);
  if (!result.success) {
    return NextResponse.json({ error: result.error || "Failed to remove tokens" }, { status: 400 });
  }

  return NextResponse.json({ success: true, message: `Removed ${amount} token(s)` });
}
