import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

interface RequestBody {
  role: "user" | "moderator" | "admin";
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

  // Verify requester is admin
  const { data: adminData, error: adminError } = await supabaseAdmin.auth.admin.getUserById(requester.id);
  
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

  // Await params to get userId
  const { userId } = await params;

  let body: RequestBody;
  try {
    body = await req.json();
  } catch (e) {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { role } = body;

  if (!role || !["user", "moderator", "admin"].includes(role)) {
    return NextResponse.json(
      { error: "role must be one of: user, moderator, admin" },
      { status: 400 }
    );
  }

  try {
    // Update user role using admin client
    const { data: updateData, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      {
        user_metadata: {
          role: role
        }
      }
    );

    if (updateError || !updateData?.user) {
      console.error("Error updating user role:", updateError);
      return NextResponse.json(
        { error: "Failed to update user role" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      role: role
    });
  } catch (error) {
    console.error("Error in PATCH /api/users/[userId]/role:", error);
    return NextResponse.json(
      { error: "Failed to update user role" },
      { status: 500 }
    );
  }
}
