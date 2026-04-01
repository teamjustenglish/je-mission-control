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

    const { email } = await req.json()
    if (!email) throw new Error('Email is required')

    // Generate code
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = 'BT-'
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]

    // Create user with a temporary random password (they'll set their own on activation)
    const tempPassword = crypto.randomUUID() + '!Aa1'
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    })
    if (createError) throw createError

    // Store code
    await supabaseAdmin.from('moderator_codes').insert({
      mod_id: newUser.user.id,
      email,
      code,
    })

    return new Response(JSON.stringify({ code, userId: newUser.user.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
