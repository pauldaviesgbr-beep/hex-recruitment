import { NextResponse } from 'next/server'
import { verifyAdmin, createAdminClient } from '@/lib/admin'

const PAGE_SIZE = 20

export async function GET(req: Request) {
  const { authorized, token } = await verifyAdmin(req)
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const conversationId = searchParams.get('conversationId')
  const page = parseInt(searchParams.get('page') || '1')
  const search = searchParams.get('search') || ''
  const sort = searchParams.get('sort') || 'last_message_at'
  const dir = (searchParams.get('dir') || 'desc') as 'asc' | 'desc'

  const db = createAdminClient(token)

  // Single conversation messages
  if (conversationId) {
    try {
      const { data: messages } = await db
        .from('messages')
        .select('id, sender_id, sender_name, content, is_read, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(100)

      const { data: conversation } = await db
        .from('conversations')
        .select('*')
        .eq('id', conversationId)
        .single()

      return NextResponse.json({ messages: messages || [], conversation })
    } catch (error: any) {
      console.error('[Admin Messages Detail]', error.message)
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }
  }

  // Conversations list
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  try {
    let query = db
      .from('conversations')
      .select('id, participant_1, participant_2, participant_1_name, participant_2_name, related_job_id, last_message, last_message_at', { count: 'exact' })

    if (search) {
      query = query.or(`participant_1_name.ilike.%${search}%,participant_2_name.ilike.%${search}%,last_message.ilike.%${search}%`)
    }

    const sortField = sort === 'participant_1_name' ? 'participant_1_name' : 'last_message_at'
    query = query.order(sortField, { ascending: dir === 'asc' }).range(from, to)

    const { data, count, error } = await query
    if (error) throw error

    // Stats
    const [totalConvos, totalMsgs] = await Promise.all([
      db.from('conversations').select('*', { count: 'exact', head: true }).then(r => r.count || 0),
      db.from('messages').select('*', { count: 'exact', head: true }).then(r => r.count || 0),
    ])

    return NextResponse.json({
      conversations: data || [],
      total: count || 0,
      page,
      totalPages: Math.ceil((count || 0) / PAGE_SIZE),
      stats: {
        totalConversations: totalConvos,
        totalMessages: totalMsgs,
      },
    })
  } catch (error: any) {
    console.error('[Admin Messages]', error.message)
    return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
  }
}
