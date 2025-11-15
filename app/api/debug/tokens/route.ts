import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 500 }
    );
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const userId = req.nextUrl.searchParams.get('userId');
  
  if (!userId) {
    return NextResponse.json(
      { error: "userId parameter required" },
      { status: 400 }
    );
  }

  try {
    // Check tokens
    const { data: tokens, error: tokensError } = await supabaseAdmin
      .from('tokens')
      .select('*')
      .eq('creator_id', userId);

    // Check ownerships
    const { data: ownerships, error: ownershipsError } = await supabaseAdmin
      .from('token_ownerships')
      .select('*')
      .eq('owner_id', userId);

    return NextResponse.json({
      tokens: tokens || [],
      tokensError: tokensError?.message || null,
      ownerships: ownerships || [],
      ownershipsError: ownershipsError?.message || null,
      tokenCount: tokens?.length || 0,
      ownershipCount: ownerships?.length || 0
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
