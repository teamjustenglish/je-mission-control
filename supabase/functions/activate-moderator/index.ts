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

    const { email, code, password } = await req.json()
    if (!email || !code || !password) throw new Error('Email, code, and password are required')

    // Validate code
    const { data: codeRecord } = await supabaseAdmin
      .from('moderator_codes')
      .select('*')
      .eq('email', email)
      .eq('code', code)
      .eq('used', false)
      .single()

    if (!codeRecord) throw new Error('Invalid or already used access code')

    // Update user password
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(codeRecord.mod_id, {
      password,
    })
    if (updateError) throw updateError

    // Mark code as used
    await supabaseAdmin.from('moderator_codes').update({ used: true }).eq('id', codeRecord.id)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
