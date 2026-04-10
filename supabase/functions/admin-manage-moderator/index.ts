import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // Verify caller is admin
    const authHeader = req.headers.get('Authorization')!
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token)
    if (!caller) throw new Error('Unauthorized')

    const { data: isAdmin } = await supabaseAdmin.rpc('has_role', { _user_id: caller.id, _role: 'admin' })
    if (!isAdmin) throw new Error('Not an admin')

    const body = await req.json()
    const { action } = body

    if (action === 'create') {
      const { email, name } = body
      if (!email || !name) throw new Error('Email and name are required')

      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      let code = 'BT-'
      for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]

      const tempPassword = crypto.randomUUID() + '!Aa1'
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { name },
      })
      if (createError) throw createError

      await supabaseAdmin.from('profiles').update({ name }).eq('id', newUser.user.id)

      await supabaseAdmin.from('moderator_codes').insert({
        mod_id: newUser.user.id,
        email,
        code,
        temp_password: tempPassword,
      })

      return new Response(JSON.stringify({ code, userId: newUser.user.id, name }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'reset') {
      const { userId, email, name } = body
      if (!userId || !email) throw new Error('userId and email are required')

      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
      let code = 'BT-'
      for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]

      const tempPassword = crypto.randomUUID() + '!Aa1'
      const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(userId, { password: tempPassword })
      if (pwErr) throw pwErr

      await supabaseAdmin.from('moderator_codes').insert({
        mod_id: userId,
        email,
        code,
        temp_password: tempPassword,
      })

      return new Response(JSON.stringify({ code, name }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'ban') {
      const { userId, ban } = body
      if (!userId) throw new Error('userId is required')

      const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        ban_duration: ban ? '876600h' : 'none',
      })
      if (error) throw error

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'delete') {
      const { userId } = body
      if (!userId) throw new Error('userId is required')

      // Get all batch IDs for this mod
      const { data: modBatches } = await supabaseAdmin.from('batches').select('id').eq('mod_id', userId)
      const batchIds = (modBatches || []).map(b => b.id)

      if (batchIds.length > 0) {
        // Get all student IDs in those batches
        const { data: batchStudents } = await supabaseAdmin.from('students').select('id').in('batch_id', batchIds)
        const studentIds = (batchStudents || []).map(s => s.id)

        // Get all demo_day IDs in those batches
        const { data: batchDemoDays } = await supabaseAdmin.from('demo_days').select('id').in('batch_id', batchIds)
        const demoDayIds = (batchDemoDays || []).map(d => d.id)

        // a. Delete demo_scores
        if (demoDayIds.length > 0) {
          const { error } = await supabaseAdmin.from('demo_scores').delete().in('demo_day_id', demoDayIds)
          if (error) throw new Error(`Failed to delete demo_scores: ${error.message}`)
        }

        // b. Delete demo_days
        const { error: ddErr } = await supabaseAdmin.from('demo_days').delete().in('batch_id', batchIds)
        if (ddErr) throw new Error(`Failed to delete demo_days: ${ddErr.message}`)

        // c. Delete rescheduled_sessions
        const { error: rsErr } = await supabaseAdmin.from('rescheduled_sessions').delete().in('batch_id', batchIds)
        if (rsErr) throw new Error(`Failed to delete rescheduled_sessions: ${rsErr.message}`)

        // d. Delete attendance
        if (studentIds.length > 0) {
          const { error: attErr } = await supabaseAdmin.from('attendance').delete().in('student_id', studentIds)
          if (attErr) throw new Error(`Failed to delete attendance: ${attErr.message}`)
        }

        // e. Delete students
        const { error: stErr } = await supabaseAdmin.from('students').delete().in('batch_id', batchIds)
        if (stErr) throw new Error(`Failed to delete students: ${stErr.message}`)

        // f. Delete batches
        const { error: bErr } = await supabaseAdmin.from('batches').delete().eq('mod_id', userId)
        if (bErr) throw new Error(`Failed to delete batches: ${bErr.message}`)
      }

      // g. Delete activity_log
      const { error: alErr } = await supabaseAdmin.from('activity_log').delete().eq('mod_id', userId)
      if (alErr) throw new Error(`Failed to delete activity_log: ${alErr.message}`)

      // h. Delete moderator_codes
      const { error: mcErr } = await supabaseAdmin.from('moderator_codes').delete().eq('mod_id', userId)
      if (mcErr) throw new Error(`Failed to delete moderator_codes: ${mcErr.message}`)

      // i. Delete profile
      const { error: pErr } = await supabaseAdmin.from('profiles').delete().eq('id', userId)
      if (pErr) throw new Error(`Failed to delete profile: ${pErr.message}`)

      // j. Delete auth user
      const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (authErr) throw new Error(`Failed to delete auth user: ${authErr.message}`)

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    throw new Error('Unknown action')
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
