// ============================================================
// EstudaAI — Script de Migração: defaultDB → Google Sheets
// ============================================================
// Como usar:
// 1. Abra o navegador em http://localhost:5173 (ou qualquer página)
// 2. Abra o Console (F12 > Console)
// 3. Cole este script inteiro e aperte Enter
// 4. Aguarde as mensagens de progresso
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbyhT495ELPbDX_d9ph28WbFzUYzTdwu5sau9LkUZu7-FbReLWuXpC2I8GjuJrE3ZOVWGA/exec';

async function post(module, action, body = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ module, action, ...body }),
  });
  return await res.json();
}

async function migrate() {
  console.log('🚀 Iniciando migração...');

  // ========== USERS ==========
  const users = [
    { id: "u1", name: "Administrador", email: "admin@estudaai.com", role: "admin", coach_id: "", avatar_url: "" },
    { id: "u2", name: "Prof. Carlos", email: "carlos@estudaai.com", role: "coach", coach_id: "", avatar_url: "" },
    { id: "u3", name: "Ana Lima", email: "ana@estudaai.com", role: "aluno", coach_id: "u2", avatar_url: "" },
  ];
  console.log('📋 Migrando users...');
  for (const u of users) {
    const r = await post('users', 'create', u);
    console.log('  ✓ User:', u.name, r.status);
  }

  // ========== EDITAIS ==========
  const editais = [
    { id: "ed1", name: "Concurso TRT 2025", coach_id: "u2" },
    { id: "ed2", name: "Auditor de Controle Externo — TCE-RJ", coach_id: "u2" },
  ];
  console.log('📋 Migrando editais...');
  for (const e of editais) {
    const r = await post('editais', 'create', e);
    console.log('  ✓ Edital:', e.name, r.status);
  }

  // ========== MATERIAS ==========
  const materias = [
    // ed1
    { id: "m1", edital_id: "ed1", name: "Direito Constitucional", color: "#6366f1", review_preset: "moderada", ordem: 0 },
    { id: "m2", edital_id: "ed1", name: "Língua Portuguesa", color: "#ec4899", review_preset: "moderada", ordem: 1 },
    { id: "m3", edital_id: "ed1", name: "Raciocínio Lógico", color: "#14b8a6", review_preset: "moderada", ordem: 2 },
    // ed2
    { id: "m20", edital_id: "ed2", name: "Língua Portuguesa", color: "#ec4899", review_preset: "moderada", ordem: 0 },
    { id: "m21", edital_id: "ed2", name: "Administração Pública", color: "#6366f1", review_preset: "moderada", ordem: 1 },
    { id: "m22", edital_id: "ed2", name: "Ética no Serviço Público", color: "#14b8a6", review_preset: "moderada", ordem: 2 },
    { id: "m23", edital_id: "ed2", name: "Legislação Institucional", color: "#f59e0b", review_preset: "moderada", ordem: 3 },
    { id: "m24", edital_id: "ed2", name: "Auditoria Governamental", color: "#ef4444", review_preset: "moderada", ordem: 4 },
    { id: "m25", edital_id: "ed2", name: "Contabilidade Pública", color: "#8b5cf6", review_preset: "moderada", ordem: 5 },
    { id: "m26", edital_id: "ed2", name: "Administração Financeira e Orçamentária (AFO)", color: "#22d3ee", review_preset: "moderada", ordem: 6 },
  ];
  console.log('📋 Migrando materias...');
  for (const m of materias) {
    const r = await post('materias', 'create', m);
    console.log('  ✓ Matéria:', m.name, r.status);
  }

  // ========== TOPICOS ==========
  const topicos = [
    // m1 - Direito Constitucional
    { id: "t1", materia_id: "m1", name: "Princípios Fundamentais", ordem: 0 },
    { id: "t2", materia_id: "m1", name: "Direitos Fundamentais", ordem: 1 },
    { id: "t3", materia_id: "m1", name: "Organização do Estado", ordem: 2 },
    { id: "t4", materia_id: "m1", name: "Poder Legislativo", ordem: 3 },
    // m2 - Língua Portuguesa (ed1)
    { id: "t5", materia_id: "m2", name: "Fonologia", ordem: 0 },
    { id: "t6", materia_id: "m2", name: "Morfologia", ordem: 1 },
    { id: "t7", materia_id: "m2", name: "Sintaxe", ordem: 2 },
    // m3 - Raciocínio Lógico
    { id: "t8", materia_id: "m3", name: "Proposições", ordem: 0 },
    { id: "t9", materia_id: "m3", name: "Tabela Verdade", ordem: 1 },
    // m20 - Língua Portuguesa (ed2)
    { id: "t200", materia_id: "m20", name: "Compreensão e interpretação de textos", ordem: 0 },
    { id: "t201", materia_id: "m20", name: "Tipologia textual", ordem: 1 },
    { id: "t202", materia_id: "m20", name: "Ortografia oficial", ordem: 2 },
    { id: "t203", materia_id: "m20", name: "Acentuação gráfica", ordem: 3 },
    { id: "t204", materia_id: "m20", name: "Emprego das classes de palavras", ordem: 4 },
    { id: "t205", materia_id: "m20", name: "Emprego do sinal indicativo de crase", ordem: 5 },
    { id: "t206", materia_id: "m20", name: "Sintaxe da oração e do período", ordem: 6 },
    { id: "t207", materia_id: "m20", name: "Pontuação", ordem: 7 },
    { id: "t208", materia_id: "m20", name: "Concordância nominal e verbal", ordem: 8 },
    { id: "t209", materia_id: "m20", name: "Regência nominal e verbal", ordem: 9 },
    { id: "t210", materia_id: "m20", name: "Significação das palavras", ordem: 10 },
    { id: "t211", materia_id: "m20", name: "Redação oficial (princípios e pronomes de tratamento)", ordem: 11 },
    // m21 - Administração Pública
    { id: "t212", materia_id: "m21", name: "Estado, governo e administração pública: conceitos, elementos, poderes e organização; natureza, fins e princípios", ordem: 0 },
    { id: "t213", materia_id: "m21", name: "Organização administrativa do Estado", ordem: 1 },
    { id: "t214", materia_id: "m21", name: "Administração direta e indireta", ordem: 2 },
    { id: "t215", materia_id: "m21", name: "Agentes públicos: espécies e classificação; poderes, deveres e prerrogativas; cargo, emprego e função públicos", ordem: 3 },
    { id: "t216", materia_id: "m21", name: "Poderes administrativos", ordem: 4 },
    { id: "t217", materia_id: "m21", name: "Atos administrativos: conceitos, requisitos, atributos, classificação, espécies e invalidação", ordem: 5 },
    { id: "t218", materia_id: "m21", name: "Controle e responsabilização da administração: controle administrativo, judicial e legislativo; responsabilidade civil do Estado", ordem: 6 },
    { id: "t219", materia_id: "m21", name: "Governabilidade, governança e accountability", ordem: 7 },
    { id: "t220", materia_id: "m21", name: "Planejamento e controle governamentais", ordem: 8 },
    { id: "t221", materia_id: "m21", name: "Gerenciamento e avaliação de políticas públicas", ordem: 9 },
    // m22 - Ética
    { id: "t222", materia_id: "m22", name: "Resolução nº 335/2019 (Código de Ética dos Servidores do TCE-RJ)", ordem: 0 },
    // m23 - Legislação Institucional
    { id: "t223", materia_id: "m23", name: "Deliberação nº 338/2023 (Regimento Interno do TCE-RJ)", ordem: 0 },
    { id: "t224", materia_id: "m23", name: "Lei Complementar nº 63/1990 (Lei Orgânica do TCE-RJ)", ordem: 1 },
    { id: "t225", materia_id: "m23", name: "Lei Estadual nº 4.787/2006 (Quadro de Pessoal e Plano de Carreiras do TCE-RJ)", ordem: 2 },
    { id: "t226", materia_id: "m23", name: "Decreto-Lei Estadual nº 220/1975 (Estatuto dos Funcionários Públicos Civis do ERJ)", ordem: 3 },
    { id: "t227", materia_id: "m23", name: "Decreto Estadual nº 2.479/1979 (Regulamento do Estatuto dos Funcionários Públicos Civis do ERJ)", ordem: 4 },
    // m24 - Auditoria Governamental
    { id: "t228", materia_id: "m24", name: "Normas de auditoria do TCU (Portaria-TCU nº 280/2010)", ordem: 0 },
    { id: "t229", materia_id: "m24", name: "Técnicas e Controle: Auditoria e Fiscalização", ordem: 1 },
    { id: "t230", materia_id: "m24", name: "Papéis de trabalho, nota, relatório, registro de constatações, certificado e parecer", ordem: 2 },
    { id: "t231", materia_id: "m24", name: "Amostragem (IN nº 01/2001 - SFCI)", ordem: 3 },
    { id: "t232", materia_id: "m24", name: "Controle externo no setor público federal", ordem: 4 },
    { id: "t233", materia_id: "m24", name: "Normas de Auditoria do TCU – NAT: classificação e objetivos da auditoria", ordem: 5 },
    { id: "t234", materia_id: "m24", name: "Identificação e avaliação de objetivos, riscos e controles", ordem: 6 },
    { id: "t235", materia_id: "m24", name: "Comunicação com o auditado e requisições de documentos e informações", ordem: 7 },
    { id: "t236", materia_id: "m24", name: "Planejamento e execução de auditorias", ordem: 8 },
    { id: "t237", materia_id: "m24", name: "Relatório de auditoria", ordem: 9 },
    { id: "t238", materia_id: "m24", name: "Regimento Interno do TCU: atividade de controle externo", ordem: 10 },
    { id: "t239", materia_id: "m24", name: "Prestação de Contas e Relatório de Gestão: IN nº 63/2010 do TCU", ordem: 11 },
    { id: "t240", materia_id: "m24", name: "Da fiscalização contábil, financeira e orçamentária", ordem: 12 },
    { id: "t241", materia_id: "m24", name: "Lei Complementar nº 101/2000 (LRF): transparência, controle e fiscalização", ordem: 13 },
    { id: "t242", materia_id: "m24", name: "Lei nº 4.320/1964: Título VIII – Controle da execução orçamentária", ordem: 14 },
    { id: "t243", materia_id: "m24", name: "Execução de auditoria nas contas patrimoniais e de resultados", ordem: 15 },
    { id: "t244", materia_id: "m24", name: "Normas vigentes do CFC: Normas Profissionais de Auditor Independente (NBC PAs)", ordem: 16 },
    { id: "t245", materia_id: "m24", name: "NBC TA 200 – Objetivos gerais do auditor e condução da auditoria", ordem: 17 },
    { id: "t246", materia_id: "m24", name: "NBC TA 230 – Documentação de auditoria", ordem: 18 },
    { id: "t247", materia_id: "m24", name: "NBC TA 240 – Responsabilidade do auditor em relação à fraude", ordem: 19 },
    { id: "t248", materia_id: "m24", name: "Série 700 das NBC TAs – Formação da opinião e emissão do relatório", ordem: 20 },
    { id: "t249", materia_id: "m24", name: "NBC TI 01 – Auditoria Interna", ordem: 21 },
    { id: "t250", materia_id: "m24", name: "NBC PI 01 – Normas Profissionais do Auditor Interno", ordem: 22 },
    { id: "t251", materia_id: "m24", name: "NBASP – Normas Brasileiras de Auditoria do Setor Público", ordem: 23 },
    // m25 - Contabilidade Pública
    { id: "t252", materia_id: "m25", name: "Conceito, objeto e regime", ordem: 0 },
    { id: "t253", materia_id: "m25", name: "Campo de aplicação", ordem: 1 },
    { id: "t254", materia_id: "m25", name: "Conceitos e princípios básicos da Lei nº 4.320/1964", ordem: 2 },
    { id: "t255", materia_id: "m25", name: "Plano Plurianual (PPA), Lei de Diretrizes Orçamentárias (LDO) e Lei Orçamentária Anual (LOA)", ordem: 3 },
    { id: "t256", materia_id: "m25", name: "Balanço financeiro, patrimonial, orçamentário e demonstrativo das variações", ordem: 4 },
    { id: "t257", materia_id: "m25", name: "Registros contábeis de operações", ordem: 5 },
    { id: "t258", materia_id: "m25", name: "Orçamento público: elaboração, acompanhamento e fiscalização", ordem: 6 },
    { id: "t259", materia_id: "m25", name: "Créditos adicionais: especiais, extraordinários, ilimitados e suplementares", ordem: 7 },
    { id: "t260", materia_id: "m25", name: "Princípios orçamentários", ordem: 8 },
    { id: "t261", materia_id: "m25", name: "Diretrizes orçamentárias", ordem: 9 },
    { id: "t262", materia_id: "m25", name: "Processo orçamentário", ordem: 10 },
    { id: "t263", materia_id: "m25", name: "Suprimento de fundos", ordem: 11 },
    { id: "t264", materia_id: "m25", name: "Restos a pagar", ordem: 12 },
    { id: "t265", materia_id: "m25", name: "Despesas de exercícios anteriores", ordem: 13 },
    { id: "t266", materia_id: "m25", name: "Conta única do Tesouro", ordem: 14 },
    { id: "t267", materia_id: "m25", name: "Tomadas e prestações de contas", ordem: 15 },
    { id: "t268", materia_id: "m25", name: "Controladoria", ordem: 16 },
    { id: "t269", materia_id: "m25", name: "Auditoria", ordem: 17 },
    { id: "t270", materia_id: "m25", name: "MCASP – 10ª edição", ordem: 18 },
    { id: "t271", materia_id: "m25", name: "Sistema de Planejamento e Orçamento e de Programação Financeira (Lei nº 10.180/2001)", ordem: 19 },
    { id: "t272", materia_id: "m25", name: "NBCASP – Normas Brasileiras de Contabilidade Aplicadas ao Setor Público", ordem: 20 },
    { id: "t273", materia_id: "m25", name: "SIAFI – Sistema Integrado de Administração Financeira do Governo Federal", ordem: 21 },
    // m26 - AFO
    { id: "t274", materia_id: "m26", name: "Orçamento público: conceito, noções gerais, campo de atuação, ciclo orçamentário e princípios orçamentários; créditos adicionais", ordem: 0 },
    { id: "t275", materia_id: "m26", name: "Orçamento-programa: conceito e finalidade", ordem: 1 },
    { id: "t276", materia_id: "m26", name: "Instrumentos de planejamento governamental: PPA, LDO e LOA", ordem: 2 },
    { id: "t277", materia_id: "m26", name: "Reserva de contingência", ordem: 3 },
    { id: "t278", materia_id: "m26", name: "Contingenciamento de dotações", ordem: 4 },
    { id: "t279", materia_id: "m26", name: "Receita pública: conceito, classificações e estágios; receita orçamentária e extraorçamentária", ordem: 5 },
    { id: "t280", materia_id: "m26", name: "Despesa pública: conceito, classificações e estágios; despesa orçamentária e extraorçamentária", ordem: 6 },
    { id: "t281", materia_id: "m26", name: "Restos a pagar (AFO)", ordem: 7 },
    { id: "t282", materia_id: "m26", name: "Despesas de exercícios anteriores (AFO)", ordem: 8 },
    { id: "t283", materia_id: "m26", name: "Fundos especiais", ordem: 9 },
  ];

  // Enviar tópicos em batches por matéria para não estourar timeout
  console.log('📋 Migrando tópicos (' + topicos.length + ' total)...');
  const materiaIds = [...new Set(topicos.map(t => t.materia_id))];
  for (const mid of materiaIds) {
    const batch = topicos.filter(t => t.materia_id === mid);
    const r = await post('topicos', 'createBatch', { items: batch });
    console.log('  ✓ Tópicos matéria ' + mid + ': ' + batch.length + ' itens -', r.status);
  }

  // ========== ALUNO_EDITAIS ==========
  console.log('📋 Migrando aluno_editais...');
  await post('aluno_editais', 'associar', { aluno_id: "u3", edital_id: "ed1" });
  console.log('  ✓ Ana → ed1');
  await post('aluno_editais', 'associar', { aluno_id: "u3", edital_id: "ed2" });
  console.log('  ✓ Ana → ed2');

  console.log('');
  console.log('✅ Migração concluída!');
  console.log('   - 3 users');
  console.log('   - 2 editais');
  console.log('   - ' + materias.length + ' matérias');
  console.log('   - ' + topicos.length + ' tópicos');
  console.log('   - 2 associações aluno↔edital');
}

migrate().catch(e => console.error('❌ Erro na migração:', e));
