// ============================================================
// EstudaAI — Script de Migração COMPLETO
// Lê o base.json exportado do Supabase e popula as planilhas
// ============================================================
// Como usar:
// 1. Rode: node scripts/migrate-from-json.mjs
// (requer Node.js 18+ com fetch nativo)
// ============================================================

import { readFileSync } from 'fs';
import { resolve } from 'path';

const API_URL = 'https://script.google.com/macros/s/AKfycbyhT495ELPbDX_d9ph28WbFzUYzTdwu5sau9LkUZu7-FbReLWuXpC2I8GjuJrE3ZOVWGA/exec';

// Lê o JSON exportado
const raw = readFileSync(resolve('scripts/base.json'), 'utf-8');
const wrapper = JSON.parse(raw);
// O Supabase retorna [{data: {...}}] ou diretamente o objeto
const db = Array.isArray(wrapper) ? (wrapper[0]?.data || wrapper[0]) : (wrapper.data || wrapper);

async function post(module, action, body = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ module, action, ...body }),
  });
  const json = await res.json();
  if (json.status === 'error') {
    console.error(`  ❌ ${module}/${action}:`, json.error);
  }
  return json;
}

// Delay para não estourar cota
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function migrate() {
  console.log('🚀 Iniciando migração do base.json...\n');

  // ========== USERS ==========
  const users = db.users || [];
  console.log(`📋 Users: ${users.length}`);
  for (const u of users) {
    await post('users', 'create', {
      id: u.id,
      name: u.name || '',
      email: u.email || '',
      role: u.role || 'aluno',
      coach_id: u.coachId || '',
      avatar_url: u.avatar_url || '',
    });
    console.log(`  ✓ ${u.name} (${u.role})`);
    await delay(200);
  }

  // ========== EDITAIS + MATERIAS + TOPICOS ==========
  const editais = db.editais || [];
  console.log(`\n📋 Editais: ${editais.length}`);
  for (const ed of editais) {
    await post('editais', 'create', {
      id: ed.id,
      name: ed.name || '',
      coach_id: ed.coachId || '',
    });
    console.log(`  ✓ Edital: ${ed.name}`);
    await delay(200);

    const materias = ed.materias || [];
    for (let mi = 0; mi < materias.length; mi++) {
      const mat = materias[mi];
      await post('materias', 'create', {
        id: mat.id,
        edital_id: ed.id,
        name: mat.name || '',
        color: mat.color || '',
        review_preset: mat.reviewPreset || 'moderada',
        ordem: mi,
      });
      console.log(`    ✓ Matéria: ${mat.name}`);
      await delay(200);

      const topicos = mat.topicos || [];
      if (topicos.length > 0) {
        // Envia em batches de 20 para não estourar timeout
        for (let i = 0; i < topicos.length; i += 20) {
          const batch = topicos.slice(i, i + 20).map((t, idx) => ({
            id: t.id,
            materia_id: mat.id,
            name: t.name || '',
            conteudo_baixa: t.conteudoBaixa || t.conteudo_baixa || '',
            conteudo_media: t.conteudoMedia || t.conteudo_media || '',
            conteudo_alta: t.conteudoAlta || t.conteudo_alta || '',
            material_url: t.materialUrl || t.material_url || '',
            material_name: t.materialName || t.material_name || '',
            ordem: i + idx,
          }));
          await post('topicos', 'createBatch', { items: batch });
          console.log(`      ✓ Tópicos: ${batch.length} (batch ${Math.floor(i/20)+1})`);
          await delay(300);
        }
      }
    }
  }

  // ========== ALUNO_EDITAIS ==========
  const alunoEditais = db.alunoEditais || [];
  console.log(`\n📋 Aluno↔Editais: ${alunoEditais.length}`);
  for (const ae of alunoEditais) {
    await post('aluno_editais', 'associar', {
      aluno_id: ae.alunoId || ae.aluno_id,
      edital_id: ae.editalId || ae.edital_id,
    });
    console.log(`  ✓ ${ae.alunoId || ae.aluno_id} → ${ae.editalId || ae.edital_id}`);
    await delay(200);
  }

  // ========== PLANOS ==========
  const planos = db.planos || [];
  console.log(`\n📋 Planos: ${planos.length}`);
  for (const p of planos) {
    await post('planos', 'create', {
      id: p.id,
      aluno_id: p.alunoId || p.aluno_id || '',
      edital_id: p.editalId || p.edital_id || '',
      rotina: p.rotina || {},
      plan: p.plan || {},
      nivel_cobertura: p.nivelCobertura || p.nivel_cobertura || [],
    });
    console.log(`  ✓ Plano: ${p.id}`);
    await delay(300);
  }

  // ========== PROGRESSO ==========
  const progresso = db.progresso || [];
  console.log(`\n📋 Progresso: ${progresso.length} registros`);
  for (let i = 0; i < progresso.length; i += 10) {
    const batch = progresso.slice(i, i + 10);
    for (const pr of batch) {
      await post('progresso', 'set', {
        aluno_id: pr.alunoId || pr.aluno_id,
        plano_id: pr.planoId || pr.plano_id,
        key: pr.key,
        done: pr.done,
      });
    }
    console.log(`  ✓ Progresso: ${Math.min(i+10, progresso.length)}/${progresso.length}`);
    await delay(300);
  }

  // ========== STUDY_NOTES ==========
  const notes = db.studyNotes || [];
  console.log(`\n📋 Study Notes: ${notes.length}`);
  for (const n of notes) {
    await post('study_notes', 'save', {
      aluno_id: n.alunoId || n.aluno_id,
      plano_id: n.planoId || n.plano_id,
      topic_id: n.topicId || n.topic_id,
      note: n.note || '',
    });
    console.log(`  ✓ Nota: ${n.topicId || n.topic_id}`);
    await delay(200);
  }

  // ========== GAMIFICACAO ==========
  const gam = db.gamificacao || [];
  console.log(`\n📋 Gamificação: ${gam.length}`);
  for (const g of gam) {
    await post('gamificacao', 'setMeta', {
      aluno_id: g.alunoId || g.aluno_id,
      week_goal: g.weekGoal || g.week_goal || 5,
    });
    console.log(`  ✓ ${g.alunoId || g.aluno_id}`);
    await delay(200);
  }

  // ========== SIMULADOS ==========
  const simulados = db.simulados || [];
  console.log(`\n📋 Simulados: ${simulados.length}`);
  for (const sim of simulados) {
    await post('simulados', 'create', {
      id: sim.id,
      coach_id: sim.coachId || sim.coach_id || '',
      edital_id: sim.editalId || sim.edital_id || '',
      nome: sim.nome || '',
      tipo: sim.tipo || 'geral',
      materia_id: sim.materiaId || sim.materia_id || '',
      descricao: sim.descricao || '',
      alunos_permitidos: sim.alunosPermitidos || sim.alunos_permitidos || null,
    });
    console.log(`  ✓ Simulado: ${sim.nome}`);
    await delay(200);
  }

  // ========== QUESTOES ==========
  const questoes = db.questoes || [];
  console.log(`\n📋 Questões: ${questoes.length}`);
  for (const q of questoes) {
    await post('questoes', 'create', {
      id: q.id,
      simulado_id: q.simuladoId || q.simulado_id || '',
      tipo: q.tipo || 'ce',
      enunciado: q.enunciado || '',
      alternativas: q.alternativas || [],
      gabarito: q.gabarito || '',
      ordem: q.ordem || 0,
    });
    await delay(200);
  }
  if (questoes.length) console.log(`  ✓ ${questoes.length} questões migradas`);

  // ========== TENTATIVAS ==========
  const tentativas = db.tentativas || [];
  console.log(`\n📋 Tentativas: ${tentativas.length}`);
  for (const t of tentativas) {
    await post('tentativas', 'create', {
      id: t.id,
      simulado_id: t.simuladoId || t.simulado_id || '',
      aluno_id: t.alunoId || t.aluno_id || '',
    });
    // Se já finalizada, atualiza com os dados
    if (t.status === 'finalizada' || t.finishedAt) {
      await post('tentativas', 'update', {
        id: t.id,
        data: {
          respostas: t.respostas || [],
          status: t.status || 'finalizada',
          acertos: t.acertos || 0,
          erros: t.erros || 0,
          brancos: t.brancos || 0,
          pontos_cebraspe: t.pontosCebraspe || t.pontos_cebraspe || '',
          percentual: t.percentual || 0,
          tempo_gasto: t.tempoGasto || t.tempo_gasto || 0,
          finished_at: t.finishedAt || t.finished_at || '',
        }
      });
    }
    await delay(200);
  }
  if (tentativas.length) console.log(`  ✓ ${tentativas.length} tentativas migradas`);

  // ========== BATALHAS ==========
  const batalhas = db.batalhas || [];
  console.log(`\n📋 Batalhas: ${batalhas.length}`);
  for (const b of batalhas) {
    await post('batalhas', 'create', {
      id: b.id,
      nome: b.nome || '',
      coach_id: b.coachId || b.coach_id || '',
      simulado_id: b.simuladoId || b.simulado_id || '',
      data_fim: b.dataFim || b.data_fim || '',
      tempo_limite: b.tempoLimite || b.tempo_limite || '',
    });
    // Participantes
    const parts = b.participantes || [];
    for (const p of parts) {
      await post('batalha_participantes', 'create', {
        batalha_id: b.id,
        aluno_id: p.alunoId || p.aluno_id || '',
        tentativa_id: p.tentativaId || p.tentativa_id || '',
        finalizado: p.finalizado || false,
        acertos: p.acertos || 0,
        erros: p.erros || 0,
        brancos: p.brancos || 0,
        pontos_cebraspe: p.pontosCebraspe || '',
        percentual: p.percentual || 0,
        tempo_gasto: p.tempoGasto || 0,
      });
      await delay(100);
    }
    console.log(`  ✓ Batalha: ${b.nome} (${parts.length} participantes)`);
    await delay(200);
  }

  // ========== FEEDBACK_SIMULADO ==========
  const feedbacks = db.feedbackSimulado || [];
  console.log(`\n📋 Feedbacks: ${feedbacks.length}`);
  for (const fb of feedbacks) {
    await post('feedback_simulado', 'save', {
      tentativa_id: fb.tentativaId || fb.tentativa_id || '',
      simulado_id: fb.simuladoId || fb.simulado_id || '',
      aluno_id: fb.alunoId || fb.aluno_id || '',
      coach_id: fb.coachId || fb.coach_id || '',
      comentarios_questoes: fb.comentariosQuestoes || fb.comentarios_questoes || [],
      orientacoes_gerais: fb.orientacoesGerais || fb.orientacoes_gerais || '',
      sugestoes_conteudo: fb.sugestoesConteudo || fb.sugestoes_conteudo || '',
      temas_revisar: fb.temasRevisar || fb.temas_revisar || '',
      status: fb.status || 'rascunho',
    });
    console.log(`  ✓ Feedback: ${fb.tentativaId || fb.tentativa_id}`);
    await delay(200);
  }

  // ========== RESUMO_COMMENTS ==========
  const rComments = db.resumoComments || [];
  console.log(`\n📋 Resumo Comments: ${rComments.length}`);
  for (const rc of rComments) {
    await post('resumo_comments', 'save', {
      aluno_id: rc.alunoId || rc.aluno_id || '',
      plano_id: rc.planoId || rc.plano_id || '',
      topic_id: rc.topicId || rc.topic_id || '',
      coach_id: rc.coachId || rc.coach_id || '',
      coach_comment: rc.coachComment || rc.coach_comment || '',
    });
    await delay(200);
  }
  if (rComments.length) console.log(`  ✓ ${rComments.length} comments migrados`);

  // ========== RESUMO_ADDITIONS ==========
  const rAdditions = db.resumoAdditions || [];
  console.log(`\n📋 Resumo Additions: ${rAdditions.length}`);
  for (const ra of rAdditions) {
    await post('resumo_additions', 'save', {
      aluno_id: ra.alunoId || ra.aluno_id || '',
      plano_id: ra.planoId || ra.plano_id || '',
      topic_id: ra.topicId || ra.topic_id || '',
      coach_id: ra.coachId || ra.coach_id || '',
      addition: ra.addition || '',
    });
    await delay(200);
  }
  if (rAdditions.length) console.log(`  ✓ ${rAdditions.length} additions migrados`);

  // ========== LOGS ==========
  const logs = db.logs || [];
  console.log(`\n📋 Logs: ${logs.length}`);
  for (const l of logs) {
    await post('logs', 'add', {
      actor_id: l.actorId || l.actor_id || 'system',
      message: l.message || '',
      meta: l.meta || {},
    });
    await delay(100);
  }
  if (logs.length) console.log(`  ✓ ${logs.length} logs migrados`);

  console.log('\n\n✅ ========== MIGRAÇÃO CONCLUÍDA ==========');
  console.log(`   Users: ${users.length}`);
  console.log(`   Editais: ${editais.length}`);
  console.log(`   Matérias: ${editais.reduce((s,e)=>(e.materias||[]).length+s,0)}`);
  console.log(`   Tópicos: ${editais.reduce((s,e)=>(e.materias||[]).reduce((s2,m)=>(m.topicos||[]).length+s2,0)+s,0)}`);
  console.log(`   Aluno↔Editais: ${alunoEditais.length}`);
  console.log(`   Planos: ${planos.length}`);
  console.log(`   Progresso: ${progresso.length}`);
  console.log(`   Study Notes: ${notes.length}`);
  console.log(`   Simulados: ${simulados.length}`);
  console.log(`   Questões: ${questoes.length}`);
  console.log(`   Tentativas: ${tentativas.length}`);
  console.log(`   Batalhas: ${batalhas.length}`);
  console.log(`   Feedbacks: ${feedbacks.length}`);
  console.log(`   Logs: ${logs.length}`);
}

migrate().catch(e => console.error('❌ Erro fatal:', e));
