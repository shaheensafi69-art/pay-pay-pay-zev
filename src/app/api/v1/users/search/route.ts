import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/server/supabaseAdmin';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = (searchParams.get('q') || '').trim().replace(/^@/, '');

    if (!query || query.length < 1) {
      return NextResponse.json({ users: [] });
    }

    const supabase = getSupabaseAdmin();

    // Check if query is UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);

    let queryBuilder = supabase
      .from('profiles')
      .select('id, username, first_name, last_name, avatar_url, is_verified, coins_balance');

    if (isUuid) {
      queryBuilder = queryBuilder.eq('id', query);
    } else {
      queryBuilder = queryBuilder
        .or(`username.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
        .limit(8);
    }

    const { data: users, error } = await queryBuilder;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ users: users || [] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
