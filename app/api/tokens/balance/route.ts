import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getUserTokenBalance } from "@/app/misc/tokens";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
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
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  // Verify the user's session
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );

  if (authError || !user) {
    return NextResponse.json(
      { error: "Invalid or expired session" },
      { status: 401 }
    );
  }

  // Get userId from query params (optional - defaults to authenticated user)
  const { searchParams } = new URL(request.url);
  const requestedUserId = searchParams.get("userId");
  
  // Use the requested userId if provided, otherwise use the authenticated user's ID
  const targetUserId = requestedUserId || user.id;

  try {
    // Fetch balance using service role for accurate data
    const balance = await getUserTokenBalance(targetUserId, supabaseAdmin);
    
    console.log(`[Token Balance API] Fetched balance for user ${targetUserId}:`, balance);
    
    if (balance === null) {
      return NextResponse.json(
        { error: "Failed to fetch token balance" },
        { status: 500 }
      );
    }

    return NextResponse.json({ balance }, { status: 200 });
  } catch (error) {
    console.error("Error fetching token balance:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
