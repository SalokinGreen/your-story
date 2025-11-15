import { supabase } from "./supabase";

export interface TokenBalance {
  total: number;
  tradable: number;
  locked: number;
}

/**
 * Get the token balance for a user
 * @param userId - The user's ID
 * @param supabaseClient - Optional Supabase client (should be service role client from API)
 * @returns Token balance breakdown
 */
export async function getUserTokenBalance(userId: string, supabaseClient?: any): Promise<TokenBalance | null> {
  try {
    // Use provided client (with service role) or default client
    const client = supabaseClient || supabase;
    
    // Get all tokens owned by the user
    const { data: ownerships, error } = await client
      .from('token_ownerships')
      .select(`
        token_id,
        tokens!inner (
          minted_at
        )
      `)
      .eq('owner_id', userId);

    if (error) {
      console.error('Error fetching token balance:', error);
      return null;
    }

    if (!ownerships || ownerships.length === 0) {
      return { total: 0, tradable: 0, locked: 0 };
    }

    const now = new Date();
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let tradable = 0;
    let locked = 0;

    for (const ownership of ownerships) {
      const token = (ownership as any).tokens;
      if (!token) continue;

      const mintedAt = new Date(token.minted_at);
      if (mintedAt <= oneMonthAgo) {
        tradable++;
      } else {
        locked++;
      }
    }

    return {
      total: tradable + locked,
      tradable,
      locked
    };
  } catch (error) {
    console.error('Error in getUserTokenBalance:', error);
    return null;
  }
}

/**
 * Check if user has enough tradable tokens
 * @param userId - The user's ID
 * @param required - Number of tokens required
 * @param supabaseClient - Optional Supabase client (should be service role client from API)
 * @returns True if user has enough tradable tokens
 */
export async function hasEnoughTokens(userId: string, required: number, supabaseClient?: any): Promise<boolean> {
  const balance = await getUserTokenBalance(userId, supabaseClient);
  return balance !== null && balance.total >= required;
}

/**
 * Deduct tokens from a user's balance by burning them
 * This function will delete the newest tokens from the user's ownership
 * @param userId - The user's ID
 * @param amount - Number of tokens to deduct
 * @param supabaseClient - Optional Supabase client (should be service role client from API)
 * @returns Success status and error message if any
 */
export async function deductTokens(userId: string, amount: number, supabaseClient?: any): Promise<{ success: boolean; error?: string }> {
  try {
    // Use provided client (with service role) or default client
    const client = supabaseClient || supabase;
    
    // Get user's tokens, newest first (so we delete locked tokens first)
    const { data: ownerships, error: fetchError } = await client
      .from('token_ownerships')
      .select(`
        token_id,
        tokens!inner (
          id,
          minted_at
        )
      `)
      .eq('owner_id', userId)
      .order('tokens(minted_at)', { ascending: false })
      .limit(amount);

    if (fetchError) {
      console.error('Error fetching tokens to deduct:', fetchError);
      return { success: false, error: 'Failed to fetch tokens' };
    }

    if (!ownerships || ownerships.length < amount) {
      return { success: false, error: `Insufficient tokens. Need ${amount}, have ${ownerships?.length || 0}` };
    }

    // Extract token IDs to delete
    const tokenIdsToDelete = ownerships.map((o: any) => o.tokens.id);

    // Delete the tokens (this will cascade delete ownerships)
    const { error: deleteError } = await client
      .from('tokens')
      .delete()
      .in('id', tokenIdsToDelete);

    if (deleteError) {
      console.error('Error deleting tokens:', deleteError);
      return { success: false, error: 'Failed to deduct tokens' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in deductTokens:', error);
    return { success: false, error: 'Unexpected error deducting tokens' };
  }
}

/**
 * Gift tokens from one user to another by transferring ownership
 * @param fromUserId - The user gifting tokens
 * @param toUserId - The user receiving tokens
 * @param amount - Number of tokens to gift
 * @returns Success status and error message if any
 */
export async function giftTokens(fromUserId: string, toUserId: string, amount: number): Promise<{ success: boolean; error?: string }> {
  try {
    if (fromUserId === toUserId) {
      return { success: false, error: 'Cannot gift tokens to yourself' };
    }

    if (amount <= 0) {
      return { success: false, error: 'Amount must be positive' };
    }

    // Get sender's tradable tokens (>= 1 month old), oldest first
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const { data: ownerships, error: fetchError } = await supabase
      .from('token_ownerships')
      .select(`
        token_id,
        tokens!inner (
          id,
          minted_at
        )
      `)
      .eq('owner_id', fromUserId)
      .lte('tokens.minted_at', oneMonthAgo.toISOString())
      .order('tokens(minted_at)', { ascending: true })
      .limit(amount);

    if (fetchError) {
      console.error('Error fetching tokens to gift:', fetchError);
      return { success: false, error: 'Failed to fetch tokens' };
    }

    if (!ownerships || ownerships.length < amount) {
      return { success: false, error: `Insufficient tradable tokens. Need ${amount}, have ${ownerships?.length || 0}` };
    }

    // Extract token IDs to transfer
    const tokenIds = ownerships.map((o: any) => o.tokens.id);

    // Update ownership for each token
    const { error: updateError } = await supabase
      .from('token_ownerships')
      .update({
        owner_id: toUserId,
        acquired_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .in('token_id', tokenIds);

    if (updateError) {
      console.error('Error transferring tokens:', updateError);
      return { success: false, error: 'Failed to transfer tokens' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in giftTokens:', error);
    return { success: false, error: 'Unexpected error gifting tokens' };
  }
}

/**
 * Mint new tokens for a user (admin only)
 * @param userId - The user to mint tokens for
 * @param amount - Number of tokens to mint
 * @param adminId - The admin performing the action (for verification)
 * @param supabaseClient - Optional Supabase client (should be service role client from API)
 * @returns Success status and error message if any
 */
export async function mintTokens(userId: string, amount: number, adminId: string, supabaseClient?: any): Promise<{ success: boolean; error?: string }> {
  try {
    if (amount <= 0) {
      return { success: false, error: 'Amount must be positive' };
    }

    // Use provided client (with service role) or default client
    const client = supabaseClient || supabase;

    // Mint tokens
    const tokensToCreate = [];
    for (let i = 0; i < amount; i++) {
      tokensToCreate.push({
        creator_id: adminId,
        minted_at: new Date().toISOString(),
        metadata_url: null
      });
    }

    const { data: newTokens, error: mintError } = await client
      .from('tokens')
      .insert(tokensToCreate)
      .select('id');

    if (mintError || !newTokens) {
      console.error('Error minting tokens:', mintError);
      return { success: false, error: 'Failed to mint tokens' };
    }

    // Create ownerships for the new tokens
    const ownershipsToCreate = newTokens.map((token: any) => ({
      token_id: token.id,
      owner_id: userId,
      acquired_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    const { error: ownershipError } = await client
      .from('token_ownerships')
      .insert(ownershipsToCreate);

    if (ownershipError) {
      console.error('Error creating ownerships:', ownershipError);
      // Clean up tokens if ownership creation failed
      await client.from('tokens').delete().in('id', newTokens.map((t: any) => t.id));
      return { success: false, error: 'Failed to create token ownerships' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in mintTokens:', error);
    return { success: false, error: 'Unexpected error minting tokens' };
  }
}

