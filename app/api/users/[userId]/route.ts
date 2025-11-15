import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: "Server not configured: missing Supabase credentials" },
      { status: 500 }
    );
  }

  // Create admin client with service role key
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

  // Create regular client to verify requester
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_KEY;
  if (!supabaseKey) {
    return NextResponse.json(
      { error: "Server not configured" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Verify the requester's session
  const { data: { user: requester }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );

  if (authError || !requester) {
    return NextResponse.json(
      { error: "Invalid or expired session", code: "AUTH_INVALID" },
      { status: 401 }
    );
  }

  // Await params to get userId
  const { userId } = await params;

  try {
    // Fetch user data using admin client
    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);

    if (userError || !userData?.user) {
      console.error("Error fetching user:", userError);
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Return safe user data (no sensitive info)
    return NextResponse.json({
      id: userData.user.id,
      email: userData.user.email || "Unknown",
      created_at: userData.user.created_at,
      user_metadata: userData.user.user_metadata,
      app_metadata: userData.user.app_metadata
    });
  } catch (error) {
    console.error("Error in GET /api/users/[userId]:", error);
    return NextResponse.json(
      { error: "Failed to fetch user data" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey || !supabaseKey) {
    return NextResponse.json(
      { error: "Server not configured: missing Supabase credentials" },
      { status: 500 }
    );
  }

  // Create clients
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

  // Verify the requester's session
  const { data: { user: requester }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  );

  if (authError || !requester) {
    return NextResponse.json(
      { error: "Invalid or expired session", code: "AUTH_INVALID" },
      { status: 401 }
    );
  }

  // Await params to get userId
  const { userId } = await params;

  // Check if the requester is updating their own profile
  if (requester.id !== userId) {
    return NextResponse.json(
      { error: "Unauthorized: You can only update your own profile" },
      { status: 403 }
    );
  }

  let body: { display_name?: string };
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { display_name } = body;

  if (!display_name || typeof display_name !== 'string') {
    return NextResponse.json(
      { error: "display_name is required and must be a string" },
      { status: 400 }
    );
  }

  const trimmedName = display_name.trim();
  if (!trimmedName || trimmedName.length > 50) {
    return NextResponse.json(
      { error: "Display name must be between 1 and 50 characters" },
      { status: 400 }
    );
  }

  try {
    // Update user metadata using admin client
    const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      {
        user_metadata: {
          display_name: trimmedName
        }
      }
    );

    if (updateError || !updateData?.user) {
      console.error("Error updating user:", updateError);
      return NextResponse.json(
        { error: "Failed to update display name" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      display_name: trimmedName
    });
  } catch (error) {
    console.error("Error in PATCH /api/users/[userId]:", error);
    return NextResponse.json(
      { error: "Failed to update user data" },
      { status: 500 }
    );
  }
}
