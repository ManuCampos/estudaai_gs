// ============================================================
// Script para exportar dados do Supabase (app_state)
// Cole no console do navegador em http://localhost:5173
// Vai imprimir o JSON completo dos editais salvos
// ============================================================

const SUPABASE_URL = "https://ogmlsmmybqmrnrilzesg.supabase.co";
const SUPABASE_KEY = "sb_publishable_dsUx1e6SQo_yuXg77NN-MA_HEL33DSo";

async function exportSupabase() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_state?id=eq.main&select=data`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    }
  });
  const json = await res.json();
  if (json && json[0] && json[0].data) {
    const db = json[0].data;
    console.log('=== EDITAIS ===');
    console.log(JSON.stringify(db.editais, null, 2));
    console.log('=== ALUNO_EDITAIS ===');
    console.log(JSON.stringify(db.alunoEditais, null, 2));
    console.log('=== USERS ===');
    console.log(JSON.stringify(db.users, null, 2));
    // Copia tudo para clipboard
    const exportData = { editais: db.editais, alunoEditais: db.alunoEditais, users: db.users };
    copy(JSON.stringify(exportData, null, 2));
    console.log('\n✅ Dados copiados para o clipboard! Cole aqui no chat.');
  } else {
    console.log('❌ Não encontrou dados:', json);
  }
}

exportSupabase();
