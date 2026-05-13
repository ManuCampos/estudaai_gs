// ============================================================
// EstudaAI — Sistema de Gestão de Estudos v4.1
// Arquitetura modular: auth / users / editais / planos / progresso
// Perfis: Admin | Coach | Aluno
// Persistência: Supabase (PostgreSQL)
// ============================================================

import { useState, useRef, createContext, useContext, useEffect, Component } from "react";
import { createClient } from "@supabase/supabase-js";
import { initGoogleAuth, renderGoogleButton, googleLogout } from "./googleAuth.js";
import { sheetsUsersModule } from "./sheetsApi.js";

// ============================================================
// SUPABASE — Cliente e persistência
// ============================================================
const SUPABASE_URL = "https://ogmlsmmybqmrnrilzesg.supabase.co";
const SUPABASE_KEY = "sb_publishable_dsUx1e6SQo_yuXg77NN-MA_HEL33DSo";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Controle de sincronização — evita que abas com dados antigos sobrescrevam mudanças
// feitas em outra aba/dispositivo. Usa concorrência otimista via comparação de updated_at.
let _persistTimer = null;
let _lastSyncedAt = null;   // updated_at do snapshot que está em _db
let _isReloading  = false;  // evita reload reentrante
let _onRemoteReload = null; // callback opcional disparado quando recarregamos do servidor

function persistToSupabase(db) {
  clearTimeout(_persistTimer);
  _persistTimer = setTimeout(async () => {
    if (_isReloading) return;
    try {
      const now = new Date().toISOString();
      // Primeira escrita (ou registro ainda inexistente) — upsert seguro
      if (!_lastSyncedAt) {
        const { data, error } = await supabase
          .from("app_state")
          .upsert({ id: "main", data: db, updated_at: now })
          .select();
        if (!error) _lastSyncedAt = (data && data[0]?.updated_at) || now;
        else console.warn("[EstudaAI] Supabase upsert error:", error);
        return;
      }
      // Escritas seguintes: só atualiza se o updated_at remoto continuar
      // sendo o mesmo que carregamos. Se outra aba escreveu nesse meio-tempo,
      // 0 linhas serão afetadas e nós recarregamos em vez de sobrescrever.
      const { data: updatedRows, error } = await supabase
        .from("app_state")
        .update({ data: db, updated_at: now })
        .eq("id", "main")
        .eq("updated_at", _lastSyncedAt)
        .select();
      if (error) {
        console.warn("[EstudaAI] Supabase update error:", error);
        return;
      }
      if (!updatedRows || updatedRows.length === 0) {
        console.warn("[EstudaAI] Conflito detectado — outra aba/dispositivo alterou os dados. Recarregando para evitar sobrescrita.");
        await storage.load();
        if (typeof _onRemoteReload === "function") _onRemoteReload();
        return;
      }
      _lastSyncedAt = now;
    } catch (e) {
      console.warn("[EstudaAI] Supabase persist error:", e);
    }
  }, 800);
}

// ============================================================
// MODULE: storage — Banco de dados em memória (singleton)
// ============================================================
const defaultDB = {
  users: [
    { id: "u1", name: "Administrador", email: "admin@estudaai.com", password: "admin123", role: "admin", createdAt: "2025-01-01T00:00:00.000Z" },
    { id: "u2", name: "Prof. Carlos", email: "carlos@estudaai.com", password: "coach123", role: "coach", createdAt: "2025-01-01T00:00:00.000Z" },
    { id: "u3", name: "Ana Lima", email: "ana@estudaai.com", password: "aluno123", role: "aluno", coachId: "u2", createdAt: "2025-01-01T00:00:00.000Z" },
  ],
  editais: [
    {
      id: "ed1", name: "Concurso TRT 2025", coachId: "u2",
      materias: [
        { id: "m1", name: "Direito Constitucional", color: "#6366f1", topicos: [
          { id: "t1", name: "Princípios Fundamentais" },
          { id: "t2", name: "Direitos Fundamentais" },
          { id: "t3", name: "Organização do Estado" },
          { id: "t4", name: "Poder Legislativo" },
        ]},
        { id: "m2", name: "Língua Portuguesa", color: "#ec4899", topicos: [
          { id: "t5", name: "Fonologia" },
          { id: "t6", name: "Morfologia" },
          { id: "t7", name: "Sintaxe" },
        ]},
        { id: "m3", name: "Raciocínio Lógico", color: "#14b8a6", topicos: [
          { id: "t8", name: "Proposições" },
          { id: "t9", name: "Tabela Verdade" },
        ]},
      ],
    },
  {
    id: "ed2", name: "Auditor de Controle Externo — TCE-RJ", coachId: "u2",
    materias: [
      { id: "m20", name: "Língua Portuguesa", color: "#ec4899", topicos: [
        { id: "t200", name: "Compreensão e interpretação de textos" },
        { id: "t201", name: "Tipologia textual" },
        { id: "t202", name: "Ortografia oficial" },
        { id: "t203", name: "Acentuação gráfica" },
        { id: "t204", name: "Emprego das classes de palavras" },
        { id: "t205", name: "Emprego do sinal indicativo de crase" },
        { id: "t206", name: "Sintaxe da oração e do período" },
        { id: "t207", name: "Pontuação" },
        { id: "t208", name: "Concordância nominal e verbal" },
        { id: "t209", name: "Regência nominal e verbal" },
        { id: "t210", name: "Significação das palavras" },
        { id: "t211", name: "Redação oficial (princípios e pronomes de tratamento)" },
      ]},
      { id: "m21", name: "Administração Pública", color: "#6366f1", topicos: [
        { id: "t212", name: "Estado, governo e administração pública: conceitos, elementos, poderes e organização; natureza, fins e princípios" },
        { id: "t213", name: "Organização administrativa do Estado" },
        { id: "t214", name: "Administração direta e indireta" },
        { id: "t215", name: "Agentes públicos: espécies e classificação; poderes, deveres e prerrogativas; cargo, emprego e função públicos" },
        { id: "t216", name: "Poderes administrativos" },
        { id: "t217", name: "Atos administrativos: conceitos, requisitos, atributos, classificação, espécies e invalidação" },
        { id: "t218", name: "Controle e responsabilização da administração: controle administrativo, judicial e legislativo; responsabilidade civil do Estado" },
        { id: "t219", name: "Governabilidade, governança e accountability" },
        { id: "t220", name: "Planejamento e controle governamentais" },
        { id: "t221", name: "Gerenciamento e avaliação de políticas públicas" },
      ]},
      { id: "m22", name: "Ética no Serviço Público", color: "#14b8a6", topicos: [
        { id: "t222", name: "Resolução nº 335/2019 (Código de Ética dos Servidores do TCE-RJ)" },
      ]},
      { id: "m23", name: "Legislação Institucional", color: "#f59e0b", topicos: [
        { id: "t223", name: "Deliberação nº 338/2023 (Regimento Interno do TCE-RJ)" },
        { id: "t224", name: "Lei Complementar nº 63/1990 (Lei Orgânica do TCE-RJ)" },
        { id: "t225", name: "Lei Estadual nº 4.787/2006 (Quadro de Pessoal e Plano de Carreiras do TCE-RJ)" },
        { id: "t226", name: "Decreto-Lei Estadual nº 220/1975 (Estatuto dos Funcionários Públicos Civis do ERJ)" },
        { id: "t227", name: "Decreto Estadual nº 2.479/1979 (Regulamento do Estatuto dos Funcionários Públicos Civis do ERJ)" },
      ]},
      { id: "m24", name: "Auditoria Governamental", color: "#ef4444", topicos: [
        { id: "t228", name: "Normas de auditoria do TCU (Portaria-TCU nº 280/2010)" },
        { id: "t229", name: "Técnicas e Controle: Auditoria e Fiscalização" },
        { id: "t230", name: "Papéis de trabalho, nota, relatório, registro de constatações, certificado e parecer" },
        { id: "t231", name: "Amostragem (IN nº 01/2001 - SFCI)" },
        { id: "t232", name: "Controle externo no setor público federal" },
        { id: "t233", name: "Normas de Auditoria do TCU – NAT: classificação e objetivos da auditoria" },
        { id: "t234", name: "Identificação e avaliação de objetivos, riscos e controles" },
        { id: "t235", name: "Comunicação com o auditado e requisições de documentos e informações" },
        { id: "t236", name: "Planejamento e execução de auditorias" },
        { id: "t237", name: "Relatório de auditoria" },
        { id: "t238", name: "Regimento Interno do TCU: atividade de controle externo" },
        { id: "t239", name: "Prestação de Contas e Relatório de Gestão: IN nº 63/2010 do TCU" },
        { id: "t240", name: "Da fiscalização contábil, financeira e orçamentária" },
        { id: "t241", name: "Lei Complementar nº 101/2000 (LRF): transparência, controle e fiscalização" },
        { id: "t242", name: "Lei nº 4.320/1964: Título VIII – Controle da execução orçamentária" },
        { id: "t243", name: "Execução de auditoria nas contas patrimoniais e de resultados" },
        { id: "t244", name: "Normas vigentes do CFC: Normas Profissionais de Auditor Independente (NBC PAs)" },
        { id: "t245", name: "NBC TA 200 – Objetivos gerais do auditor e condução da auditoria" },
        { id: "t246", name: "NBC TA 230 – Documentação de auditoria" },
        { id: "t247", name: "NBC TA 240 – Responsabilidade do auditor em relação à fraude" },
        { id: "t248", name: "Série 700 das NBC TAs – Formação da opinião e emissão do relatório" },
        { id: "t249", name: "NBC TI 01 – Auditoria Interna" },
        { id: "t250", name: "NBC PI 01 – Normas Profissionais do Auditor Interno" },
        { id: "t251", name: "NBASP – Normas Brasileiras de Auditoria do Setor Público" },
      ]},
      { id: "m25", name: "Contabilidade Pública", color: "#8b5cf6", topicos: [
        { id: "t252", name: "Conceito, objeto e regime" },
        { id: "t253", name: "Campo de aplicação" },
        { id: "t254", name: "Conceitos e princípios básicos da Lei nº 4.320/1964" },
        { id: "t255", name: "Plano Plurianual (PPA), Lei de Diretrizes Orçamentárias (LDO) e Lei Orçamentária Anual (LOA)" },
        { id: "t256", name: "Balanço financeiro, patrimonial, orçamentário e demonstrativo das variações" },
        { id: "t257", name: "Registros contábeis de operações" },
        { id: "t258", name: "Orçamento público: elaboração, acompanhamento e fiscalização" },
        { id: "t259", name: "Créditos adicionais: especiais, extraordinários, ilimitados e suplementares" },
        { id: "t260", name: "Princípios orçamentários" },
        { id: "t261", name: "Diretrizes orçamentárias" },
        { id: "t262", name: "Processo orçamentário" },
        { id: "t263", name: "Suprimento de fundos" },
        { id: "t264", name: "Restos a pagar" },
        { id: "t265", name: "Despesas de exercícios anteriores" },
        { id: "t266", name: "Conta única do Tesouro" },
        { id: "t267", name: "Tomadas e prestações de contas" },
        { id: "t268", name: "Controladoria" },
        { id: "t269", name: "Auditoria" },
        { id: "t270", name: "MCASP – 10ª edição" },
        { id: "t271", name: "Sistema de Planejamento e Orçamento e de Programação Financeira (Lei nº 10.180/2001)" },
        { id: "t272", name: "NBCASP – Normas Brasileiras de Contabilidade Aplicadas ao Setor Público" },
        { id: "t273", name: "SIAFI – Sistema Integrado de Administração Financeira do Governo Federal" },
      ]},
      { id: "m26", name: "Administração Financeira e Orçamentária (AFO)", color: "#22d3ee", topicos: [
        { id: "t274", name: "Orçamento público: conceito, noções gerais, campo de atuação, ciclo orçamentário e princípios orçamentários; créditos adicionais" },
        { id: "t275", name: "Orçamento-programa: conceito e finalidade" },
        { id: "t276", name: "Instrumentos de planejamento governamental: PPA, LDO e LOA" },
        { id: "t277", name: "Reserva de contingência" },
        { id: "t278", name: "Contingenciamento de dotações" },
        { id: "t279", name: "Receita pública: conceito, classificações e estágios; receita orçamentária e extraorçamentária" },
        { id: "t280", name: "Despesa pública: conceito, classificações e estágios; despesa orçamentária e extraorçamentária" },
        { id: "t281", name: "Restos a pagar (AFO)" },
        { id: "t282", name: "Despesas de exercícios anteriores (AFO)" },
        { id: "t283", name: "Fundos especiais" },
      ]},
    ],
  },
  ],
  alunoEditais: [{ alunoId: "u3", editalId: "ed1" }, { alunoId: "u3", editalId: "ed2" }],
  planos: [],
  progresso: [],
  studyNotes: [],
  gamificacao: [],
  logs: [],
  simulados: [],
  questoes: [],
  tentativas: [],
  batalhas: [],
  feedbackSimulado: [],
  resumoComments: [],
  resumoAdditions: [],
  materialFiles: [],
};

// Singleton mutável — funciona como "banco em memória"
let _db = JSON.parse(JSON.stringify(defaultDB));
let _listeners = [];

const storage = {
  get() { return _db; },
  set(updater) {
    _db = typeof updater === "function" ? updater(_db) : { ..._db, ...updater };
    _listeners.forEach(fn => fn(_db));
    persistToSupabase(_db);
    return _db;
  },
  async load() {
    if (_isReloading) return;
    _isReloading = true;
    try {
      const { data, error } = await supabase
        .from("app_state")
        .select("data, updated_at")
        .eq("id", "main")
        .single();
      if (data?.data && !error) {
        _db = { ...defaultDB, ...data.data };
        _lastSyncedAt = data.updated_at || null;
        _listeners.forEach(fn => fn(_db));
      }
    } catch (e) {
      console.warn("[EstudaAI] Supabase load error:", e);
    } finally {
      _isReloading = false;
    }
  },
  onRemoteReload(fn) { _onRemoteReload = fn; },
  subscribe(fn) { _listeners.push(fn); return () => { _listeners = _listeners.filter(l => l !== fn); }; },
};

// ============================================================
// MODULE: auth
// ============================================================
let _session = null;

const authModule = {
  login(identifier, password) {
    const db = storage.get();
    const id = identifier.trim().toLowerCase();
    const user = db.users.find(u => {
      // Match por email completo, nome completo, ou username (parte antes do @)
      const emailMatch = u.email.toLowerCase() === id;
      const nameMatch = u.name.toLowerCase() === id;
      const usernameMatch = u.email.includes("@") && u.email.split("@")[0].toLowerCase() === id;
      return (emailMatch || nameMatch || usernameMatch) && u.password === password;
    });
    if (!user) return { success: false, error: "Usuário ou senha incorretos." };
    _session = user;
    return { success: true, user };
  },
  logout() { _session = null; },
  getSession() { return _session; },
  resetPassword(userId, newPassword) {
    storage.set(db => ({ ...db, users: db.users.map(u => u.id === userId ? { ...u, password: newPassword } : u) }));
    logModule.add("admin", `Senha resetada para usuário ${userId}`);
  },
};

// ============================================================
// MODULE: log
// ============================================================
const logModule = {
  add(actorId, message, meta = {}) {
    storage.set(db => ({
      ...db,
      logs: [...db.logs, { id: `log${Date.now()}${Math.random()}`, actorId, message, meta, createdAt: new Date().toISOString() }],
    }));
  },
  getAll() { return storage.get().logs; },
  getByUser(userId) { return storage.get().logs.filter(l => l.actorId === userId || l.meta?.targetId === userId); },
};

// ============================================================
// MODULE: users
// ============================================================
const usersModule = {
  getAll() { return storage.get().users; },
  getById(id) { return storage.get().users.find(u => u.id === id); },
  getCoaches() { return storage.get().users.filter(u => u.role === "coach"); },
  getAlunos(coachId = null) {
    const all = storage.get().users.filter(u => u.role === "aluno");
    return coachId ? all.filter(u => u.coachId === coachId) : all;
  },
  create(data) {
    const user = { id: `u${Date.now()}`, ...data, createdAt: new Date().toISOString() };
    storage.set(db => ({ ...db, users: [...db.users, user] }));
    logModule.add(data.createdBy || "system", `Usuário criado: ${data.name} (${data.role})`);
    return user;
  },
  update(id, data) {
    storage.set(db => ({ ...db, users: db.users.map(u => u.id === id ? { ...u, ...data } : u) }));
    logModule.add(data.updatedBy || "system", `Usuário atualizado: ${id}`);
  },
  delete(id) {
    storage.set(db => ({ ...db, users: db.users.filter(u => u.id !== id) }));
    logModule.add("system", `Usuário removido: ${id}`);
  },
};

// ============================================================
// MODULE: editais
// ============================================================
const editaisModule = {
  getAll() { return storage.get().editais; },
  getByCoach(coachId) { return storage.get().editais.filter(e => e.coachId === coachId); },
  getById(id) { return storage.get().editais.find(e => e.id === id); },
  create(data) {
    const edital = { id: `ed${Date.now()}`, ...data, materias: data.materias || [], createdAt: new Date().toISOString() };
    storage.set(db => ({ ...db, editais: [...db.editais, edital] }));
    return edital;
  },
  update(id, data) { storage.set(db => ({ ...db, editais: db.editais.map(e => e.id === id ? { ...e, ...data } : e) })); },
  delete(id) { storage.set(db => ({ ...db, editais: db.editais.filter(e => e.id !== id) })); },
  associarAluno(alunoId, editalId) {
    storage.set(db => {
      if (db.alunoEditais.find(ae => ae.alunoId === alunoId && ae.editalId === editalId)) return db;
      return { ...db, alunoEditais: [...db.alunoEditais, { alunoId, editalId }] };
    });
    logModule.add("coach", `Edital ${editalId} associado ao aluno ${alunoId}`);
  },
  desassociarAluno(alunoId, editalId) {
    storage.set(db => ({ ...db, alunoEditais: db.alunoEditais.filter(ae => !(ae.alunoId === alunoId && ae.editalId === editalId)) }));
  },
  getByAluno(alunoId) {
    const db = storage.get();
    const ids = db.alunoEditais.filter(ae => ae.alunoId === alunoId).map(ae => ae.editalId);
    return db.editais.filter(e => ids.includes(e.id));
  },
};

// ============================================================
// MODULE: planos
// ============================================================
const REVIEW_INTERVALS = [1, 7, 21, 30];
const REVIEW_PRESETS = {
  baixa:    [1, 14, 21],
  moderada: [1, 7, 21, 30],
  intensa:  [1, 7, 14, 21, 30],
};
const REVIEW_PRESET_LABELS = { baixa: "Baixa", moderada: "Moderada", intensa: "Intensa" };
const REVIEW_PRESET_DESCS  = { baixa: "3 revisões: 1, 14, 21d", moderada: "4 revisões: 1, 7, 21, 30d", intensa: "5 revisões: 1, 7, 14, 21, 30d" };

// Feriados nacionais fixos brasileiros (MM-DD)
const FERIADOS_FIXOS_BR = ["01-01","04-21","05-01","09-07","10-12","11-02","11-15","11-20","12-25"];
function isFeriadoBR(date) {
  const mm = String(date.getMonth()+1).padStart(2,"0");
  const dd = String(date.getDate()).padStart(2,"0");
  return FERIADOS_FIXOS_BR.includes(`${mm}-${dd}`);
}
// Avança para o próximo dia válido (estudo permitido e não feriado)
function proximoDiaUtil(date, aulasNoDiaFn, maxDias=30) {
  let d = new Date(date);
  let safety = 0;
  while ((aulasNoDiaFn(d.getDay()) === 0 || isFeriadoBR(d)) && safety < maxDias) {
    d.setDate(d.getDate() + 1);
    safety++;
  }
  return d;
}

const planosModule = {
  generate(alunoId, editalId, rotina) {
    if (!alunoId)  throw new Error("ID do aluno ausente.");
    if (!editalId) throw new Error("Selecione um edital.");
    if (!rotina || typeof rotina !== "object") throw new Error("Rotina inválida.");
    const edital = editaisModule.getById(editalId);
    if (!edital) throw new Error(`Edital "${editalId}" não encontrado. Peça ao seu coach para reassociar.`);
    if (!Array.isArray(edital.materias) || edital.materias.length === 0) {
      throw new Error(`O edital "${edital.name || editalId}" ainda não tem matérias cadastradas.`);
    }
    // Filter to selected materias (if provided), otherwise use all
    const materiaIds = rotina.materiaIds && rotina.materiaIds.length > 0 ? rotina.materiaIds : null;
    const materias = materiaIds
      ? edital.materias.filter(m => materiaIds.includes(m.id))
      : edital.materias;
    if (materias.length === 0) {
      throw new Error("Nenhuma matéria selecionada — escolha pelo menos uma.");
    }
    // Filter topics by coverage level (nivelCobertura)
    // nivelCobertura is now an array: ["baixa", "media", "alta"]
    const nivelCobertura = rotina.nivelCobertura || ["media"];
    const filtrarPorNivel = (topicos) => {
      return topicos.filter(t => {
        // If topic has no content fields set at all, always include it
        const temQualquerConteudo = (t.conteudoBaixa?.trim().length > 0) ||
                                    (t.conteudoMedia?.trim().length > 0) ||
                                    (t.conteudoAlta?.trim().length > 0);
        if (!temQualquerConteudo) return true;
        // Otherwise, include only if the selected nivel has content
        return nivelCobertura.some(nivel => {
          switch(nivel) {
            case "baixa": return t.conteudoBaixa?.trim().length > 0;
            case "media": return t.conteudoMedia?.trim().length > 0;
            case "alta": return t.conteudoAlta?.trim().length > 0;
            default: return false;
          }
        });
      });
    };
    // Build per-materia topic queues and distribute according to mode
    const modoOrganizacao = rotina.modoOrganizacao || "alternado";
    const queues = materias.map(m =>
      filtrarPorNivel(m.topicos).map(t => ({ ...t, materiaId: m.id, materiaName: m.name, materiaColor: m.color, materiaReviewPreset: m.reviewPreset || "moderada" }))
    );
    const allTopicos = [];
    if (modoOrganizacao === "sequencial") {
      // Sequential: all topics of each materia before moving to the next
      queues.forEach(q => allTopicos.push(...q));
    } else {
      // Alternated: round-robin interleaving
      let cursors = queues.map(() => 0);
      while (queues.some((q, i) => cursors[i] < q.length)) {
        for (let i = 0; i < queues.length; i++) {
          if (cursors[i] < queues[i].length) {
            allTopicos.push(queues[i][cursors[i]]);
            cursors[i]++;
          }
        }
      }
    }
    if (allTopicos.length === 0) {
      throw new Error("Nenhum tópico atende ao nível de cobertura selecionado. Tente incluir outros níveis (Baixa/Média/Alta) ou peça ao seu coach para preencher o conteúdo das matérias.");
    }
    // Sanidade da rotina: precisa ter ao menos um dia de estudo
    const _diasConfigCheck = rotina.diasConfig || null;
    const _aulasPorDiaCheck = rotina.aulasPorDia || 1;
    const _diasEstudoCheck = rotina.dias || [1, 2, 3, 4, 5];
    const totalAulasSemana = _diasConfigCheck
      ? Object.values(_diasConfigCheck).reduce((a, n) => a + (Number(n) || 0), 0)
      : _diasEstudoCheck.length * _aulasPorDiaCheck;
    if (totalAulasSemana <= 0) {
      throw new Error("Sua rotina não tem dia de estudo. Configure pelo menos um dia com aulas.");
    }
    const plan = {}, reviews = {};
    let topicIdx = 0;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    // Support both new diasConfig {0:0,1:2,...} and legacy {dias:[],aulasPorDia:n}
    const diasConfig = rotina.diasConfig || null;
    const aulasPorDia = rotina.aulasPorDia || 1;
    const diasEstudo = rotina.dias || [1, 2, 3, 4, 5];
    function aulasNoDia(dow) {
      if (diasConfig) return diasConfig[dow] || 0;
      return diasEstudo.includes(dow) ? aulasPorDia : 0;
    }
    let dayOffset = 0;
    const maxDays = allTopicos.length * 5 + 60;
    while (topicIdx < allTopicos.length && dayOffset < maxDays) {
      const d = new Date(start); d.setDate(d.getDate() + dayOffset);
      const dow = d.getDay();
      const key = localDateKey(d);
      if (!plan[key]) plan[key] = { date: key, topicos: [], reviews: [] };
      const aulasHoje = aulasNoDia(dow);
      if (aulasHoje > 0) {
        for (let a = 0; a < aulasHoje && topicIdx < allTopicos.length; a++) {
          plan[key].topicos.push({ ...allTopicos[topicIdx] });
          const reviewIntervals = REVIEW_PRESETS[allTopicos[topicIdx].materiaReviewPreset || "moderada"] || REVIEW_INTERVALS;
          reviewIntervals.forEach(interval => {
            // Move review to next dia útil (sem feriado, sem dia sem aula)
            let revDate = new Date(d); revDate.setDate(revDate.getDate() + interval);
            revDate = proximoDiaUtil(revDate, aulasNoDia);
            const revKey = localDateKey(revDate);
            if (!reviews[revKey]) reviews[revKey] = [];
            reviews[revKey].push({ ...allTopicos[topicIdx], reviewInterval: interval });
          });
          topicIdx++;
        }
      } // end aulasHoje > 0
      dayOffset++;
    }
    Object.entries(reviews).forEach(([key, revs]) => {
      if (!plan[key]) plan[key] = { date: key, topicos: [], reviews: [] };
      plan[key].reviews.push(...revs);
    });
    // Cap reviews per day — redistribute overflow to next study day
    const maxRevDay = rotina.maxRevisoesPorDia || 0;
    const minRevDay = rotina.minRevisoesPorDia || 0;
    if (maxRevDay > 0) {
      const sortedKeys = Object.keys(plan).sort();
      for (let i = 0; i < sortedKeys.length; i++) {
        const dk = sortedKeys[i];
        if (plan[dk].reviews.length > maxRevDay) {
          const overflow = plan[dk].reviews.splice(maxRevDay);
          let j = i + 1;
          while (j < sortedKeys.length && aulasNoDia(new Date(sortedKeys[j]+"T12:00:00").getDay()) === 0) j++;
          if (j < sortedKeys.length) {
            plan[sortedKeys[j]].reviews = [...overflow, ...plan[sortedKeys[j]].reviews];
          } else {
            // Extend plan by finding the next study day after the last key
            const lastDate = new Date(sortedKeys[sortedKeys.length-1]+"T12:00:00");
            let extDate = new Date(lastDate); extDate.setDate(extDate.getDate()+1);
            let safety3 = 0;
            while (aulasNoDia(extDate.getDay()) === 0 && safety3 < 14) { extDate.setDate(extDate.getDate()+1); safety3++; }
            const extKey = localDateKey(extDate);
            if (!plan[extKey]) plan[extKey] = { date: extKey, topicos: [], reviews: [] };
            plan[extKey].reviews.push(...overflow);
            sortedKeys.push(extKey);
          }
        }
      }
    }
    const plano = { id: `pl${Date.now()}`, alunoId, editalId, rotina, plan, nivelCobertura, createdAt: new Date().toISOString() };
    storage.set(db => ({
      ...db,
      planos: [...db.planos.filter(p => !(p.alunoId === alunoId && p.editalId === editalId)), plano],
    }));
    logModule.add(alunoId, `Plano gerado para edital ${editalId}`, { editalId });
    return plano;
  },
  getByAluno(alunoId) { return storage.get().planos.filter(p => p.alunoId === alunoId); },
  getById(id) { return storage.get().planos.find(p => p.id === id); },
  delete(planoId) {
    storage.set(db => ({
      ...db,
      planos:    db.planos.filter(p => p.id !== planoId),
      progresso: db.progresso.filter(p => p.planoId !== planoId),
    }));
  },
  updateRotina(planoId, alunoId, novaRotina) {
    const plano = this.getById(planoId);
    if (!plano) return null;
    logModule.add(alunoId, `Rotina alterada`, { planoId, rotina: novaRotina });
    // Preserve past plan entries (dates before today) so previous weeks stay visible
    const todayKey = localDateKey();
    const pastPlan = {};
    Object.entries(plano.plan || {}).forEach(([key, day]) => {
      if (key < todayKey) pastPlan[key] = day;
    });
    // regenerarFuturo: keeps same plano.id, only rebuilds lessons from today forward
    this.regenerarFuturo(planoId, alunoId, novaRotina);
    // Merge past entries back so historical weeks remain intact
    if (Object.keys(pastPlan).length > 0) {
      storage.set(db => ({
        ...db,
        planos: db.planos.map(p => p.id === planoId ? { ...p, plan: { ...pastPlan, ...p.plan } } : p),
      }));
    }
    return this.getById(planoId);
  },
};

// ============================================================
// MODULE: progresso
// ============================================================
const progressoModule = {
  toggle(alunoId, planoId, key) {
    storage.set(db => {
      const prog = db.progresso;
      const idx = prog.findIndex(p => p.alunoId === alunoId && p.planoId === planoId && p.key === key);
      if (idx >= 0) {
        const updated = [...prog];
        updated[idx] = { ...updated[idx], done: !updated[idx].done };
        return { ...db, progresso: updated };
      }
      return { ...db, progresso: [...prog, { alunoId, planoId, key, done: true, at: new Date().toISOString() }] };
    });
  },
  isDone(alunoId, planoId, key) {
    const item = storage.get().progresso.find(p => p.alunoId === alunoId && p.planoId === planoId && p.key === key);
    return item ? item.done : false;
  },
  saveNote(alunoId, planoId, topicId, note, topicName) {
    storage.set(db => {
      const notes = db.studyNotes || [];
      const idx = notes.findIndex(n => n.alunoId === alunoId && n.planoId === planoId && n.topicId === topicId);
      // Resolve topic name: use provided, or try to find from editais
      let tName = topicName || "";
      if (!tName) {
        const plano = (db.planos||[]).find(p => p.id === planoId);
        const edital = plano ? (db.editais||[]).find(e => e.id === plano.editalId) : null;
        if (edital) {
          for (const m of (edital.materias||[])) {
            const t = (m.topicos||[]).find(t => t.id === topicId);
            if (t) { tName = t.name; break; }
          }
        }
      }
      if (idx >= 0) {
        const updated = [...notes];
        updated[idx] = { ...updated[idx], note, updatedAt: new Date().toISOString(), topicName: tName || updated[idx].topicName || "" };
        return { ...db, studyNotes: updated };
      }
      return { ...db, studyNotes: [...notes, { alunoId, planoId, topicId, note, topicName: tName, updatedAt: new Date().toISOString() }] };
    });
  },
  getNote(alunoId, planoId, topicId) {
    return (storage.get().studyNotes || []).find(n => n.alunoId === alunoId && n.planoId === planoId && n.topicId === topicId)?.note || "";
  },
  deleteNote(alunoId, planoId, topicId) {
    storage.set(db => ({
      ...db,
      studyNotes: (db.studyNotes || []).filter(n =>
        !(n.alunoId === alunoId && n.planoId === planoId && n.topicId === topicId)
      ),
    }));
  },
  // Lista todos os resumos do aluno, enriquecidos com topic+matéria+plano.
  // Retorna [{ alunoId, planoId, topicId, note, updatedAt, topic:{id,name}, materia:{id,name,color}, planoNome }]
  listResumos(alunoId) {
    const db = storage.get();
    const notes = (db.studyNotes || []).filter(n => n.alunoId === alunoId && (n.note || "").trim().length > 0);
    return notes.map(n => {
      const plano = (db.planos || []).find(p => p.id === n.planoId);
      const edital = plano ? (db.editais || []).find(e => e.id === plano.editalId) : null;
      let topic = null, materia = null;
      if (edital) {
        for (const m of (edital.materias || [])) {
          const t = (m.topicos || []).find(t => t.id === n.topicId);
          if (t) { topic = t; materia = m; break; }
        }
      }
      // Fallback: tenta achar via plano.plan.topicos
      if (!topic && plano) {
        for (const day of Object.values(plano.plan || {})) {
          const t = (day.topicos || []).find(t => t.id === n.topicId);
          if (t) {
            topic = { id: t.id, name: t.name };
            materia = { id: t.materiaId, name: t.materiaName, color: t.materiaColor };
            break;
          }
        }
      }
      return {
        alunoId: n.alunoId, planoId: n.planoId, topicId: n.topicId,
        note: n.note, updatedAt: n.updatedAt,
        topic: topic || { id: n.topicId, name: n.topicName || "Tópico removido" },
        materia: materia || { id: "?", name: "Sem matéria", color: "#6b7280" },
        planoNome: edital?.name || plano?.id || "—",
        topicRemovido: !topic && !!n.topicName,
      };
    });
  },
  getStats(alunoId, planoId) {
    const plano = planosModule.getById(planoId);
    if (!plano) return null;
    const prog = storage.get().progresso.filter(p => p.alunoId === alunoId && p.planoId === planoId && p.done);

    // IDs únicos de tópicos (aulas) já concluídos — chave: "YYYY-MM-DD-{topicId}"
    const doneTopicIdSet = new Set(
      prog.filter(p => !p.key.endsWith("-rev")).map(p => p.key.substring(11))
    );
    const aulasFeitas = doneTopicIdSet.size;

    // Tópicos no plano atual que ainda NÃO foram feitos.
    // Após regenerarFuturo o plano só tem os restantes; após generate() tem todos.
    // Em ambos os casos: total = feitas + ainda-no-plano-não-feitas.
    const notDoneInPlan = Object.values(plano.plan)
      .flatMap(d => d.topicos)
      .filter(t => !doneTopicIdSet.has(t.id)).length;
    const totalAulas = aulasFeitas + notDoneInPlan;

    const totalReviews = Object.values(plano.plan).reduce((a, d) => a + d.reviews.length, 0);
    const reviewsFeitas = prog.filter(p => p.key.endsWith("-rev")).length;
    const pct = totalAulas ? Math.min(100, Math.round((aulasFeitas / totalAulas) * 100)) : 0;
    const aulasPorDia = plano.rotina?.aulasPorDia || 1;
    const diasRestantes = aulasFeitas < totalAulas ? Math.ceil((totalAulas - aulasFeitas) / aulasPorDia) : 0;
    const previsao = diasRestantes > 0
      ? new Date(Date.now() + diasRestantes * 86400000).toLocaleDateString("pt-BR")
      : "Concluído!";
    return { totalAulas, aulasFeitas, totalReviews, reviewsFeitas, pct, previsao };
  },
  saveDone(alunoId, planoId, key) {
    storage.set(db => {
      const prog = db.progresso;
      const idx = prog.findIndex(p => p.alunoId === alunoId && p.planoId === planoId && p.key === key);
      if (idx >= 0) {
        const updated = [...prog];
        updated[idx] = { ...updated[idx], done: true };
        return { ...db, progresso: updated };
      }
      return { ...db, progresso: [...prog, { alunoId, planoId, key, done: true, at: new Date().toISOString() }] };
    });
  },
};

// ============================================================
// MODULE: resumo (comentários e complementos do coach)
// ============================================================
const resumoModule = {
  saveCoachComment(alunoId, planoId, topicId, coachId, comment) {
    storage.set(db => {
      const comments = db.resumoComments || [];
      const idx = comments.findIndex(c => c.alunoId === alunoId && c.planoId === planoId && c.topicId === topicId);
      if (idx >= 0) {
        const updated = [...comments];
        updated[idx] = { ...updated[idx], coachComment: comment, coachId, updatedAt: new Date().toISOString() };
        return { ...db, resumoComments: updated };
      }
      return { ...db, resumoComments: [...comments, { alunoId, planoId, topicId, coachComment: comment, coachId, updatedAt: new Date().toISOString() }] };
    });
  },
  getCoachComment(alunoId, planoId, topicId) {
    return (storage.get().resumoComments || []).find(c => c.alunoId === alunoId && c.planoId === planoId && c.topicId === topicId)?.coachComment || "";
  },
  saveCoachAddition(alunoId, planoId, topicId, coachId, addition) {
    storage.set(db => {
      const additions = db.resumoAdditions || [];
      const idx = additions.findIndex(a => a.alunoId === alunoId && a.planoId === planoId && a.topicId === topicId);
      if (idx >= 0) {
        const updated = [...additions];
        updated[idx] = { ...updated[idx], addition, coachId, updatedAt: new Date().toISOString() };
        return { ...db, resumoAdditions: updated };
      }
      return { ...db, resumoAdditions: [...additions, { alunoId, planoId, topicId, addition, coachId, updatedAt: new Date().toISOString() }] };
    });
  },
  getCoachAddition(alunoId, planoId, topicId) {
    return (storage.get().resumoAdditions || []).find(a => a.alunoId === alunoId && a.planoId === planoId && a.topicId === topicId)?.addition || "";
  },
};

// ============================================================
// MODULE: gamificacao
// ============================================================
const NIVEIS = [
  { level:1, name:"Iniciante",  min:0,    max:100,  emoji:"🌱" },
  { level:2, name:"Estudante",  min:100,  max:300,  emoji:"📖" },
  { level:3, name:"Dedicado",   min:300,  max:700,  emoji:"🎯" },
  { level:4, name:"Focado",     min:700,  max:1400, emoji:"🔥" },
  { level:5, name:"Expert",     min:1400, max:2500, emoji:"⚡" },
  { level:6, name:"Mestre",     min:2500, max:4000, emoji:"🏆" },
  { level:7, name:"Lenda",      min:4000, max:Infinity, emoji:"👑" },
];

const gamificacaoModule = {
  get(alunoId) {
    return storage.get().gamificacao?.find(g => g.alunoId === alunoId) ||
      { alunoId, weekGoal: 5 };
  },
  calcXP(alunoId, planoId) {
    const prog = storage.get().progresso.filter(p => p.alunoId === alunoId && p.planoId === planoId && p.done);
    return prog.filter(p => !p.key.endsWith("-rev")).length * 10 +
           prog.filter(p =>  p.key.endsWith("-rev")).length * 5;
  },
  getNivel(xp) {
    return NIVEIS.find(n => xp >= n.min && xp < n.max) || NIVEIS[NIVEIS.length - 1];
  },
  getStreakAtual(alunoId, planoId) {
    const prog = storage.get().progresso.filter(
      p => p.alunoId === alunoId && p.planoId === planoId && p.done && !p.key.endsWith("-rev")
    );
    const doneDays = new Set(prog.map(p => p.key.split("-").slice(0,3).join("-")));
    if (!doneDays.size) return 0;

    // Determina os dias de estudo da rotina (DOW: 0=domingo .. 6=sábado).
    // Dias NÃO marcados como estudo + feriados nacionais são "puláveis":
    // não estudar neles não quebra o streak.
    const plano = (storage.get().planos || []).find(p => p.id === planoId);
    const diasConfig = plano?.rotina?.diasConfig || null;
    const diasEstudo = plano?.rotina?.dias || [1,2,3,4,5];
    const isStudyDow = (dow) => {
      if (diasConfig) return (diasConfig[dow] || 0) > 0;
      return diasEstudo.includes(dow);
    };
    const isStudyDate = (d) => isStudyDow(d.getDay()) && !isFeriadoBR(d);

    const today = new Date(); today.setHours(0,0,0,0);
    let cursor = new Date(today);

    // Se hoje ainda não é dia de estudo (fim de semana / feriado / dia sem aula),
    // recua até o último dia de estudo. Caso contrário, se hoje é dia de estudo
    // mas nada foi feito ainda, considera como "ainda em curso" e recua para o
    // último dia de estudo anterior — assim o streak não cai à meia-noite.
    if (!isStudyDate(cursor) || !doneDays.has(localDateKey(cursor))) {
      // recua um dia e procura o último dia de estudo
      let safety = 0;
      do {
        cursor.setDate(cursor.getDate() - 1); safety++;
      } while (!isStudyDate(cursor) && safety < 60);
    }

    let streak = 0;
    let safety = 0;
    while (safety < 365 * 3) {
      safety++;
      if (!isStudyDate(cursor)) {
        // Pula dia sem estudo (fim de semana / feriado / dia 0-aulas) —
        // não conta nem quebra a sequência.
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      const k = localDateKey(cursor);
      if (doneDays.has(k)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break; // dia de estudo SEM aula concluída → fim do streak
      }
    }
    return streak;
  },
  getMetaSemanal(alunoId, planoId) {
    const prog = storage.get().progresso.filter(
      p => p.alunoId === alunoId && p.planoId === planoId && p.done && !p.key.endsWith("-rev")
    );
    const today = new Date(); today.setHours(0,0,0,0);
    const mon = new Date(today); mon.setDate(today.getDate() - ((today.getDay()+6)%7));
    const monKey = localDateKey(mon);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const sunKey = localDateKey(sun);
    const thisWeek = prog.filter(p => { const dk=p.key.split("-").slice(0,3).join("-"); return dk>=monKey&&dk<=sunKey; });
    const meta = this.get(alunoId).weekGoal || 5;
    return { feitas: thisWeek.length, meta };
  },
  setMeta(alunoId, meta) {
    storage.set(db => {
      const arr = db.gamificacao || [];
      const idx = arr.findIndex(g => g.alunoId === alunoId);
      const ex = idx >= 0 ? arr[idx] : { alunoId, weekGoal: 5 };
      const upd = { ...ex, weekGoal: meta };
      return { ...db, gamificacao: idx >= 0 ? arr.map((g,i) => i===idx ? upd : g) : [...arr, upd] };
    });
  },
};

// ============================================================
// MODULE: simulados (Exam/Quizzes)
// ============================================================
const simuladosModule = {
  create(coachId, editalId, nome, tipo, materiaId, descricao, alunosPermitidos) {
    const id = "sim_" + Math.random().toString(36).substr(2,9);
    const simulado = {
      id, coachId, editalId, nome, tipo, materiaId: tipo === "geral" ? null : materiaId, descricao,
      alunosPermitidos: alunosPermitidos || null,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
    };
    storage.set(db => ({ ...db, simulados: [...(db.simulados || []), simulado] }));
    return simulado;
  },
  getById(id) {
    return (storage.get().simulados || []).find(s => s.id === id);
  },
  getByCoach(coachId) {
    return (storage.get().simulados || []).filter(s => s.coachId === coachId);
  },
  getByEdital(editalId) {
    return (storage.get().simulados || []).filter(s => s.editalId === editalId);
  },
  getByEditalParaAluno(editalId, alunoId) {
    return (storage.get().simulados || []).filter(s =>
      s.editalId === editalId &&
      (s.alunosPermitidos === null || s.alunosPermitidos === undefined || s.alunosPermitidos.includes(alunoId))
    );
  },
  update(id, updates) {
    storage.set(db => ({
      ...db,
      simulados: (db.simulados || []).map(s => s.id === id ? { ...s, ...updates, updatedAt: new Date().toISOString() } : s)
    }));
  },
  delete(id) {
    storage.set(db => ({
      ...db,
      simulados: (db.simulados || []).filter(s => s.id !== id),
      questoes: (db.questoes || []).filter(q => q.simuladoId !== id),
      tentativas: (db.tentativas || []).filter(t => t.simuladoId !== id)
    }));
  }
};

// ============================================================
// MODULE: questões (Quiz Questions)
// ============================================================
const questoesModule = {
  create(simuladoId, tipo, enunciado, alternativas, gabarito, ordem) {
    const id = "q_" + Math.random().toString(36).substr(2,9);
    const questao = {
      id, simuladoId, tipo, enunciado, alternativas: alternativas || [], gabarito, ordem: ordem || 0,
      createdAt: new Date().toISOString()
    };
    storage.set(db => ({ ...db, questoes: [...(db.questoes || []), questao] }));
    return questao;
  },
  getBySimulado(simuladoId) {
    return ((storage.get().questoes || []).filter(q => q.simuladoId === simuladoId)).sort((a,b) => a.ordem - b.ordem);
  },
  getById(id) {
    return (storage.get().questoes || []).find(q => q.id === id);
  },
  update(id, updates) {
    storage.set(db => ({
      ...db,
      questoes: (db.questoes || []).map(q => q.id === id ? { ...q, ...updates } : q)
    }));
  },
  delete(id) {
    storage.set(db => ({
      ...db,
      questoes: (db.questoes || []).filter(q => q.id !== id),
      tentativas: (db.tentativas || []).filter(t => !t.respostas?.some(r => r.questaoId === id))
    }));
  }
};

// ============================================================
// MODULE: tentativas (Quiz Attempts)
// ============================================================
const tentativasModule = {
  create(simuladoId, alunoId) {
    const id = "tent_" + Math.random().toString(36).substr(2,9);
    const tentativa = {
      id, simuladoId, alunoId, respostas: [], startedAt: new Date().toISOString(), finishedAt: null, status: "em_andamento"
    };
    storage.set(db => ({ ...db, tentativas: [...(db.tentativas || []), tentativa] }));
    return tentativa;
  },
  getById(id) {
    return (storage.get().tentativas || []).find(t => t.id === id);
  },
  getBySimuladoAluno(simuladoId, alunoId) {
    return (storage.get().tentativas || []).filter(t => t.simuladoId === simuladoId && t.alunoId === alunoId);
  },
  responder(tentativaId, questaoId, resposta) {
    storage.set(db => {
      const tentativas = db.tentativas || [];
      return {
        ...db,
        tentativas: tentativas.map(t => {
          if (t.id !== tentativaId) return t;
          const idx = t.respostas.findIndex(r => r.questaoId === questaoId);
          if (idx >= 0) {
            const newResps = [...t.respostas];
            newResps[idx] = { questaoId, resposta, respondidaEm: new Date().toISOString() };
            return { ...t, respostas: newResps };
          }
          return { ...t, respostas: [...t.respostas, { questaoId, resposta, respondidaEm: new Date().toISOString() }] };
        })
      };
    });
  },
  salvarTempoDecorrido(tentativaId, tempoSegundos) {
    storage.set(db => {
      const tentativas = db.tentativas || [];
      return {
        ...db,
        tentativas: tentativas.map(t => t.id === tentativaId
          ? { ...t, tempoDecorridoSegundos: tempoSegundos }
          : t
        )
      };
    });
  },
  finalizar(tentativaId, tempoDecorridoSegundos) {
    storage.set(db => {
      const tentativas = db.tentativas || [];
      const tentativa = tentativas.find(t => t.id === tentativaId);
      if (!tentativa) return db;
      const questoes = questoesModule.getBySimulado(tentativa.simuladoId);
      let acertos = 0, erros = 0, brancos = 0;
      const respostasIncorretas = [];
      const isTodoCE = questoes.every(q => q.tipo === "ce");
      questoes.forEach(q => {
        const resp = tentativa.respostas.find(r => r.questaoId === q.id);
        if (!resp || !resp.resposta) {
          brancos++;
        } else if (resp.resposta === q.gabarito) {
          acertos++;
        } else {
          erros++;
          respostasIncorretas.push({ questaoId: q.id, questaoEnunciado: q.enunciado });
        }
      });
      const pontosCebraspe = isTodoCE ? (acertos - erros) : null;
      const total = questoes.length;
      const percentual = total > 0 ? Math.round((acertos / total) * 100) : 0;
      return {
        ...db,
        tentativas: tentativas.map(t => t.id === tentativaId
          ? { ...t, finishedAt: new Date().toISOString(), status: "finalizada", acertos, erros, brancos, pontosCebraspe, percentual, tempoDecorridoSegundos, respostasIncorretas }
          : t
        )
      };
    });
  },
  getResultados(simuladoId, coachId) {
    const simulado = simuladosModule.getById(simuladoId);
    if (!simulado || simulado.coachId !== coachId) return null;
    const tentativas = (storage.get().tentativas || []).filter(t => t.simuladoId === simuladoId && t.status === "finalizada");
    return { simulado, tentativas };
  }
};

// ============================================================
// MODULE: batalhas (Batalhas entre alunos)
// ============================================================
const batalhasModule = {
  create(coachId, simuladoId, nome, dataFim, tempoLimite, alunoIds) {
    const batalha = {
      id: "bat_" + Math.random().toString(36).substr(2,9),
      nome: nome || "Batalha",
      coachId,
      simuladoId,
      dataFim,
      tempoLimite: tempoLimite || null,
      status: "ativa",
      criadaEm: new Date().toISOString(),
      participantes: alunoIds.map(alunoId => ({
        alunoId,
        tentativaId: null,
        finalizado: false,
        acertos: 0,
        erros: 0,
        brancos: 0,
        pontosCebraspe: null,
        percentual: 0,
        tempoGasto: 0,
      }))
    };
    storage.set(db => ({ ...db, batalhas: [...(db.batalhas || []), batalha] }));
    return batalha;
  },
  getByCoach(coachId) {
    return (storage.get().batalhas || []).filter(b => b.coachId === coachId);
  },
  getByAluno(alunoId) {
    return (storage.get().batalhas || []).filter(b =>
      b.participantes && b.participantes.some(p => p.alunoId === alunoId)
    );
  },
  getById(id) {
    return (storage.get().batalhas || []).find(b => b.id === id);
  },
  registrarResultado(batalhaId, alunoId, tentativaId, acertos, erros, brancos, pontosCebraspe, percentual, tempoGasto) {
    storage.set(db => ({
      ...db,
      batalhas: (db.batalhas || []).map(b => {
        if (b.id !== batalhaId) return b;
        return {
          ...b,
          participantes: b.participantes.map(p => {
            if (p.alunoId !== alunoId) return p;
            return { ...p, tentativaId, finalizado: true, acertos, erros, brancos, pontosCebraspe, percentual, tempoGasto };
          })
        };
      })
    }));
  },
  encerrar(batalhaId) {
    storage.set(db => ({
      ...db,
      batalhas: (db.batalhas || []).map(b => b.id === batalhaId ? { ...b, status: "encerrada" } : b)
    }));
  },
  delete(batalhaId) {
    storage.set(db => ({ ...db, batalhas: (db.batalhas || []).filter(b => b.id !== batalhaId) }));
  },
  getRanking(batalhaId) {
    const b = (storage.get().batalhas || []).find(x => x.id === batalhaId);
    if (!b) return [];
    const finalizados = (b.participantes || []).filter(p => p.finalizado);
    return finalizados.sort((a, z) => {
      const pa = a.pontosCebraspe !== null ? a.pontosCebraspe : a.percentual;
      const pz = z.pontosCebraspe !== null ? z.pontosCebraspe : z.percentual;
      if (pz !== pa) return pz - pa;
      if (z.acertos !== a.acertos) return z.acertos - a.acertos;
      return a.tempoGasto - z.tempoGasto;
    });
  }
};

// ============================================================
// MODULE: feedbackSimulado (Coach → Aluno)
// ============================================================
const feedbackModule = {
  // Salva ou atualiza rascunho de feedback
  salvar(coachId, tentativaId, dados) {
    storage.set(db => {
      const feedbacks = db.feedbackSimulado || [];
      const tentativa = (db.tentativas || []).find(t => t.id === tentativaId);
      if (!tentativa) return db;
      const idx = feedbacks.findIndex(f => f.tentativaId === tentativaId);
      const feedback = {
        id: idx >= 0 ? feedbacks[idx].id : `fb_${Math.random().toString(36).substr(2,9)}`,
        tentativaId,
        simuladoId: tentativa.simuladoId,
        alunoId: tentativa.alunoId,
        coachId,
        comentariosQuestoes: dados.comentariosQuestoes || [],
        orientacoesGerais: dados.orientacoesGerais || "",
        sugestoesConteudo: dados.sugestoesConteudo || "",
        temasRevisar: dados.temasRevisar || "",
        status: dados.status || "rascunho",
        criadoEm: idx >= 0 ? feedbacks[idx].criadoEm : new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
        enviadoEm: dados.status === "enviado" ? new Date().toISOString() : (idx >= 0 ? feedbacks[idx].enviadoEm : null),
      };
      return {
        ...db,
        feedbackSimulado: idx >= 0
          ? feedbacks.map((f, i) => i === idx ? feedback : f)
          : [...feedbacks, feedback]
      };
    });
  },
  getByTentativa(tentativaId) {
    return (storage.get().feedbackSimulado || []).find(f => f.tentativaId === tentativaId) || null;
  },
  getByAluno(alunoId) {
    return (storage.get().feedbackSimulado || []).filter(f => f.alunoId === alunoId && f.status === "enviado");
  },
  getEnviadoParaAluno(tentativaId) {
    const fb = (storage.get().feedbackSimulado || []).find(f => f.tentativaId === tentativaId);
    return fb?.status === "enviado" ? fb : null;
  },
};

// Adiantar aulas: move N topics from future days to today
planosModule.adiantarAulas = function(planoId, howMany) {
  const plano = this.getById(planoId);
  if (!plano) return 0;
  const todayKey = localDateKey();
  const futureDays = Object.keys(plano.plan).filter(dk => dk > todayKey).sort();
  const topicsToMove = [];
  for (const dk of futureDays) {
    if (topicsToMove.length >= howMany) break;
    for (const t of plano.plan[dk].topicos) {
      if (topicsToMove.length >= howMany) break;
      topicsToMove.push({ topic: t, fromDay: dk });
    }
  }
  if (topicsToMove.length === 0) return 0;
  storage.set(db => {
    const planos = db.planos.map(p => {
      if (p.id !== planoId) return p;
      const np = JSON.parse(JSON.stringify(p.plan));
      if (!np[todayKey]) np[todayKey] = { date: todayKey, topicos: [], reviews: [] };
      for (const { topic, fromDay } of topicsToMove) {
        np[fromDay].topicos = np[fromDay].topicos.filter(t => t.id !== topic.id);
        np[todayKey].topicos.push(topic);
        // Remove old reviews and reschedule from today
        Object.keys(np).forEach(dk => {
          if (dk > todayKey) np[dk].reviews = np[dk].reviews.filter(r => r.id !== topic.id);
        });
        const intervals = REVIEW_PRESETS[topic.materiaReviewPreset || "moderada"] || REVIEW_INTERVALS;
        const todayDate = new Date(todayKey + "T12:00:00");
        intervals.forEach(interval => {
          const rd = new Date(todayDate); rd.setDate(rd.getDate() + interval);
          const rk = localDateKey(rd);
          if (!np[rk]) np[rk] = { date: rk, topicos: [], reviews: [] };
          if (!np[rk].reviews.find(r => r.id === topic.id))
            np[rk].reviews.push({ ...topic, reviewInterval: interval });
        });
      }
      return { ...p, plan: np };
    });
    return { ...db, planos };
  });
  return topicsToMove.length;
};

// Adicionar reagendarTopico ao planosModule
// Regenera apenas as aulas não feitas (a partir de hoje), mantém progresso existente e o mesmo plano.id
planosModule.regenerarFuturo = function(planoId, alunoId, novaRotina) {
  const plano = this.getById(planoId);
  if (!plano) return null;
  const rotina = novaRotina || plano.rotina;
  const edital = editaisModule.getById(plano.editalId);
  if (!edital) return null;
  const todayKey = localDateKey();
  // Collect done topic IDs (lessons already studied)
  const db = storage.get();
  const doneProgresso = (db.progresso || []).filter(p => p.planoId === planoId && p.done && !p.key.endsWith('-rev'));
  const doneTopicIds = new Set(doneProgresso.map(p => p.key.substring(11))); // strip 'YYYY-MM-DD-'
  // Build list of all plan topics not yet done
  const materiaIds = rotina.materiaIds && rotina.materiaIds.length > 0 ? rotina.materiaIds : null;
  const materias = materiaIds ? edital.materias.filter(m => materiaIds.includes(m.id)) : edital.materias;
  const modoOrganizacao = rotina.modoOrganizacao || "alternado";
  const queues = materias.map(m =>
    m.topicos.map(t => ({ ...t, materiaId: m.id, materiaName: m.name, materiaColor: m.color, materiaReviewPreset: m.reviewPreset || "moderada" }))
  );
  const allTopicos = [];
  if (modoOrganizacao === "sequencial") {
    queues.forEach(q => allTopicos.push(...q));
  } else {
    let cursors = queues.map(() => 0);
    while (queues.some((q, i) => cursors[i] < q.length)) {
      for (let i = 0; i < queues.length; i++) {
        if (cursors[i] < queues[i].length) { allTopicos.push(queues[i][cursors[i]]); cursors[i]++; }
      }
    }
  }
  // Filter to only not-done topics
  const remaining = allTopicos.filter(t => !doneTopicIds.has(t.id));
  // Build new schedule from today
  const diasConfig = rotina.diasConfig || null;
  const aulasPorDia = rotina.aulasPorDia || 1;
  const diasEstudo = rotina.dias || [1,2,3,4,5];
  function aulasNoDia(dow) {
    if (diasConfig) return diasConfig[dow] || 0;
    return diasEstudo.includes(dow) ? aulasPorDia : 0;
  }
  const plan = {}, reviews = {};
  let topicIdx = 0;
  const start = new Date(); start.setHours(0,0,0,0);
  let dayOffset = 0;
  const maxDays = remaining.length * 5 + 60;
  while (topicIdx < remaining.length && dayOffset < maxDays) {
    const d = new Date(start); d.setDate(d.getDate() + dayOffset);
    const dow = d.getDay();
    const key = localDateKey(d);
    if (!plan[key]) plan[key] = { date: key, topicos: [], reviews: [] };
    const aulasHoje = aulasNoDia(dow);
    if (aulasHoje > 0) {
      for (let a = 0; a < aulasHoje && topicIdx < remaining.length; a++) {
        plan[key].topicos.push({ ...remaining[topicIdx] });
        const intervals = REVIEW_PRESETS[remaining[topicIdx].materiaReviewPreset || "moderada"] || REVIEW_INTERVALS;
        intervals.forEach(interval => {
          let revDate = new Date(d); revDate.setDate(revDate.getDate() + interval);
          revDate = proximoDiaUtil(revDate, aulasNoDia);
          const revKey = localDateKey(revDate);
          if (!reviews[revKey]) reviews[revKey] = [];
          reviews[revKey].push({ ...remaining[topicIdx], reviewInterval: interval });
        });
        topicIdx++;
      }
    }
    dayOffset++;
  }
  Object.entries(reviews).forEach(([key, revs]) => {
    if (!plan[key]) plan[key] = { date: key, topicos: [], reviews: [] };
    plan[key].reviews.push(...revs);
  });
  // Cap reviews per day
  const maxRevDay = rotina.maxRevisoesPorDia || 0;
  const minRevDay = rotina.minRevisoesPorDia || 0;
  if (maxRevDay > 0) {
    const sortedKeys = Object.keys(plan).sort();
    for (let i = 0; i < sortedKeys.length; i++) {
      const dk = sortedKeys[i];
      if (plan[dk].reviews.length > maxRevDay) {
        const overflow = plan[dk].reviews.splice(maxRevDay);
        let j = i + 1;
        while (j < sortedKeys.length && aulasNoDia(new Date(sortedKeys[j]+"T12:00:00").getDay()) === 0) j++;
        if (j < sortedKeys.length) plan[sortedKeys[j]].reviews = [...overflow, ...plan[sortedKeys[j]].reviews];
        else sortedKeys.push(sortedKeys[sortedKeys.length-1]); // fallback
      }
    }
  }
  // Pull forward reviews to meet minimum per day
  if (minRevDay > 0) {
    const sortedKeys = Object.keys(plan).sort();
    for (let i = 0; i < sortedKeys.length; i++) {
      const dk = sortedKeys[i];
      const cap = maxRevDay > 0 ? maxRevDay : 999;
      let needed = minRevDay - plan[dk].reviews.length;
      let j = i + 1;
      while (needed > 0 && j < sortedKeys.length) {
        const future = sortedKeys[j];
        const available = plan[future].reviews;
        const take = Math.min(needed, available.length, cap - plan[dk].reviews.length);
        if (take > 0) {
          plan[dk].reviews = [...plan[dk].reviews, ...available.splice(0, take)];
          needed -= take;
        }
        j++;
      }
    }
  }
  // Reagenda revisões FUTURAS das aulas já concluídas (que sumiram ao regenerar o plano).
  // Para cada aula feita, calcula os intervalos de revisão e adiciona ao plano
  // apenas as datas que ainda não chegaram e ainda não foram feitas.
  const topicMap = {};
  allTopicos.forEach(t => { topicMap[t.id] = t; });
  // Também inclui os tópicos que estavam no plano antigo mas não estão em allTopicos (edge case)
  Object.values(plano.plan || {}).forEach(day =>
    (day.topicos || []).forEach(t => { if (!topicMap[t.id]) topicMap[t.id] = t; })
  );
  const doneRevKeys = new Set(
    (db.progresso || []).filter(p => p.planoId === planoId && p.done && p.key.endsWith('-rev')).map(p => p.key)
  );
  // Agrupa por topicId → data mais antiga de conclusão
  const doneByTopic = {};
  doneProgresso.forEach(p => {
    const date = p.key.substring(0, 10);
    const tid  = p.key.substring(11);
    if (!doneByTopic[tid] || date < doneByTopic[tid]) doneByTopic[tid] = date;
  });
  Object.entries(doneByTopic).forEach(([topicId, completionDate]) => {
    const topicObj = topicMap[topicId];
    if (!topicObj) return;
    const intervals = REVIEW_PRESETS[topicObj.materiaReviewPreset || "moderada"] || [1, 7, 21, 30];
    const compD = new Date(completionDate + "T12:00:00");
    intervals.forEach(interval => {
      let revDate = new Date(compD);
      revDate.setDate(revDate.getDate() + interval);
      revDate = proximoDiaUtil(revDate, aulasNoDia);
      const revKey = localDateKey(revDate);
      if (revKey < todayKey) return; // já passou
      // Verifica se a revisão já foi feita pelo aluno
      const progressoRevKey = `${revKey}-${topicId}-rev`;
      if (doneRevKeys.has(progressoRevKey)) return; // já concluída
      if (!plan[revKey]) plan[revKey] = { date: revKey, topicos: [], reviews: [] };
      // Evita duplicata
      if (!plan[revKey].reviews.find(r => r.id === topicId && r.reviewInterval === interval)) {
        plan[revKey].reviews.push({ ...topicObj, reviewInterval: interval });
      }
    });
  });

  // Re-aplica o cap de revisões POR DIA agora que adicionamos as revisões
  // das aulas já concluídas (esse passo originalmente ignorava o cap).
  if (maxRevDay > 0) {
    let safetyCap = 0;
    while (safetyCap < 10) {
      safetyCap++;
      let changed = false;
      const keysSorted = Object.keys(plan).sort();
      for (let i = 0; i < keysSorted.length; i++) {
        const dk = keysSorted[i];
        const day = plan[dk];
        if (!day.reviews || day.reviews.length <= maxRevDay) continue;
        const overflow = day.reviews.splice(maxRevDay);
        changed = true;
        let j = i + 1;
        while (j < keysSorted.length && aulasNoDia(new Date(keysSorted[j]+"T12:00:00").getDay()) === 0) j++;
        if (j < keysSorted.length) {
          plan[keysSorted[j]].reviews = [...overflow, ...plan[keysSorted[j]].reviews];
        } else {
          const lastDate = new Date(keysSorted[keysSorted.length-1]+"T12:00:00");
          let extDate = new Date(lastDate); extDate.setDate(extDate.getDate()+1);
          let s3 = 0;
          while (aulasNoDia(extDate.getDay()) === 0 && s3 < 30) { extDate.setDate(extDate.getDate()+1); s3++; }
          const extKey = localDateKey(extDate);
          if (!plan[extKey]) plan[extKey] = { date: extKey, topicos: [], reviews: [] };
          plan[extKey].reviews.push(...overflow);
          keysSorted.push(extKey);
        }
      }
      if (!changed) break;
    }
  }

  // Preserva os dias passados para que o histórico de semanas anteriores continue visível
  const pastPlan = {};
  Object.entries(plano.plan || {}).forEach(([key, day]) => {
    if (key < todayKey) pastPlan[key] = day;
  });
  const fullPlan = { ...pastPlan, ...plan };
  // Update existing plan in-place (keep planoId and progress)
  storage.set(db => ({
    ...db,
    planos: db.planos.map(p => p.id === planoId ? { ...p, rotina, plan: fullPlan } : p),
  }));
  return this.getById(planoId);
};

// Regenera do zero mantendo o mesmo plano.id (progresso e notas existentes continuam válidos)
planosModule.regenerarDoZero = function(planoId, alunoId, novaRotina) {
  const plano = this.getById(planoId);
  if (!plano) return null;
  const rotina = novaRotina || plano.rotina;
  // generate() removes old plan (by alunoId+editalId) but does NOT touch progresso/studyNotes
  const newPlano = this.generate(alunoId, plano.editalId, rotina);
  if (!newPlano) return null;
  const newId = newPlano.id;
  // Swap newPlano.id → planoId so existing progress/notes entries remain valid (they still reference planoId)
  storage.set(db => ({
    ...db,
    planos: db.planos.map(p => p.id === newId ? { ...p, id: planoId } : p),
    progresso: db.progresso.filter(p => p.planoId !== newId),
    studyNotes: (db.studyNotes || []).filter(n => n.planoId !== newId),
  }));
  return this.getById(planoId);
};

planosModule.reagendarTopico = function(planoId, dateKey, topicoId) {
  const plano = this.getById(planoId);
  if (!plano) return null;
  const topico = (plano.plan[dateKey]?.topicos || []).find(t => t.id === topicoId);
  if (!topico) return null;
  const diasEstudo = plano.rotina?.dias || [1,2,3,4,5];
  const start = new Date(dateKey + "T12:00:00");
  start.setDate(start.getDate() + 1);
  let nextDay = null;
  for (let i = 0; i < 30; i++) {
    if (diasEstudo.includes(start.getDay())) { nextDay = localDateKey(start); break; }
    start.setDate(start.getDate() + 1);
  }
  if (!nextDay) return null;
  storage.set(db => {
    const planos = db.planos.map(p => {
      if (p.id !== planoId) return p;
      const np = JSON.parse(JSON.stringify(p.plan));
      if (np[dateKey]) np[dateKey].topicos = np[dateKey].topicos.filter(t => t.id !== topicoId);
      Object.keys(np).forEach(dk => { if (dk > dateKey) np[dk].reviews = np[dk].reviews.filter(r => r.id !== topicoId); });
      if (!np[nextDay]) np[nextDay] = { date: nextDay, topicos: [], reviews: [] };
      np[nextDay].topicos = [...np[nextDay].topicos, topico];
      const nd = new Date(nextDay + "T12:00:00");
      REVIEW_INTERVALS.forEach(interval => {
        const rd = new Date(nd); rd.setDate(rd.getDate() + interval);
        const rk = localDateKey(rd);
        if (!np[rk]) np[rk] = { date: rk, topicos: [], reviews: [] };
        if (!np[rk].reviews.find(r => r.id === topicoId))
          np[rk].reviews = [...np[rk].reviews, { ...topico, reviewInterval: interval }];
      });
      return { ...p, plan: np };
    });
    return { ...db, planos };
  });
  return nextDay; // retorna a data de destino
};

// ============================================================
// REMANEJAMENTO AUTOMÁTICO — aulas e revisões pendentes em dias
// passados são movidas para o próximo dia útil.
//
// Disparada automaticamente:
//   • Ao carregar o app (qualquer hora)        → cutoff = hoje
//   • Diariamente às 23:59:30 (timer interno)  → cutoff = amanhã
//
// Comportamento:
//   • Para cada aula NÃO concluída em dias < cutoff:
//       – Remove do dia antigo
//       – Reagenda para o próximo dia útil (respeita capacidade
//         aulasPorDia/diasConfig e feriados nacionais BR)
//       – Recria as revisões a partir da nova data (REVIEW_PRESETS)
//   • Para cada revisão NÃO concluída em dias < cutoff:
//       – Se o tópico-pai foi remanejado, ignora (a revisão já foi
//         recriada junto com a aula)
//       – Caso contrário, move para o próximo dia útil
//   • Aulas e revisões já marcadas como concluídas permanecem no
//     dia original (preserva o histórico real de estudo).
// ============================================================
planosModule.remanejarPendentesPassados = function(cutoffDateKeyParam) {
  const todayKey = localDateKey();
  const cutoffKey = cutoffDateKeyParam || todayKey;
  const cutoffDate = new Date(cutoffKey + "T12:00:00");
  const db = storage.get();
  const planos = db.planos || [];
  if (planos.length === 0) return { aulas: 0, revisoes: 0 };

  // Conjunto de chaves "aluno|plano|key" feitas (done=true)
  const progressoSet = new Set(
    (db.progresso || [])
      .filter(p => p.done)
      .map(p => `${p.alunoId}|${p.planoId}|${p.key}`)
  );

  let totalAulasMovidas = 0;
  let totalRevisoesMovidas = 0;
  let mudou = false;

  const planosAtualizados = planos.map(plano => {
    const diasConfig = plano.rotina?.diasConfig || null;
    const aulasPorDia = plano.rotina?.aulasPorDia || 1;
    const diasEstudo = plano.rotina?.dias || [1, 2, 3, 4, 5];
    const aulasNoDia = (dow) => {
      if (diasConfig) return diasConfig[dow] || 0;
      return diasEstudo.includes(dow) ? aulasPorDia : 0;
    };
    const proxDiaUtilLocal = (fromDate) => {
      let d = new Date(fromDate);
      let safety = 0;
      while ((aulasNoDia(d.getDay()) === 0 || isFeriadoBR(d)) && safety < 60) {
        d.setDate(d.getDate() + 1); safety++;
      }
      return d;
    };

    const np = JSON.parse(JSON.stringify(plano.plan || {}));
    const allKeys = Object.keys(np).sort();
    const pastKeys = allKeys.filter(dk => dk < cutoffKey);
    if (pastKeys.length === 0) return plano;

    // 1) Coleta aulas e revisões pendentes; mantém apenas as feitas no dia antigo
    const aulasPendentes = [];   // { topico, oldKey }
    const revisoesPendentes = []; // { review, oldKey }

    pastKeys.forEach(dk => {
      const day = np[dk];
      if (!day) return;
      const planoKey = `${plano.alunoId}|${plano.id}`;
      const topicosFeitos = [];
      const topicosPend = [];
      (day.topicos || []).forEach(t => {
        const k = `${planoKey}|${dk}-${t.id}`;
        if (progressoSet.has(k)) topicosFeitos.push(t);
        else topicosPend.push(t);
      });
      const revsFeitas = [];
      const revsPend = [];
      (day.reviews || []).forEach(r => {
        const k = `${planoKey}|${dk}-${r.id}-rev`;
        if (progressoSet.has(k)) revsFeitas.push(r);
        else revsPend.push(r);
      });
      topicosPend.forEach(t => aulasPendentes.push({ topico: t, oldKey: dk }));
      revsPend.forEach(r => revisoesPendentes.push({ review: r, oldKey: dk }));
      np[dk] = { ...day, topicos: topicosFeitos, reviews: revsFeitas };
    });

    if (aulasPendentes.length === 0 && revisoesPendentes.length === 0) return plano;

    const ensureDay = (key) => {
      if (!np[key]) np[key] = { date: key, topicos: [], reviews: [] };
    };

    // 2) Move aulas pendentes em ordem cronológica, respeitando aulasPorDia
    aulasPendentes.sort((a, b) => a.oldKey.localeCompare(b.oldKey));
    let cursorDate = proxDiaUtilLocal(new Date(cutoffDate));
    const movingTopicIds = new Set();

    aulasPendentes.forEach(({ topico }) => {
      let safety = 0;
      while (safety < 120) {
        const dow = cursorDate.getDay();
        if (aulasNoDia(dow) === 0 || isFeriadoBR(cursorDate)) {
          cursorDate.setDate(cursorDate.getDate() + 1); safety++; continue;
        }
        const cKey = localDateKey(cursorDate);
        ensureDay(cKey);
        const ocupadas = (np[cKey].topicos || []).length;
        if (ocupadas < aulasNoDia(dow)) {
          // Antes de adicionar, remove revisões PENDENTES futuras desse mesmo tópico
          // (serão recriadas a partir da nova data). Revisões já feitas são preservadas.
          Object.keys(np).forEach(dk => {
            if (dk >= cKey) {
              np[dk].reviews = (np[dk].reviews || []).filter(r => {
                if (r.id !== topico.id) return true;
                const rk = `${plano.alunoId}|${plano.id}|${dk}-${r.id}-rev`;
                return progressoSet.has(rk); // mantém só as feitas
              });
            }
          });
          np[cKey].topicos = [...(np[cKey].topicos || []), topico];
          movingTopicIds.add(topico.id);
          // Recria as revisões a partir da nova data (preset da matéria)
          const intervals = REVIEW_PRESETS[topico.materiaReviewPreset || "moderada"] || REVIEW_INTERVALS;
          intervals.forEach(interval => {
            let rd = new Date(cursorDate); rd.setDate(rd.getDate() + interval);
            rd = proxDiaUtilLocal(rd);
            const rk = localDateKey(rd);
            ensureDay(rk);
            if (!np[rk].reviews.find(r => r.id === topico.id && r.reviewInterval === interval)) {
              np[rk].reviews = [...np[rk].reviews, { ...topico, reviewInterval: interval }];
            }
          });
          totalAulasMovidas++;
          mudou = true;
          break;
        }
        cursorDate.setDate(cursorDate.getDate() + 1); safety++;
      }
    });

    // 3) Move revisões pendentes que NÃO são de aulas remanejadas.
    //    Respeita maxRevisoesPorDia transbordando para o próximo dia útil.
    const maxRevDay = plano.rotina?.maxRevisoesPorDia || 0;
    let revCursorDate = proxDiaUtilLocal(new Date(cutoffDate));
    const proximoDiaComEspaco = (fromDate) => {
      let d = new Date(fromDate);
      let safety = 0;
      while (safety < 365) {
        if (aulasNoDia(d.getDay()) > 0 && !isFeriadoBR(d)) {
          const k = localDateKey(d);
          ensureDay(k);
          if (maxRevDay <= 0 || (np[k].reviews || []).length < maxRevDay) return d;
        }
        d.setDate(d.getDate() + 1); safety++;
      }
      return d;
    };
    revisoesPendentes.forEach(({ review }) => {
      if (movingTopicIds.has(review.id)) return; // já recriadas com a aula
      revCursorDate = proximoDiaComEspaco(revCursorDate);
      const rk = localDateKey(revCursorDate);
      ensureDay(rk);
      const ja = np[rk].reviews.find(r => r.id === review.id && r.reviewInterval === review.reviewInterval);
      if (!ja) {
        np[rk].reviews = [...np[rk].reviews, review];
        totalRevisoesMovidas++;
        mudou = true;
      }
    });

    // 4) Cap reviews per day em cascata — após mover aulas (que recriam revisões)
    //    e revisões pendentes, garante que nenhum dia ultrapasse maxRevisoesPorDia.
    if (maxRevDay > 0) {
      let safetyCap = 0;
      while (safetyCap < 10) {
        safetyCap++;
        let changed = false;
        const keysSorted = Object.keys(np).sort();
        for (let i = 0; i < keysSorted.length; i++) {
          const dk = keysSorted[i];
          const day = np[dk];
          if (!day.reviews || day.reviews.length <= maxRevDay) continue;
          const overflow = day.reviews.splice(maxRevDay);
          changed = true;
          mudou = true;
          let j = i + 1;
          let placed = false;
          while (j < keysSorted.length) {
            const nk = keysSorted[j];
            const nd = new Date(nk + "T12:00:00");
            if (aulasNoDia(nd.getDay()) > 0 && !isFeriadoBR(nd)) {
              np[nk].reviews = [...overflow, ...np[nk].reviews];
              placed = true; break;
            }
            j++;
          }
          if (!placed) {
            const lastKey = keysSorted[keysSorted.length - 1];
            let extDate = new Date(lastKey + "T12:00:00");
            let s2 = 0;
            do { extDate.setDate(extDate.getDate() + 1); s2++; }
            while ((aulasNoDia(extDate.getDay()) === 0 || isFeriadoBR(extDate)) && s2 < 30);
            const ek = localDateKey(extDate);
            ensureDay(ek);
            np[ek].reviews = [...overflow, ...np[ek].reviews];
            keysSorted.push(ek);
          }
        }
        if (!changed) break;
      }
    }

    return { ...plano, plan: np };
  });

  if (mudou) {
    storage.set(db => ({ ...db, planos: planosAtualizados }));
    if (typeof console !== "undefined") {
      console.log(`[EstudaAI] Remanejamento automático: ${totalAulasMovidas} aula(s) e ${totalRevisoesMovidas} revisão(ões) movidas para o próximo dia útil.`);
    }
  }
  return { aulas: totalAulasMovidas, revisoes: totalRevisoesMovidas };
};

// Agendador interno: roda no carregamento do app + diariamente às 23:59:30.
// Idempotente: pode ser chamado várias vezes; só haverá um timer ativo.
let _remanejarTimer = null;
planosModule.iniciarRemanejamentoAutomatico = function() {
  if (typeof window === "undefined") return;
  // 1) Execução imediata (cutoff = hoje → move dias passados)
  try { planosModule.remanejarPendentesPassados(); } catch (e) {
    console.warn("[EstudaAI] Erro no remanejamento inicial:", e);
  }
  // 2) Agendamento recursivo às 23:59:30 (cutoff = amanhã → move TODAS as
  //    aulas/revisões não estudadas no dia que está terminando).
  const agendar = () => {
    const agora = new Date();
    const alvo = new Date(agora);
    alvo.setHours(23, 59, 30, 0);
    if (alvo.getTime() <= agora.getTime()) alvo.setDate(alvo.getDate() + 1);
    const ms = alvo.getTime() - agora.getTime();
    if (_remanejarTimer) clearTimeout(_remanejarTimer);
    _remanejarTimer = setTimeout(() => {
      try {
        // Cutoff = amanhã: ao rodar às 23:59:30 de hoje, marca o dia atual
        // como "passado", movendo todas as aulas/revisões pendentes dele.
        const amanha = new Date();
        amanha.setDate(amanha.getDate() + 1);
        planosModule.remanejarPendentesPassados(localDateKey(amanha));
      } catch (e) {
        console.warn("[EstudaAI] Erro no remanejamento agendado:", e);
      }
      agendar(); // re-agenda para o próximo dia
    }, ms);
  };
  agendar();
};

// Importa uma aula já estudada: marca como concluída em data passada e adiciona revisões futuras
planosModule.importarAulaJaEstudada = function(planoId, alunoId, topicId, completionDateKey, reviewIntervals) {
  const plano = this.getById(planoId);
  if (!plano) return;

  // Busca o objeto do tópico no plano
  let topicObj = null;
  for (const day of Object.values(plano.plan)) {
    const t = (day.topicos || []).find(t => t.id === topicId);
    if (t) { topicObj = t; break; }
  }
  if (!topicObj) return;

  const todayKey = localDateKey();
  const progKey = `${completionDateKey}-${topicId}`;

  // Marca como concluída com flag de importação manual
  storage.set(db => {
    const prog = db.progresso;
    const idx = prog.findIndex(p => p.alunoId === alunoId && p.planoId === planoId && p.key === progKey);
    if (idx >= 0) {
      const updated = [...prog];
      updated[idx] = { ...updated[idx], done: true, importado: true, importadoEm: new Date().toISOString() };
      return { ...db, progresso: updated };
    }
    return { ...db, progresso: [...prog, { alunoId, planoId, key: progKey, done: true, importado: true, importadoEm: new Date().toISOString(), at: new Date().toISOString() }] };
  });

  // Remove a aula do plano futuro e reconstrói revisões
  storage.set(db => {
    const planos = db.planos.map(p => {
      if (p.id !== planoId) return p;
      const np = JSON.parse(JSON.stringify(p.plan));

      // Remove a aula de todos os dias futuros (já está concluída)
      Object.keys(np).forEach(dk => {
        if (dk >= todayKey) {
          np[dk].topicos = (np[dk].topicos || []).filter(t => t.id !== topicId);
          // Remove revisões existentes para este tópico (serão recriadas abaixo)
          if (reviewIntervals && reviewIntervals.length > 0) {
            np[dk].reviews = (np[dk].reviews || []).filter(r => r.id !== topicId);
          }
        }
      });

      // Adiciona revisões futuras baseadas na data de conclusão
      if (reviewIntervals && reviewIntervals.length > 0) {
        const compD = new Date(completionDateKey + "T12:00:00");
        reviewIntervals.forEach(interval => {
          let revDate = new Date(compD);
          revDate.setDate(revDate.getDate() + interval);
          const revKey = localDateKey(revDate);
          if (revKey < todayKey) return; // Revisões já passadas são ignoradas
          if (!np[revKey]) np[revKey] = { date: revKey, topicos: [], reviews: [] };
          if (!np[revKey].reviews.find(r => r.id === topicId && r.reviewInterval === interval)) {
            np[revKey].reviews.push({ ...topicObj, reviewInterval: interval });
          }
        });
      }

      return { ...p, plan: np };
    });
    return { ...db, planos };
  });

  logModule.add(alunoId, `Aula importada manualmente: ${topicObj.name}`, { planoId, topicId, completionDateKey, reviewIntervals });
  persistToSupabase();
};

// ============================================================
// DESIGN SYSTEM
// ============================================================
const COLORS_MATERIAS = ["#6366f1","#ec4899","#14b8a6","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#10b981","#f97316","#3b82f6"];
const DAYS_FULL = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
// Usa data LOCAL do browser (evita bug de fuso: após 22h BRT o toISOString() já retorna dia seguinte UTC)
// Obter data de hoje em São Paulo
function getTodaySaoPaulo() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Sao_Paulo'
  });

  const parts = formatter.formatToParts(now);
  const year = parseInt(parts.find(p => p.type === 'year').value);
  const month = parseInt(parts.find(p => p.type === 'month').value);
  const day = parseInt(parts.find(p => p.type === 'day').value);

  const dateInSaoPaulo = new Date(year, month - 1, day);
  dateInSaoPaulo.setHours(0, 0, 0, 0);
  return dateInSaoPaulo;
}

function localDateKey(d) {
  const x = d || new Date();
  // Converter para fuso horário de São Paulo (America/Sao_Paulo)
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'America/Sao_Paulo'
  });

  const parts = formatter.formatToParts(x);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;

  return `${year}-${month}-${day}`;
}

const css = `
@import url("https://fonts.googleapis.com/css2?family=Cabinet+Grotesk:wght@400;500;700;800;900&family=Instrument+Sans:wght@400;500;600&display=swap");
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#07080f;--s1:#0e0f1a;--s2:#151625;--s3:#1c1e30;--s4:#22243a;
  --b1:rgba(255,255,255,0.06);--b2:rgba(255,255,255,0.1);--b3:rgba(255,255,255,0.18);
  --t1:#eeeef8;--t2:#9898b8;--t3:#5a5a80;
  --green:#22d3a5;--green-d:rgba(34,211,165,0.12);--green-b:rgba(34,211,165,0.25);
  --blue:#60a5fa;--blue-d:rgba(96,165,250,0.12);
  --purple:#a78bfa;--purple-d:rgba(167,139,250,0.12);
  --red:#f87171;--red-d:rgba(248,113,113,0.12);
  --amber:#fbbf24;--amber-d:rgba(251,191,36,0.12);
  --r:12px;--r-sm:8px;--r-lg:18px;--r-xl:26px;
  --shadow:0 8px 32px rgba(0,0,0,0.5);
  font-family:"Instrument Sans",sans-serif;font-size:14px;line-height:1.5;color:var(--t1)
}
html,body{background:var(--bg);min-height:100vh}
h1,h2,h3,h4{font-family:"Cabinet Grotesk",sans-serif;line-height:1.2}
.app-layout{display:flex;min-height:100vh}
.sidebar{width:248px;background:var(--s1);border-right:1px solid var(--b1);display:flex;flex-direction:column;padding:16px 10px;position:fixed;top:0;left:0;bottom:0;z-index:100;overflow-y:auto}
.main{margin-left:248px;flex:1;padding:28px 32px;min-height:100vh}
.logo{padding:10px 12px 20px;border-bottom:1px solid var(--b1);margin-bottom:8px}
.logo h2{font-size:20px;font-weight:900;letter-spacing:-0.5px}
.logo .dot{color:var(--green)}
.logo p{font-size:11px;color:var(--t3);margin-top:3px}
.nav-lbl{font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--t3);padding:12px 12px 5px}
.nav-btn{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:var(--r-sm);cursor:pointer;transition:all 0.15s;color:var(--t2);font-size:13px;font-weight:500;border:none;background:none;width:100%;text-align:left}
.nav-btn:hover{background:var(--s2);color:var(--t1)}
.nav-btn.active{background:var(--green-d);color:var(--green);font-weight:600}
.nav-icon{width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;background:var(--s3);flex-shrink:0;font-size:14px}
.nav-btn.active .nav-icon{background:var(--green-b)}
.nav-spacer{flex:1}
.user-pill{margin:8px 4px 0;padding:10px 12px;background:var(--s2);border-radius:var(--r);border:1px solid var(--b1)}
.user-pill-name{font-size:13px;font-weight:600;margin-bottom:1px}
.user-pill-role{font-size:10px;color:var(--t3);text-transform:uppercase;letter-spacing:.5px}
.ph{margin-bottom:24px;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
.ph h1{font-size:26px;font-weight:900;letter-spacing:-0.5px}
.ph p{color:var(--t2);font-size:13px;margin-top:3px}
.card{background:var(--s1);border:1px solid var(--b1);border-radius:var(--r-lg);padding:22px}
.card-sm{background:var(--s2);border:1px solid var(--b1);border-radius:var(--r);padding:14px}
.card-title{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--t3);margin-bottom:14px}
.g2{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.stat{background:var(--s1);border:1px solid var(--b1);border-radius:var(--r);padding:18px;display:flex;flex-direction:column;gap:4px}
.stat-l{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--t3)}
.stat-v{font-size:30px;font-weight:900;font-family:"Cabinet Grotesk";line-height:1.1}
.stat-s{font-size:12px;color:var(--t2)}
.btn{display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:var(--r-sm);border:none;cursor:pointer;font-family:"Cabinet Grotesk";font-size:13px;font-weight:700;transition:all 0.18s;white-space:nowrap;line-height:1}
.btn:disabled{opacity:0.4;cursor:not-allowed;transform:none}
.btn-green{background:var(--green);color:#07080f}
.btn-green:hover:not(:disabled){background:#2ff5c0;transform:translateY(-1px);box-shadow:0 4px 16px rgba(34,211,165,0.3)}
.btn-ghost{background:transparent;color:var(--t2);border:1px solid var(--b2)}
.btn-ghost:hover:not(:disabled){background:var(--s2);color:var(--t1)}
.btn-red{background:var(--red-d);color:var(--red);border:1px solid rgba(248,113,113,0.2)}
.btn-red:hover:not(:disabled){background:rgba(248,113,113,0.2)}
.btn-blue{background:var(--blue-d);color:var(--blue);border:1px solid rgba(96,165,250,0.2)}
.btn-blue:hover:not(:disabled){background:rgba(96,165,250,0.2)}
.btn-sm{padding:6px 12px;font-size:12px}
.btn-xs{padding:4px 9px;font-size:11px}
.btn-icon{padding:7px;border-radius:var(--r-sm)}
.badge{display:inline-flex;align-items:center;padding:3px 8px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.3px}
.bg{background:var(--green-d);color:var(--green)}
.bb{background:var(--blue-d);color:var(--blue)}
.bp{background:var(--purple-d);color:var(--purple)}
.br{background:var(--red-d);color:var(--red)}
.ba{background:var(--amber-d);color:var(--amber)}
.bn{background:var(--s3);color:var(--t2)}
.form-group{margin-bottom:13px}
.lbl{display:block;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--t2);margin-bottom:5px}
.inp{width:100%;padding:9px 12px;background:var(--s2);border:1px solid var(--b2);border-radius:var(--r-sm);color:var(--t1);font-family:inherit;font-size:13px;outline:none;transition:border-color .15s}
.inp:focus{border-color:var(--green)}
.inp::placeholder{color:var(--t3)}
select.inp{cursor:pointer}
.table{width:100%;border-collapse:collapse}
.table th{text-align:left;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--t3);padding:8px 12px;border-bottom:1px solid var(--b1)}
.table td{padding:11px 12px;border-bottom:1px solid var(--b1);font-size:13px;vertical-align:middle}
.table tr:last-child td{border-bottom:none}
.table tr:hover td{background:rgba(255,255,255,0.02)}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px}
.modal{background:var(--s1);border:1px solid var(--b2);border-radius:var(--r-xl);padding:28px;width:100%;max-width:520px;max-height:85vh;overflow-y:auto}
.modal-wide{max-width:680px}
.modal-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.modal-hd h2{font-size:19px;font-weight:900}
.modal-ft{display:flex;gap:8px;justify-content:flex-end;margin-top:20px;padding-top:18px;border-top:1px solid var(--b1)}
.modal-x{background:none;border:none;color:var(--t2);cursor:pointer;padding:4px 8px;border-radius:6px;font-size:16px;line-height:1}
.modal-x:hover{color:var(--t1);background:var(--s2)}
.pbar{height:5px;background:var(--s3);border-radius:5px;overflow:hidden}
.pbar-fill{height:100%;border-radius:5px;transition:width .5s ease}
.row{display:flex;align-items:center;gap:8px}
.row-b{display:flex;align-items:center;justify-content:space-between;gap:8px}
.mt2{margin-top:8px}.mt3{margin-top:12px}.mt4{margin-top:16px}
.mb2{margin-bottom:8px}.mb3{margin-bottom:12px}.mb4{margin-bottom:16px}
.text-sm{font-size:12px}.text-xs{font-size:11px}.text-muted{color:var(--t2)}.text-dim{color:var(--t3)}
.fw6{font-weight:600}.fw7{font-weight:700}.fw9{font-weight:900}
.fh{font-family:"Cabinet Grotesk",sans-serif}
.empty{text-align:center;padding:50px 20px;color:var(--t3)}
.empty h3{font-size:16px;font-weight:700;color:var(--t2);margin-bottom:6px}
.dot-c{width:10px;height:10px;border-radius:50%;flex-shrink:0}
.ck-btn{width:22px;height:22px;min-width:22px;border-radius:6px;border:1.5px solid var(--b2);background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;color:transparent;transition:all .15s}
.ck-btn:hover{border-color:var(--green);color:var(--green)}
.ck-btn.ck{background:var(--green);border-color:var(--green);color:#07080f}
.topic-row{display:flex;align-items:center;gap:9px;padding:8px 11px;background:var(--s2);border-radius:var(--r-sm);margin-bottom:5px;border:1px solid transparent}
.topic-row:hover{border-color:var(--b2)}
.topic-row.done{opacity:0.4}
.topic-row.done .tr-name{text-decoration:line-through}
.tr-name{flex:1;font-size:13px}
.tr-tag{font-size:11px;color:var(--t3)}
.rev-sec{border-left:2px solid var(--amber);padding-left:11px;margin-top:9px}
.rev-lbl{font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;color:var(--amber);margin-bottom:5px}
.day-card{background:var(--s1);border:1px solid var(--b1);border-radius:var(--r);padding:15px;margin-bottom:9px}
.day-card.today{border-color:var(--green)}
.sec-card{background:var(--s1);border:1px solid var(--b1);border-radius:var(--r-lg);overflow:hidden;margin-bottom:14px}
.sec-hd{padding:14px 18px;border-bottom:1px solid var(--b1);display:flex;align-items:center;justify-content:space-between}
.chip{display:inline-flex;align-items:center;padding:3px 8px;background:var(--s3);border:1px solid var(--b1);border-radius:5px;font-size:11px;margin:2px}
.alert{padding:11px 14px;border-radius:var(--r-sm);font-size:13px;margin-bottom:14px;display:flex;gap:9px;align-items:flex-start}
.alert-blue{background:var(--blue-d);border:1px solid rgba(96,165,250,0.2);color:#93c5fd}
.alert-green{background:var(--green-d);border:1px solid rgba(34,211,165,0.2);color:var(--green)}.alert-red{background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);color:#f87171}
.login-wrap{min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);padding:20px;position:relative;overflow:hidden}
.login-wrap::before{content:'';position:absolute;width:500px;height:500px;background:radial-gradient(circle,rgba(34,211,165,0.07) 0%,transparent 70%);top:-80px;left:-80px;pointer-events:none}
.foco-topic{background:var(--s2);border:1.5px solid var(--b2);border-radius:18px;padding:32px 28px;margin-bottom:20px;text-align:center;transition:border-color .2s}
.foco-topic:hover{border-color:var(--green)}
.btn-estudar{background:var(--green);color:#07080f;font-family:"Cabinet Grotesk";font-size:17px;font-weight:900;width:100%;padding:16px;border-radius:10px;border:none;cursor:pointer;transition:all .18s;margin-bottom:10px}
.btn-estudar:hover{background:#2ff5c0;transform:translateY(-1px);box-shadow:0 6px 20px rgba(34,211,165,0.35)}
.btn-pular{background:transparent;color:var(--t2);border:1px solid var(--b2);font-family:"Cabinet Grotesk";font-size:13px;font-weight:700;width:100%;padding:11px;border-radius:10px;cursor:pointer;transition:all .15s}
.btn-pular:hover{background:var(--s2);color:var(--t1)}
.step-bar{display:flex;gap:6px;margin-bottom:28px}
.step-seg{height:6px;border-radius:3px;flex:1;transition:all .3s}
.wizard-center{max-width:520px;margin:0 auto}
.edital-opt{padding:14px 18px;border-radius:12px;cursor:pointer;margin-bottom:10px;border:2px solid var(--b2);background:var(--s2);transition:all .15s}
.edital-opt:hover{border-color:var(--b3)}
.edital-opt.sel{border-color:var(--green);background:var(--green-d)}
.dia-pill{padding:8px 12px;border-radius:8px;cursor:pointer;border:1.5px solid var(--b2);background:var(--s2);color:var(--t2);font-family:"Cabinet Grotesk";font-weight:700;font-size:12px;transition:all .15s;user-select:none}
.dia-pill.sel{border-color:var(--green);background:var(--green-d);color:var(--green)}
.apd-pill{flex:1;padding:10px 0;border-radius:8px;cursor:pointer;text-align:center;border:1.5px solid var(--b2);background:var(--s2);color:var(--t2);font-family:"Cabinet Grotesk";font-weight:700;font-size:16px;transition:all .15s}
.apd-pill.sel{border-color:var(--green);background:var(--green-d);color:var(--green)}
.streak-bar{display:flex;align-items:center;gap:12px}
.gami-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px}
@media(max-width:700px){.gami-grid{grid-template-columns:1fr 1fr}.g4{grid-template-columns:1fr 1fr}.g3{grid-template-columns:1fr 1fr}.sidebar{display:none}.main{margin-left:0}}
.login-wrap::after{content:'';position:absolute;width:350px;height:350px;background:radial-gradient(circle,rgba(96,165,250,0.05) 0%,transparent 70%);bottom:-30px;right:-30px;pointer-events:none}
.rank-table{width:100%;border-collapse:collapse}.rank-table th{text-align:left;font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;color:var(--t3);padding:10px 12px;border-bottom:1px solid var(--b2)}.rank-table td{padding:12px;border-bottom:1px solid var(--b1);font-size:13px;vertical-align:middle}.rank-pos{font-family:"Cabinet Grotesk";font-weight:900;font-size:18px;width:36px;text-align:center}.rank-1{color:#fbbf24}.rank-2{color:#9ca3af}.rank-3{color:#b45309}.preset-btn{padding:6px 12px;border-radius:7px;border:1.5px solid var(--b2);background:var(--s3);cursor:pointer;font-size:12px;font-weight:600;color:var(--t2);transition:all .15s}.preset-btn.active{border-color:var(--green);background:var(--green-d);color:var(--green)}.adiantar-btn{width:100%;padding:12px;border-radius:10px;border:1.5px dashed var(--amber);background:var(--amber-d);cursor:pointer;font-size:13px;font-weight:700;color:var(--amber);display:flex;align-items:center;justify-content:center;gap:8px;transition:all .15s;margin-top:10px}.adiantar-btn:hover{background:rgba(251,191,36,.2)}.mat-link{color:var(--blue);font-size:11px;text-decoration:none;display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:5px;background:var(--blue-d);white-space:nowrap;flex-shrink:0}.mat-link:hover{background:rgba(96,165,250,.25)}.upload-zone{border:2px dashed var(--b2);border-radius:10px;padding:22px;text-align:center;cursor:pointer;transition:all .15s}.upload-zone:hover{border-color:var(--blue);background:var(--blue-d)}
.login-box{background:var(--s1);border:1px solid var(--b2);border-radius:var(--r-xl);padding:40px;width:100%;max-width:400px;position:relative;z-index:1;box-shadow:var(--shadow)}
.login-logo{text-align:center;margin-bottom:32px}
.login-logo h1{font-size:32px;font-weight:900;letter-spacing:-1px}
.login-logo p{color:var(--t2);font-size:12px;margin-top:5px}
.profile-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:24px}
.pc{padding:14px 8px;border:1.5px solid var(--b1);border-radius:var(--r);cursor:pointer;text-align:center;transition:all .18s;background:var(--s2)}
.pc:hover{border-color:var(--b3);background:var(--s3)}
.pc.sel{border-color:var(--green);background:var(--green-d)}
.pc-icon{font-size:22px;margin-bottom:6px}
.pc-name{font-family:"Cabinet Grotesk";font-size:13px;font-weight:700}
.pc-sub{font-size:10px;color:var(--t3);margin-top:1px}
.divider{border:none;border-top:1px solid var(--b1);margin:18px 0}
.err{color:var(--red);font-size:12px;text-align:center;margin-top:8px;font-weight:600}
@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
.fi{animation:fadeIn .2s ease}
`;

// ============================================================
// COMPONENTE: AlunoOnboarding — wizard "Começar Hoje"
// ============================================================
function AlunoOnboarding({ user, editais, onGenerate }) {
  const firstEdital = editaisModule.getById(editais[0]?.id || "");
  const [step, setStep] = useState(1);
  const [editalId, setEditalId] = useState(editais[0]?.id || "");
  const [materiaIds, setMateriaIds] = useState(() => firstEdital ? firstEdital.materias.map(m => m.id) : []);
  // diasConfig: { 0:0, 1:2, 2:2, 3:2, 4:2, 5:2, 6:0 } — 0 = folga
  const [diasConfig, setDiasConfig] = useState({ 0:0, 1:2, 2:2, 3:2, 4:2, 5:2, 6:0 });
  const [rotinaMode, setRotinaMode] = useState("manual"); // "manual" | "data"
  const [dataFim, setDataFim] = useState("");
  const [maxRevisoes, setMaxRevisoes] = useState(5);
  const [minRevisoes, setMinRevisoes] = useState(0);
  const [modoOrganizacao, setModoOrganizacao] = useState("alternado");
  const [nivelCobertura, setNivelCobertura] = useState(["media"]); // array of selected levels: "alta", "media", "baixa"
  function setDayAulas(dow, val) {
    setDiasConfig(prev => ({ ...prev, [dow]: Math.max(0, Math.min(5, val)) }));
  }
  function calcSugestao() {
    if (!dataFim || totalTop === 0) return null;
    const today = new Date(); today.setHours(0,0,0,0);
    const fim = new Date(dataFim + "T00:00:00");
    const diasTotal = Math.round((fim - today) / 86400000);
    if (diasTotal <= 0) return null;
    const semanasTotal = diasTotal / 7;
    const aulasSemanaNeed = Math.ceil(totalTop / semanasTotal);
    const apd = Math.max(1, Math.ceil(aulasSemanaNeed / 5));
    const capped = Math.min(5, apd);
    const sugestedCfg = { 0:0, 1:capped, 2:capped, 3:capped, 4:capped, 5:capped, 6:0 };
    const aulasSemSug = capped * 5;
    const semanasSug = aulasSemSug > 0 ? Math.ceil(totalTop / aulasSemSug) : 0;
    return { diasTotal, semanasTotal: Math.ceil(semanasTotal), aulasSemanaNeed, apd: capped, sugestedCfg, semanasSug };
  }
  const edital = editaisModule.getById(editalId);

  // When edital changes, default to all materias selected
  function handleSelectEdital(id) {
    setEditalId(id);
    const ed = editaisModule.getById(id);
    setMateriaIds(ed ? ed.materias.map(m => m.id) : []);
  }

  function toggleMateria(id) {
    setMateriaIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  }

  const selectedMaterias = edital ? edital.materias.filter(m => materiaIds.includes(m.id)) : [];
  const totalTop = selectedMaterias.reduce((a,m) => a + m.topicos.length, 0);
  const sugestao = rotinaMode === "data" ? calcSugestao() : null;
  const aulasSem = Object.values(diasConfig).reduce((a,n) => a + n, 0);
  const semanas = aulasSem > 0 ? Math.ceil(totalTop / aulasSem) : 0;
  const previsao = semanas > 0 ? new Date(Date.now() + semanas*7*86400000).toLocaleDateString("pt-BR",{day:"2-digit",month:"long"}) : "—";
  const diasAtivos = Object.values(diasConfig).filter(n => n > 0).length;

  function handleGerar() {
    try {
      const plano = planosModule.generate(user.id, editalId, { diasConfig, materiaIds, maxRevisoesPorDia: maxRevisoes, minRevisoesPorDia: minRevisoes, modoOrganizacao, nivelCobertura });
      if (!plano) throw new Error("Não foi possível gerar o plano.");
      onGenerate();
    } catch (e) {
      console.error("[EstudaAI] handleGerar:", e);
      alert("Não foi possível gerar o plano:\n\n" + (e?.message || "Erro desconhecido."));
    }
  }

  return (
    <div className="wizard-center">
      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{fontSize:44}}>🎯</div>
        <h1 style={{fontSize:26,fontWeight:900,marginTop:8,letterSpacing:"-0.5px"}}>Começar Hoje</h1>
        <p style={{color:"var(--t2)",marginTop:5,fontSize:13}}>Configure sua rotina e gere seu plano personalizado</p>
      </div>
      <div className="step-bar">
        {[1,2,3,4].map(s=><div key={s} className="step-seg" style={{background:s<=step?"var(--green)":"var(--s3)",opacity:s<step?0.55:1}}/>)}
      </div>

      {/* STEP 1 — Edital */}
      {step===1&&(
        <div className="card fi">
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{fontSize:26}}>📋</div>
            <h2 style={{fontSize:17,fontWeight:900,marginTop:6}}>Qual é o seu objetivo?</h2>
            <p style={{color:"var(--t2)",fontSize:13,marginTop:3}}>Escolha o edital que deseja estudar</p>
          </div>
          {editais.map(e=>{
            const tot=e.materias.reduce((a,m)=>a+m.topicos.length,0);
            return(<div key={e.id} className={`edital-opt${editalId===e.id?" sel":""}`} onClick={()=>handleSelectEdital(e.id)}>
              <div style={{fontFamily:"Cabinet Grotesk",fontWeight:700,fontSize:15,color:editalId===e.id?"var(--green)":"var(--t1)"}}>{e.name}</div>
              <div style={{fontSize:12,color:"var(--t3)",marginTop:3}}>{e.materias.length} matérias · {tot} tópicos</div>
            </div>);
          })}
          <button className="btn btn-green mt4" style={{width:"100%"}} disabled={!editalId} onClick={()=>setStep(2)}>Continuar →</button>
        </div>
      )}

      {/* STEP 2 — Matérias */}
      {step===2&&(
        <div className="card fi">
          <div style={{textAlign:"center",marginBottom:20}}>
            <div style={{fontSize:26}}>📚</div>
            <h2 style={{fontSize:17,fontWeight:900,marginTop:6}}>Quais matérias estudar?</h2>
            <p style={{color:"var(--t2)",fontSize:13,marginTop:3}}>{modoOrganizacao==="sequencial"?"Cada disciplina será estudada em bloco antes da próxima":"Os tópicos serão alternados entre as matérias selecionadas"}</p>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",marginBottom:8,gap:8}}>
            <button className="btn btn-ghost btn-xs" onClick={()=>setMateriaIds(edital.materias.map(m=>m.id))}>Todas</button>
            <button className="btn btn-ghost btn-xs" onClick={()=>setMateriaIds([])}>Nenhuma</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:320,overflowY:"auto"}}>
            {edital&&edital.materias.map(m=>{
              const sel = materiaIds.includes(m.id);
              return (
              <div key={m.id} onClick={()=>toggleMateria(m.id)} style={{display:"flex",alignItems:"center",gap:12,padding:"11px 14px",borderRadius:10,border:`1.5px solid ${sel?"var(--green)":"var(--b2)"}`,background:sel?"var(--s2)":"var(--s1)",cursor:"pointer",transition:"all .15s"}}>
                  <div style={{width:12,height:12,borderRadius:"50%",background:m.color,flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:13,color:sel?"var(--green)":"var(--t1)"}}>{m.name}</div>
                    <div style={{fontSize:11,color:"var(--t3)",marginTop:1}}>{m.topicos.length} tópico{m.topicos.length!==1?"s":""}</div>
                  </div>
                  <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${sel?"var(--green)":"var(--b2)"}`,background:sel?"var(--green)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:11,color:"#07080f",fontWeight:900}}>
                    {sel&&"✓"}
                  </div>
                </div>
              );
            })}
          </div>
          {materiaIds.length>0&&<div style={{marginTop:10,fontSize:12,color:"var(--t3)",textAlign:"center"}}>{materiaIds.length} matéria{materiaIds.length!==1?"s":""} · {totalTop} tópico{totalTop!==1?"s":""} selecionado{totalTop!==1?"s":""}</div>}
          <div style={{marginTop:16,padding:"14px 16px",borderRadius:10,background:"var(--s2)",border:"1px solid var(--b1)"}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--t2)",marginBottom:10}}>📚 Organização das matérias</div>
            <div style={{display:"flex",gap:8}}>
              <div onClick={()=>setModoOrganizacao("alternado")} style={{flex:1,padding:"10px 12px",borderRadius:8,border:`1.5px solid ${modoOrganizacao==="alternado"?"var(--green)":"var(--b2)"}`,background:modoOrganizacao==="alternado"?"rgba(34,211,165,0.07)":"transparent",cursor:"pointer",textAlign:"center",transition:"all .15s"}}>
                <div style={{fontSize:16,marginBottom:4}}>🔀</div>
                <div style={{fontSize:12,fontWeight:700,color:modoOrganizacao==="alternado"?"var(--green)":"var(--t1)"}}>Alternadas</div>
                <div style={{fontSize:10,color:"var(--t3)",marginTop:2}}>Intercala matérias todo dia</div>
              </div>
              <div onClick={()=>setModoOrganizacao("sequencial")} style={{flex:1,padding:"10px 12px",borderRadius:8,border:`1.5px solid ${modoOrganizacao==="sequencial"?"var(--blue)":"var(--b2)"}`,background:modoOrganizacao==="sequencial"?"rgba(96,165,250,0.07)":"transparent",cursor:"pointer",textAlign:"center",transition:"all .15s"}}>
                <div style={{fontSize:16,marginBottom:4}}>📖</div>
                <div style={{fontSize:12,fontWeight:700,color:modoOrganizacao==="sequencial"?"var(--blue)":"var(--t1)"}}>Sequencial</div>
                <div style={{fontSize:10,color:"var(--t3)",marginTop:2}}>Uma matéria por vez</div>
              </div>
            </div>
          </div>
          <div style={{display:"flex",gap:10,marginTop:16}}>
            <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setStep(1)}>← Voltar</button>
            <button className="btn btn-green" style={{flex:2}} disabled={materiaIds.length===0} onClick={()=>setStep(3)}>Continuar →</button>
          </div>
        </div>
      )}

      {/* STEP 3 — Rotina por dia */}
      {step===3&&(
        <div className="card fi">
          <div style={{textAlign:"center",marginBottom:16}}>
            <div style={{fontSize:26}}>⏰</div>
            <h2 style={{fontSize:17,fontWeight:900,marginTop:6}}>Sua rotina de estudos</h2>
          </div>
          {/* Mode toggle */}
          <div style={{display:"flex",gap:6,marginBottom:18,background:"var(--s2)",borderRadius:10,padding:4}}>
            <button onClick={()=>setRotinaMode("manual")} style={{flex:1,padding:"8px 0",borderRadius:8,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,background:rotinaMode==="manual"?"var(--s4)":"transparent",color:rotinaMode==="manual"?"var(--t1)":"var(--t3)",transition:"all .15s"}}>⚙️ Configurar por dia</button>
            <button onClick={()=>setRotinaMode("data")} style={{flex:1,padding:"8px 0",borderRadius:8,border:"none",cursor:"pointer",fontWeight:700,fontSize:12,background:rotinaMode==="data"?"var(--s4)":"transparent",color:rotinaMode==="data"?"var(--t1)":"var(--t3)",transition:"all .15s"}}>📅 Por data de término</button>
          </div>

          {rotinaMode==="data"?(
            <div>
              <div className="form-group">
                <label className="lbl">Data de término do ciclo</label>
                <input className="inp" type="date" value={dataFim} onChange={e=>setDataFim(e.target.value)}
                  min={localDateKey(new Date(Date.now()+86400000))}/>
              </div>
              {sugestao?(
                <div style={{marginTop:12}}>
                  <div style={{background:"var(--s2)",borderRadius:12,padding:"16px 18px",marginBottom:14}}>
                    <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",textTransform:"uppercase",letterSpacing:.5,marginBottom:12}}>Sugestão automática</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12}}>
                      <div style={{textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,fontFamily:"Cabinet Grotesk",color:"var(--green)"}}>{sugestao.apd}</div><div style={{fontSize:10,color:"var(--t3)",fontWeight:700,textTransform:"uppercase"}}>aulas/dia</div></div>
                      <div style={{textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,fontFamily:"Cabinet Grotesk",color:"var(--blue)"}}>{sugestao.aulasSemanaNeed}</div><div style={{fontSize:10,color:"var(--t3)",fontWeight:700,textTransform:"uppercase"}}>aulas/sem</div></div>
                      <div style={{textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,fontFamily:"Cabinet Grotesk",color:"var(--amber)"}}>{sugestao.semanasSug}</div><div style={{fontSize:10,color:"var(--t3)",fontWeight:700,textTransform:"uppercase"}}>semanas</div></div>
                    </div>
                    <div style={{fontSize:12,color:"var(--t2)",textAlign:"center"}}>Seg a Sex, {sugestao.apd} aula{sugestao.apd>1?"s":""} por dia</div>
                  </div>
                  <button className="btn btn-green" style={{width:"100%",marginBottom:8}} onClick={()=>{
                    try {
                      setDiasConfig(sugestao.sugestedCfg);
                      const p = planosModule.generate(user.id,editalId,{diasConfig:sugestao.sugestedCfg,materiaIds,maxRevisoesPorDia:maxRevisoes,minRevisoesPorDia:minRevisoes,modoOrganizacao,nivelCobertura});
                      if (!p) throw new Error("Não foi possível gerar o plano.");
                      onGenerate();
                    } catch (e) {
                      console.error("[EstudaAI] criar plano automático:", e);
                      alert("Não foi possível gerar o plano:\n\n" + (e?.message || "Erro desconhecido."));
                    }
                  }}>🚀 Criar plano automaticamente</button>
                  <button className="btn btn-ghost" style={{width:"100%"}} onClick={()=>{setDiasConfig(sugestao.sugestedCfg);setRotinaMode("manual");}}>⚙️ Ajustar manualmente</button>
                </div>
              ):(
                dataFim?<div className="alert alert-red mt3">Data inválida ou no passado.</div>
                       :<p style={{color:"var(--t3)",fontSize:13,textAlign:"center",marginTop:10}}>Selecione uma data para ver a sugestão.</p>
              )}
              {/* Máx. revisões — também no modo automático */}
              <div style={{marginTop:16,padding:"14px 16px",borderRadius:10,background:"var(--s2)",border:"1px solid var(--b1)"}}>
                <div style={{fontSize:12,fontWeight:700,color:"var(--t2)",marginBottom:12}}>📚 Organização das matérias</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <label style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",borderRadius:8,border:`1.5px solid ${modoOrganizacao==="alternado"?"var(--green)":"var(--b2)"}`,background:modoOrganizacao==="alternado"?"rgba(34,211,165,0.07)":"transparent",cursor:"pointer",transition:"all .15s"}} onClick={()=>setModoOrganizacao("alternado")}>
                    <input type="radio" checked={modoOrganizacao==="alternado"} onChange={()=>setModoOrganizacao("alternado")} style={{marginTop:2,accentColor:"var(--green)"}}/>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:"var(--t1)"}}>🔀 Matérias alternadas</div>
                      <div style={{fontSize:11,color:"var(--t3)",marginTop:2}}>As disciplinas se intercalam dia a dia — mais variedade e melhor retenção</div>
                    </div>
                  </label>
                  <label style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",borderRadius:8,border:`1.5px solid ${modoOrganizacao==="sequencial"?"var(--blue)":"var(--b2)"}`,background:modoOrganizacao==="sequencial"?"rgba(96,165,250,0.07)":"transparent",cursor:"pointer",transition:"all .15s"}} onClick={()=>setModoOrganizacao("sequencial")}>
                    <input type="radio" checked={modoOrganizacao==="sequencial"} onChange={()=>setModoOrganizacao("sequencial")} style={{marginTop:2,accentColor:"var(--blue)"}}/>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:"var(--t1)"}}>📖 Matérias sequenciais</div>
                      <div style={{fontSize:11,color:"var(--t3)",marginTop:2}}>Cada disciplina é concluída em bloco antes de passar para a próxima</div>
                    </div>
                  </label>
                </div>
              </div>
              <div style={{marginTop:16,padding:"14px 16px",borderRadius:10,background:"var(--s2)",border:"1px solid var(--b1)"}}>
                <div style={{fontSize:12,fontWeight:700,color:"var(--t2)",marginBottom:12}}>🔁 Revisões por dia</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:11,color:"var(--t3)",width:50}}>Mínimo</span>
                    <button onClick={()=>setMinRevisoes(r=>Math.max(0,r-1))} style={{width:28,height:28,borderRadius:7,border:"1.5px solid var(--b2)",background:"var(--s3)",cursor:"pointer",fontSize:15,fontWeight:700,color:"var(--t2)",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                    <span style={{fontFamily:"Cabinet Grotesk",fontWeight:900,fontSize:18,color:"var(--blue)",minWidth:28,textAlign:"center"}}>{minRevisoes === 0 ? "—" : minRevisoes}</span>
                    <button onClick={()=>setMinRevisoes(r=>Math.min(maxRevisoes,r+1))} style={{width:28,height:28,borderRadius:7,border:"1.5px solid var(--b2)",background:"var(--s3)",cursor:"pointer",fontSize:15,fontWeight:700,color:"var(--t2)",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                    <span style={{fontSize:11,color:"var(--t3)"}}>puxar adiantadas p/ completar</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:11,color:"var(--t3)",width:50}}>Máximo</span>
                    <button onClick={()=>setMaxRevisoes(r=>{const v=Math.max(1,r-1);if(minRevisoes>v)setMinRevisoes(v);return v;})} style={{width:28,height:28,borderRadius:7,border:"1.5px solid var(--b2)",background:"var(--s3)",cursor:"pointer",fontSize:15,fontWeight:700,color:"var(--t2)",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                    <span style={{fontFamily:"Cabinet Grotesk",fontWeight:900,fontSize:18,color:"var(--amber)",minWidth:28,textAlign:"center"}}>{maxRevisoes}</span>
                    <button onClick={()=>setMaxRevisoes(r=>Math.min(20,r+1))} style={{width:28,height:28,borderRadius:7,border:"1.5px solid var(--b2)",background:"var(--s3)",cursor:"pointer",fontSize:15,fontWeight:700,color:"var(--t2)",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                    <span style={{fontSize:11,color:"var(--t3)"}}>excedente vai pro próximo dia</span>
                  </div>
                </div>
              </div>
              <div style={{display:"flex",gap:10,marginTop:16}}>
                <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setStep(2)}>← Voltar</button>
              </div>
            </div>
          ):(
            <div>
              <p style={{color:"var(--t2)",fontSize:13,marginBottom:12,textAlign:"center"}}>Quantas aulas por dia? Zero = folga</p>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {DAYS_FULL.map((name, dow) => {
                  const val = diasConfig[dow] || 0;
                  const ativo = val > 0;
                  return (
                    <div key={dow} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,border:`1.5px solid ${ativo?"var(--green)":"var(--b2)"}`,background:ativo?"var(--s2)":"var(--s1)",transition:"all .15s"}}>
                      <span style={{fontFamily:"Cabinet Grotesk",fontWeight:700,fontSize:13,width:48,color:ativo?"var(--t1)":"var(--t3)"}}>{name.slice(0,3)}</span>
                      <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:"auto"}}>
                        <button onClick={()=>setDayAulas(dow, val-1)} style={{width:28,height:28,borderRadius:7,border:"1.5px solid var(--b2)",background:"var(--s3)",cursor:"pointer",fontSize:16,fontWeight:700,color:"var(--t2)",display:"flex",alignItems:"center",justifyContent:"center"}} disabled={val===0}>−</button>
                        <span style={{width:24,textAlign:"center",fontFamily:"Cabinet Grotesk",fontWeight:900,fontSize:15,color:ativo?"var(--green)":"var(--t3)"}}>{val === 0 ? "—" : val}</span>
                        <button onClick={()=>setDayAulas(dow, val+1)} style={{width:28,height:28,borderRadius:7,border:"1.5px solid var(--b2)",background:"var(--s3)",cursor:"pointer",fontSize:16,fontWeight:700,color:"var(--t2)",display:"flex",alignItems:"center",justifyContent:"center"}} disabled={val===5}>+</button>
                      </div>
                      <span style={{width:80,fontSize:11,color:ativo?"var(--t2)":"var(--t3)",textAlign:"right"}}>{ativo ? `${val} aula${val>1?"s":""}` : "folga"}</span>
                    </div>
                  );
                })}
              </div>
              {aulasSem>0&&<div style={{marginTop:10,fontSize:12,color:"var(--t3)",textAlign:"center"}}>{aulasSem} aula{aulasSem!==1?"s":""}/semana · {diasAtivos} dia{diasAtivos!==1?"s":""} ativos</div>}
              <div style={{marginTop:16,padding:"14px 16px",borderRadius:10,background:"var(--s2)",border:"1px solid var(--b1)"}}>
                <div style={{fontSize:12,fontWeight:700,color:"var(--t2)",marginBottom:12}}>📚 Organização das matérias</div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <label style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",borderRadius:8,border:`1.5px solid ${modoOrganizacao==="alternado"?"var(--green)":"var(--b2)"}`,background:modoOrganizacao==="alternado"?"rgba(34,211,165,0.07)":"transparent",cursor:"pointer",transition:"all .15s"}} onClick={()=>setModoOrganizacao("alternado")}>
                    <input type="radio" checked={modoOrganizacao==="alternado"} onChange={()=>setModoOrganizacao("alternado")} style={{marginTop:2,accentColor:"var(--green)"}}/>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:"var(--t1)"}}>🔀 Matérias alternadas</div>
                      <div style={{fontSize:11,color:"var(--t3)",marginTop:2}}>As disciplinas se intercalam dia a dia — mais variedade e melhor retenção</div>
                    </div>
                  </label>
                  <label style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",borderRadius:8,border:`1.5px solid ${modoOrganizacao==="sequencial"?"var(--blue)":"var(--b2)"}`,background:modoOrganizacao==="sequencial"?"rgba(96,165,250,0.07)":"transparent",cursor:"pointer",transition:"all .15s"}} onClick={()=>setModoOrganizacao("sequencial")}>
                    <input type="radio" checked={modoOrganizacao==="sequencial"} onChange={()=>setModoOrganizacao("sequencial")} style={{marginTop:2,accentColor:"var(--blue)"}}/>
                    <div>
                      <div style={{fontSize:13,fontWeight:700,color:"var(--t1)"}}>📖 Matérias sequenciais</div>
                      <div style={{fontSize:11,color:"var(--t3)",marginTop:2}}>Cada disciplina é concluída em bloco antes de passar para a próxima</div>
                    </div>
                  </label>
                </div>
              </div>
              <div style={{marginTop:16,padding:"14px 16px",borderRadius:10,background:"var(--s2)",border:"1px solid var(--b1)"}}>
                <div style={{fontSize:12,fontWeight:700,color:"var(--t2)",marginBottom:12}}>🔁 Revisões por dia</div>
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:11,color:"var(--t3)",width:50}}>Mínimo</span>
                    <button onClick={()=>setMinRevisoes(r=>Math.max(0,r-1))} style={{width:28,height:28,borderRadius:7,border:"1.5px solid var(--b2)",background:"var(--s3)",cursor:"pointer",fontSize:15,fontWeight:700,color:"var(--t2)",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                    <span style={{fontFamily:"Cabinet Grotesk",fontWeight:900,fontSize:18,color:"var(--blue)",minWidth:28,textAlign:"center"}}>{minRevisoes === 0 ? "—" : minRevisoes}</span>
                    <button onClick={()=>setMinRevisoes(r=>Math.min(maxRevisoes,r+1))} style={{width:28,height:28,borderRadius:7,border:"1.5px solid var(--b2)",background:"var(--s3)",cursor:"pointer",fontSize:15,fontWeight:700,color:"var(--t2)",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                    <span style={{fontSize:11,color:"var(--t3)"}}>puxar adiantadas p/ completar</span>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:11,color:"var(--t3)",width:50}}>Máximo</span>
                    <button onClick={()=>setMaxRevisoes(r=>{const v=Math.max(1,r-1);if(minRevisoes>v)setMinRevisoes(v);return v;})} style={{width:28,height:28,borderRadius:7,border:"1.5px solid var(--b2)",background:"var(--s3)",cursor:"pointer",fontSize:15,fontWeight:700,color:"var(--t2)",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                    <span style={{fontFamily:"Cabinet Grotesk",fontWeight:900,fontSize:18,color:"var(--amber)",minWidth:28,textAlign:"center"}}>{maxRevisoes}</span>
                    <button onClick={()=>setMaxRevisoes(r=>Math.min(20,r+1))} style={{width:28,height:28,borderRadius:7,border:"1.5px solid var(--b2)",background:"var(--s3)",cursor:"pointer",fontSize:15,fontWeight:700,color:"var(--t2)",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                    <span style={{fontSize:11,color:"var(--t3)"}}>excedente vai pro próximo dia</span>
                  </div>
                </div>
              </div>
              <div style={{display:"flex",gap:10,marginTop:16}}>
                <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setStep(2)}>← Voltar</button>
                <button className="btn btn-green" style={{flex:2}} disabled={aulasSem===0} onClick={()=>setStep(4)}>Continuar →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STEP 4 — Confirmação */}
      {step===4&&(
        <div className="card fi">
          <div style={{textAlign:"center",marginBottom:24}}>
            <div style={{fontSize:26}}>🚀</div>
            <h2 style={{fontSize:17,fontWeight:900,marginTop:6}}>Tudo pronto!</h2>
            <p style={{color:"var(--t2)",fontSize:13,marginTop:3}}>Veja como ficará seu plano</p>
          </div>
          <div style={{background:"var(--s2)",borderRadius:12,padding:"18px 20px",marginBottom:16}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
              <div style={{textAlign:"center"}}><div style={{fontSize:28,fontWeight:900,fontFamily:"Cabinet Grotesk",color:"var(--green)"}}>{totalTop}</div><div style={{fontSize:11,color:"var(--t3)",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Tópicos</div></div>
              <div style={{textAlign:"center"}}><div style={{fontSize:28,fontWeight:900,fontFamily:"Cabinet Grotesk",color:"var(--blue)"}}>{semanas}sem</div><div style={{fontSize:11,color:"var(--t3)",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Duração</div></div>
              <div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:900,fontFamily:"Cabinet Grotesk",color:"var(--amber)"}}>{diasAtivos}×/sem</div><div style={{fontSize:11,color:"var(--t3)",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Frequência</div></div>
              <div style={{textAlign:"center"}}><div style={{fontSize:13,fontWeight:700,fontFamily:"Cabinet Grotesk",color:"var(--t1)",marginTop:3}}>{previsao}</div><div style={{fontSize:11,color:"var(--t3)",fontWeight:700,textTransform:"uppercase",letterSpacing:1}}>Previsão</div></div>
            </div>
            <div style={{borderTop:"1px solid var(--b1)",marginTop:14,paddingTop:12,display:"flex",justifyContent:"center",gap:20}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontFamily:"Cabinet Grotesk",fontWeight:900,fontSize:16,color:"var(--blue)"}}>{minRevisoes === 0 ? "—" : minRevisoes}</div>
                <div style={{fontSize:11,color:"var(--t3)"}}>mín. revisões/dia</div>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={{fontFamily:"Cabinet Grotesk",fontWeight:900,fontSize:16,color:"var(--amber)"}}>{maxRevisoes}</div>
                <div style={{fontSize:11,color:"var(--t3)"}}>máx. revisões/dia</div>
              </div>
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>Matérias no plano ({materiaIds.length})</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {selectedMaterias.map(m=>(
                <span key={m.id} style={{display:"inline-flex",alignItems:"center",gap:5,background:"var(--s3)",border:"1px solid var(--b2)",borderRadius:99,padding:"4px 10px",fontSize:12}}>
                  <span style={{width:8,height:8,borderRadius:"50%",background:m.color,display:"inline-block"}}/>
                  {m.name}
                </span>
              ))}
            </div>
          </div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>Níveis de cobertura selecionados</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {nivelCobertura.length > 0 ? nivelCobertura.map(nivel => {
                const levelConfig = {
                  baixa: { label: "Baixa", emoji: "🟢", color: "var(--green)" },
                  media: { label: "Média", emoji: "🟡", color: "var(--amber)" },
                  alta: { label: "Alta", emoji: "🔴", color: "var(--red)" }
                };
                const cfg = levelConfig[nivel];
                return (
                  <span key={nivel} style={{display:"inline-flex",alignItems:"center",gap:5,background:"var(--s3)",border:`1px solid ${cfg.color}`,borderRadius:99,padding:"4px 10px",fontSize:12,color:cfg.color,fontWeight:600}}>
                    {cfg.emoji} {cfg.label}
                  </span>
                );
              }) : <span style={{fontSize:12,color:"var(--t3)"}}>Nenhum nível selecionado</span>}
            </div>
          </div>
          <div style={{marginBottom:14,padding:"14px 16px",borderRadius:10,background:"var(--s2)",border:"1px solid var(--b1)"}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--t2)",marginBottom:12}}>📖 Nível de Cobertura</div>
            <p style={{fontSize:12,color:"var(--t3)",marginBottom:12}}>Escolha quais níveis incluir no seu plano:</p>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {[
                { id: "baixa", emoji: "🟢", label: "Baixa Cobertura", desc: "Resumos curtos", color: "var(--green)" },
                { id: "media", emoji: "🟡", label: "Média Cobertura", desc: "Conteúdo balanceado", color: "var(--amber)" },
                { id: "alta", emoji: "🔴", label: "Alta Cobertura", desc: "Conteúdo completo", color: "var(--red)" },
              ].map(opt => {
                const isSelected = nivelCobertura.includes(opt.id);
                return (
                  <div
                    key={opt.id}
                    onClick={() => {
                      setNivelCobertura(prev =>
                        isSelected
                          ? prev.filter(n => n !== opt.id)
                          : [...prev, opt.id]
                      );
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "11px 14px",
                      borderRadius: 10,
                      border: `1.5px solid ${isSelected ? opt.color : "var(--b2)"}`,
                      background: isSelected ? "var(--s3)" : "var(--s1)",
                      cursor: "pointer",
                      transition: "all .15s"
                    }}
                  >
                    <span style={{fontSize:16}}>{opt.emoji}</span>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:13,color:isSelected ? opt.color : "var(--t1)"}}>{opt.label}</div>
                      <div style={{fontSize:11,color:"var(--t3)",marginTop:1}}>{opt.desc}</div>
                    </div>
                    <div style={{width:18,height:18,borderRadius:5,border:`2px solid ${isSelected ? opt.color : "var(--b2)"}`,background:isSelected ? opt.color : "transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontSize:11,color:"#07080f",fontWeight:900}}>
                      {isSelected && "✓"}
                    </div>
                  </div>
                );
              })}
            </div>
            {nivelCobertura.length === 0 && (
              <div style={{marginTop:10,fontSize:11,color:"var(--red)",fontWeight:600}}>Selecione pelo menos um nível</div>
            )}
          </div>

          <div className="alert alert-blue mb4"><span>🔁</span><span>Tópicos alternados entre matérias + revisões automáticas em 1, 7, 14, 21 e 30 dias.</span></div>
          <div style={{display:"flex",gap:10}}>
            <button className="btn btn-ghost" style={{flex:1}} onClick={()=>setStep(3)}>← Voltar</button>
            <button className="btn btn-green" style={{flex:2}} disabled={nivelCobertura.length === 0} onClick={handleGerar}>🚀 Gerar Plano!</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// COMPONENTE: EstudarAgoraModal — foco topic a topic
// ============================================================
function EstudarAgoraModal({ user, plano, onClose, onRefresh }) {
  const today = localDateKey();
  const [idx, setIdx] = useState(0);
  const [concluidos, setConcluidos] = useState(0);
  const [noteText, setNoteText] = useState("");
  const [tick, setTick] = useState(0);
  const [showMaterials, setShowMaterials] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptTipo, setPromptTipo] = useState(null);
  const [promptCopiado, setPromptCopiado] = useState(false);
  const [reagendToast, setReagendToast] = useState("");
  // Fluxo "Aula Já Estudada"
  const [jaEstudada, setJaEstudada] = useState(false);
  const [jaEstudadaDate, setJaEstudadaDate] = useState("");
  const [comRevisao, setComRevisao] = useState(null); // null | true | false
  const [revisaoPreset, setRevisaoPreset] = useState("moderada");
  const [customIntervals, setCustomIntervals] = useState("");
  const dayData = plano.plan[today] || { topicos:[], reviews:[] };
  // Combina aulas pendentes + revisões pendentes (aulas primeiro)
  const pendingLessons = (dayData.topicos || [])
    .filter(t => !progressoModule.isDone(user.id, plano.id, `${today}-${t.id}`))
    .map(t => ({ ...t, _type: "lesson" }));
  const pendingReviews = (dayData.reviews || [])
    .filter(t => !progressoModule.isDone(user.id, plano.id, `${today}-${t.id}-rev`))
    .map(t => ({ ...t, _type: "review" }));
  const pending = [...pendingLessons, ...pendingReviews];
  const xpGanho = concluidos * 10;
  const currentTopic = pending[idx];

  const getMaterialFiles = (topicId) => {
    const materiais = storage.get().materiais || [];
    const topic = materiais.find(m => m.topicId === topicId && m.editalId === plano?.editalId);

    // Suportar ambas as estruturas: nova (com files array) e antiga (com url direto)
    if (topic?.files && Array.isArray(topic.files)) {
      return topic.files;
    } else if (topic?.url) {
      // Converter estrutura antiga para nova
      return [{
        url: topic.url,
        filename: topic.filename,
        type: "Material",
        addedAt: topic.savedAt || new Date().toISOString()
      }];
    }
    return [];
  };

  const topicMaterials = currentTopic ? getMaterialFiles(currentTopic.id) : [];

  // Carrega nota sempre que o tópico muda
  useEffect(() => {
    if (currentTopic) {
      setNoteText(progressoModule.getNote(user.id, plano.id, currentTopic.id));
    }
  }, [idx, currentTopic?.id]);

  function avanca() { if (idx+1 >= pending.length) setIdx(pending.length); else setIdx(i=>i+1); }
  function handleOk() {
    if (noteText.trim()) progressoModule.saveNote(user.id, plano.id, currentTopic.id, noteText.trim());
    const progKey = currentTopic._type === "review"
      ? `${today}-${currentTopic.id}-rev`
      : `${today}-${currentTopic.id}`;
    progressoModule.saveDone(user.id, plano.id, progKey);
    setConcluidos(c=>c+1); avanca(); onRefresh(); setTick(t=>t+1);
  }
  function handlePular() {
    if (noteText.trim()) progressoModule.saveNote(user.id, plano.id, currentTopic.id, noteText.trim());
    if (currentTopic._type === "lesson") {
      if (noteText.trim()) {
        // Aluno enviou resumo → considera aula concluída
        const progKey = `${today}-${currentTopic.id}`;
        progressoModule.saveDone(user.id, plano.id, progKey);
        setConcluidos(c=>c+1);
      } else {
        const novaData = planosModule.reagendarTopico(plano.id, today, currentTopic.id);
        if (novaData) {
          const d = new Date(novaData + "T00:00:00");
          const dataFormatada = d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
          setReagendToast(`📅 "${currentTopic.name}" reagendada para ${dataFormatada}`);
          setTimeout(() => setReagendToast(""), 3500);
        } else {
          setReagendToast("📅 Aula adicionada ao final do plano");
          setTimeout(() => setReagendToast(""), 3500);
        }
      }
    }
    avanca(); onRefresh(); setTick(t=>t+1);
  }
  function handleImportarAula() {
    if (!jaEstudadaDate) { alert("Informe a data em que você concluiu a aula."); return; }
    if (comRevisao === null) { alert("Informe se deseja incluir no cronograma de revisão."); return; }
    let intervals = null;
    if (comRevisao) {
      if (revisaoPreset === "personalizado") {
        intervals = customIntervals.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n > 0);
        if (intervals.length === 0) { alert("Informe pelo menos um intervalo válido (ex: 1, 7, 21)."); return; }
      } else {
        intervals = REVIEW_PRESETS[revisaoPreset] || [1, 7, 21, 30];
      }
    }
    if (noteText.trim()) progressoModule.saveNote(user.id, plano.id, currentTopic.id, noteText.trim());
    planosModule.importarAulaJaEstudada(plano.id, user.id, currentTopic.id, jaEstudadaDate, intervals);
    setJaEstudada(false); setJaEstudadaDate(""); setComRevisao(null); setRevisaoPreset("moderada"); setCustomIntervals("");
    setConcluidos(c=>c+1); avanca(); onRefresh(); setTick(t=>t+1);
  }
  const finished = idx >= pending.length;

  const PROMPT_TIPOS = [
    { id:"resumo",      icon:"📖", label:"Resumo completo",          desc:"Síntese clara e objetiva do conteúdo" },
    { id:"aula",        icon:"🎓", label:"Aula completa",            desc:"Explicação detalhada como um professor" },
    { id:"mapa",        icon:"🧠", label:"Mapa mental",              desc:"Estrutura hierárquica dos conceitos" },
    { id:"exercicios",  icon:"💪", label:"Exercícios práticos",      desc:"Lista de questões para fixação" },
    { id:"revisao",     icon:"⚡", label:"Revisão rápida",           desc:"Os pontos mais importantes em bullet points" },
    { id:"iniciante",   icon:"🔰", label:"Para iniciantes",          desc:"Explicação simples do zero" },
    { id:"questoes",    icon:"📝", label:"Questões comentadas",      desc:"Questões de concurso com gabarito e comentário" },
    { id:"fichamento",  icon:"🗂️", label:"Fichamento",              desc:"Fichamento completo para anotação" },
  ];

  function gerarPrompt(tipo) {
    const topico = currentTopic?.name || "tópico";
    const materia = currentTopic?.materiaName || "matéria";
    switch(tipo) {
      case "resumo":
        return `Faça um resumo completo e didático sobre "${topico}" dentro do contexto de ${materia}.

O resumo deve:
- Explicar o conceito principal de forma clara
- Destacar os pontos mais importantes
- Apresentar exemplos práticos quando possível
- Ser organizado em tópicos com linguagem acessível
- Focar nos aspectos cobrados em concursos públicos`;
      case "aula":
        return `Atue como um professor especialista em ${materia} e dê uma aula completa sobre "${topico}".

A aula deve seguir esta estrutura:
1. Introdução e contexto
2. Conceito e definição
3. Desenvolvimento com exemplos
4. Pontos de atenção e pegadinhas de prova
5. Resumo final com os tópicos mais importantes

Use linguagem clara e didática, como se estivesse explicando para um concurseiro.`;
      case "mapa":
        return `Crie um mapa mental completo sobre "${topico}" (${materia}).

Estruture da seguinte forma:
- Conceito central: ${topico}
  - Subtópico 1: [principais aspectos]
  - Subtópico 2: [divisões importantes]
  - Subtópico 3: [exemplos e aplicações]
  - Subtópico 4: [pontos cobrados em prova]

Use hierarquia clara com recuo, emojis para facilitar memorização e destaque os conceitos mais cobrados em concursos.`;
      case "exercicios":
        return `Crie uma lista de 10 exercícios práticos sobre "${topico}" (${materia}) para fixação do conteúdo.

Para cada exercício:
- Apresente a questão
- Dê o gabarito comentado logo abaixo
- Explique o raciocínio da resposta

Varie os tipos: verdadeiro/falso, múltipla escolha, dissertativas curtas. Foque no que costuma ser cobrado em concursos públicos.`;
      case "revisao":
        return `Faça uma revisão rápida e objetiva de "${topico}" (${materia}) em formato de bullet points.

Inclua:
✅ Definição em 1 linha
📌 5 a 10 pontos essenciais para memorizar
⚠️ Principais pegadinhas e erros comuns
🎯 O que mais cai em concurso sobre este tema

Seja direto e conciso — máximo 300 palavras.`;
      case "iniciante":
        return `Explique "${topico}" (${materia}) para alguém que nunca teve contato com o assunto.

Use:
- Linguagem simples, sem jargões técnicos
- Analogias do cotidiano para facilitar o entendimento
- Exemplos práticos e concretos
- Progressão lógica do mais simples ao mais complexo

Ao final, liste 3 conceitos-chave que o iniciante deve memorizar.`;
      case "questoes":
        return `Crie 5 questões estilo concurso público sobre "${topico}" (${materia}), com gabarito e comentário.

Formato para cada questão:

Questão [N]: [Texto da questão]
a) [alternativa]
b) [alternativa]
c) [alternativa]
d) [alternativa]
e) [alternativa]

Gabarito: [letra]
Comentário: [explicação detalhada do porquê a resposta está correta e por que as demais estão erradas]

Baseie as questões em bancas como CESPE/Cebraspe, FGV e FCC.`;
      case "fichamento":
        return `Faça um fichamento completo de "${topico}" (${materia}) para servir como material de estudo.

Estruture assim:

📌 TEMA: ${topico}
📚 MATÉRIA: ${materia}

1. DEFINIÇÃO
[definição objetiva]

2. PONTOS PRINCIPAIS
[lista dos conceitos centrais]

3. DETALHAMENTO
[explicação aprofundada de cada ponto]

4. EXEMPLOS
[exemplos práticos e casos concretos]

5. PALAVRAS-CHAVE
[termos importantes para memorizar]

6. O QUE CAI EM PROVA
[principais cobranças de concurso sobre o tema]`;
      default: return "";
    }
  }

  return (
    <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      {/* Modal de Materiais */}
      {showMaterials && (
        <div className="overlay" onClick={() => setShowMaterials(false)} style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:9999}}>
          <div className="modal fi" style={{maxWidth:500,padding:"40px 30px",zIndex:10000}} onClick={e => e.stopPropagation()}>
            <div className="modal-hd" style={{marginBottom:"30px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <h2 style={{margin:0,fontSize:18,fontWeight:700}}>{currentTopic?.name || "Materiais"}</h2>
              <button className="modal-x" onClick={() => setShowMaterials(false)}>✕</button>
            </div>
            {topicMaterials.length > 0 ? (
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {topicMaterials.map((file, idx) => (
                  <a
                    key={idx}
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding:"16px",
                      borderRadius:8,
                      background:"var(--blue-d)",
                      border:"1px solid var(--blue)",
                      textDecoration:"none",
                      display:"flex",
                      flexDirection:"column",
                      gap:4,
                      cursor:"pointer",
                      transition:"all 0.15s"
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = "var(--blue)"}
                    onMouseLeave={(e) => e.currentTarget.style.background = "var(--blue-d)"}
                  >
                    <div style={{fontSize:13,fontWeight:600,color:"var(--blue)"}}>
                      📄 {file.type}
                    </div>
                    <div style={{fontSize:11,color:"var(--t3)",wordBreak:"break-word"}}>
                      {file.filename}
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,color:"var(--t3)"}}>
                <div style={{fontSize:40}}>⚠️</div>
                <p style={{margin:0,textAlign:"center"}}>Nenhum material disponível para este tópico.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="modal" style={{maxWidth:480}} onClick={e=>e.stopPropagation()}>
        {finished || pending.length===0 ? (
          <div style={{textAlign:"center",padding:"16px 0"}}>
            <div style={{fontSize:56,marginBottom:12}}>{pending.length===0?"😎":"🎉"}</div>
            <h2 style={{fontSize:22,fontWeight:900,marginBottom:8}}>{pending.length===0?"Tudo feito hoje!":"Sessão concluída!"}</h2>
            <p style={{color:"var(--t2)",marginBottom:20}}>
              {pending.length===0
                ? "Você já completou todas as aulas e revisões de hoje."
                : `Você completou ${concluidos} item${concluidos!==1?"s":""} nessa sessão.`}
            </p>
            {xpGanho>0&&<div className="badge bg" style={{fontSize:13,padding:"7px 16px",marginBottom:20}}>+{xpGanho} XP ganho! 🔥</div>}
            <button className="btn btn-green" style={{width:"100%"}} onClick={onClose}>Fechar</button>
          </div>
        ) : (
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:"var(--t3)"}}>
                  {currentTopic._type === "review" ? `Revisão ${idx - pendingLessons.length + 1} de ${pendingReviews.length}` : `Aula ${idx+1} de ${pendingLessons.length}`}
                  {pendingReviews.length > 0 && pendingLessons.length > 0 && (
                    <span style={{marginLeft:8,color:"var(--amber)"}}>• {pendingReviews.length} revisão{pendingReviews.length!==1?"ões":""} pendente{pendingReviews.length!==1?"s":""}</span>
                  )}
                </div>
                <h2 style={{fontSize:18,fontWeight:900}}>
                  {currentTopic._type === "review" ? "🔁 Revisão" : "▶ Estudar Agora"}
                </h2>
              </div>
              <button className="modal-x" onClick={onClose}>✕</button>
            </div>
            <div style={{display:"flex",gap:4,marginBottom:22}}>
              {pending.map((_,i)=><div key={i} style={{flex:1,height:5,borderRadius:3,background:i<idx?"var(--green)":i===idx?"var(--green)":"var(--s3)",opacity:i<idx?0.45:1,transition:"all .3s"}}/>)}
            </div>
            <div className="foco-topic">
              <div style={{width:14,height:14,borderRadius:"50%",background:currentTopic.materiaColor,margin:"0 auto 10px"}}/>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:"var(--t3)",marginBottom:8}}>{currentTopic.materiaName}</div>
              <div style={{fontSize:22,fontWeight:900,fontFamily:"Cabinet Grotesk",lineHeight:1.25}}>{currentTopic.name}</div>
              <button
                onClick={() => setShowMaterials(true)}
                style={{
                  marginTop:14,
                  padding:"8px 14px",
                  borderRadius:6,
                  background: topicMaterials.length > 0 ? "var(--blue)" : "var(--s3)",
                  color: topicMaterials.length > 0 ? "white" : "var(--t2)",
                  border: topicMaterials.length > 0 ? "none" : "1px solid var(--b2)",
                  fontSize:12,
                  fontWeight:600,
                  cursor:"pointer",
                  display:"inline-flex",
                  alignItems:"center",
                  gap:6,
                  transition:"all 0.15s"
                }}
                onMouseEnter={(e) => {
                  if (topicMaterials.length > 0) {
                    e.target.style.background = "var(--blue-d)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (topicMaterials.length > 0) {
                    e.target.style.background = "var(--blue)";
                  }
                }}
              >
                📎 {topicMaterials.length > 0 ? `Ver ${topicMaterials.length} material${topicMaterials.length !== 1 ? "is" : ""}` : "Sem materiais"}
              </button>
              <button
                onClick={() => { setShowPrompt(p => !p); setPromptTipo(null); setPromptCopiado(false); }}
                style={{ marginTop:8, padding:"8px 14px", borderRadius:6, background:showPrompt?"var(--green)":"var(--s3)", color:showPrompt?"#07080f":"var(--t2)", border:showPrompt?"none":"1px solid var(--b2)", fontSize:12, fontWeight:600, cursor:"pointer", display:"inline-flex", alignItems:"center", gap:6, transition:"all 0.15s" }}
              >
                🤖 {showPrompt ? "Fechar Prompt IA" : "Gerar Prompt de IA"}
              </button>
            </div>

            {/* Painel de Prompt IA */}
            {showPrompt && (
              <div style={{ marginBottom:16, padding:"14px 16px", borderRadius:10, background:"var(--s2)", border:"1px solid rgba(34,211,165,0.3)" }}>
                <div style={{ fontSize:12, fontWeight:700, color:"var(--green)", marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
                  🤖 Gerar Prompt de IA
                </div>
                {!promptTipo ? (
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                    {PROMPT_TIPOS.map(pt => (
                      <button key={pt.id} onClick={() => setPromptTipo(pt.id)} style={{ padding:"8px 10px", borderRadius:8, border:"1px solid var(--b2)", background:"var(--s3)", cursor:"pointer", textAlign:"left", transition:"all .15s" }}
                        onMouseEnter={e=>e.currentTarget.style.borderColor="var(--green)"}
                        onMouseLeave={e=>e.currentTarget.style.borderColor="var(--b2)"}
                      >
                        <div style={{ fontSize:15, marginBottom:2 }}>{pt.icon}</div>
                        <div style={{ fontSize:11, fontWeight:700, color:"var(--t1)" }}>{pt.label}</div>
                        <div style={{ fontSize:10, color:"var(--t3)", marginTop:2 }}>{pt.desc}</div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                      <button onClick={() => { setPromptTipo(null); setPromptCopiado(false); }} style={{ padding:"4px 10px", borderRadius:6, border:"1px solid var(--b2)", background:"var(--s3)", fontSize:11, cursor:"pointer", color:"var(--t2)" }}>
                        ← Voltar
                      </button>
                      <span style={{ fontSize:12, fontWeight:700, color:"var(--t2)" }}>
                        {PROMPT_TIPOS.find(p=>p.id===promptTipo)?.icon} {PROMPT_TIPOS.find(p=>p.id===promptTipo)?.label}
                      </span>
                    </div>
                    <div style={{ background:"var(--s1)", borderRadius:8, padding:"12px 14px", fontSize:12, color:"var(--t2)", lineHeight:1.6, whiteSpace:"pre-wrap", maxHeight:200, overflowY:"auto", border:"1px solid var(--b2)", marginBottom:10, fontFamily:"monospace" }}>
                      {gerarPrompt(promptTipo)}
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(gerarPrompt(promptTipo));
                        setPromptCopiado(true);
                        setTimeout(() => setPromptCopiado(false), 2500);
                      }}
                      style={{ width:"100%", padding:"10px", borderRadius:8, border:"none", background:promptCopiado?"var(--green)":"var(--blue)", color:promptCopiado?"#07080f":"white", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"Cabinet Grotesk", transition:"all .2s" }}
                    >
                      {promptCopiado ? "✅ Copiado! Cole na IA agora" : "📋 Copiar Prompt"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Aula Já Estudada */}
            {currentTopic._type === "lesson" && (
              <div style={{marginBottom:14,padding:"12px 14px",borderRadius:8,background:"var(--s2)",border:`1px solid ${jaEstudada?"var(--green)":"var(--b2)"}`,transition:"border-color .2s"}}>
                <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
                  <input type="checkbox" checked={jaEstudada} onChange={e=>{setJaEstudada(e.target.checked);if(!e.target.checked){setComRevisao(null);setJaEstudadaDate("");}}} style={{width:16,height:16,accentColor:"var(--green)",cursor:"pointer"}}/>
                  <span style={{fontSize:13,fontWeight:700,color:jaEstudada?"var(--green)":"var(--t1)"}}>✅ Aula Já Estudada</span>
                </label>
                {jaEstudada && (
                  <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:14}}>
                    <div>
                      <label style={{fontSize:11,fontWeight:700,letterSpacing:.6,textTransform:"uppercase",color:"var(--t3)",display:"block",marginBottom:6}}>📅 Quando você concluiu esta aula?</label>
                      <input type="date" className="inp" value={jaEstudadaDate} onChange={e=>setJaEstudadaDate(e.target.value)} max={today} style={{fontSize:13,padding:"8px 12px"}}/>
                    </div>
                    <div>
                      <label style={{fontSize:11,fontWeight:700,letterSpacing:.6,textTransform:"uppercase",color:"var(--t3)",display:"block",marginBottom:8}}>Incluir no cronograma de revisão?</label>
                      <div style={{display:"flex",gap:8}}>
                        {[{v:true,l:"✅ Sim"},{v:false,l:"❌ Não"}].map(({v,l})=>(
                          <label key={String(v)} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"8px 0",borderRadius:8,background:comRevisao===v?"var(--green-d)":"var(--s3)",border:`1px solid ${comRevisao===v?"var(--green)":"var(--b2)"}`,flex:1,justifyContent:"center",transition:"all .15s"}}>
                            <input type="radio" name="comRevisao" checked={comRevisao===v} onChange={()=>setComRevisao(v)} style={{accentColor:"var(--green)"}}/>
                            <span style={{fontSize:13,fontWeight:600}}>{l}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    {comRevisao===true && (
                      <div>
                        <label style={{fontSize:11,fontWeight:700,letterSpacing:.6,textTransform:"uppercase",color:"var(--t3)",display:"block",marginBottom:8}}>Modelo de Revisão Espaçada</label>
                        <div style={{display:"flex",flexDirection:"column",gap:6}}>
                          {[
                            {key:"baixa",     label:"Baixa",       desc:"3 revisões: 1, 14, 21 dias"},
                            {key:"moderada",  label:"Moderada",    desc:"4 revisões: 1, 7, 21, 30 dias"},
                            {key:"intensa",   label:"Intensa",     desc:"5 revisões: 1, 7, 14, 21, 30 dias"},
                            {key:"personalizado",label:"Personalizado",desc:"Defina seus próprios intervalos"},
                          ].map(({key,label,desc})=>(
                            <label key={key} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"10px 12px",borderRadius:8,background:revisaoPreset===key?"var(--blue-d)":"var(--s3)",border:`1px solid ${revisaoPreset===key?"var(--blue)":"var(--b2)"}`,transition:"all .15s"}}>
                              <input type="radio" name="revisaoPreset" checked={revisaoPreset===key} onChange={()=>setRevisaoPreset(key)} style={{accentColor:"var(--blue)"}}/>
                              <div>
                                <div style={{fontSize:13,fontWeight:700}}>{label}</div>
                                <div style={{fontSize:11,color:"var(--t3)"}}>{desc}</div>
                              </div>
                            </label>
                          ))}
                        </div>
                        {revisaoPreset==="personalizado" && (
                          <div style={{marginTop:10}}>
                            <label style={{fontSize:11,fontWeight:700,letterSpacing:.6,textTransform:"uppercase",color:"var(--t3)",display:"block",marginBottom:6}}>Intervalos em dias (separados por vírgula)</label>
                            <input type="text" className="inp" value={customIntervals} onChange={e=>setCustomIntervals(e.target.value)} placeholder="Ex: 1, 3, 7, 15, 30" style={{fontSize:13,padding:"8px 12px"}}/>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <div style={{marginBottom:16}}>
              <label style={{fontSize:11,fontWeight:700,letterSpacing:.6,textTransform:"uppercase",color:currentTopic._type==="review"?"var(--amber)":"var(--t3)",display:"block",marginBottom:7}}>
                {currentTopic._type === "review" ? "🔁 Suas Anotações (edite e complemente)" : "📝 Resumo / Anotações"}
              </label>
              {currentTopic._type === "review" && !noteText && (
                <div style={{marginBottom:8,padding:"8px 12px",borderRadius:6,background:"var(--amber-d)",border:"1px solid rgba(251,191,36,0.3)",fontSize:12,color:"var(--amber)"}}>
                  Nenhuma anotação anterior. Aproveite para registrar o que relembrou!
                </div>
              )}
              <textarea
                className="inp"
                style={{minHeight:currentTopic._type==="review"?120:90,resize:"vertical",fontFamily:"inherit",fontSize:13,lineHeight:1.6,borderColor:currentTopic._type==="review"?"rgba(251,191,36,0.4)":"var(--b2)"}}
                value={noteText}
                onChange={e=>setNoteText(e.target.value)}
                placeholder={currentTopic._type === "review" ? "Complemente suas anotações, adicione o que revisou hoje..." : "Escreva aqui o que você entendeu, pontos importantes, macetes..."}
              />
            </div>
            <button className="btn-estudar" onClick={jaEstudada ? handleImportarAula : handleOk}>
              {jaEstudada
                ? "📥 Importar Aula Já Estudada"
                : currentTopic._type === "review" ? "✅ Revisão concluída →" : "✅ Concluído — próximo →"}
            </button>
            {currentTopic._type === "lesson" && !jaEstudada && (
              <button className="btn-pular" onClick={handlePular}>📅 Pular e reagendar para depois</button>
            )}
            {reagendToast && (
              <div style={{position:"absolute",bottom:80,left:"50%",transform:"translateX(-50%)",background:"var(--green)",color:"#fff",padding:"10px 18px",borderRadius:10,fontSize:12,fontWeight:600,boxShadow:"0 4px 16px rgba(0,0,0,0.3)",whiteSpace:"nowrap",zIndex:1200}}>
                {reagendToast}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// SHARED COMPONENTS
// ============================================================
const CheckIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

function Modal({ open, onClose, title, children, footer, wide }) {
  if (!open) return null;
  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal fi ${wide ? "modal-wide" : ""}`}>
        <div className="modal-hd">
          <h2>{title}</h2>
          <button className="modal-x" onClick={onClose}>✕</button>
        </div>
        {children}
        {footer && <div className="modal-ft">{footer}</div>}
      </div>
    </div>
  );
}

function Confirm({ open, onClose, onConfirm, title, message }) {
  return (
    <Modal open={open} onClose={onClose} title={title || "Confirmar"}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancelar</button><button className="btn btn-red" onClick={onConfirm}>Confirmar</button></>}>
      <p className="text-muted">{message}</p>
    </Modal>
  );
}

function PBar({ pct, color }) {
  return <div className="pbar"><div className="pbar-fill" style={{ width: `${Math.min(pct,100)}%`, background: color || "var(--green)" }} /></div>;
}

// ============================================================
// LOGIN PAGE
// ============================================================
const PROFILES = [
  { role: "admin",  icon: "🛡️", name: "Admin",  sub: "Plataforma",  email: "admin@estudaai.com",  password: "admin123" },
  { role: "coach",  icon: "🎓", name: "Coach",  sub: "Professores", email: "carlos@estudaai.com", password: "coach123" },
  { role: "aluno",  icon: "📖", name: "Aluno",  sub: "Estudantes",  email: "ana@estudaai.com",    password: "aluno123" },
];

function LoginPage({ onLogin }) {
  const [selected, setSelected] = useState(null);
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [authMode, setAuthMode] = useState("legacy"); // "google" desabilitado temporariamente
  const googleBtnRef = useRef(null);

  useEffect(() => {
    // Inicializa Google OAuth
    initGoogleAuth(async (googleUser) => {
      setLoading(true);
      setError("");
      try {
        // Busca ou cria usuário na planilha
        const user = await sheetsUsersModule.upsertByEmail({
          email: googleUser.email,
          name: googleUser.name,
          avatar_url: googleUser.avatar_url,
        });
        // Sincroniza com o storage local para manter compatibilidade
        const db = storage.get();
        const existsLocally = db.users.find(u => u.email === user.email);
        if (!existsLocally) {
          storage.set(d => ({ ...d, users: [...d.users, { id: user.id, name: user.name, email: user.email, role: user.role, coachId: user.coach_id || "", createdAt: user.created_at }] }));
        } else if (existsLocally.id !== user.id) {
          // Atualiza o ID local para bater com o da planilha
          storage.set(d => ({ ...d, users: d.users.map(u => u.email === user.email ? { ...u, id: user.id, name: user.name } : u) }));
        }
        const localUser = { id: user.id, name: user.name, email: user.email, role: user.role, coachId: user.coach_id || "", avatar_url: user.avatar_url };
        _session = localUser;
        onLogin(localUser);
      } catch (err) {
        setError("Erro ao fazer login com Google: " + err.message);
        setLoading(false);
      }
    });
    // Renderiza botão Google após um tick
    setTimeout(() => {
      if (document.getElementById("google-login-btn")) {
        renderGoogleButton("google-login-btn");
      }
    }, 300);
  }, []);

  function pickProfile(p) {
    setSelected(p.role);
    setEmail("");
    setPassword("");
    setError("");
  }

  function handleEmailChange(val) {
    setEmail(val);
    setError("");
    const id = val.trim().toLowerCase();
    if (!id) { setSelected(null); return; }
    const db = storage.get();
    const match = db.users.find(u =>
      u.email.toLowerCase() === id || u.name.toLowerCase() === id
    );
    setSelected(match ? match.role : null);
  }

  function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setTimeout(() => {
      const result = authModule.login(email.trim(), password);
      if (result.success) {
        onLogin(result.user);
      } else {
        setError(result.error);
        setLoading(false);
      }
    }, 300);
  }

  return (
    <div className="login-wrap">
      <div className="login-box fi">
        <div className="login-logo">
          <h1>Estuda<span style={{ color: "var(--green)" }}>AI</span></h1>
          <p>Sistema de Gestão de Estudos</p>
        </div>

        {authMode === "google" && (
          <>
            <div id="google-login-btn" style={{ display: "flex", justifyContent: "center", margin: "24px 0" }}></div>
            {loading && <p style={{ textAlign: "center", fontSize: 13, color: "var(--t3)" }}>Autenticando...</p>}
            {error && <p className="err">{error}</p>}
            <hr className="divider" />
            <button
              className="btn btn-ghost btn-xs"
              style={{ width: "100%", justifyContent: "center", fontSize: 12 }}
              onClick={() => setAuthMode("legacy")}
            >
              Entrar com email/senha (modo legado)
            </button>
          </>
        )}

        {authMode === "legacy" && (
          <>
            <p className="text-xs text-dim mb2 fw7" style={{ letterSpacing: ".8px", textTransform: "uppercase" }}>Perfil</p>
            <div className="profile-grid">
              {PROFILES.map(p => (
                <div key={p.role} className={`pc ${selected === p.role ? "sel" : ""}`} onClick={() => pickProfile(p)}>
                  <div className="pc-icon">{p.icon}</div>
                  <div className="pc-name">{p.name}</div>
                  <div className="pc-sub">{p.sub}</div>
                </div>
              ))}
            </div>
            <hr className="divider" />
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="lbl">E-mail ou usuário</label>
                <input className="inp" type="text" value={email} onChange={e => handleEmailChange(e.target.value)} placeholder="email@exemplo.com ou nome" required autoComplete="username" />
              </div>
              <div className="form-group">
                <label className="lbl">Senha</label>
                <input className="inp" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
              </div>
              {error && <p className="err">{error}</p>}
              <button type="submit" className="btn btn-green mt3" style={{ width: "100%", justifyContent: "center" }} disabled={loading}>
                {loading ? "Entrando..." : "Entrar →"}
              </button>
            </form>
            <hr className="divider" />
            <button
              className="btn btn-ghost btn-xs"
              style={{ width: "100%", justifyContent: "center", fontSize: 12 }}
              onClick={() => setAuthMode("google")}
            >
              Voltar para login com Google
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// LAYOUT
// ============================================================
const NAV = {
  admin: [
    { id: "dashboard", label: "Dashboard", icon: "⊞" },
    { id: "coaches",   label: "Coaches",   icon: "🎓" },
    { id: "alunos",    label: "Alunos",    icon: "👥" },
    { id: "logs",      label: "Logs",      icon: "📋" },
    { id: "debug",     label: "Debug",     icon: "🔧" },
  ],
  coach: [
    { id: "dashboard",      label: "Dashboard",      icon: "⊞" },
    { id: "alunos",         label: "Meus Alunos",    icon: "👥" },
    { id: "editais",        label: "Editais",        icon: "📄" },
    { id: "gerenciar-plano", label: "Gerenciar Planos", icon: "📋" },
    { id: "progresso",      label: "Progresso",      icon: "📊" },
    { id: "conteudo",       label: "Conteúdo",       icon: "📚" },
    { id: "resumos",        label: "Resumos",        icon: "✍️" },
    { id: "simulados",      label: "Simulados",      icon: "📝" },
    { id: "ranking",        label: "Ranking",        icon: "🏆" },
    { id: "batalha",       label: "Batalha",        icon: "⚔️" },
  ],
  aluno: [
    { id: "dashboard", label: "Dashboard",       icon: "⊞" },
    { id: "plano",     label: "Meu Plano",       icon: "📅" },
    { id: "rotina",    label: "Rotina",           icon: "⚙️" },
    { id: "progresso", label: "Progresso",        icon: "📊" },
    { id: "resumos",   label: "Resumos",          icon: "✍️" },
    { id: "conteudos", label: "Conteúdos",       icon: "📚" },
    { id: "simulados", label: "Simulados",       icon: "📝" },
    { id: "ranking",         label: "Ranking",          icon: "🏆" },
    { id: "gerador-prompt",  label: "Gerador de Prompt",icon: "🧠" },
    { id: "batalha",          label: "Batalha",          icon: "⚔️" },
  ],
};
const ROLE_LABEL = { admin: "Administrador", coach: "Coach", aluno: "Aluno" };

function Layout({ user, page, setPage, onLogout, children }) {
  const nav = NAV[user.role] || [];
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="logo">
          <h2>Estuda<span className="dot">AI</span></h2>
          <p>Sistema de Estudos</p>
        </div>
        <div className="nav-lbl">Menu</div>
        {nav.map(item => (
          <button key={item.id} className={`nav-btn ${page === item.id ? "active" : ""}`} onClick={() => setPage(item.id)}>
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </button>
        ))}
        <div className="nav-spacer" />
        <div className="user-pill">
          <div className="user-pill-name">{user.name}</div>
          <div className="user-pill-role">{ROLE_LABEL[user.role]}</div>
          <button className="btn btn-ghost btn-xs mt2" style={{ width: "100%", justifyContent: "center" }} onClick={onLogout}>Sair</button>
        </div>
      </aside>
      <main className="main"><div className="fi">{children}</div></main>
    </div>
  );
}

// ============================================================
// ADMIN PAGES
// ============================================================
function AdminDashboard({ refresh }) {
  const db = storage.get();
  const coaches = db.users.filter(u => u.role === "coach");
  const alunos  = db.users.filter(u => u.role === "aluno");
  const logs    = [...db.logs].reverse().slice(0, 6);
  return (
    <div>
      <div className="ph"><div><h1>Dashboard Admin</h1><p>Visão geral da plataforma</p></div></div>
      <div className="g4 mb4">
        <div className="stat"><div className="stat-l">Coaches</div><div className="stat-v" style={{color:"var(--blue)"}}>{coaches.length}</div></div>
        <div className="stat"><div className="stat-l">Alunos</div><div className="stat-v" style={{color:"var(--green)"}}>{alunos.length}</div></div>
        <div className="stat"><div className="stat-l">Editais</div><div className="stat-v" style={{color:"var(--purple)"}}>{db.editais.length}</div></div>
        <div className="stat"><div className="stat-l">Logs</div><div className="stat-v" style={{color:"var(--amber)"}}>{db.logs.length}</div></div>
      </div>
      <div className="g2">
        <div className="card">
          <div className="card-title">Coaches</div>
          {coaches.length === 0 ? <p className="text-muted text-sm">Nenhum coach.</p> : coaches.map(c => (
            <div key={c.id} className="row-b" style={{padding:"9px 0",borderBottom:"1px solid var(--b1)"}}>
              <div><div className="fw6">{c.name}</div><div className="text-xs text-dim">{c.email}</div></div>
              <span className="badge bn">{alunos.filter(a=>a.coachId===c.id).length} aluno(s)</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-title">Últimos logs</div>
          {logs.length === 0 ? <p className="text-muted text-sm">Sem logs.</p> : logs.map(l => (
            <div key={l.id} style={{padding:"7px 0",borderBottom:"1px solid var(--b1)"}}>
              <div className="text-sm fw6">{l.message}</div>
              <div className="text-xs text-dim">{new Date(l.createdAt).toLocaleString("pt-BR")}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdminCoaches({ refresh }) {
  const [modal, setModal]   = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm]     = useState({ name:"", email:"", password:"" });
  const [confirm, setConfirm] = useState(null);
  const [resetM, setResetM] = useState(null);
  const [newPass, setNewPass] = useState("");
  const coaches = usersModule.getCoaches();
  const alunos  = usersModule.getAlunos();

  function openNew()  { setEditing(null); setForm({name:"",email:"",password:""}); setModal(true); }
  function openEdit(c){ setEditing(c.id); setForm({name:c.name,email:c.email,password:""}); setModal(true); }
  function save() {
    if (!form.name || !form.email) return;
    if (editing) { const u={name:form.name,email:form.email,updatedBy:"admin"}; if(form.password)u.password=form.password; usersModule.update(editing,u); }
    else { if(!form.password)return; usersModule.create({...form,role:"coach",createdBy:"admin"}); }
    refresh(); setModal(false);
  }
  function del(id) { usersModule.delete(id); refresh(); setConfirm(null); }
  function resetPass() { if(!newPass)return; authModule.resetPassword(resetM,newPass); refresh(); setResetM(null); setNewPass(""); }

  return (
    <div>
      <div className="ph"><div><h1>Coaches</h1><p>Gerencie os professores</p></div><button className="btn btn-green" onClick={openNew}>+ Novo Coach</button></div>
      <div className="card">
        {coaches.length===0 ? <div className="empty"><h3>Nenhum coach</h3></div> :
          <table className="table">
            <thead><tr><th>Nome</th><th>E-mail</th><th>Alunos</th><th>Ações</th></tr></thead>
            <tbody>{coaches.map(c=>(
              <tr key={c.id}>
                <td className="fw6">{c.name}</td><td className="text-muted">{c.email}</td>
                <td><span className="badge bn">{alunos.filter(a=>a.coachId===c.id).length}</span></td>
                <td><div className="row">
                  <button className="btn btn-ghost btn-xs" onClick={()=>openEdit(c)}>Editar</button>
                  <button className="btn btn-blue btn-xs" onClick={()=>{setResetM(c.id);setNewPass("");}}>Reset Senha</button>
                  <button className="btn btn-red btn-xs" onClick={()=>setConfirm(c.id)}>Remover</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        }
      </div>
      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar Coach":"Novo Coach"}
        footer={<><button className="btn btn-ghost" onClick={()=>setModal(false)}>Cancelar</button><button className="btn btn-green" onClick={save}>Salvar</button></>}>
        <div className="form-group"><label className="lbl">Nome</label><input className="inp" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Nome completo"/></div>
        <div className="form-group"><label className="lbl">E-mail</label><input className="inp" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="email@exemplo.com"/></div>
        <div className="form-group"><label className="lbl">{editing?"Nova Senha (opcional)":"Senha"}</label><input className="inp" type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="••••••••"/></div>
      </Modal>
      <Modal open={!!resetM} onClose={()=>setResetM(null)} title="Resetar Senha"
        footer={<><button className="btn btn-ghost" onClick={()=>setResetM(null)}>Cancelar</button><button className="btn btn-green" onClick={resetPass}>Salvar</button></>}>
        <div className="form-group"><label className="lbl">Nova Senha</label><input className="inp" type="password" value={newPass} onChange={e=>setNewPass(e.target.value)} placeholder="Nova senha"/></div>
      </Modal>
      <Confirm open={!!confirm} onClose={()=>setConfirm(null)} onConfirm={()=>del(confirm)} title="Remover Coach" message="Remover permanentemente?"/>
    </div>
  );
}

function AdminAlunos({ refresh }) {
  const [confirm, setConfirm] = useState(null);
  const [resetM, setResetM]   = useState(null);
  const [newPass, setNewPass] = useState("");
  const [modal, setModal]     = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm]       = useState({name:"",email:""});
  const alunos = usersModule.getAlunos();

  function del(id) { usersModule.delete(id); refresh(); setConfirm(null); }
  function resetPass() { if(!newPass)return; authModule.resetPassword(resetM,newPass); refresh(); setResetM(null); setNewPass(""); }
  function openEdit(u) { setEditingId(u.id); setForm({name:u.name,email:u.email}); setModal(true); }
  function save() { usersModule.update(editingId,{...form,updatedBy:"admin"}); refresh(); setModal(false); }

  return (
    <div>
      <div className="ph"><div><h1>Alunos</h1><p>Todos os alunos</p></div></div>
      <div className="card">
        {alunos.length===0 ? <div className="empty"><h3>Nenhum aluno</h3></div> :
          <table className="table">
            <thead><tr><th>Nome</th><th>E-mail</th><th>Coach</th><th>Ações</th></tr></thead>
            <tbody>{alunos.map(a=>{
              const coach = a.coachId ? usersModule.getById(a.coachId) : null;
              return (
                <tr key={a.id}>
                  <td className="fw6">{a.name}</td><td className="text-muted">{a.email}</td>
                  <td>{coach?<span className="badge bb">{coach.name}</span>:<span className="text-dim">—</span>}</td>
                  <td><div className="row">
                    <button className="btn btn-ghost btn-xs" onClick={()=>openEdit(a)}>Editar</button>
                    <button className="btn btn-blue btn-xs" onClick={()=>{setResetM(a.id);setNewPass("");}}>Reset Senha</button>
                    <button className="btn btn-red btn-xs" onClick={()=>setConfirm(a.id)}>Remover</button>
                  </div></td>
                </tr>
              );
            })}</tbody>
          </table>
        }
      </div>
      <Modal open={modal} onClose={()=>setModal(false)} title="Editar Aluno"
        footer={<><button className="btn btn-ghost" onClick={()=>setModal(false)}>Cancelar</button><button className="btn btn-green" onClick={save}>Salvar</button></>}>
        <div className="form-group"><label className="lbl">Nome</label><input className="inp" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
        <div className="form-group"><label className="lbl">E-mail</label><input className="inp" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
      </Modal>
      <Modal open={!!resetM} onClose={()=>setResetM(null)} title="Resetar Senha"
        footer={<><button className="btn btn-ghost" onClick={()=>setResetM(null)}>Cancelar</button><button className="btn btn-green" onClick={resetPass}>Salvar</button></>}>
        <div className="form-group"><label className="lbl">Nova Senha</label><input className="inp" type="password" value={newPass} onChange={e=>setNewPass(e.target.value)}/></div>
      </Modal>
      <Confirm open={!!confirm} onClose={()=>setConfirm(null)} onConfirm={()=>del(confirm)} title="Remover Aluno" message="Tem certeza?"/>
    </div>
  );
}

function AdminLogs() {
  const logs = [...logModule.getAll()].reverse();
  return (
    <div>
      <div className="ph"><div><h1>Logs do Sistema</h1></div></div>
      <div className="card">
        {logs.length===0 ? <div className="empty"><h3>Nenhum log</h3></div> :
          <table className="table">
            <thead><tr><th>Data/Hora</th><th>Ator</th><th>Mensagem</th></tr></thead>
            <tbody>{logs.map(l=>{
              const u=usersModule.getById(l.actorId);
              return (
                <tr key={l.id}>
                  <td className="text-xs text-dim" style={{whiteSpace:"nowrap"}}>{new Date(l.createdAt).toLocaleString("pt-BR")}</td>
                  <td><span className="badge bn">{u?u.name:l.actorId}</span></td>
                  <td className="text-sm">{l.message}</td>
                </tr>
              );
            })}</tbody>
          </table>
        }
      </div>
    </div>
  );
}

// ============================================================
// COACH PAGES
// ============================================================
function CoachDashboard({ user }) {
  const alunos  = usersModule.getAlunos(user.id);
  const editais = editaisModule.getByCoach(user.id);
  const planos  = storage.get().planos;
  return (
    <div>
      <div className="ph"><div><h1>Olá, {user.name.split(" ")[0]}! 👋</h1><p>Acompanhe seus alunos</p></div></div>
      <div className="g4 mb4">
        <div className="stat"><div className="stat-l">Alunos</div><div className="stat-v" style={{color:"var(--blue)"}}>{alunos.length}</div></div>
        <div className="stat"><div className="stat-l">Editais</div><div className="stat-v" style={{color:"var(--purple)"}}>{editais.length}</div></div>
        <div className="stat"><div className="stat-l">Com Plano</div><div className="stat-v" style={{color:"var(--green)"}}>{alunos.filter(a=>planos.some(p=>p.alunoId===a.id)).length}</div></div>
        <div className="stat"><div className="stat-l">Tópicos</div><div className="stat-v" style={{color:"var(--amber)"}}>{editais.reduce((a,e)=>a+e.materias.reduce((b,m)=>b+m.topicos.length,0),0)}</div></div>
      </div>
      <div className="card">
        <div className="card-title">Progresso dos alunos</div>
        {alunos.length===0 ? <p className="text-muted text-sm">Nenhum aluno cadastrado.</p> : alunos.map(a=>{
          const plano=planos.find(p=>p.alunoId===a.id);
          const stats=plano?progressoModule.getStats(a.id,plano.id):null;
          return (
            <div key={a.id} style={{padding:"12px 0",borderBottom:"1px solid var(--b1)"}}>
              <div className="row-b mb2">
                <div className="row"><span className="fw6">{a.name}</span><span className={`badge ${plano?"bg":"bn"}`}>{plano?"Ativo":"Sem plano"}</span></div>
                {stats&&<span className="text-xs text-dim">Previsão: {stats.previsao}</span>}
              </div>
              {stats?<><div className="row-b mb2 text-xs text-dim"><span>{stats.aulasFeitas}/{stats.totalAulas} aulas</span><span>{stats.pct}%</span></div><PBar pct={stats.pct}/></>:<p className="text-xs text-dim">Plano não gerado.</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CoachAlunos({ user, refresh }) {
  const [modal, setModal]   = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm]     = useState({name:"",email:"",password:""});
  const [assocM, setAssocM] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const alunos  = usersModule.getAlunos(user.id);
  const editais = editaisModule.getByCoach(user.id);

  function openNew()  { setEditing(null); setForm({name:"",email:"",password:""}); setModal(true); }
  function openEdit(a){ setEditing(a.id); setForm({name:a.name,email:a.email,password:""}); setModal(true); }
  function save() {
    if (!form.name||!form.email) return;
    if (editing) { const u={name:form.name,email:form.email,updatedBy:user.id}; if(form.password)u.password=form.password; usersModule.update(editing,u); }
    else { if(!form.password)return; usersModule.create({...form,role:"aluno",coachId:user.id,createdBy:user.id}); }
    refresh(); setModal(false);
  }
  function del(id) { usersModule.delete(id); refresh(); setConfirm(null); }

  return (
    <div>
      <div className="ph"><div><h1>Meus Alunos</h1></div><button className="btn btn-green" onClick={openNew}>+ Novo Aluno</button></div>
      <div className="card">
        {alunos.length===0 ? <div className="empty"><h3>Nenhum aluno</h3></div> :
          <table className="table">
            <thead><tr><th>Nome</th><th>E-mail</th><th>Edital</th><th>Ações</th></tr></thead>
            <tbody>{alunos.map(a=>{
              const ae=editaisModule.getByAluno(a.id);
              return (
                <tr key={a.id}>
                  <td className="fw6">{a.name}</td><td className="text-muted">{a.email}</td>
                  <td>{ae.length>0?ae.map(e=><span key={e.id} className="chip">{e.name}</span>):<span className="text-dim">—</span>}</td>
                  <td><div className="row">
                    <button className="btn btn-ghost btn-xs" onClick={()=>openEdit(a)}>Editar</button>
                    <button className="btn btn-blue btn-xs" onClick={()=>setAssocM(a)}>Edital</button>
                    <button className="btn btn-red btn-xs" onClick={()=>setConfirm(a.id)}>Remover</button>
                  </div></td>
                </tr>
              );
            })}</tbody>
          </table>
        }
      </div>
      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar Aluno":"Novo Aluno"}
        footer={<><button className="btn btn-ghost" onClick={()=>setModal(false)}>Cancelar</button><button className="btn btn-green" onClick={save}>Salvar</button></>}>
        <div className="form-group"><label className="lbl">Nome</label><input className="inp" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Nome completo"/></div>
        <div className="form-group"><label className="lbl">E-mail</label><input className="inp" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="email@exemplo.com"/></div>
        <div className="form-group"><label className="lbl">{editing?"Nova Senha (opcional)":"Senha inicial"}</label><input className="inp" type="password" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="••••••••"/></div>
      </Modal>
      {assocM&&<AssocEditalModal aluno={assocM} editais={editais} onClose={()=>{setAssocM(null);refresh();}}/>}
      <Confirm open={!!confirm} onClose={()=>setConfirm(null)} onConfirm={()=>del(confirm)} title="Remover Aluno" message="Tem certeza?"/>
    </div>
  );
}

function AssocEditalModal({ aluno, editais, onClose }) {
  const [current, setCurrent] = useState(()=>editaisModule.getByAluno(aluno.id).map(e=>e.id));
  function toggle(editalId) {
    if (current.includes(editalId)) { editaisModule.desassociarAluno(aluno.id,editalId); setCurrent(c=>c.filter(x=>x!==editalId)); }
    else { editaisModule.associarAluno(aluno.id,editalId); setCurrent(c=>[...c,editalId]); }
  }
  return (
    <Modal open={true} onClose={onClose} title={`Editais — ${aluno.name}`} footer={<button className="btn btn-green" onClick={onClose}>Fechar</button>}>
      {editais.length===0?<p className="text-muted">Crie editais primeiro.</p>:editais.map(e=>(
        <div key={e.id} className="row-b" style={{padding:"11px 0",borderBottom:"1px solid var(--b1)"}}>
          <div><div className="fw6">{e.name}</div><div className="text-xs text-dim">{e.materias.reduce((a,m)=>a+m.topicos.length,0)} tópicos</div></div>
          <button className={`btn btn-sm ${current.includes(e.id)?"btn-red":"btn-green"}`} onClick={()=>toggle(e.id)}>{current.includes(e.id)?"Desassociar":"Associar"}</button>
        </div>
      ))}
    </Modal>
  );
}

function CoachEditais({ user, refresh }) {
  const [modal, setModal]   = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm]     = useState({name:"",materias:[]});
  const [matM, setMatM]     = useState(false);
  const [matForm, setMatForm] = useState({name:"",color:"#6366f1",topicos:[],reviewPreset:"moderada"});
  const [matRaw, setMatRaw]   = useState("");
  const [editMatIdx, setEditMatIdx] = useState(null);
  const [confirm, setConfirm] = useState(null);
  // Material attachment modal: { idx, tab:"upload"|"url", urlInput, uploading, error }
  const [matAttach, setMatAttach] = useState(null);
  // Topic details editor: { idx, promptSugerido, conteudoAlta, conteudoMedia, conteudoBaixa }
  const [topicoEditar, setTopicoEditar] = useState(null);
  const editais = editaisModule.getByCoach(user.id);

  function openNew()  { setEditing(null); setForm({name:"",materias:[]}); setModal(true); }
  function openEdit(e){ setEditing(e.id); setForm({name:e.name,materias:JSON.parse(JSON.stringify(e.materias))}); setModal(true); }
  function saveEdital() {
    if (!form.name) return;
    if (editing) editaisModule.update(editing,{name:form.name,materias:form.materias});
    else editaisModule.create({name:form.name,coachId:user.id,materias:form.materias});
    refresh(); setModal(false);
  }
  function parseTopicosRaw(raw) {
    if (!raw.trim()) return [];
    const numberedMatch = raw.match(/^\s*\d+[\.\):]?\s+/);
    if (numberedMatch) {
      const parts = raw.split(/\n|(?=\d+[\.\):]?\s+)/).map(s=>s.replace(/^\s*\d+[\.\):]?\s*/,'').trim()).filter(Boolean);
      if (parts.length > 1) return parts;
    }
    if (raw.includes(';')) return raw.split(';').map(s=>s.trim()).filter(Boolean);
    const byLine = raw.split('\n').map(s=>s.replace(/^\s*[-•*]\s*/,'').trim()).filter(Boolean);
    if (byLine.length > 1) return byLine;
    return [raw.trim()];
  }
  // topicos are objects: { name, materialUrl?, materialName? }
  function openNewMat()  { setEditMatIdx(null); setMatForm({name:"",color:"#6366f1",topicos:[],reviewPreset:"moderada"}); setMatRaw(""); setMatM(true); }
  function openEditMat(i){ const m=form.materias[i]; setEditMatIdx(i); setMatForm({name:m.name,color:m.color,reviewPreset:m.reviewPreset||"moderada",topicos:m.topicos.map(t=>({name:t.name,promptSugerido:t.promptSugerido||"",conteudoAlta:t.conteudoAlta||"",conteudoMedia:t.conteudoMedia||"",conteudoBaixa:t.conteudoBaixa||"",materialUrl:t.materialUrl,materialName:t.materialName}))}); setMatRaw(m.topicos.map(t=>t.name).join('\n')); setMatM(true); }
  function handleMatRawChange(val) {
    setMatRaw(val);
    const names = parseTopicosRaw(val);
    setMatForm(f=>({...f, topicos: names.map((name,i)=>({name, promptSugerido:f.topicos[i]?.promptSugerido||"", conteudoAlta:f.topicos[i]?.conteudoAlta||"", conteudoMedia:f.topicos[i]?.conteudoMedia||"", conteudoBaixa:f.topicos[i]?.conteudoBaixa||"", materialUrl:f.topicos[i]?.materialUrl, materialName:f.topicos[i]?.materialName}))}));
  }
  function removeTopico(i) {
    const next = matForm.topicos.filter((_,j)=>j!==i);
    setMatForm(f=>({...f, topicos: next}));
    setMatRaw(next.map(t=>t.name).join('\n'));
  }

  function abrirEditarTopico(i) {
    const t = matForm.topicos[i];
    setTopicoEditar({
      idx: i,
      promptSugerido: t.promptSugerido || "",
      conteudoAlta: t.conteudoAlta || "",
      conteudoMedia: t.conteudoMedia || "",
      conteudoBaixa: t.conteudoBaixa || ""
    });
  }

  function salvarDetalhesTopico() {
    if (!topicoEditar) return;
    setMatForm(f => ({
      ...f,
      topicos: f.topicos.map((t, i) =>
        i === topicoEditar.idx
          ? {
              ...t,
              promptSugerido: topicoEditar.promptSugerido,
              conteudoAlta: topicoEditar.conteudoAlta,
              conteudoMedia: topicoEditar.conteudoMedia,
              conteudoBaixa: topicoEditar.conteudoBaixa
            }
          : t
      )
    }));
    setTopicoEditar(null);
  }
  function saveMat() {
    const valid = matForm.topicos.filter(t=>t.name?.trim());
    if (!matForm.name||valid.length===0) return;
    const mat={id:editMatIdx!==null?form.materias[editMatIdx].id:`m${Date.now()}`,name:matForm.name,color:matForm.color,reviewPreset:matForm.reviewPreset||"moderada",
      topicos:valid.map((t,i)=>({
        id:`t${Date.now()}-${i}`,
        name:t.name,
        promptSugerido:t.promptSugerido||"",
        conteudoAlta:t.conteudoAlta||"",
        conteudoMedia:t.conteudoMedia||"",
        conteudoBaixa:t.conteudoBaixa||"",
        ...(t.materialUrl?{materialUrl:t.materialUrl,materialName:t.materialName}:{})
      }))};
    if (editMatIdx!==null) setForm(f=>({...f,materias:f.materias.map((m,i)=>i===editMatIdx?mat:m)}));
    else setForm(f=>({...f,materias:[...f.materias,mat]}));
    setMatM(false);
  }
  // Supabase Storage upload
  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file || matAttach===null) return;
    if (file.size > 20 * 1024 * 1024) { setMatAttach(a=>({...a,error:"Arquivo muito grande. Máximo 20MB."})); return; }
    setMatAttach(a=>({...a,uploading:true,error:null}));
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const path = `topicos/${Date.now()}_${safeName}`;
    const { error } = await supabase.storage.from('materiais').upload(path, file, {upsert:true});
    if (error) {
      setMatAttach(a=>({...a,uploading:false,error:`Erro no upload: ${error.message}. Use a aba URL.`}));
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('materiais').getPublicUrl(path);
    setMatForm(f=>({...f,topicos:f.topicos.map((t,i)=>i===matAttach.idx?{...t,materialUrl:publicUrl,materialName:file.name}:t)}));
    setMatAttach(null);
  }
  function saveUrlAttach() {
    const url = matAttach?.urlInput?.trim();
    if (!url) return;
    setMatForm(f=>({...f,topicos:f.topicos.map((t,i)=>i===matAttach.idx?{...t,materialUrl:url,materialName:url}:t)}));
    setMatAttach(null);
  }
  function removeMaterial(idx) {
    setMatForm(f=>({...f,topicos:f.topicos.map((t,i)=>i===idx?{name:t.name}:t)}));
  }

  return (
    <div>
      <div className="ph"><div><h1>Editais</h1><p>Gerencie editais e matérias</p></div><button className="btn btn-green" onClick={openNew}>+ Novo Edital</button></div>
      {editais.length===0?<div className="card"><div className="empty"><h3>Nenhum edital</h3></div></div>:editais.map(e=>(
        <div className="sec-card" key={e.id}>
          <div className="sec-hd">
            <div><div className="fw7 fh" style={{fontSize:15}}>{e.name}</div><div className="text-xs text-dim mt2">{e.materias.reduce((a,m)=>a+m.topicos.length,0)} tópicos</div></div>
            <div className="row"><button className="btn btn-ghost btn-sm" onClick={()=>openEdit(e)}>Editar</button><button className="btn btn-red btn-sm" onClick={()=>setConfirm(e.id)}>Remover</button></div>
          </div>
          <div style={{padding:"12px 18px 14px"}}>
            {e.materias.map(m=>(
              <div key={m.id} className="row mb2" style={{flexWrap:"wrap"}}>
                <div className="dot-c" style={{background:m.color}}/><span className="fw6 text-sm">{m.name}</span><span className="badge bn">{m.topicos.length} tóp.</span>
                {m.topicos.slice(0,4).map(t=><span key={t.id} className="chip">{t.name}</span>)}
                {m.topicos.length>4&&<span className="chip">+{m.topicos.length-4}</span>}
              </div>
            ))}
          </div>
        </div>
      ))}
      <Modal open={modal} onClose={()=>setModal(false)} title={editing?"Editar Edital":"Novo Edital"} wide
        footer={<><button className="btn btn-ghost" onClick={()=>setModal(false)}>Cancelar</button><button className="btn btn-green" onClick={saveEdital}>Salvar</button></>}>
        <div className="form-group"><label className="lbl">Nome do Edital</label><input className="inp" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Ex: Concurso TRT 2025"/></div>
        <div className="row-b mb3 mt4"><span className="fw7 fh">Matérias ({form.materias.length})</span><button className="btn btn-ghost btn-sm" onClick={openNewMat}>+ Matéria</button></div>
        {form.materias.length===0?<p className="text-muted text-sm mb3">Nenhuma matéria.</p>:form.materias.map((m,idx)=>(
          <div key={m.id} className="card-sm row-b mb2">
            <div className="row"><div className="dot-c" style={{background:m.color}}/><span className="fw6">{m.name}</span><span className="badge bn">{m.topicos.length} tóp.</span></div>
            <div className="row"><button className="btn btn-ghost btn-xs" onClick={()=>openEditMat(idx)}>Editar</button><button className="btn btn-red btn-xs" onClick={()=>setForm(f=>({...f,materias:f.materias.filter((_,i)=>i!==idx)}))}>✕</button></div>
          </div>
        ))}
      </Modal>
      <Modal open={matM} onClose={()=>setMatM(false)} title={editMatIdx!==null?"Editar Matéria":"Nova Matéria"}
        footer={<><button className="btn btn-ghost" onClick={()=>setMatM(false)}>Cancelar</button><button className="btn btn-green" onClick={saveMat}>Confirmar</button></>}>
        <div className="form-group"><label className="lbl">Nome</label><input className="inp" value={matForm.name} onChange={e=>setMatForm(f=>({...f,name:e.target.value}))} placeholder="Ex: Direito Constitucional"/></div>
        <div className="form-group"><label className="lbl">Cor</label><div className="row" style={{flexWrap:"wrap",gap:7}}>{COLORS_MATERIAS.map(c=><div key={c} onClick={()=>setMatForm(f=>({...f,color:c}))} style={{width:28,height:28,borderRadius:7,background:c,cursor:"pointer",border:matForm.color===c?"3px solid white":"3px solid transparent"}}/>)}</div></div>
        <div className="form-group">
          <label className="lbl">Ciclo de Revisão</label>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {Object.keys(REVIEW_PRESETS).map(key=>(
              <button key={key} type="button" className={`preset-btn${matForm.reviewPreset===key?" active":""}`} onClick={()=>setMatForm(f=>({...f,reviewPreset:key}))}>
                {REVIEW_PRESET_LABELS[key]}
              </button>
            ))}
          </div>
          <div style={{fontSize:11,color:"var(--t3)",marginTop:5}}>{REVIEW_PRESET_DESCS[matForm.reviewPreset]}</div>
        </div>
        <div className="form-group">
          <label className="lbl">Tópicos</label>
          <textarea
            className="inp"
            style={{minHeight:110,resize:"vertical",fontFamily:"inherit",lineHeight:1.55,fontSize:13}}
            value={matRaw}
            onChange={e=>handleMatRawChange(e.target.value)}
            placeholder={"Cole ou digite os tópicos. Formatos aceitos:\n• Um por linha\n• Separados por ponto e vírgula: Tópico A; Tópico B\n• Numerados: 1 Tópico A 2 Tópico B"}
          />
          {matForm.topicos.length>0&&(
            <div style={{marginTop:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",textTransform:"uppercase",letterSpacing:.5,marginBottom:7}}>
                {matForm.topicos.length} tópico{matForm.topicos.length!==1?"s":""} detectado{matForm.topicos.length!==1?"s":""}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,maxHeight:180,overflowY:"auto"}}>
                {matForm.topicos.map((t,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:4,background:"var(--s3)",border:`1px solid ${t.conteudoAlta||t.conteudoMedia||t.conteudoBaixa?"var(--green)":"var(--b2)"}`,borderRadius:99,padding:"4px 10px 4px 12px",fontSize:12,maxWidth:"100%"}}>
                    <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{t.name}</span>
                    {(t.conteudoAlta||t.conteudoMedia||t.conteudoBaixa)&&<span title="Tem conteúdo de níveis" style={{fontSize:11,color:"var(--green)",flexShrink:0}}>📚</span>}
                    {t.promptSugerido&&<span title="Tem prompt sugerido" style={{fontSize:11,color:"var(--amber)",flexShrink:0}}>💡</span>}
                    <button title="Editar detalhes (prompt e conteúdo por nível)" onClick={()=>abrirEditarTopico(i)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--blue)",fontSize:12,lineHeight:1,padding:"0 2px",flexShrink:0}}>✎</button>
                    {t.materialUrl&&<span title={t.materialName} style={{fontSize:11,color:"var(--green)",flexShrink:0}}>📎</span>}
                    <button title={t.materialUrl?"Trocar material":"Anexar material"} onClick={()=>setMatAttach({idx:i,tab:"upload",urlInput:"",uploading:false,error:null})} style={{background:"none",border:"none",cursor:"pointer",color:t.materialUrl?"var(--green)":"var(--t3)",fontSize:12,lineHeight:1,padding:"0 2px",flexShrink:0}}>🔗</button>
                    {t.materialUrl&&<button title="Remover material" onClick={()=>removeMaterial(i)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--amber)",fontSize:11,lineHeight:1,padding:0,flexShrink:0}}>⊘</button>}
                    <button onClick={()=>removeTopico(i)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--t3)",fontSize:14,lineHeight:1,padding:0,flexShrink:0}}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Modal>
      <Confirm open={!!confirm} onClose={()=>setConfirm(null)} onConfirm={()=>{editaisModule.delete(confirm);refresh();setConfirm(null);}} title="Remover Edital" message="Tem certeza?"/>
      {matAttach!==null&&(
        <div className="overlay" onClick={()=>setMatAttach(null)} style={{zIndex:9999}}>
          <div className="modal fi" style={{maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <div className="modal-hd"><h2>📎 Anexar Material</h2><button className="modal-x" onClick={()=>setMatAttach(null)}>✕</button></div>
            <p style={{fontSize:12,color:"var(--t3)",marginBottom:14}}>Tópico: <strong>{matForm.topicos[matAttach.idx]?.name}</strong></p>
            <div style={{display:"flex",gap:8,marginBottom:16}}>
              <button type="button" className={`preset-btn${matAttach.tab==="upload"?" active":""}`} onClick={()=>setMatAttach(a=>({...a,tab:"upload"}))}>⬆ Upload</button>
              <button type="button" className={`preset-btn${matAttach.tab==="url"?" active":""}`} onClick={()=>setMatAttach(a=>({...a,tab:"url"}))}>🔗 URL</button>
            </div>
            {matAttach.tab==="upload"?(
              <>
                <label className="upload-zone">
                  <input type="file" style={{display:"none"}} onChange={handleFileUpload} accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"/>
                  {matAttach.uploading?(
                    <div style={{color:"var(--t2)"}}>⏳ Enviando...</div>
                  ):(
                    <>
                      <div style={{fontSize:36,marginBottom:8}}>📁</div>
                      <div style={{fontWeight:700,marginBottom:4}}>Clique para selecionar arquivo</div>
                      <div style={{fontSize:11,color:"var(--t3)"}}>PDF, DOC, imagens — máx. 20MB</div>
                    </>
                  )}
                </label>
                {matAttach.error&&<div className="alert alert-red mt3" style={{fontSize:12}}>{matAttach.error}</div>}
              </>
            ):(
              <>
                <div className="form-group">
                  <label className="lbl">URL do material</label>
                  <input className="inp" value={matAttach.urlInput} onChange={e=>setMatAttach(a=>({...a,urlInput:e.target.value}))} placeholder="https://..."/>
                </div>
                <button className="btn btn-green" style={{width:"100%"}} onClick={saveUrlAttach}>Salvar URL</button>
              </>
            )}
            {matForm.topicos[matAttach?.idx]?.materialUrl&&(
              <div style={{marginTop:14,padding:"10px 12px",borderRadius:9,background:"var(--s3)",border:"1px solid var(--green)",display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:11,color:"var(--green)",fontWeight:700,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📎 {matForm.topicos[matAttach.idx].materialName}</span>
                <a href={matForm.topicos[matAttach.idx].materialUrl} target="_blank" rel="noreferrer" style={{fontSize:11,color:"var(--blue)",textDecoration:"none"}}>Abrir</a>
                <button onClick={()=>removeMaterial(matAttach.idx)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--red)",fontSize:11}}>Remover</button>
              </div>
            )}
          </div>
        </div>
      )}
      {topicoEditar !== null && (
        <div className="overlay" onClick={() => setTopicoEditar(null)} style={{ zIndex: 9999 }}>
          <div className="modal fi" style={{ maxWidth: 600, maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
            <div className="modal-hd">
              <h2>✎ Editar Tópico: {matForm.topicos[topicoEditar.idx]?.name}</h2>
              <button className="modal-x" onClick={() => setTopicoEditar(null)}>✕</button>
            </div>

            <div style={{ padding: "20px" }}>
              {/* Prompt Sugerido */}
              <div className="form-group" style={{ marginBottom: 20 }}>
                <label className="lbl">💡 Prompt Sugerido</label>
                <p style={{ fontSize: 11, color: "var(--t3)", marginBottom: 8 }}>
                  Suira um prompt de estudo para este tópico. O aluno pode usá-lo para gerar materiais com IA.
                </p>
                <textarea
                  className="inp"
                  style={{ minHeight: 80, fontFamily: "inherit", resize: "vertical" }}
                  value={topicoEditar.promptSugerido}
                  onChange={e => setTopicoEditar(s => ({ ...s, promptSugerido: e.target.value }))}
                  placeholder="Ex: Explique os conceitos principais de estequiometria e como calcular..."
                />
              </div>

              {/* Conteúdo Alta Cobertura */}
              <div className="form-group" style={{ marginBottom: 20, padding: 12, borderRadius: 8, background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)" }}>
                <label className="lbl" style={{ color: "var(--red)" }}>🔴 Alta Cobertura</label>
                <p style={{ fontSize: 11, color: "var(--t3)", marginBottom: 8 }}>
                  Cole aqui o conteúdo completo, detalhado e aprofundado para este tópico.
                </p>
                <textarea
                  className="inp"
                  style={{ minHeight: 120, fontFamily: "inherit", resize: "vertical" }}
                  value={topicoEditar.conteudoAlta}
                  onChange={e => setTopicoEditar(s => ({ ...s, conteudoAlta: e.target.value }))}
                  placeholder="Conteúdo detalhado e aprofundado..."
                />
              </div>

              {/* Conteúdo Média Cobertura */}
              <div className="form-group" style={{ marginBottom: 20, padding: 12, borderRadius: 8, background: "rgba(251, 191, 36, 0.08)", border: "1px solid rgba(251, 191, 36, 0.2)" }}>
                <label className="lbl" style={{ color: "var(--amber)" }}>🟡 Média Cobertura</label>
                <p style={{ fontSize: 11, color: "var(--t3)", marginBottom: 8 }}>
                  Cole o conteúdo essencial, focado nos pontos principais.
                </p>
                <textarea
                  className="inp"
                  style={{ minHeight: 120, fontFamily: "inherit", resize: "vertical" }}
                  value={topicoEditar.conteudoMedia}
                  onChange={e => setTopicoEditar(s => ({ ...s, conteudoMedia: e.target.value }))}
                  placeholder="Conteúdo essencial e sintetizado..."
                />
              </div>

              {/* Conteúdo Baixa Cobertura */}
              <div className="form-group" style={{ marginBottom: 20, padding: 12, borderRadius: 8, background: "rgba(34, 197, 94, 0.08)", border: "1px solid rgba(34, 197, 94, 0.2)" }}>
                <label className="lbl" style={{ color: "var(--green)" }}>🟢 Baixa Cobertura</label>
                <p style={{ fontSize: 11, color: "var(--t3)", marginBottom: 8 }}>
                  Cole apenas o resumo, conceitos principais em poucas linhas.
                </p>
                <textarea
                  className="inp"
                  style={{ minHeight: 100, fontFamily: "inherit", resize: "vertical" }}
                  value={topicoEditar.conteudoBaixa}
                  onChange={e => setTopicoEditar(s => ({ ...s, conteudoBaixa: e.target.value }))}
                  placeholder="Resumo e conceitos principais..."
                />
              </div>
            </div>

            <div style={{ padding: "16px 20px", borderTop: "1px solid var(--b2)", display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setTopicoEditar(null)}>
                Cancelar
              </button>
              <button className="btn btn-green" style={{ flex: 1 }} onClick={salvarDetalhesTopico}>
                ✓ Salvar Detalhes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CoachProgresso({ user }) {
  const alunos = usersModule.getAlunos(user.id);
  const planos = storage.get().planos;
  const db = storage.get();
  return (
    <div>
      <div className="ph"><div><h1>Progresso dos Alunos</h1></div></div>
      {alunos.length===0?<div className="card"><div className="empty"><h3>Nenhum aluno</h3></div></div>:alunos.map(a=>{
        const ap=planos.filter(p=>p.alunoId===a.id);
        // Simulados finalizados pelo aluno
        const tentativasAluno = (db.tentativas||[]).filter(t=>t.alunoId===a.id && t.status==="finalizada");
        return (
          <div className="sec-card mb4" key={a.id}>
            <div className="sec-hd"><div className="fw7 fh" style={{fontSize:15}}>{a.name}</div><span className="badge bb">{a.email}</span></div>
            <div style={{padding:"14px 18px"}}>
              {ap.length===0?<p className="text-muted text-sm">Sem plano.</p>:ap.map(plano=>{
                const stats=progressoModule.getStats(a.id,plano.id);
                const edital=editaisModule.getById(plano.editalId);
                if (!stats) return null;
                return (
                  <div key={plano.id} className="card-sm mb3">
                    <div className="row-b mb3"><div className="fw6">{edital?.name}</div><span className={`badge ${stats.pct===100?"bg":"bn"}`}>{stats.pct}%</span></div>
                    <div className="g3 mb3">
                      <div style={{textAlign:"center"}}><div className="fw9 fh" style={{fontSize:22,color:"var(--green)"}}>{stats.aulasFeitas}</div><div className="text-xs text-dim">Feitas</div></div>
                      <div style={{textAlign:"center"}}><div className="fw9 fh" style={{fontSize:22}}>{stats.totalAulas-stats.aulasFeitas}</div><div className="text-xs text-dim">Restantes</div></div>
                      <div style={{textAlign:"center"}}><div className="fw7 fh" style={{fontSize:12,color:"var(--amber)",marginTop:4}}>{stats.previsao}</div><div className="text-xs text-dim">Previsão</div></div>
                    </div>
                    <PBar pct={stats.pct}/>
                  </div>
                );
              })}

              {/* Histórico de Simulados do Aluno */}
              {tentativasAluno.length > 0 && (
                <div style={{marginTop:12}}>
                  <div style={{fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:"var(--t3)",marginBottom:10}}>📝 Simulados Realizados</div>
                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {tentativasAluno.map(tent=>{
                      const sim = (db.simulados||[]).find(s=>s.id===tent.simuladoId);
                      const total = (db.questoes||[]).filter(q=>q.simuladoId===tent.simuladoId).length;
                      const pct = total > 0 ? Math.round((tent.acertos/total)*100) : 0;
                      const minutos = Math.floor((tent.tempoDecorridoSegundos||0)/60);
                      const segundos = (tent.tempoDecorridoSegundos||0)%60;
                      return (
                        <div key={tent.id} style={{padding:"10px 14px",borderRadius:8,background:"var(--s3)",border:"1px solid var(--b1)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
                          <div>
                            <div style={{fontSize:13,fontWeight:600,color:"var(--t1)",marginBottom:2}}>{sim?.nome||"Simulado"}</div>
                            <div style={{fontSize:11,color:"var(--t3)"}}>
                              {new Date(tent.finishedAt).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"})}
                              {tent.tempoDecorridoSegundos ? ` • ⏱️ ${minutos}m ${segundos}s` : ""}
                            </div>
                          </div>
                          <div style={{display:"flex",gap:10,alignItems:"center"}}>
                            <div style={{textAlign:"center"}}>
                              <div style={{fontSize:18,fontWeight:900,color:pct>=60?"var(--green)":"var(--red)",fontFamily:"Cabinet Grotesk"}}>{tent.acertos}/{total}</div>
                              <div style={{fontSize:10,color:"var(--t3)"}}>acertos</div>
                            </div>
                            <span className={`badge ${pct>=60?"bg":"br"}`}>{pct}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ============================================================
// COACH: Gerenciar Planos
// ============================================================
function CoachGerenciarPlanos({ user, refresh }) {
  const alunos = usersModule.getAlunos(user.id);
  const planos = storage.get().planos;
  const [selectedAlunoId, setSelectedAlunoId] = useState(alunos[0]?.id || null);
  const [view, setView] = useState("tabela"); // "tabela" | "cronograma"
  const [modalAula, setModalAula] = useState(null); // { alunoId, planoId, date, topicId, action }
  const [anotacao, setAnotacao] = useState("");
  const [novaData, setNovaData] = useState("");
  const [dataRealizacao, setDataRealizacao] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const selectedAluno = alunos.find(a => a.id === selectedAlunoId);
  const alunoPlanos = planos.filter(p => p.alunoId === selectedAlunoId);

  function salvarAlteracao(alunoId, planoId, topicId, date, action, notes = "") {
    const registro = {
      id: `alter${Date.now()}`,
      alunoId,
      planoId,
      topicId,
      date,
      action, // "mark_done" | "mark_pending" | "cancel" | "reschedule"
      notes,
      realizadoPor: user.id,
      realizadoEm: new Date().toISOString(),
    };
    storage.set(db => ({
      ...db,
      auditLog: [...(db.auditLog || []), registro],
    }));
  }

  function marcarComoConcluida(alunoId, planoId, date, topicId, dataRealizacao) {
    const dataParaUsar = dataRealizacao || date;
    if (anotacao.trim()) salvarAlteracao(alunoId, planoId, topicId, dataParaUsar, "mark_done", anotacao);
    progressoModule.saveDone(alunoId, planoId, `${dataParaUsar}-${topicId}`);

    // Schedule reviews from the completion date
    const plano = planosModule.getById(planoId);
    if (plano) {
      const topicObj = Object.values(plano.plan || {}).flatMap(d => d.topicos).find(t => t.id === topicId);
      if (topicObj) {
        storage.set(db => {
          const planos = db.planos.map(p => {
            if (p.id !== planoId) return p;
            const np = JSON.parse(JSON.stringify(p.plan));
            const lessonDate = new Date(dataParaUsar + "T12:00:00");
            const intervals = REVIEW_PRESETS[topicObj.materiaReviewPreset || "moderada"] || REVIEW_INTERVALS;
            intervals.forEach(interval => {
              const rd = new Date(lessonDate); rd.setDate(rd.getDate() + interval);
              const rk = localDateKey(rd);
              if (!np[rk]) np[rk] = { date: rk, topicos: [], reviews: [] };
              if (!np[rk].reviews.find(r => r.id === topicId))
                np[rk].reviews.push({ ...topicObj, reviewInterval: interval });
            });
            return { ...p, plan: np };
          });
          return { ...db, planos };
        });
      }
    }

    setModalAula(null);
    setAnotacao("");
    setDataRealizacao("");
    setSuccessMessage("✅ Aula marcada como concluída!");
    setTimeout(() => setSuccessMessage(""), 3000);
    refresh();
  }

  function desmarcarComoConcluida(alunoId, planoId, date, topicId) {
    if (anotacao.trim()) salvarAlteracao(alunoId, planoId, topicId, date, "mark_pending", anotacao);
    progressoModule.toggle(alunoId, planoId, `${date}-${topicId}`);
    persistToSupabase(storage.get());
    setModalAula(null);
    setAnotacao("");
    setSuccessMessage("⏳ Aula marcada como pendente!");
    setTimeout(() => setSuccessMessage(""), 3000);
    refresh();
  }

  function cancelarAula(alunoId, planoId, date, topicId) {
    salvarAlteracao(alunoId, planoId, topicId, date, "cancel", anotacao);
    const plano = planosModule.getById(planoId);
    if (plano?.plan?.[date]) {
      storage.set(db => ({
        ...db,
        planos: db.planos.map(p => p.id === planoId ? {
          ...p,
          plan: { ...p.plan, [date]: { ...p.plan[date], topicos: p.plan[date].topicos.filter(t => t.id !== topicId) } }
        } : p),
      }));
      persistToSupabase(storage.get());
    }
    setModalAula(null);
    setAnotacao("");
    setSuccessMessage("❌ Aula cancelada!");
    setTimeout(() => setSuccessMessage(""), 3000);
    refresh();
  }

  function reagendarAula(alunoId, planoId, date, topicId, newDate) {
    if (!newDate) return;
    salvarAlteracao(alunoId, planoId, topicId, date, "reschedule", `Movido de ${date} para ${newDate}`);

    persistToSupabase(storage.get());

    const plano = planosModule.getById(planoId);
    if (plano?.plan) {
      const aula = plano.plan[date]?.topicos.find(t => t.id === topicId);
      if (aula) {
        const novoPlano = { ...plano.plan };
        // Remove from old date
        novoPlano[date] = { ...novoPlano[date], topicos: novoPlano[date].topicos.filter(t => t.id !== topicId) };
        // Add to new date
        if (!novoPlano[newDate]) novoPlano[newDate] = { date: newDate, topicos: [], reviews: [] };
        novoPlano[newDate].topicos.push(aula);
        storage.set(db => ({
          ...db,
          planos: db.planos.map(p => p.id === planoId ? { ...p, plan: novoPlano } : p),
        }));
        persistToSupabase(storage.get());
      }
    }
    setModalAula(null);
    setNovaData("");
    setSuccessMessage(`🔄 Aula reagendada para ${new Date(newDate + "T12:00:00").toLocaleDateString("pt-BR")}!`);
    setTimeout(() => setSuccessMessage(""), 3000);
    refresh();
  }

  if (!selectedAluno) return <div className="card"><div className="empty"><h3>Nenhum aluno</h3></div></div>;

  return (
    <div>
      <div className="ph"><div><h1>Gerenciar Planos de Aulas</h1><p>Ajuste cronogramas e registre aulas</p></div></div>

      {successMessage && (
        <div style={{
          padding: '14px 16px',
          borderRadius: 8,
          background: 'var(--green-d)',
          color: 'var(--green)',
          marginBottom: 16,
          fontSize: 13,
          fontWeight: 600,
          border: '1px solid var(--green)',
          animation: 'fadeIn 0.3s ease'
        }}>
          {successMessage}
        </div>
      )}

      {/* Seleção de aluno */}
      <div className="card mb4">
        <div className="card-title">Selecione um aluno</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {alunos.map(a => (
            <button
              key={a.id}
              onClick={() => setSelectedAlunoId(a.id)}
              style={{
                padding: "12px 16px",
                borderRadius: 10,
                border: `2px solid ${selectedAlunoId === a.id ? "var(--green)" : "var(--b2)"}`,
                background: selectedAlunoId === a.id ? "var(--green-d)" : "var(--s1)",
                color: selectedAlunoId === a.id ? "var(--green)" : "var(--t2)",
                cursor: "pointer",
                fontWeight: 600,
                transition: "all .15s",
              }}
            >
              {a.name} ({a.email})
            </button>
          ))}
        </div>
      </div>

      {/* Planos do aluno */}
      {alunoPlanos.length === 0 ? (
        <div className="card"><div className="empty"><h3>Nenhum plano ativo</h3></div></div>
      ) : (
        alunoPlanos.map(plano => (
          <div key={plano.id} className="card mb4">
            <div className="card-title" style={{ marginBottom: 16 }}>
              {editaisModule.getById(plano.editalId)?.name}
              <span style={{ marginLeft: 8, fontSize: 12, color: "var(--t3)" }}>{Object.keys(plano.plan || {}).length} aulas</span>
            </div>

            {/* Abas de visualização */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
              <button
                onClick={() => setView("tabela")}
                className={`preset-btn ${view === "tabela" ? "active" : ""}`}
              >
                📊 Tabela
              </button>
              <button
                onClick={() => setView("cronograma")}
                className={`preset-btn ${view === "cronograma" ? "active" : ""}`}
              >
                📅 Cronograma
              </button>
            </div>

            {/* VISTA 1: Tabela */}
            {view === "tabela" && (
              <CoachPlanoTabela
                aluno={selectedAluno}
                plano={plano}
                setModalAula={setModalAula}
              />
            )}

            {/* VISTA 2: Cronograma */}
            {view === "cronograma" && (
              <CoachPlanoCronograma
                aluno={selectedAluno}
                plano={plano}
                setModalAula={setModalAula}
              />
            )}
          </div>
        ))
      )}

      {/* MODAL: Ação na aula */}
      {modalAula && (
        <div style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
        }}>
          <div className="card" style={{ maxWidth: 500, padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
              {modalAula.action === "mark_done" && "✅ Marcar aula como realizada"}
              {modalAula.action === "mark_pending" && "⏳ Marcar como não realizada"}
              {modalAula.action === "cancel" && "❌ Cancelar aula"}
              {modalAula.action === "reschedule" && "🔄 Reagendar aula"}
            </div>

            {modalAula.action === "mark_done" && (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", display: "block", marginBottom: 6 }}>
                    📅 Data de conclusão
                  </label>
                  <input
                    type="date"
                    value={dataRealizacao || modalAula.date}
                    onChange={(e) => setDataRealizacao(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--b2)",
                      background: "var(--s1)",
                      color: "var(--t2)",
                      fontSize: 13,
                    }}
                  />
                  <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 4 }}>
                    A partir dessa data, as revisões serão agendadas automaticamente
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", display: "block", marginBottom: 6 }}>
                    📝 Anotações (opcional)
                  </label>
                  <textarea
                    value={anotacao}
                    onChange={(e) => setAnotacao(e.target.value)}
                    placeholder="Ex: Aluno completou com excelência..."
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: "1px solid var(--b2)",
                      background: "var(--s1)",
                      color: "var(--t2)",
                      fontSize: 13,
                      minHeight: 80,
                      fontFamily: "inherit",
                    }}
                  />
                </div>
              </>
            )}

            {(modalAula.action === "mark_pending" || modalAula.action === "cancel") && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", display: "block", marginBottom: 6 }}>
                  📝 Anotações (opcional)
                </label>
                <textarea
                  value={anotacao}
                  onChange={(e) => setAnotacao(e.target.value)}
                  placeholder="Ex: Aluno completou com excelência..."
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--b2)",
                    background: "var(--s1)",
                    color: "var(--t2)",
                    fontSize: 13,
                    minHeight: 80,
                    fontFamily: "inherit",
                  }}
                />
              </div>
            )}

            {modalAula.action === "reschedule" && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", display: "block", marginBottom: 6 }}>
                  📅 Nova data
                </label>
                <input
                  type="date"
                  value={novaData}
                  onChange={(e) => setNovaData(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid var(--b2)",
                    background: "var(--s1)",
                    color: "var(--t2)",
                    fontSize: 13,
                  }}
                />
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1 }}
                onClick={() => {
                  setModalAula(null);
                  setAnotacao("");
                  setNovaData("");
                  setDataRealizacao("");
                }}
              >
                Cancelar
              </button>
              <button
                className="btn btn-green"
                style={{ flex: 1 }}
                onClick={() => {
                  if (modalAula.action === "mark_done") marcarComoConcluida(modalAula.alunoId, modalAula.planoId, modalAula.date, modalAula.topicId, dataRealizacao);
                  else if (modalAula.action === "mark_pending") desmarcarComoConcluida(modalAula.alunoId, modalAula.planoId, modalAula.date, modalAula.topicId);
                  else if (modalAula.action === "cancel") cancelarAula(modalAula.alunoId, modalAula.planoId, modalAula.date, modalAula.topicId);
                  else if (modalAula.action === "reschedule") reagendarAula(modalAula.alunoId, modalAula.planoId, modalAula.date, modalAula.topicId, novaData);
                }}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Componente: Vista em tabela
function CoachPlanoTabela({ aluno, plano, setModalAula }) {
  const aulas = [];
  Object.entries(plano.plan || {}).forEach(([date, day]) => {
    day.topicos?.forEach(t => {
      const done = progressoModule.isDone(aluno.id, plano.id, `${date}-${t.id}`);
      aulas.push({ date, topic: t, done, type: "aula" });
    });
    day.reviews?.forEach(r => {
      const done = progressoModule.isDone(aluno.id, plano.id, `${date}-${r.id}-rev`);
      aulas.push({ date, topic: r, done, type: "review" });
    });
  });
  aulas.sort((a, b) => a.date.localeCompare(b.date));

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: "2px solid var(--b2)" }}>
          <th style={{ padding: "10px 12px", textAlign: "left", color: "var(--t3)", fontWeight: 700, fontSize: 11, textTransform: "uppercase" }}>Data</th>
          <th style={{ padding: "10px 12px", textAlign: "left", color: "var(--t3)", fontWeight: 700, fontSize: 11, textTransform: "uppercase" }}>Tipo</th>
          <th style={{ padding: "10px 12px", textAlign: "left", color: "var(--t3)", fontWeight: 700, fontSize: 11, textTransform: "uppercase" }}>Tópico</th>
          <th style={{ padding: "10px 12px", textAlign: "center", color: "var(--t3)", fontWeight: 700, fontSize: 11, textTransform: "uppercase" }}>Status</th>
          <th style={{ padding: "10px 12px", textAlign: "center", color: "var(--t3)", fontWeight: 700, fontSize: 11, textTransform: "uppercase" }}>Ações</th>
        </tr>
      </thead>
      <tbody>
        {aulas.map((aula, i) => (
          <tr key={i} style={{ borderBottom: "1px solid var(--b2)", background: aula.done ? "rgba(34, 197, 94, 0.1)" : "transparent" }}>
            <td style={{ padding: "12px", color: "var(--t2)", fontWeight: 600 }}>{aula.date}</td>
            <td style={{ padding: "12px", color: "var(--t3)" }}>{aula.type === "aula" ? "📚 Aula" : "🔁 Revisão"}</td>
            <td style={{ padding: "12px", color: "var(--t2)" }}>{aula.topic.name?.slice(0, 40)}</td>
            <td style={{ padding: "12px", textAlign: "center", color: aula.done ? "var(--green)" : "var(--amber)" }}>
              {aula.done ? "✅ Feita" : "⏳ Pendente"}
            </td>
            <td style={{ padding: "12px", textAlign: "center", display: "flex", gap: 6, justifyContent: "center" }}>
              <button
                className="btn-xs"
                onClick={() => setModalAula({ alunoId: aluno.id, planoId: plano.id, date: aula.date, topicId: aula.topic.id, action: aula.done ? "mark_pending" : "mark_done" })}
                style={{ padding: "4px 10px", fontSize: 11, background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: 6, cursor: "pointer" }}
              >
                {aula.done ? "Desfazer" : "✓ Concluir"}
              </button>
              <button
                onClick={() => setModalAula({ alunoId: aluno.id, planoId: plano.id, date: aula.date, topicId: aula.topic.id, action: "reschedule" })}
                style={{ padding: "4px 10px", fontSize: 11, background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: 6, cursor: "pointer" }}
              >
                🔄
              </button>
              <button
                onClick={() => setModalAula({ alunoId: aluno.id, planoId: plano.id, date: aula.date, topicId: aula.topic.id, action: "cancel" })}
                style={{ padding: "4px 10px", fontSize: 11, background: "var(--s2)", border: "1px solid var(--b2)", borderRadius: 6, cursor: "pointer" }}
              >
                ❌
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Constrói mapa topicId → { name, materiaName, materiaColor } a partir do edital
function buildTopicMap(edital) {
  const map = {};
  if (!edital) return map;
  for (const m of (edital.materias || [])) {
    for (const t of (m.topicos || [])) {
      map[t.id] = { name: t.name, materiaName: m.name, materiaColor: m.color };
    }
  }
  return map;
}

// Componente: Vista em cronograma
function CoachPlanoCronograma({ aluno, plano, setModalAula }) {
  const edital = editaisModule.getById(plano.editalId);
  const topicMap = buildTopicMap(edital);

  // Dias do plano atual
  const planDays = { ...(plano.plan || {}) };

  // Reconstrói dias históricos a partir do progresso (datas que não estão no plano)
  const todayKey = localDateKey();
  const prog = storage.get().progresso.filter(
    p => p.alunoId === aluno.id && p.planoId === plano.id && p.done && !p.key.endsWith("-rev")
  );
  prog.forEach(p => {
    const date = p.key.substring(0, 10);
    const topicId = p.key.substring(11);
    if (date >= todayKey) return; // só datas passadas
    if (!planDays[date]) {
      planDays[date] = { date, topicos: [], reviews: [], _history: true };
    }
    // Adiciona o tópico ao dia histórico se ainda não estiver lá
    if (!planDays[date].topicos.find(t => t.id === topicId)) {
      const info = topicMap[topicId] || { name: topicId, materiaName: "", materiaColor: "#6b7280" };
      planDays[date].topicos.push({ id: topicId, ...info });
    }
  });

  const sorted = Object.keys(planDays).sort();
  let weekStart = null;
  const semanas = [];

  sorted.forEach(date => {
    const d = new Date(date + "T00:00:00");
    const wStart = new Date(d);
    wStart.setDate(d.getDate() - d.getDay() + 1);
    const wKey = localDateKey(wStart);
    if (!weekStart || wKey !== weekStart) {
      weekStart = wKey;
      const wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + 6);
      semanas.push({ start: wKey, end: localDateKey(wEnd), dias: {} });
    }
    const currentWeek = semanas[semanas.length - 1];
    if (!currentWeek.dias[date]) currentWeek.dias[date] = planDays[date];
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {semanas.map((sem, wi) => (
        <div key={wi}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t3)", marginBottom: 12 }}>
            📅 {sem.start} — {sem.end}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
            {Object.entries(sem.dias).map(([date, day]) => (
              <div key={date} style={{ padding: 14, borderRadius: 10, border: "1px solid var(--b2)", background: "var(--s2)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: "var(--t1)" }}>{date}</div>
                {(day.topicos || []).map((t, i) => {
                  const done = progressoModule.isDone(aluno.id, plano.id, `${date}-${t.id}`);
                  return (
                    <div
                      key={i}
                      style={{
                        padding: "8px 10px",
                        marginBottom: 6,
                        borderRadius: 7,
                        background: done ? "var(--green-d)" : "var(--s3)",
                        color: done ? "var(--green)" : "var(--t2)",
                        fontSize: 12,
                        textDecoration: done ? "line-through" : "none",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 6,
                      }}
                    >
                      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name?.slice(0, 20)}</span>
                      <button onClick={() => setModalAula({ alunoId: aluno.id, planoId: plano.id, date, topicId: t.id, action: "mark_done" })} style={{ padding: "2px 6px", fontSize: 10, background: "transparent", border: "none", cursor: "pointer" }}>✓</button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// ALUNO PAGES
// ============================================================
function AlunoDashboard({ user, setPage }) {
  const [estudarOpen, setEstudarOpen] = useState(false);
  const [tick, setTick] = useState(0);
  const plano  = planosModule.getByAluno(user.id)[0]||null;
  const stats  = plano?progressoModule.getStats(user.id,plano.id):null;
  const edital = plano?editaisModule.getById(plano.editalId):null;
  const today  = localDateKey();
  const td     = plano?.plan?.[today]||{topicos:[],reviews:[]};
  const tdDone = td.topicos.filter(t=>progressoModule.isDone(user.id,plano?.id,`${today}-${t.id}`)).length;
  const tdPend = td.topicos.length - tdDone;
  const xp     = plano ? gamificacaoModule.calcXP(user.id, plano.id) : 0;
  const nivel  = gamificacaoModule.getNivel(xp);
  const streak = plano ? gamificacaoModule.getStreakAtual(user.id, plano.id) : 0;
  const meta   = plano ? gamificacaoModule.getMetaSemanal(user.id, plano.id) : { feitas:0, meta:5 };
  const xpPct  = nivel.max===Infinity ? 100 : Math.round(((xp-nivel.min)/(nivel.max-nivel.min))*100);
  const metaPct= Math.min(100, meta.meta>0 ? Math.round(meta.feitas/meta.meta*100) : 0);

  // BUG-7: Detectar streak quebrado e notificar
  const [streakNotif, setStreakNotif] = useState(null);
  useEffect(() => {
    if (!plano) return;
    const key = `estudaai_streak_${user.id}`;
    const saved = JSON.parse(localStorage.getItem(key) || "{}");
    if (streak === 0 && saved.lastStreak > 0 && !saved.notificado) {
      setStreakNotif(saved.lastStreak);
      localStorage.setItem(key, JSON.stringify({ ...saved, notificado: true }));
    } else if (streak > 0) {
      localStorage.setItem(key, JSON.stringify({ lastStreak: streak, notificado: false }));
    }
  }, [streak, plano]);

  function refresh() { setTick(t=>t+1); }
  return (
    <div>
      <div className="ph">
        <div><h1>Olá, {user.name.split(" ")[0]}! 📚</h1><p>Continue de onde parou</p></div>
        {plano&&tdPend>0&&<button className="btn btn-green" style={{fontSize:15,padding:"12px 22px"}} onClick={()=>setEstudarOpen(true)}>▶ Estudar Agora</button>}
      </div>

      {/* Notificação de streak quebrado */}
      {streakNotif && (
        <div style={{background:"var(--amber-d,#fef3c7)",border:"1.5px solid var(--amber,#f59e0b)",borderRadius:10,padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
          <div style={{fontSize:13,color:"var(--t1)"}}>
            😔 Seu streak de <strong>{streakNotif} dia{streakNotif>1?"s":""}</strong> foi interrompido. Que tal retomar hoje?
          </div>
          <button className="btn btn-ghost btn-xs" onClick={() => setStreakNotif(null)} style={{flexShrink:0}}>✕</button>
        </div>
      )}
      {/* Streak recomeçou */}
      {streak === 1 && tdDone > 0 && !streakNotif && (
        <div style={{background:"var(--green-d,#dcfce7)",border:"1.5px solid var(--green,#22c55e)",borderRadius:10,padding:"12px 16px",marginBottom:16,fontSize:13,color:"var(--t1)"}}>
          🔥 1 dia seguido — você recomeçou! Continue assim!
        </div>
      )}

      {/* Gamification strip */}
      {plano&&(
        <div className="gami-grid">
          <div className="card-sm" style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{fontSize:26,lineHeight:1}}>🔥</div>
            <div>
              <div style={{fontSize:24,fontWeight:900,fontFamily:"Cabinet Grotesk",color:"var(--amber)",lineHeight:1}}>{streak}</div>
              <div style={{fontSize:10,color:"var(--t3)",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Dias seguidos</div>
            </div>
          </div>
          <div className="card-sm">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div>
                <div style={{fontSize:10,color:"var(--t3)",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Nível {nivel.level}</div>
                <div style={{fontFamily:"Cabinet Grotesk",fontWeight:900,fontSize:13}}>{nivel.emoji} {nivel.name}</div>
              </div>
              <div style={{fontSize:11,color:"var(--purple)",fontWeight:700}}>{xp} XP</div>
            </div>
            <div className="pbar"><div className="pbar-fill" style={{width:`${xpPct}%`,background:"var(--purple)"}}/></div>
          </div>
          <div className="card-sm">
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div>
                <div style={{fontSize:10,color:"var(--t3)",fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Meta semanal</div>
                <div style={{fontFamily:"Cabinet Grotesk",fontWeight:900,fontSize:13}}>🎯 {meta.feitas}/{meta.meta}</div>
              </div>
              <span className={`badge ${meta.feitas>=meta.meta?"bg":"bn"}`}>{metaPct}%</span>
            </div>
            <div className="pbar"><div className="pbar-fill" style={{width:`${metaPct}%`,background:"var(--blue)"}}/></div>
          </div>
        </div>
      )}

      {!plano?(
        <div className="card"><div className="empty">
          <div style={{fontSize:40,marginBottom:8}}>🎯</div>
          <h3>Nenhum plano ativo</h3>
          <p style={{marginBottom:16}}>Crie seu plano personalizado em minutos.</p>
          <button className="btn btn-green" onClick={()=>setPage("plano")}>🚀 Começar Hoje</button>
        </div></div>
      ):(
        <>
          <div className="g4 mb4">
            <div className="stat"><div className="stat-l">Hoje</div><div className="stat-v">{tdDone}/{td.topicos.length}</div><div className="stat-s">aulas</div></div>
            <div className="stat"><div className="stat-l">Total feitas</div><div className="stat-v" style={{color:"var(--green)"}}>{stats?.aulasFeitas}</div><div className="stat-s">de {stats?.totalAulas}</div></div>
            <div className="stat"><div className="stat-l">Progresso</div><div className="stat-v">{stats?.pct}%</div></div>
            <div className="stat"><div className="stat-l">Previsão</div><div className="stat-v" style={{fontSize:14,marginTop:6,color:"var(--amber)"}}>{stats?.previsao}</div></div>
          </div>
          <div className="g2">
            <div className="card">
              <div className="card-title">Progresso — {edital?.name}</div>
              <div className="row-b mb2 text-sm text-muted"><span>{stats?.aulasFeitas} concluídas</span><span>{stats?.pct}%</span></div>
              <PBar pct={stats?.pct||0}/>
              <div className="row mt3 text-xs text-dim" style={{gap:14}}>
                <span>✅ {stats?.aulasFeitas} feitas</span><span>⏳ {(stats?.totalAulas||0)-(stats?.aulasFeitas||0)} restantes</span><span>🔄 {stats?.reviewsFeitas} revisões</span>
              </div>
            </div>
            <div className="card">
              <div className="card-title">Aulas de Hoje</div>
              {td.topicos.length===0?<p className="text-muted text-sm">Sem aulas hoje 🎉</p>:(
                <>
                  {td.topicos.slice(0,5).map((t,i)=>{
                    const done=progressoModule.isDone(user.id,plano.id,`${today}-${t.id}`);
                    return <div key={i} className={`topic-row ${done?"done":""}`}><div className="dot-c" style={{background:t.materiaColor}}/><span className="tr-name">{t.name}</span>{done&&<span className="badge bg" style={{fontSize:10}}>✓</span>}</div>;
                  })}
                  {tdPend>0&&<button className="btn btn-green mt3" style={{width:"100%"}} onClick={()=>setEstudarOpen(true)}>▶ Estudar Agora ({tdPend} pendente{tdPend!==1?"s":""})</button>}
                </>
              )}
            </div>
          </div>
        </>
      )}
      {estudarOpen&&plano&&<EstudarAgoraModal user={user} plano={plano} onClose={()=>{setEstudarOpen(false);refresh();}} onRefresh={refresh}/>}
    </div>
  );
}

function AlunoPlano({ user, refresh }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [tick, setTick] = useState(0);
  const [gerarEdital, setGerarEdital] = useState("");
  const [showEstudar2, setShowEstudar2] = useState(false);  // ← moved above conditional return
  const [showAdiantar, setShowAdiantar] = useState(false);
  const [adiantarQtd, setAdiantarQtd] = useState(2);
  const [expandedNote, setExpandedNote] = useState(null); // topicId whose note is expanded
  const [showRegerar, setShowRegerar] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState(null); // topicId for PDF modal
  const plano   = planosModule.getByAluno(user.id)[0]||null;
  const editais = editaisModule.getByAluno(user.id);
  const today   = new Date(); today.setHours(0,0,0,0);

  function gerarPlano() {
    if (!gerarEdital) return;
    try {
      planosModule.generate(user.id,gerarEdital,{dias:[1,2,3,4,5],aulasPorDia:1});
      refresh();
    } catch (e) {
      console.error("[EstudaAI] gerarPlano:", e);
      alert("Não foi possível gerar o plano:\n\n" + (e?.message || "Erro desconhecido."));
    }
  }
  function toggle(key) { if(!plano)return; progressoModule.toggle(user.id,plano.id,key); setTick(t=>t+1); }
  function getWeekDays(offset) {
    const mon=new Date(today); mon.setDate(today.getDate()-today.getDay()+1+offset*7);
    return Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return localDateKey(d);});
  }
  function getTopicMaterial(topicId) {
    const materiais = storage.get().materiais || [];
    return materiais.find(m => m.topicId === topicId && m.editalId === plano?.editalId);
  }
  const weekDays=getWeekDays(weekOffset);
  const wLabel=`${new Date(weekDays[0]+"T00:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})} – ${new Date(weekDays[6]+"T00:00:00").toLocaleDateString("pt-BR",{day:"2-digit",month:"short"})}`;

  // Mapa topicId → info (para reconstruir histórico de dias não presentes no plano)
  const _editalForHistory = plano ? editaisModule.getById(plano.editalId) : null;
  const _topicMapHistory  = buildTopicMap(_editalForHistory);
  const _todayKey = localDateKey(today);
  function getDayData(dk) {
    if (plano?.plan?.[dk]) return plano.plan[dk];
    // Reconstrói dia histórico a partir do progresso (só datas passadas)
    if (!plano || dk >= _todayKey) return { topicos: [], reviews: [] };
    const doneProg = storage.get().progresso.filter(
      p => p.alunoId === user.id && p.planoId === plano.id && p.done && p.key.startsWith(dk + "-") && !p.key.endsWith("-rev")
    );
    if (doneProg.length === 0) return { topicos: [], reviews: [] };
    const topicos = doneProg.map(p => {
      const tid = p.key.substring(11);
      const info = _topicMapHistory[tid] || { name: tid, materiaName: "", materiaColor: "#6b7280" };
      return { id: tid, ...info };
    });
    return { topicos, reviews: [], _history: true };
  }

  if (!plano) return (
    <div>
      <div className="ph"><div><h1>Meu Plano</h1><p>Gere seu plano personalizado</p></div></div>
      {editais.length===0
        ? <div className="card"><div className="empty"><h3>Nenhum edital associado</h3><p>Peça ao seu coach para associar um edital.</p></div></div>
        : <AlunoOnboarding user={user} editais={editais} onGenerate={refresh}/>
      }
    </div>
  );

  const edital=editaisModule.getById(plano.editalId);
  const todayKeyP = localDateKey(today);
  const todayDataP = plano.plan[todayKeyP]||{topicos:[],reviews:[]};
  const todayDoneP = todayDataP.topicos.filter(t=>progressoModule.isDone(user.id,plano.id,`${todayKeyP}-${t.id}`)).length;
  const allTodayDone = todayDataP.topicos.length > 0 && todayDoneP === todayDataP.topicos.length;
  // Há tópicos pendentes em dias futuros que poderiam ser adiantados?
  const hasFutureTopicsP = Object.keys(plano.plan).some(dk => dk > todayKeyP && (plano.plan[dk].topicos?.length || 0) > 0);
  // Quantos tópicos futuros existem no total (limite superior do "adiantar")
  const futureTopicsCountP = Object.keys(plano.plan).reduce((acc, dk) => acc + (dk > todayKeyP ? (plano.plan[dk].topicos?.length || 0) : 0), 0);
  function handleAdiantar() {
    const moved = planosModule.adiantarAulas(plano.id, adiantarQtd);
    setShowAdiantar(false); setTick(t=>t+1); refresh();
    if (moved === 0) alert("Não há aulas futuras para adiantar.");
  }
  const getMaterialFiles = (topicId) => {
    const materiais = storage.get().materiais || [];
    const topic = materiais.find(m => m.topicId === topicId && m.editalId === plano?.editalId);

    // Suportar ambas as estruturas: nova (com files array) e antiga (com url direto)
    if (topic?.files && Array.isArray(topic.files)) {
      return topic.files;
    } else if (topic?.url) {
      // Converter estrutura antiga para nova
      return [{
        url: topic.url,
        filename: topic.filename,
        type: "Material",
        addedAt: topic.savedAt || new Date().toISOString()
      }];
    }
    return [];
  };

  const topicMaterials = showPdfModal ? getMaterialFiles(showPdfModal) : [];
  const topicName = plano?.plan ? Object.values(plano.plan).flatMap(d => d.topicos).find(t => t.id === showPdfModal)?.name : null;

  return (
    <div>
      {showPdfModal && (
        <div className="overlay" onClick={()=>setShowPdfModal(null)}>
          <div className="modal fi" style={{maxWidth:500,padding:"40px 30px"}} onClick={e=>e.stopPropagation()}>
            <div className="modal-hd" style={{marginBottom:"30px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <h2 style={{margin:0,fontSize:18,fontWeight:700}}>{topicName || "Materiais"}</h2>
              <button className="modal-x" onClick={()=>setShowPdfModal(null)}>✕</button>
            </div>
            {topicMaterials.length > 0 ? (
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {topicMaterials.map((file, idx) => (
                  <a
                    key={idx}
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding:"16px",
                      borderRadius:8,
                      background:"var(--blue-d)",
                      border:"1px solid var(--blue)",
                      textDecoration:"none",
                      display:"flex",
                      flexDirection:"column",
                      gap:4,
                      cursor:"pointer",
                      transition:"all 0.15s"
                    }}
                    onMouseEnter={(e) => e.target.style.background = "var(--blue)"}
                    onMouseLeave={(e) => e.target.style.background = "var(--blue-d)"}
                  >
                    <div style={{fontSize:13,fontWeight:600,color:"var(--blue)"}}>
                      📄 {file.type}
                    </div>
                    <div style={{fontSize:11,color:"var(--t3)",wordBreak:"break-word"}}>
                      {file.filename}
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,color:"var(--t3)"}}>
                <div style={{fontSize:40}}>⚠️</div>
                <p style={{margin:0,textAlign:"center"}}>Nenhum material disponível para este tópico.</p>
              </div>
            )}
          </div>
        </div>
      )}
      {showEstudar2&&<EstudarAgoraModal user={user} plano={plano} onClose={()=>{setShowEstudar2(false);setTick(t=>t+1);refresh();}}/>}
      {showAdiantar&&(
        <div className="overlay" onClick={()=>setShowAdiantar(false)}>
          <div className="modal fi" style={{maxWidth:380}} onClick={e=>e.stopPropagation()}>
            <div className="modal-hd"><h2>⚡ Adiantar Aulas</h2><button className="modal-x" onClick={()=>setShowAdiantar(false)}>✕</button></div>
            <p style={{color:"var(--t2)",fontSize:13,marginBottom:20}}>Você completou todas as aulas de hoje! Quantas aulas dos próximos dias quer adiantar? <span style={{color:"var(--t3)"}}>({futureTopicsCountP} disponíve{futureTopicsCountP!==1?"is":"l"})</span></p>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:16,marginBottom:24}}>
              <button onClick={()=>setAdiantarQtd(q=>Math.max(1,q-1))} style={{width:36,height:36,borderRadius:9,border:"1.5px solid var(--b2)",background:"var(--s3)",cursor:"pointer",fontSize:20,fontWeight:700,color:"var(--t2)",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
              <span style={{fontFamily:"Cabinet Grotesk",fontWeight:900,fontSize:32,color:"var(--amber)",minWidth:48,textAlign:"center"}}>{Math.min(adiantarQtd, Math.max(1, futureTopicsCountP))}</span>
              <button onClick={()=>setAdiantarQtd(q=>Math.min(Math.max(1, futureTopicsCountP) , Math.min(10,q+1)))} style={{width:36,height:36,borderRadius:9,border:"1.5px solid var(--b2)",background:"var(--s3)",cursor:"pointer",fontSize:20,fontWeight:700,color:"var(--t2)",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
            </div>
            <button className="btn btn-green" style={{width:"100%"}} onClick={handleAdiantar}>⚡ Adiantar {Math.min(adiantarQtd, Math.max(1, futureTopicsCountP))} aula{Math.min(adiantarQtd, Math.max(1, futureTopicsCountP))!==1?"s":""}</button>
          </div>
        </div>
      )}
      {showRegerar&&(
        <div className="overlay" onClick={()=>setShowRegerar(false)}>
          <div className="modal fi" style={{maxWidth:420}} onClick={e=>e.stopPropagation()}>
            <div className="modal-hd"><h2>🔄 Regerar Plano</h2><button className="modal-x" onClick={()=>setShowRegerar(false)}>✕</button></div>
            <p style={{color:"var(--t2)",fontSize:13,marginBottom:20}}>Escolha como deseja regenerar seu plano de estudos:</p>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <button className="btn btn-green" style={{textAlign:"left",padding:"16px 18px",borderRadius:12,height:"auto",flexDirection:"column",alignItems:"flex-start",gap:4}} onClick={()=>{planosModule.regenerarFuturo(plano.id,user.id,plano.rotina);setShowRegerar(false);refresh();}}>
                <span style={{fontWeight:900,fontSize:14}}>📅 Continuar de onde parei</span>
                <span style={{fontSize:11,opacity:.8,fontWeight:400}}>Reagenda apenas as aulas não feitas a partir de hoje. Mantém todo o progresso e notas.</span>
              </button>
              <button className="btn" style={{background:"var(--s3)",border:"1.5px solid var(--b2)",color:"var(--t1)",textAlign:"left",padding:"16px 18px",borderRadius:12,height:"auto",flexDirection:"column",alignItems:"flex-start",gap:4}} onClick={async ()=>{
                // BUG-3: Verificar aulas concluídas na semana corrente que serão afetadas
                const todayKey = localDateKey(today);
                const mon = new Date(today); mon.setDate(today.getDate() - today.getDay() + 1);
                let aulasAfetadas = 0;
                for (let i = 0; i < 7; i++) {
                  const d = new Date(mon); d.setDate(mon.getDate() + i);
                  const dk = localDateKey(d);
                  if (dk < todayKey) continue; // só conta de hoje em diante
                  const dd = plano.plan?.[dk] || { topicos:[], reviews:[] };
                  dd.topicos.forEach(t => { if (progressoModule.isDone(user.id, plano.id, `${dk}-${t.id}`)) aulasAfetadas++; });
                }
                const avisoExtra = aulasAfetadas > 0
                  ? `\n\n⚠️ Atenção: ${aulasAfetadas} aula(s) concluída(s) nesta semana serão desmarcadas. O histórico de semanas anteriores será preservado.`
                  : "";
                const ok = await confirmar({ titulo: "Regenerar plano do zero?", mensagem: `O plano será recriado completamente. O progresso de semanas anteriores é mantido no histórico.${avisoExtra}`, tipo: "destrutivo", confirmLabel: "Regenerar" });
                if (!ok) return;
                planosModule.regenerarDoZero(plano.id,user.id,plano.rotina);setShowRegerar(false);refresh();
              }}>
                <span style={{fontWeight:900,fontSize:14}}>🔁 Regenerar do zero</span>
                <span style={{fontSize:11,opacity:.7,fontWeight:400}}>Recria o plano completo. O progresso já registrado é mantido no histórico.</span>
              </button>
              <button className="btn btn-ghost" onClick={()=>setShowRegerar(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
      <div className="ph"><div><h1>Meu Plano</h1><p>{edital?.name}</p></div><div className="row" style={{gap:8}}><button className="btn btn-green btn-sm" style={{fontSize:13}} onClick={()=>setShowEstudar2(true)}>▶ Estudar Agora</button><button className="btn btn-ghost btn-sm" onClick={()=>setShowRegerar(true)}>🔄 Regerar</button><button className="btn btn-red btn-sm" onClick={async ()=>{if(await confirmar({ titulo:"Excluir plano de estudos?", mensagem:"Você perderá todo o cronograma atual. O histórico de aulas já concluídas será mantido no seu progresso.", tipo:"destrutivo", confirmLabel:"Excluir" })){ planosModule.delete(plano.id);refresh();}}}>🗑 Excluir</button></div></div>
      <div className="row mb4">
        <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setWeekOffset(w=>w-1)}>◀</button>
        <span style={{fontFamily:"Cabinet Grotesk",fontWeight:700,minWidth:200,textAlign:"center"}}>{wLabel}</span>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setWeekOffset(w=>w+1)}>▶</button>
        {weekOffset!==0&&<button className="btn btn-ghost btn-sm" onClick={()=>setWeekOffset(0)}>Hoje</button>}
      </div>
      {weekDays.map(dk=>{
        const d=getDayData(dk);
        const isHistory=d._history===true;
        const date=new Date(dk+"T00:00:00");
        const isToday=dk===localDateKey(today);
        return (
          <div key={dk} className={`day-card ${isToday?"today":""}`}>
            <div className="row-b mb3">
              <div><div style={{fontFamily:"Cabinet Grotesk",fontWeight:700,fontSize:14}}>{DAYS_FULL[date.getDay()]}</div><div className="text-xs text-dim">{date.toLocaleDateString("pt-BR")}</div></div>
              {isToday&&<span className="badge bg">Hoje</span>}
            </div>
            {isHistory&&<div style={{fontSize:10,color:"var(--green)",fontWeight:700,marginBottom:8,letterSpacing:.5}}>✅ CONCLUÍDO</div>}
            {d.topicos.length===0&&d.reviews.length===0&&<p className="text-sm text-muted">Nenhum conteúdo</p>}
            {d.topicos.length>0&&<div className="mb3">{d.topicos.map((t,i)=>{const key=`${dk}-${t.id}`;const done=progressoModule.isDone(user.id,plano.id,key)||isHistory;const material=getTopicMaterial(t.id);return(<div key={i} className={`topic-row ${done?"done":""}`}><div className="dot-c" style={{background:t.materiaColor}}/><span className="tr-name">{t.name}</span>{(t.materialUrl||material)&&<button onClick={()=>setShowPdfModal(t.id)} className="mat-link" style={{background:"none",border:"none",cursor:"pointer",padding:"0 4px",fontSize:11,color:"var(--blue)"}}>📎</button>}<span className="tr-tag">{t.materiaName}</span>{!isHistory&&<button className={`ck-btn ${done?"ck":""}`} onClick={()=>toggle(key)}>{done&&<CheckIcon/>}</button>}{isHistory&&<CheckIcon/>}</div>);})}</div>}
            {isToday&&allTodayDone&&hasFutureTopicsP&&<button className="adiantar-btn" onClick={()=>setShowAdiantar(true)}>⚡ Adiantar aulas de amanhã</button>}
            {isToday&&allTodayDone&&!hasFutureTopicsP&&(
              <div style={{marginTop:10,padding:"12px 14px",borderRadius:10,background:"var(--s2)",border:"1.5px dashed var(--green)",display:"flex",flexDirection:"column",gap:8}}>
                <div style={{fontSize:13,fontWeight:700,color:"var(--green)"}}>🎉 Você concluiu todas as aulas planejadas!</div>
                <div style={{fontSize:12,color:"var(--t2)"}}>Não há mais aulas futuras no plano. Quer regerar para continuar avançando?</div>
                <button className="btn btn-green btn-sm" style={{alignSelf:"flex-start"}} onClick={()=>setShowRegerar(true)}>🔄 Regerar plano</button>
              </div>
            )}
            {d.reviews.length>0&&<div className="rev-sec"><div className="rev-lbl">Revisões</div>{d.reviews.map((r,i)=>{const key=`${dk}-${r.id}-rev`;const done=progressoModule.isDone(user.id,plano.id,key);const nota=progressoModule.getNote(user.id,plano.id,r.id);const isOpen=expandedNote===`${dk}-${r.id}`;return(<div key={i}><div className={`topic-row ${done?"done":""}`}><div className="dot-c" style={{background:r.materiaColor}}/><span className="tr-name">{r.name}</span><span className="tr-tag">🕐 {r.reviewInterval}d</span>{nota&&<button onClick={()=>setExpandedNote(isOpen?null:`${dk}-${r.id}`)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,color:isOpen?"var(--amber)":"var(--t3)",padding:"0 4px",flexShrink:0}} title="Ver anotações">📝</button>}<button className={`ck-btn ${done?"ck":""}`} onClick={()=>toggle(key)}>{done&&<CheckIcon/>}</button></div>{isOpen&&nota&&<div style={{margin:"6px 0 8px 24px",padding:"10px 13px",background:"var(--s2)",borderRadius:9,borderLeft:"3px solid var(--amber)",fontSize:12,color:"var(--t2)",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{nota}</div>}</div>);})}</div>}
          </div>
        );
      })}
    </div>
  );
}

function AlunoRotina({ user, refresh }) {
  const plano = planosModule.getByAluno(user.id)[0]||null;
  // Initialize diasConfig from saved rotina (support both old and new format)
  function initDiasConfig() {
    if (plano?.rotina?.diasConfig) return plano.rotina.diasConfig;
    if (plano?.rotina?.dias) {
      const cfg = {0:0,1:0,2:0,3:0,4:0,5:0,6:0};
      plano.rotina.dias.forEach(d => { cfg[d] = plano.rotina.aulasPorDia || 1; });
      return cfg;
    }
    return {0:0,1:2,2:2,3:2,4:2,5:2,6:0};
  }
  const [diasConfig, setDiasConfig] = useState(initDiasConfig);
  const [maxRevisoes, setMaxRevisoes] = useState(plano?.rotina?.maxRevisoesPorDia || 5);
  const [minRevisoes, setMinRevisoes] = useState(plano?.rotina?.minRevisoesPorDia || 0);
  const [modoOrganizacao, setModoOrganizacao] = useState(plano?.rotina?.modoOrganizacao || "alternado");
  const [saved, setSaved] = useState(false);
  const [ltick, setLtick] = useState(0);
  const logs = logModule.getByUser(user.id);

  function setDayAulas(dow, val) {
    setDiasConfig(prev => ({ ...prev, [dow]: Math.max(0, Math.min(5, val)) }));
    setSaved(false);
  }
  const aulasSem = Object.values(diasConfig).reduce((a,n) => a+n, 0);
  function handleSave() {
    if (!plano || aulasSem===0) return;
    planosModule.updateRotina(plano.id, user.id, { diasConfig, maxRevisoesPorDia: maxRevisoes, minRevisoesPorDia: minRevisoes, modoOrganizacao });
    refresh(); setLtick(t=>t+1); setSaved(true);
    setTimeout(()=>setSaved(false), 2500);
  }

  if (!plano) return (
    <div><div className="ph"><div><h1>Rotina</h1></div></div><div className="card"><div className="empty"><h3>Nenhum plano ativo</h3><p>Gere um plano primeiro.</p></div></div></div>
  );

  return (
    <div>
      <div className="ph"><div><h1>Rotina de Estudos</h1><p>Configure sua agenda semanal</p></div></div>
      <div className="g2">
        <div className="card">
          <div className="card-title">Aulas por dia</div>
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:16}}>
            {DAYS_FULL.map((name, dow) => {
              const val = diasConfig[dow] || 0;
              const ativo = val > 0;
              return (
                <div key={dow} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",borderRadius:10,border:`1.5px solid ${ativo?"var(--green)":"var(--b2)"}`,background:ativo?"var(--s2)":"var(--s1)",transition:"all .15s"}}>
                  <span style={{fontFamily:"Cabinet Grotesk",fontWeight:700,fontSize:13,width:60,color:ativo?"var(--t1)":"var(--t3)"}}>{name}</span>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:"auto"}}>
                    <button onClick={()=>setDayAulas(dow,val-1)} style={{width:30,height:30,borderRadius:7,border:"1.5px solid var(--b2)",background:"var(--s3)",cursor:"pointer",fontSize:16,fontWeight:700,color:"var(--t2)",display:"flex",alignItems:"center",justifyContent:"center"}} disabled={val===0}>−</button>
                    <span style={{width:28,textAlign:"center",fontFamily:"Cabinet Grotesk",fontWeight:900,fontSize:15,color:ativo?"var(--green)":"var(--t3)"}}>{val===0?"—":val}</span>
                    <button onClick={()=>setDayAulas(dow,val+1)} style={{width:30,height:30,borderRadius:7,border:"1.5px solid var(--b2)",background:"var(--s3)",cursor:"pointer",fontSize:16,fontWeight:700,color:"var(--t2)",display:"flex",alignItems:"center",justifyContent:"center"}} disabled={val===5}>+</button>
                  </div>
                  <span style={{width:70,fontSize:11,color:ativo?"var(--t2)":"var(--t3)",textAlign:"right"}}>{ativo?`${val} aula${val>1?"s":""}` : "folga"}</span>
                </div>
              );
            })}
          </div>
          <div style={{fontSize:12,color:"var(--t3)",marginBottom:12}}>{aulasSem} aula{aulasSem!==1?"s":""}/semana</div>
          <div style={{padding:"14px 16px",borderRadius:10,background:"var(--s2)",border:"1px solid var(--b1)",marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--t2)",marginBottom:12}}>📚 Organização das matérias</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <label style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",borderRadius:8,border:`1.5px solid ${modoOrganizacao==="alternado"?"var(--green)":"var(--b2)"}`,background:modoOrganizacao==="alternado"?"rgba(34,211,165,0.07)":"transparent",cursor:"pointer"}} onClick={()=>{setModoOrganizacao("alternado");setSaved(false);}}>
                <input type="radio" checked={modoOrganizacao==="alternado"} onChange={()=>{setModoOrganizacao("alternado");setSaved(false);}} style={{marginTop:2,accentColor:"var(--green)"}}/>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--t1)"}}>🔀 Matérias alternadas</div>
                  <div style={{fontSize:11,color:"var(--t3)",marginTop:2}}>Disciplinas intercaladas — mais variedade e retenção</div>
                </div>
              </label>
              <label style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",borderRadius:8,border:`1.5px solid ${modoOrganizacao==="sequencial"?"var(--blue)":"var(--b2)"}`,background:modoOrganizacao==="sequencial"?"rgba(96,165,250,0.07)":"transparent",cursor:"pointer"}} onClick={()=>{setModoOrganizacao("sequencial");setSaved(false);}}>
                <input type="radio" checked={modoOrganizacao==="sequencial"} onChange={()=>{setModoOrganizacao("sequencial");setSaved(false);}} style={{marginTop:2,accentColor:"var(--blue)"}}/>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"var(--t1)"}}>📖 Matérias sequenciais</div>
                  <div style={{fontSize:11,color:"var(--t3)",marginTop:2}}>Cada disciplina em bloco antes de ir para a próxima</div>
                </div>
              </label>
            </div>
          </div>
                    <div style={{padding:"14px 16px",borderRadius:10,background:"var(--s2)",border:"1px solid var(--b1)",marginBottom:14}}>
            <div style={{fontSize:12,fontWeight:700,color:"var(--t2)",marginBottom:12}}>🔁 Revisões por dia</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:11,color:"var(--t3)",width:50}}>Mínimo</span>
                <button onClick={()=>{setMinRevisoes(r=>Math.max(0,r-1));setSaved(false);}} style={{width:28,height:28,borderRadius:7,border:"1.5px solid var(--b2)",background:"var(--s3)",cursor:"pointer",fontSize:15,fontWeight:700,color:"var(--t2)",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                <span style={{fontFamily:"Cabinet Grotesk",fontWeight:900,fontSize:18,color:"var(--blue)",minWidth:28,textAlign:"center"}}>{minRevisoes === 0 ? "—" : minRevisoes}</span>
                <button onClick={()=>{setMinRevisoes(r=>Math.min(maxRevisoes,r+1));setSaved(false);}} style={{width:28,height:28,borderRadius:7,border:"1.5px solid var(--b2)",background:"var(--s3)",cursor:"pointer",fontSize:15,fontWeight:700,color:"var(--t2)",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                <span style={{fontSize:11,color:"var(--t3)"}}>puxar adiantadas p/ completar</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:11,color:"var(--t3)",width:50}}>Máximo</span>
                <button onClick={()=>{setMaxRevisoes(r=>{const v=Math.max(1,r-1);if(minRevisoes>v)setMinRevisoes(v);return v;});setSaved(false);}} style={{width:28,height:28,borderRadius:7,border:"1.5px solid var(--b2)",background:"var(--s3)",cursor:"pointer",fontSize:15,fontWeight:700,color:"var(--t2)",display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
                <span style={{fontFamily:"Cabinet Grotesk",fontWeight:900,fontSize:18,color:"var(--amber)",minWidth:28,textAlign:"center"}}>{maxRevisoes}</span>
                <button onClick={()=>{setMaxRevisoes(r=>Math.min(20,r+1));setSaved(false);}} style={{width:28,height:28,borderRadius:7,border:"1.5px solid var(--b2)",background:"var(--s3)",cursor:"pointer",fontSize:15,fontWeight:700,color:"var(--t2)",display:"flex",alignItems:"center",justifyContent:"center"}}>+</button>
                <span style={{fontSize:11,color:"var(--t3)"}}>excedente vai pro próximo dia</span>
              </div>
            </div>
          </div>
          {saved&&<div className="alert alert-green mb3">✓ Rotina atualizada! Plano regenerado.</div>}
          <button className="btn btn-green" disabled={aulasSem===0} onClick={handleSave}>Salvar Rotina</button>
        </div>
        <div className="card">
          <div className="card-title">Histórico de Alterações</div>
          {logs.length===0?<p className="text-muted text-sm">Nenhuma alteração registrada.</p>:[...logs].reverse().slice(0,10).map(l=>(
            <div key={l.id} style={{padding:"8px 0",borderBottom:"1px solid var(--b1)"}}>
              <div className="text-sm fw6">{l.message}</div>
              <div className="text-xs text-dim">{new Date(l.createdAt).toLocaleString("pt-BR")}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AlunoProgresso({ user }) {
  const plano  = planosModule.getByAluno(user.id)[0]||null;
  const stats  = plano?progressoModule.getStats(user.id,plano.id):null;
  const edital = plano?editaisModule.getById(plano.editalId):null;
  if (!plano||!stats) return (
    <div><div className="ph"><div><h1>Meu Progresso</h1></div></div><div className="card"><div className="empty"><h3>Nenhum plano ativo</h3></div></div></div>
  );
  return (
    <div>
      <div className="ph"><div><h1>Meu Progresso</h1><p>{edital?.name}</p></div></div>
      <div className="g4 mb4">
        <div className="stat"><div className="stat-l">Aulas feitas</div><div className="stat-v" style={{color:"var(--green)"}}>{stats.aulasFeitas}</div><div className="stat-s">de {stats.totalAulas}</div></div>
        <div className="stat"><div className="stat-l">Revisões</div><div className="stat-v" style={{color:"var(--amber)"}}>{stats.reviewsFeitas}</div><div className="stat-s">de {stats.totalReviews}</div></div>
        <div className="stat"><div className="stat-l">Conclusão</div><div className="stat-v">{stats.pct}%</div></div>
        <div className="stat"><div className="stat-l">Previsão</div><div className="stat-v" style={{fontSize:14,marginTop:6,color:"var(--amber)"}}>{stats.previsao}</div></div>
      </div>
      <div className="card mb4"><div className="card-title">Geral</div><div className="row-b mb2 text-sm"><span className="fw6">{edital?.name}</span><span className="text-muted">{stats.pct}%</span></div><PBar pct={stats.pct}/></div>
      <div className="card">
        <div className="card-title">Por Matéria</div>
        {(() => {
          // Conjunto de topicIds concluídos no progresso (não conta revisões)
          const doneTopicIds = new Set(
            (storage.get().progresso || [])
              .filter(p => p.alunoId === user.id && p.planoId === plano.id && p.done && !p.key.endsWith('-rev'))
              .map(p => p.key.substring(11))
          );
          return (edital?.materias || []).map(m => {
            // Topics da matéria atualmente no plano (não concluídos)
            const inPlanIds = new Set(
              Object.values(plano.plan).flatMap(d => (d.topicos || [])
                .filter(t => t.materiaId === m.id)
                .map(t => t.id))
            );
            // Topics da matéria já concluídos (podem ter sido removidos do plano)
            const feitosDaMateria = (m.topicos || []).filter(t => doneTopicIds.has(t.id));
            // Total = união de "ainda no plano" + "já feitos"
            const allIds = new Set([...inPlanIds, ...feitosDaMateria.map(t => t.id)]);
            const total = allIds.size;
            const mFei = feitosDaMateria.length;
            const pct = total ? Math.round((mFei / total) * 100) : 0;
            return (
              <div key={m.id} style={{ marginBottom: 16 }}>
                <div className="row-b mb2">
                  <div className="row">
                    <div className="dot-c" style={{ background: m.color }} />
                    <span className="fw6">{m.name}</span>
                  </div>
                  <span className="text-sm text-muted">{mFei}/{total} — {pct}%</span>
                </div>
                <PBar pct={pct} color={m.color} />
              </div>
            );
          });
        })()}
      </div>
    </div>
  );
}

// ============================================================
// ALUNO: Resumos — Lista, edita, exclui e exporta (PDF/DOCX)
// ============================================================
function AlunoResumos({ user, refresh }) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // { topicId, planoId, text }
  const [confirmDelete, setConfirmDelete] = useState(null); // { topicId, planoId, name }
  const [expanded, setExpanded] = useState({}); // map topicId → bool
  const [feedback, setFeedback] = useState("");
  const [associando, setAssociando] = useState(null); // { topicId, planoId, note } — resumo órfão sendo associado
  const [novoResumo, setNovoResumo] = useState(false); // modal de criar resumo
  const [novoText, setNovoText] = useState("");
  const [novoTopicId, setNovoTopicId] = useState(""); // associação opcional

  const resumos = progressoModule.listResumos(user.id);
  const filtered = resumos.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (r.topic.name || "").toLowerCase().includes(q)
        || (r.materia.name || "").toLowerCase().includes(q)
        || (r.note || "").toLowerCase().includes(q);
  });

  // Agrupa por matéria
  const grupos = {};
  filtered.forEach(r => {
    const k = r.materia.id;
    if (!grupos[k]) grupos[k] = { materia: r.materia, items: [] };
    grupos[k].items.push(r);
  });
  const gruposOrdenados = Object.values(grupos).sort((a,b) => a.materia.name.localeCompare(b.materia.name));
  gruposOrdenados.forEach(g => g.items.sort((a,b) => (a.updatedAt||"").localeCompare(b.updatedAt||"")));

  // Lista de tópicos disponíveis para associação
  const getTopicosDisponiveis = () => {
    const db = storage.get();
    const planos = (db.planos || []).filter(p => p.alunoId === user.id);
    const topicos = [];
    planos.forEach(plano => {
      const edital = (db.editais || []).find(e => e.id === plano.editalId);
      if (edital) {
        (edital.materias || []).forEach(m => {
          (m.topicos || []).forEach(t => {
            topicos.push({ id: t.id, name: t.name, materiaName: m.name, planoId: plano.id, editalName: edital.name });
          });
        });
      }
    });
    return topicos;
  };

  const showFeedback = (msg) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(""), 2500);
  };

  const handleSalvarEdicao = () => {
    if (!editing) return;
    const text = (editing.text || "").trim();
    if (!text) {
      progressoModule.deleteNote(user.id, editing.planoId, editing.topicId);
    } else {
      progressoModule.saveNote(user.id, editing.planoId, editing.topicId, text);
    }
    setEditing(null);
    showFeedback("✓ Resumo salvo");
    refresh && refresh();
  };

  const handleExcluir = () => {
    if (!confirmDelete) return;
    progressoModule.deleteNote(user.id, confirmDelete.planoId, confirmDelete.topicId);
    setConfirmDelete(null);
    showFeedback("✓ Resumo excluído");
    refresh && refresh();
  };

  // Associar resumo órfão a um tópico
  const handleAssociar = (targetTopicId) => {
    if (!associando || !targetTopicId) return;
    const topicos = getTopicosDisponiveis();
    const target = topicos.find(t => t.id === targetTopicId);
    if (!target) { showFeedback("Tópico não encontrado"); return; }
    // Deleta o resumo antigo (órfão)
    progressoModule.deleteNote(user.id, associando.planoId, associando.topicId);
    // Salva no novo tópico
    progressoModule.saveNote(user.id, target.planoId, target.id, associando.note);
    setAssociando(null);
    showFeedback("✓ Resumo associado ao tópico");
    refresh && refresh();
  };

  // Criar novo resumo
  const handleCriarResumo = () => {
    const text = novoText.trim();
    if (!text) { showFeedback("Digite o conteúdo do resumo"); return; }
    const db = storage.get();
    const planos = (db.planos || []).filter(p => p.alunoId === user.id);
    const plano = planos[0]; // usa o primeiro plano disponível
    if (!plano) { showFeedback("Nenhum plano ativo. Gere um plano primeiro."); return; }
    const topicId = novoTopicId || ("avulso_" + Date.now());
    progressoModule.saveNote(user.id, plano.id, topicId, text);
    setNovoResumo(false);
    setNovoText("");
    setNovoTopicId("");
    showFeedback("✓ Resumo criado");
    refresh && refresh();
  };

  // ===== Exportação =====
  const escapeHtml = (s) => String(s||"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");

  const buildHtml = (alvo) => {
    // alvo = lista de resumos (1 ou todos). Retorna HTML completo.
    const hoje = new Date().toLocaleDateString("pt-BR");
    const itens = alvo.map(r => {
      const data = r.updatedAt ? new Date(r.updatedAt).toLocaleDateString("pt-BR") : "—";
      const noteHtml = escapeHtml(r.note).replace(/\n/g, "<br>");
      return `
        <div class="resumo-item">
          <div class="resumo-meta">
            <span class="materia" style="background:${r.materia.color || '#6b7280'}">${escapeHtml(r.materia.name)}</span>
            <span class="data">Atualizado: ${data}</span>
          </div>
          <h2>${escapeHtml(r.topic.name)}</h2>
          <div class="resumo-texto">${noteHtml}</div>
        </div>`;
    }).join("\n");

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Resumos — ${escapeHtml(user.name)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color:#1f2937; line-height:1.55; max-width: 760px; margin: 0 auto; padding: 16px; }
  h1 { font-size: 22px; margin: 0 0 4px; color:#0f172a; }
  .header { border-bottom: 2px solid #0ea5e9; padding-bottom: 8px; margin-bottom: 18px; }
  .header .sub { color:#64748b; font-size: 12px; }
  .resumo-item { page-break-inside: avoid; margin: 0 0 22px; padding: 14px 16px; border:1px solid #e5e7eb; border-radius: 8px; background:#fafafa; }
  .resumo-item h2 { font-size: 16px; margin: 6px 0 10px; color:#0f172a; }
  .resumo-meta { display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:11px; }
  .resumo-meta .materia { color:#fff; padding: 3px 9px; border-radius: 999px; font-weight:700; text-transform:uppercase; letter-spacing:.4px; font-size:10px; }
  .resumo-meta .data { color:#64748b; }
  .resumo-texto { font-size: 13px; white-space: pre-wrap; color:#1f2937; }
  .footer { margin-top: 30px; font-size: 10px; color:#94a3b8; text-align:center; }
</style>
</head>
<body>
  <div class="header">
    <h1>Resumos de Estudo</h1>
    <div class="sub">${escapeHtml(user.name)} · Gerado em ${hoje} · ${alvo.length} resumo(s)</div>
  </div>
  ${itens}
  <div class="footer">EstudaAI — Sistema de Gestão de Estudos</div>
</body>
</html>`;
  };

  const exportarPDF = (alvo) => {
    const html = buildHtml(alvo);
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) { alert("Permita pop-ups para gerar o PDF."); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch(e){} }, 350);
  };

  const exportarDOCX = (alvo, fileBase) => {
    // Word lê HTML nativamente. Salvamos como .doc para evitar
    // a etapa de "abrir em modo de leitura" que .docx exige.
    const html = buildHtml(alvo);
    // Wrapper Word HTML (melhora compatibilidade com Word/Google Docs)
    const wordHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">${html.replace(/<!DOCTYPE.*?>/i, "").replace(/<\/?html[^>]*>/gi, "")}</html>`;
    const blob = new Blob([wordHtml], { type: "application/msword;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileBase}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div>
      <div className="ph">
        <div>
          <h1>✍️ Meus Resumos</h1>
          <p>{resumos.length} resumo(s) criado(s) · agrupados por matéria</p>
        </div>
      </div>

      {feedback && (
        <div style={{position:"fixed",top:20,right:20,padding:"10px 16px",background:"var(--green)",color:"#fff",borderRadius:8,fontSize:13,fontWeight:600,zIndex:1100,boxShadow:"0 4px 16px rgba(0,0,0,0.2)"}}>
          {feedback}
        </div>
      )}

      <div className="card" style={{marginBottom:16,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
        <input
          className="inp"
          placeholder="🔎 Buscar por matéria, tópico ou conteúdo..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{flex:"1 1 240px",minWidth:240}}
        />
        <button className="btn btn-green" onClick={() => { setNovoResumo(true); setNovoText(""); setNovoTopicId(""); }}>
          + Novo Resumo
        </button>
        {resumos.length > 0 && (
          <>
            <button className="btn btn-ghost" onClick={() => exportarPDF(filtered)} title="Imprimir/PDF de todos">
              🖨️ PDF (todos {filtered.length})
            </button>
            <button className="btn btn-ghost" onClick={() => exportarDOCX(filtered, `resumos-${user.name.replace(/\s+/g,"-")}-completo`)} title="Baixar Word de todos">
              📄 Word (todos)
            </button>
          </>
        )}
      </div>

      {resumos.length === 0 ? (
        <div className="card" style={{textAlign:"center",padding:"40px 20px"}}>
          <div style={{fontSize:42,marginBottom:8}}>📝</div>
          <h3 style={{margin:"0 0 4px"}}>Você ainda não criou nenhum resumo</h3>
          <p className="text-muted text-sm">Quando você estuda uma aula e escreve no campo "Resumo / Anotações", ele aparece aqui.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{textAlign:"center",padding:"30px 20px"}}>
          <p className="text-muted">Nenhum resumo combina com sua busca.</p>
        </div>
      ) : (
        gruposOrdenados.map(g => (
          <div key={g.materia.id} className="card" style={{marginBottom:14}}>
            <div className="row-b" style={{marginBottom:10,paddingBottom:8,borderBottom:"1px solid var(--b1)"}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:14,height:14,borderRadius:4,background:g.materia.color}}/>
                <h3 style={{margin:0,fontSize:15}}>{g.materia.name}</h3>
                <span className="badge bn">{g.items.length}</span>
              </div>
            </div>
            {g.items.map(r => {
              const isOpen = !!expanded[r.topicId+"::"+r.planoId];
              const data = r.updatedAt ? new Date(r.updatedAt).toLocaleDateString("pt-BR") : "—";
              const preview = (r.note || "").slice(0, 180);
              return (
                <div key={r.topicId+"::"+r.planoId} style={{padding:"10px 0",borderBottom:"1px solid var(--b1)"}}>
                  <div className="row-b" style={{alignItems:"flex-start",gap:8}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:13,color:"var(--t1)",marginBottom:3}}>{r.topic.name}{r.topicRemovido && <span style={{fontSize:10,color:"var(--amber)",marginLeft:6,fontWeight:400}}>📌 Fora do edital atual</span>}</div>
                      <div style={{fontSize:11,color:"var(--t3)",marginBottom:6}}>Atualizado em {data}</div>
                      {!isOpen ? (
                        <div style={{fontSize:12,color:"var(--t2)",lineHeight:1.55,whiteSpace:"pre-wrap"}}>
                          {preview}{(r.note||"").length>180?"…":""}
                        </div>
                      ) : (
                        <div style={{fontSize:13,color:"var(--t1)",lineHeight:1.7,whiteSpace:"pre-wrap",padding:"10px 12px",background:"var(--s2)",borderRadius:8,borderLeft:"3px solid "+r.materia.color}}>
                          {r.note}
                        </div>
                      )}
                    </div>
                    <div style={{display:"flex",gap:6,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
                      <button className="btn btn-ghost btn-xs" onClick={() => setExpanded(prev => ({...prev, [r.topicId+"::"+r.planoId]: !prev[r.topicId+"::"+r.planoId]}))} title={isOpen?"Recolher":"Expandir"}>
                        {isOpen ? "🔼" : "🔽"}
                      </button>
                      {(r.materia.id === "?" || r.topic.name === "Tópico removido") && (
                        <button className="btn btn-ghost btn-xs" onClick={() => setAssociando({ topicId: r.topicId, planoId: r.planoId, note: r.note, name: r.topic.name })} title="Associar a um tópico" style={{color:"var(--blue)"}}>
                          🔗
                        </button>
                      )}
                      <button className="btn btn-ghost btn-xs" onClick={() => setEditing({ topicId: r.topicId, planoId: r.planoId, text: r.note, name: r.topic.name })} title="Editar">
                        ✏️
                      </button>
                      <button className="btn btn-ghost btn-xs" onClick={() => exportarPDF([r])} title="Imprimir/PDF">
                        🖨️
                      </button>
                      <button className="btn btn-ghost btn-xs" onClick={() => exportarDOCX([r], `resumo-${r.topic.name.replace(/\s+/g,"-").substring(0,40)}`)} title="Baixar Word">
                        📄
                      </button>
                      <button className="btn btn-ghost btn-xs" onClick={() => setConfirmDelete({ topicId: r.topicId, planoId: r.planoId, name: r.topic.name })} title="Excluir" style={{color:"var(--red,#ef4444)"}}>
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))
      )}

      {/* Modal de edição */}
      {editing && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}}>
          <div className="card" style={{maxWidth:720,width:"100%",maxHeight:"90vh",display:"flex",flexDirection:"column"}}>
            <div className="row-b" style={{marginBottom:10}}>
              <h3 style={{margin:0,fontSize:15}}>✏️ Editar resumo: {editing.name}</h3>
              <button className="btn btn-ghost btn-xs" onClick={() => setEditing(null)}>✕</button>
            </div>
            <textarea
              value={editing.text}
              onChange={e => setEditing({...editing, text: e.target.value})}
              autoFocus
              style={{flex:1,minHeight:300,padding:12,borderRadius:8,border:"1.5px solid var(--b2)",background:"var(--s2)",color:"var(--t1)",fontSize:13,lineHeight:1.6,fontFamily:"inherit",resize:"vertical"}}
              placeholder="Digite seu resumo..."
            />
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:12}}>
              <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSalvarEdicao}>💾 Salvar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação de exclusão */}
      {confirmDelete && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}}>
          <div className="card" style={{maxWidth:440,width:"100%"}}>
            <h3 style={{margin:"0 0 8px",fontSize:15}}>🗑️ Excluir resumo</h3>
            <p style={{margin:"0 0 14px",color:"var(--t2)",fontSize:13}}>
              Tem certeza que deseja excluir o resumo de <strong>{confirmDelete.name}</strong>? Esta ação não pode ser desfeita.
            </p>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className="btn" style={{background:"var(--red,#ef4444)",color:"#fff"}} onClick={handleExcluir}>Excluir</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de associar resumo órfão a tópico */}
      {associando && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}}>
          <div className="card" style={{maxWidth:560,width:"100%",maxHeight:"80vh",display:"flex",flexDirection:"column"}}>
            <div className="row-b" style={{marginBottom:10}}>
              <h3 style={{margin:0,fontSize:15}}>🔗 Associar resumo a um tópico</h3>
              <button className="btn btn-ghost btn-xs" onClick={() => setAssociando(null)}>✕</button>
            </div>
            <p style={{fontSize:12,color:"var(--t3)",margin:"0 0 12px"}}>
              Resumo: <strong>{associando.name}</strong> — Selecione o tópico de destino:
            </p>
            <div style={{flex:1,overflow:"auto",border:"1px solid var(--b2)",borderRadius:8,padding:8}}>
              {getTopicosDisponiveis().map(t => (
                <div key={t.id} style={{padding:"8px 10px",borderBottom:"1px solid var(--b1)",cursor:"pointer",fontSize:12,borderRadius:4}} className="hover-row"
                  onClick={() => handleAssociar(t.id)}>
                  <div style={{fontWeight:600,color:"var(--t1)"}}>{t.name}</div>
                  <div style={{fontSize:11,color:"var(--t3)"}}>{t.materiaName} · {t.editalName}</div>
                </div>
              ))}
              {getTopicosDisponiveis().length === 0 && (
                <p style={{textAlign:"center",color:"var(--t3)",fontSize:12,padding:20}}>Nenhum tópico disponível. Gere um plano primeiro.</p>
              )}
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:12}}>
              <button className="btn btn-ghost" onClick={() => setAssociando(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de novo resumo */}
      {novoResumo && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.55)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16}}>
          <div className="card" style={{maxWidth:720,width:"100%",maxHeight:"90vh",display:"flex",flexDirection:"column"}}>
            <div className="row-b" style={{marginBottom:10}}>
              <h3 style={{margin:0,fontSize:15}}>📝 Novo Resumo</h3>
              <button className="btn btn-ghost btn-xs" onClick={() => setNovoResumo(false)}>✕</button>
            </div>
            <div style={{marginBottom:12}}>
              <label className="lbl" style={{fontSize:12}}>Associar a um tópico (opcional)</label>
              <select className="inp" value={novoTopicId} onChange={e => setNovoTopicId(e.target.value)} style={{fontSize:12}}>
                <option value="">— Nenhum (resumo avulso) —</option>
                {getTopicosDisponiveis().map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({t.materiaName})</option>
                ))}
              </select>
            </div>
            <textarea
              value={novoText}
              onChange={e => setNovoText(e.target.value)}
              autoFocus
              style={{flex:1,minHeight:250,padding:12,borderRadius:8,border:"1.5px solid var(--b2)",background:"var(--s2)",color:"var(--t1)",fontSize:13,lineHeight:1.6,fontFamily:"inherit",resize:"vertical"}}
              placeholder="Digite seu resumo aqui..."
            />
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:12}}>
              <button className="btn btn-ghost" onClick={() => setNovoResumo(false)}>Cancelar</button>
              <button className="btn btn-green" onClick={handleCriarResumo}>💾 Salvar Resumo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ALUNO: Conteúdos — Visualizar todos os materiais disponíveis
// ============================================================
function AlunoConteudos({ user }) {
  const [showPdfModal, setShowPdfModal] = useState(null);
  const plano = planosModule.getByAluno(user.id)[0] || null;
  const editais = editaisModule.getByAluno(user.id);
  const edital = plano ? editaisModule.getById(plano.editalId) : null;

  if (!plano || !edital) {
    return (
      <div>
        <div className="ph"><div><h1>📚 Conteúdos</h1><p>Materiais disponíveis para estudo</p></div></div>
        <div className="card"><div className="empty"><h3>Nenhum plano ativo</h3><p>Gere um plano para acessar os materiais.</p></div></div>
      </div>
    );
  }

  // Obter todos os materiais disponíveis
  const materiais = storage.get().materiais || [];
  const materiaisDoEdital = materiais.filter(m => m.editalId === edital.id);

  // Construir mapa de topicos com materiais
  const topicosComMaterial = new Map();
  edital.materias?.forEach(materia => {
    materia.topicos?.forEach(topic => {
      const hasMaterial = materiaisDoEdital.find(m => m.topicId === topic.id);
      if (hasMaterial) {
        topicosComMaterial.set(topic.id, {
          ...topic,
          materiaId: materia.id,
          materiaName: materia.name,
          materiaColor: materia.color,
          material: hasMaterial
        });
      }
    });
  });

  const getMaterialFiles = (topicId) => {
    const materiais = storage.get().materiais || [];
    const topic = materiais.find(m => m.topicId === topicId && m.editalId === edital?.id);

    // Suportar ambas as estruturas: nova (com files array) e antiga (com url direto)
    if (topic?.files && Array.isArray(topic.files)) {
      return topic.files;
    } else if (topic?.url) {
      // Converter estrutura antiga para nova
      return [{
        url: topic.url,
        filename: topic.filename,
        type: "Material",
        addedAt: topic.savedAt || new Date().toISOString()
      }];
    }
    return [];
  };

  const topicMaterials = showPdfModal ? getMaterialFiles(showPdfModal) : [];

  // Encontrar o nome do tópico selecionado
  const selectedTopicName = showPdfModal ? Array.from(topicosComMaterial.values()).find(t => t.id === showPdfModal)?.name : null;

  return (
    <div>
      {showPdfModal && (
        <div className="overlay" onClick={() => setShowPdfModal(null)}>
          <div className="modal fi" style={{maxWidth:500,padding:"40px 30px"}} onClick={e => e.stopPropagation()}>
            <div className="modal-hd" style={{marginBottom:"30px",display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <h2 style={{margin:0,fontSize:18,fontWeight:700}}>{selectedTopicName || "Materiais"}</h2>
              <button className="modal-x" onClick={() => setShowPdfModal(null)}>✕</button>
            </div>
            {topicMaterials.length > 0 ? (
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                {topicMaterials.map((file, idx) => (
                  <a
                    key={idx}
                    href={file.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding:"16px",
                      borderRadius:8,
                      background:"var(--blue-d)",
                      border:"1px solid var(--blue)",
                      textDecoration:"none",
                      display:"flex",
                      flexDirection:"column",
                      gap:4,
                      cursor:"pointer",
                      transition:"all 0.15s"
                    }}
                    onMouseEnter={(e) => e.target.style.background = "var(--blue)"}
                    onMouseLeave={(e) => e.target.style.background = "var(--blue-d)"}
                  >
                    <div style={{fontSize:13,fontWeight:600,color:"var(--blue)"}}>
                      📄 {file.type}
                    </div>
                    <div style={{fontSize:11,color:"var(--t3)",wordBreak:"break-word"}}>
                      {file.filename}
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,color:"var(--t3)"}}>
                <div style={{fontSize:40}}>⚠️</div>
                <p style={{margin:0,textAlign:"center"}}>Nenhum material disponível para este tópico.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="ph"><div><h1>📚 Conteúdos</h1><p>Materiais disponíveis para estudo — {edital.name}</p></div></div>

      {topicosComMaterial.size === 0 ? (
        <div className="card"><div className="empty"><h3>Nenhum conteúdo disponível</h3><p>Seu coach ainda não adicionou materiais.</p></div></div>
      ) : (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 20 }}>Materiais por Matéria</div>
          <div style={{ display: "grid", gap: 24 }}>
            {edital.materias?.map(materia => {
              const topicosMateria = Array.from(topicosComMaterial.values()).filter(t => t.materiaId === materia.id);
              if (topicosMateria.length === 0) return null;

              return (
                <div key={materia.id} style={{ borderLeft: `4px solid ${materia.color}`, paddingLeft: 16 }}>
                  <h3 style={{ margin: "0 0 12px 0", fontSize: 15, fontWeight: 700, color: "var(--t1)" }}>
                    {materia.name}
                  </h3>
                  <div style={{ display: "grid", gap: 8 }}>
                    {topicosMateria.map(topic => (
                      <button
                        key={topic.id}
                        onClick={() => setShowPdfModal(topic.id)}
                        style={{
                          padding: 12,
                          borderRadius: 8,
                          background: "var(--s2)",
                          border: "1px solid var(--b2)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 12,
                          cursor: "pointer",
                          transition: "all 0.15s",
                          textAlign: "left",
                          color: "inherit",
                          fontFamily: "inherit",
                          fontSize: "inherit"
                        }}
                        onMouseEnter={(e) => e.target.style.background = "var(--s3)"}
                        onMouseLeave={(e) => e.target.style.background = "var(--s2)"}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)", marginBottom: 2 }}>
                            {topic.name}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--t3)" }}>
                            📄 {topic.material.filename}
                          </div>
                        </div>
                        <div style={{ fontSize: 18, flexShrink: 0 }}>📎</div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// ADMIN: Debug — simulação de tempo
// ============================================================
function AdminDebug() {
  const today = new Date(); today.setHours(0,0,0,0);
  const [simDate, setSimDate] = useState(localDateKey(today));
  const [selectedAluno, setSelectedAluno] = useState("");
  const [dayOffset, setDayOffset] = useState(0);
  const [sandbox, setSandbox] = useState(null); // cópia isolada do progresso
  const [sandboxNotes, setSandboxNotes] = useState([]);
  const [tick, setTick] = useState(0);
  const alunos = usersModule.getAlunos();
  const planos = storage.get().planos;

  // Sandbox: cópia isolada dos dados reais
  const initSandbox = (alunoId) => {
    const db = storage.get();
    const pl = db.planos.find(p => p.alunoId === alunoId);
    if (pl) {
      setSandbox(JSON.parse(JSON.stringify((db.progresso||[]).filter(p => p.alunoId === alunoId && p.planoId === pl.id))));
      setSandboxNotes(JSON.parse(JSON.stringify((db.studyNotes||[]).filter(n => n.alunoId === alunoId))));
    } else { setSandbox([]); setSandboxNotes([]); }
  };
  const handleSelectAluno = (id) => { setSelectedAluno(id); if (id) initSandbox(id); else { setSandbox(null); setSandboxNotes([]); } };
  const sbIsDone = (key) => (sandbox||[]).some(p => p.key === key && p.done);
  const sbMarkDone = (planoId, key) => { setSandbox(prev => { if (prev.find(p=>p.key===key)) return prev.map(p=>p.key===key?{...p,done:true}:p); return [...prev,{alunoId:selectedAluno,planoId,key,done:true}]; }); setTick(t=>t+1); };
  const sbRemoveDone = (planoId, key) => { setSandbox(prev => prev.filter(p => p.key !== key)); setTick(t=>t+1); };
  const sbResetAll = (planoId) => { setSandbox(prev => prev.filter(p => p.planoId !== planoId)); setTick(t=>t+1); };
  const sbAddNote = (planoId, topicId, text) => { setSandboxNotes(prev => { const ex=prev.find(n=>n.planoId===planoId&&n.topicId===topicId); if(ex) return prev.map(n=>(n.planoId===planoId&&n.topicId===topicId)?{...n,note:text,updatedAt:new Date().toISOString()}:n); return [...prev,{alunoId:selectedAluno,planoId,topicId,note:text,updatedAt:new Date().toISOString()}]; }); setTick(t=>t+1); };

  // Derived simulated date from manual offset
  const baseDate = new Date(simDate + "T00:00:00");
  const simDt = new Date(baseDate); simDt.setDate(simDt.getDate() + dayOffset);
  const simKey = localDateKey(simDt);
  const diffDays = Math.round((simDt - today) / 86400000);

  const aluno = alunos.find(a => a.id === selectedAluno);
  const plano = aluno ? planos.find(p => p.alunoId === aluno.id) : null;
  const edital = plano ? editaisModule.getById(plano.editalId) : null;
  const dayData = plano?.plan?.[simKey] || { topicos:[], reviews:[] };

  // Compute cumulative stats using sandbox
  function statsUpTo(key) {
    if (!plano || !sandbox) return null;
    const doneIds = new Set(
      sandbox.filter(p => p.done && !p.key.endsWith("-rev"))
          .map(p => p.key.substring(11))
    );
    const aulasFeitas = doneIds.size;
    const notDoneInPlan = Object.values(plano.plan).flatMap(d => d.topicos).filter(t => !doneIds.has(t.id)).length;
    const totalAulas = aulasFeitas + notDoneInPlan;
    const pct = totalAulas ? Math.min(100, Math.round((aulasFeitas/totalAulas)*100)) : 0;
    return { totalAulas, aulasFeitas, pct };
  }

  const stats = statsUpTo(simKey);
  const xp = sandbox ? sandbox.filter(p => p.done).length * 10 : 0;
  const nivel = gamificacaoModule.getNivel(xp);

  // Week view centered on simKey
  function getWeek() {
    const dow = simDt.getDay();
    const mon = new Date(simDt); mon.setDate(simDt.getDate() - ((dow+6)%7));
    return Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return localDateKey(d);});
  }
  const weekKeys = getWeek();

  function jumpDays(n) { setDayOffset(o => o + n); }
  function resetDate() { setSimDate(localDateKey(today)); setDayOffset(0); }

  const diffLabel = diffDays === 0 ? "🟢 Hoje (real)" : diffDays > 0 ? `+${diffDays} dias no futuro` : `${Math.abs(diffDays)} dias no passado`;

  return (
    <div>
      <div className="ph">
        <div><h1>🔧 Debug — Simulador de Tempo</h1><p>Sandbox isolado — não afeta dados reais</p></div>
        <button className="btn btn-ghost btn-sm" onClick={resetDate}>🔄 Voltar ao hoje</button>
      </div>

      <div style={{background:"var(--amber-d,#fef3c7)",border:"1.5px solid var(--amber,#f59e0b)",borderRadius:8,padding:"10px 14px",marginBottom:16,fontSize:12,color:"var(--amber,#92400e)"}}>
        ⚠️ <strong>Modo Sandbox:</strong> Todas as ações aqui operam numa cópia isolada dos dados. Nenhuma alteração afeta o ambiente real. Ao sair desta aba, as simulações são descartadas.
      </div>

      {/* Controls */}
      <div className="card mb4">
        <div className="card-title">Configuração</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
          <div className="form-group" style={{margin:0}}>
            <label className="lbl">Aluno</label>
            <select className="inp" value={selectedAluno} onChange={e=>handleSelectAluno(e.target.value)}>
              <option value="">— selecione —</option>
              {alunos.map(a=><option key={a.id} value={a.id}>{a.name}{planos.some(p=>p.alunoId===a.id)?"":" (sem plano)"}</option>)}
            </select>
          </div>
          <div className="form-group" style={{margin:0}}>
            <label className="lbl">Data base</label>
            <input className="inp" type="date" value={simDate} onChange={e=>{setSimDate(e.target.value);setDayOffset(0);}}/>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
          <span style={{fontSize:12,color:"var(--t3)"}}>Navegar:</span>
          <button className="btn btn-ghost btn-sm" onClick={()=>jumpDays(-7)}>◀◀ -7d</button>
          <button className="btn btn-ghost btn-sm" onClick={()=>jumpDays(-1)}>◀ -1d</button>
          <div style={{background:"var(--s2)",border:"1.5px solid var(--b2)",borderRadius:10,padding:"8px 18px",textAlign:"center",minWidth:200}}>
            <div style={{fontFamily:"Cabinet Grotesk",fontWeight:900,fontSize:18,color:"var(--green)"}}>{simDt.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})}</div>
            <div style={{fontSize:11,color:"var(--t3)",marginTop:2}}>{diffLabel}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={()=>jumpDays(1)}>+1d ▶</button>
          <button className="btn btn-ghost btn-sm" onClick={()=>jumpDays(7)}>+7d ▶▶</button>
        </div>
      </div>

      {!selectedAluno ? (
        <div className="card"><div className="empty"><h3>Selecione um aluno para simular</h3></div></div>
      ) : !plano ? (
        <div className="card"><div className="empty"><h3>Aluno sem plano gerado</h3></div></div>
      ) : (
        <>
          {/* Stats snapshot */}
          <div className="g4 mb4">
            <div className="stat"><div className="stat-l">Data simulada</div><div className="stat-v" style={{fontSize:13,color:"var(--amber)",marginTop:4}}>{simDt.toLocaleDateString("pt-BR")}</div></div>
            <div className="stat"><div className="stat-l">Aulas concluídas</div><div className="stat-v" style={{color:"var(--green)"}}>{stats?.aulasFeitas}</div><div className="stat-s">de {stats?.totalAulas}</div></div>
            <div className="stat"><div className="stat-l">Progresso</div><div className="stat-v">{stats?.pct}%</div></div>
            <div className="stat"><div className="stat-l">XP / Nível</div><div className="stat-v" style={{fontSize:13}}>{xp} XP</div><div className="stat-s">{nivel.emoji} {nivel.name}</div></div>
          </div>

          {/* Day detail */}
          <div className="g2 mb4">
            <div className="card">
              <div className="card-title">📅 {simDt.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"})}</div>
              {dayData.topicos.length===0&&dayData.reviews.length===0 ? (
                <p className="text-muted text-sm">Sem conteúdo programado — folga ou dia não configurado.</p>
              ) : (
                <>
                  {dayData.topicos.length>0&&(
                    <div className="mb3">
                      <div style={{fontSize:11,fontWeight:700,color:"var(--t3)",textTransform:"uppercase",letterSpacing:.5,marginBottom:8}}>Aulas ({dayData.topicos.length})</div>
                      {dayData.topicos.map((t,i)=>{
                        const key=`${simKey}-${t.id}`;
                        const done=sbIsDone(key);
                        return <div key={i} className={`topic-row ${done?"done":""}`}><div className="dot-c" style={{background:t.materiaColor}}/><span className="tr-name">{t.name}</span><span className="tr-tag">{t.materiaName}</span>{done&&<span className="badge bg" style={{fontSize:10}}>✓</span>}</div>;
                      })}
                    </div>
                  )}
                  {dayData.reviews.length>0&&(
                    <div className="rev-sec">
                      <div className="rev-lbl">Revisões ({dayData.reviews.length})</div>
                      {dayData.reviews.map((r,i)=>{
                        const key=`${simKey}-${r.id}-rev`;
                        const done=sbIsDone(key);
                        return <div key={i} className={`topic-row ${done?"done":""}`}><div className="dot-c" style={{background:r.materiaColor}}/><span className="tr-name">{r.name}</span><span className="tr-tag">🕐 {r.reviewInterval}d</span>{done&&<span className="badge bg" style={{fontSize:10}}>✓</span>}</div>;
                      })}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Week overview */}
            <div className="card">
              <div className="card-title">Semana simulada</div>
              {weekKeys.map(dk=>{
                const dd = plano.plan[dk]||{topicos:[],reviews:[]};
                const dDate = new Date(dk+"T00:00:00");
                const isSim = dk === simKey;
                const isReal = dk === localDateKey(today);
                return (
                  <div key={dk} onClick={()=>{ const diff=Math.round((dDate-today)/86400000); setDayOffset(diff); }}
                    style={{padding:"8px 10px",borderRadius:8,marginBottom:4,cursor:"pointer",border:`1.5px solid ${isSim?"var(--green)":isReal?"var(--amber)":"var(--b1)"}`,background:isSim?"var(--green-d)":isReal?"var(--amber-d)":"transparent",transition:"all .15s"}}>
                    <div className="row-b">
                      <div style={{fontFamily:"Cabinet Grotesk",fontWeight:700,fontSize:12,color:isSim?"var(--green)":isReal?"var(--amber)":"var(--t2)"}}>
                        {DAYS_FULL[dDate.getDay()].slice(0,3)} {dDate.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"})}
                        {isReal&&<span style={{marginLeft:5,fontSize:10,opacity:.7}}>(hoje)</span>}
                      </div>
                      <div style={{fontSize:11,color:"var(--t3)"}}>
                        {dd.topicos.length>0&&<span>{dd.topicos.length}📖 </span>}
                        {dd.reviews.length>0&&<span>{dd.reviews.length}🔁</span>}
                        {dd.topicos.length===0&&dd.reviews.length===0&&<span style={{color:"var(--t3)"}}>folga</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Edital info */}
          <div className="card">
            <div className="card-title">Plano — {edital?.name}</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
              <div style={{textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,fontFamily:"Cabinet Grotesk",color:"var(--blue)"}}>{Object.keys(plano.plan).length}</div><div style={{fontSize:11,color:"var(--t3)",fontWeight:700,textTransform:"uppercase"}}>Dias no plano</div></div>
              <div style={{textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,fontFamily:"Cabinet Grotesk",color:"var(--purple)"}}>{Object.values(plano.plan).reduce((a,d)=>a+d.topicos.length,0)}</div><div style={{fontSize:11,color:"var(--t3)",fontWeight:700,textTransform:"uppercase"}}>Total aulas</div></div>
              <div style={{textAlign:"center"}}><div style={{fontSize:22,fontWeight:900,fontFamily:"Cabinet Grotesk",color:"var(--amber)"}}>{Object.values(plano.plan).reduce((a,d)=>a+d.reviews.length,0)}</div><div style={{fontSize:11,color:"var(--t3)",fontWeight:700,textTransform:"uppercase"}}>Total revisões</div></div>
            </div>
            <PBar pct={stats?.pct||0} color="var(--green)"/>
          </div>

          {/* Ações de simulação (sandbox) */}
          <div className="card" style={{marginTop:16}}>
            <div className="card-title">⚡ Ações de Simulação (Sandbox)</div>
            <p style={{fontSize:11,color:"var(--t3)",margin:"0 0 12px"}}>Estas ações operam apenas na cópia local. Nada é salvo no banco real.</p>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
              <button className="btn btn-green btn-sm" onClick={async () => {
                const dk = simKey;
                const dd = plano.plan[dk] || { topicos:[], reviews:[] };
                dd.topicos.forEach(t => sbMarkDone(plano.id, `${dk}-${t.id}`));
                dd.reviews.forEach(r => sbMarkDone(plano.id, `${dk}-${r.id}-rev`));
                await alertar({ titulo: "Dia concluído", mensagem: `✓ [Sandbox] ${dd.topicos.length} aulas + ${dd.reviews.length} revisões concluídas em ${dk}` });
              }}>
                ✅ Concluir dia
              </button>
              <button className="btn btn-blue btn-sm" onClick={async () => {
                const n = parseInt(prompt("Quantos dias a partir da data simulada?", "7"));
                if (!n || isNaN(n)) return;
                let count = 0;
                for (let i = 0; i < n; i++) {
                  const d = new Date(simDt); d.setDate(simDt.getDate() + i);
                  const dk = localDateKey(d);
                  const dd = plano.plan[dk] || { topicos:[], reviews:[] };
                  dd.topicos.forEach(t => { sbMarkDone(plano.id, `${dk}-${t.id}`); count++; });
                  dd.reviews.forEach(r => { sbMarkDone(plano.id, `${dk}-${r.id}-rev`); count++; });
                }
                await alertar({ titulo: "Dias concluídos", mensagem: `✓ [Sandbox] ${count} itens concluídos em ${n} dias` });
              }}>
                📅 Concluir próximos N dias
              </button>
              <button className="btn btn-ghost btn-sm" style={{color:"var(--amber)"}} onClick={async () => {
                const n = parseInt(prompt("Quantos dias remover progresso?", "3"));
                if (!n || isNaN(n)) return;
                let count = 0;
                for (let i = 0; i < n; i++) {
                  const d = new Date(simDt); d.setDate(simDt.getDate() + i);
                  const dk = localDateKey(d);
                  const dd = plano.plan[dk] || { topicos:[], reviews:[] };
                  dd.topicos.forEach(t => { sbRemoveDone(plano.id, `${dk}-${t.id}`); count++; });
                  dd.reviews.forEach(r => { sbRemoveDone(plano.id, `${dk}-${r.id}-rev`); count++; });
                }
                await alertar({ titulo: "Progresso removido", mensagem: `✓ [Sandbox] Progresso removido de ${count} itens em ${n} dias` });
              }}>
                ⏭️ Simular não estudar N dias
              </button>
              <button className="btn btn-ghost btn-sm" style={{color:"var(--purple)"}} onClick={async () => {
                const dk = simKey;
                const dd = plano.plan[dk] || { topicos:[], reviews:[] };
                const half = Math.ceil(dd.topicos.length / 2);
                dd.topicos.slice(0, half).forEach(t => sbMarkDone(plano.id, `${dk}-${t.id}`));
                await alertar({ titulo: "Estudo parcial", mensagem: `✓ [Sandbox] ${half} de ${dd.topicos.length} aulas concluídas (parcial)` });
              }}>
                ½ Estudo parcial
              </button>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              <button className="btn btn-ghost btn-sm" style={{color:"var(--red)"}} onClick={async () => {
                if (!await confirmar({ titulo: "[Sandbox] Resetar progresso?", mensagem: "Todo o progresso simulado será apagado. Isso não afeta dados reais.", tipo: "destrutivo", confirmLabel: "Resetar" })) return;
                sbResetAll(plano.id);
                await alertar({ titulo: "Pronto", mensagem: "✓ [Sandbox] Progresso resetado." });
              }}>
                🗑️ Resetar progresso
              </button>
              <button className="btn btn-ghost btn-sm" onClick={async () => {
                const materias = edital?.materias || [];
                const nomes = materias.map((m,i) => `${i+1}. ${m.name}`).join("\n");
                const idx = parseInt(prompt(`Qual matéria concluir?\n\n${nomes}\n\nNúmero:`, "1"));
                if (!idx || isNaN(idx) || idx < 1 || idx > materias.length) return;
                const mat = materias[idx-1];
                const topicIds = new Set((mat.topicos||[]).map(t=>t.id));
                let count = 0;
                Object.entries(plano.plan).forEach(([dk, dd]) => {
                  dd.topicos.filter(t => topicIds.has(t.id)).forEach(t => { sbMarkDone(plano.id, `${dk}-${t.id}`); count++; });
                });
                await alertar({ titulo: "Matéria concluída", mensagem: `✓ [Sandbox] ${count} aulas de "${mat.name}" concluídas` });
              }}>
                📚 Concluir matéria inteira
              </button>
              <button className="btn btn-ghost btn-sm" onClick={async () => {
                const dk = simKey;
                const dd = plano.plan[dk] || { topicos:[], reviews:[] };
                dd.topicos.forEach(t => {
                  sbAddNote(plano.id, t.id, `[Resumo simulado] ${t.name}\n\nConteúdo de teste gerado em ${new Date().toLocaleString("pt-BR")}.`);
                });
                await alertar({ titulo: "Resumos criados", mensagem: `✓ [Sandbox] ${dd.topicos.length} resumos simulados criados` });
              }}>
                📝 Gerar resumos fake
              </button>
              <button className="btn btn-ghost btn-sm" onClick={async () => {
                initSandbox(selectedAluno);
                await alertar({ titulo: "Sandbox recarregado", mensagem: "✓ Sandbox recarregado com dados reais atuais." });
              }}>
                🔄 Recarregar do real
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================
// ALUNO: Simulados
// ============================================================
function AlunoSimulados({ user, refresh }) {
  const editais = editaisModule.getByAluno(user.id);
  const [editalId, setEditalId] = useState(editais[0]?.id || "");
  const [resolvendo, setResolvendo] = useState(null);
  const [verFeedback, setVerFeedback] = useState(null); // tentativaId
  const [abaAtiva, setAbaAtiva] = useState("simulados"); // "simulados" | "revisoes"

  const edital = editaisModule.getById(editalId);
  const simulados = edital ? simuladosModule.getByEditalParaAluno(editalId, user.id) : [];
  const todasRevisoes = feedbackModule.getByAluno(user.id);

  return (
    <div>
      <div className="ph"><div><h1>📝 Simulados</h1><p>Resolva simulados e acompanhe suas revisões</p></div></div>

      {/* Abas */}
      <div style={{ display:"flex", gap:8, marginBottom:24, borderBottom:"1px solid var(--b2)", paddingBottom:12 }}>
        {[
          { id:"simulados", label:"📝 Simulados", count: null },
          { id:"revisoes",  label:"📘 Revisão do Professor", count: todasRevisoes.length },
        ].map(ab => (
          <button key={ab.id} onClick={()=>setAbaAtiva(ab.id)} style={{ padding:"8px 18px", borderRadius:8, border:"none", background:abaAtiva===ab.id?"var(--green)":"var(--s2)", color:abaAtiva===ab.id?"#07080f":"var(--t2)", fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            {ab.label}
            {ab.count > 0 && <span style={{ background:abaAtiva===ab.id?"rgba(0,0,0,0.2)":"var(--green-d)", color:abaAtiva===ab.id?"#07080f":"var(--green)", borderRadius:10, padding:"1px 7px", fontSize:11, fontWeight:900 }}>{ab.count}</span>}
          </button>
        ))}
      </div>

      {/* Aba Revisão do Professor */}
      {abaAtiva === "revisoes" && (
        <div>
          {todasRevisoes.length === 0 ? (
            <div className="card"><div className="empty"><h3>Nenhuma revisão recebida ainda</h3><p style={{color:"var(--t3)"}}>Quando seu professor corrigir um simulado e enviar o relatório, ele aparecerá aqui.</p></div></div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {todasRevisoes.map(fb => {
                const tentativa = tentativasModule.getById(fb.tentativaId);
                const simulado = tentativa ? simuladosModule.getById(tentativa.simuladoId) : null;
                const questoes = tentativa ? questoesModule.getBySimulado(tentativa.simuladoId) : [];
                const total = questoes.length;
                const pct = total > 0 ? Math.round(((tentativa?.acertos||0) / total) * 100) : 0;
                const coach = usersModule.getById(fb.coachId);
                const comComentarios = (fb.comentariosQuestoes||[]).filter(c => c.comentario).length;
                return (
                  <div key={fb.id} style={{ padding:18, borderRadius:12, background:"var(--s2)", border:"1.5px solid rgba(34,211,165,0.35)" }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                      <div>
                        <div style={{ fontSize:15, fontWeight:900, fontFamily:"Cabinet Grotesk", marginBottom:3 }}>{simulado?.nome || "Simulado"}</div>
                        <div style={{ fontSize:12, color:"var(--t3)" }}>
                          Corrigido por <strong>{coach?.name||"Professor"}</strong> · {new Date(fb.enviadoEm).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"})}
                        </div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:22, fontWeight:900, fontFamily:"Cabinet Grotesk", color:pct>=60?"var(--green)":"var(--red)" }}>{pct}%</div>
                        <div style={{ fontSize:11, color:"var(--t3)" }}>{tentativa?.acertos||0}/{total} acertos</div>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
                      {comComentarios > 0 && <span style={{ fontSize:11, padding:"3px 10px", borderRadius:10, background:"var(--blue-d)", color:"var(--blue)", fontWeight:700 }}>💬 {comComentarios} comentário{comComentarios!==1?"s":""}</span>}
                      {fb.orientacoesGerais && <span style={{ fontSize:11, padding:"3px 10px", borderRadius:10, background:"var(--amber-d,rgba(251,191,36,.1))", color:"var(--amber)", fontWeight:700 }}>📋 Orientações gerais</span>}
                    </div>
                    <button onClick={()=>setVerFeedback(fb.tentativaId)} style={{ width:"100%", padding:"10px", borderRadius:8, border:"none", background:"var(--green)", color:"#07080f", fontSize:13, fontWeight:900, cursor:"pointer", fontFamily:"Cabinet Grotesk" }}>
                      📘 Ver Revisão Completa
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Aba Simulados */}
      {abaAtiva === "simulados" && (
      <div>

      {editais.length > 1 && (
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--t2)" }}>
            Selecione um edital:
          </label>
          <select
            value={editalId}
            onChange={(e) => setEditalId(e.target.value)}
            style={{
              maxWidth: 350,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--b2)",
              background: "var(--s2)",
              color: "var(--t1)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer"
            }}
          >
            {editais.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
      )}

      {!edital ? (
        <div className="card"><div className="empty"><h3>Nenhum edital disponível</h3></div></div>
      ) : simulados.length === 0 ? (
        <div className="card"><div className="empty"><h3>Nenhum simulado disponível para este edital</h3></div></div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {simulados.map(sim => {
            const tentativas = tentativasModule.getBySimuladoAluno(sim.id, user.id);
            const finalizadas = tentativas.filter(t => t.status === "finalizada");
            const emAndamento = tentativas.find(t => t.status === "em_andamento");
            // Verifica se alguma tentativa tem feedback enviado
            const tentativaComFeedback = finalizadas.find(t => feedbackModule.getEnviadoParaAluno(t.id));

            return (
              <div
                key={sim.id}
                style={{
                  padding: 16,
                  borderRadius: 8,
                  background: "var(--s2)",
                  border: tentativaComFeedback ? "1px solid rgba(34,211,165,0.35)" : "1px solid var(--b2)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--t1)" }}>{sim.nome}</div>
                    {tentativaComFeedback && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: "var(--green-d)", color: "var(--green)", border: "1px solid rgba(34,211,165,0.3)" }}>
                        📨 Feedback disponível
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 6 }}>
                    {sim.tipo === "geral" ? "Simulado Geral" : "Simulado Específico"}
                  </div>
                  {sim.descricao && (
                    <div style={{ fontSize: 12, color: "var(--t2)", marginBottom: 6 }}>{sim.descricao}</div>
                  )}
                </div>

                <div style={{ fontSize: 11, color: "var(--t3)" }}>
                  {finalizadas.length > 0 && (
                    <div>✓ {finalizadas.length} tentativa{finalizadas.length > 1 ? 's' : ''} finalizada{finalizadas.length > 1 ? 's' : ''}</div>
                  )}
                  {emAndamento && (
                    <div style={{ color: "var(--amber)" }}>⏳ Tentativa em andamento</div>
                  )}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: "auto", flexWrap: "wrap" }}>
                  {tentativaComFeedback && (
                    <button
                      onClick={() => setVerFeedback(tentativaComFeedback.id)}
                      style={{
                        flex: 1, minWidth: 120,
                        padding: "8px 12px", borderRadius: 6, border: "none",
                        background: "var(--green)", color: "#07080f",
                        fontSize: 12, fontWeight: 700, cursor: "pointer"
                      }}
                    >
                      📨 Ver Feedback
                    </button>
                  )}
                  {emAndamento ? (
                    <button
                      onClick={() => setResolvendo(emAndamento.id)}
                      style={{
                        flex: 1, padding: "8px 12px", borderRadius: 6, border: "none",
                        background: "var(--amber)", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer"
                      }}
                    >
                      Continuar
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        const nova = tentativasModule.create(sim.id, user.id);
                        setResolvendo(nova.id);
                      }}
                      style={{
                        flex: 1, padding: "8px 12px", borderRadius: 6, border: "none",
                        background: "var(--blue)", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer"
                      }}
                    >
                      {finalizadas.length > 0 ? "Resolver novamente" : "Resolver"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      </div>)}

      {resolvendo && (
        <ResolverSimulado tentativaId={resolvendo} onVoltar={() => { setResolvendo(null); refresh?.(); }} />
      )}
      {verFeedback && (
        <ModalVerFeedback tentativaId={verFeedback} onClose={() => setVerFeedback(null)} />
      )}
    </div>
  );
}

// Componente para resolver simulado
function ResolverSimulado({ tentativaId, onVoltar }) {
  const tentativa = tentativasModule.getById(tentativaId);
  if (!tentativa) return null;

  const simulado = simuladosModule.getById(tentativa.simuladoId);
  const questoes = questoesModule.getBySimulado(tentativa.simuladoId);
  const [questaoAtual, setQuestaoAtual] = useState(0);
  const [tempoDecorridoSegundos, setTempoDecorridoSegundos] = useState(0);
  const [tempoRestante, setTempoRestante] = useState(
    simulado?.tempoLimiteMinutos ? simulado.tempoLimiteMinutos * 60 : null
  );
  const [finalizado, setFinalizado] = useState(false);
  const q = questoes[questaoAtual];

  useEffect(() => {
    if (finalizado || !tempoRestante) return;
    const interval = setInterval(() => {
      setTempoDecorridoSegundos(prev => prev + 1);
      setTempoRestante(prev => {
        if (prev <= 1) {
          setFinalizado(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [finalizado, tempoRestante]);

  if (!q) {
    return (
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000
      }}>
        <div style={{
          background: "var(--s1)", padding: 24, borderRadius: 12, maxWidth: 400, width: "90%"
        }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--t1)", marginBottom: 16 }}>
            Simulado concluído!
          </div>
          <div style={{ color: "var(--t2)", marginBottom: 20 }}>
            Obrigado por resolver este simulado. Você pode resolver novamente a qualquer momento.
          </div>
          <button
            onClick={() => {
              tentativasModule.finalizar(tentativaId, tempoDecorridoSegundos);
              onVoltar();
            }}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 6,
              border: "none",
              background: "var(--blue)",
              color: "white",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: "20px 12px"
    }}>
      <div style={{
        background: "var(--s1)", borderRadius: 12, maxWidth: 600, width: "90%",
        display: "flex", flexDirection: "column", maxHeight: "90vh", overflow: "hidden"
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "var(--t3)" }}>
            Questão {questaoAtual + 1} de {questoes.length}
          </div>
          {tempoRestante !== null && (
            <div style={{
              padding: "6px 12px",
              borderRadius: 6,
              background: tempoRestante <= 60 ? "var(--red)" : "var(--s2)",
              color: tempoRestante <= 60 ? "white" : "var(--amber)",
              fontSize: 12,
              fontWeight: 600
            }}>
              ⏱️ {Math.floor(tempoRestante / 60)}:{String(tempoRestante % 60).padStart(2, "0")}
            </div>
          )}
        </div>
        <div style={{
          height: 4, background: "var(--b2)", borderRadius: 2,
          overflow: "hidden", marginBottom: 20
        }}>
          <div style={{
            height: "100%", background: "var(--blue)",
            width: `${((questaoAtual + 1) / questoes.length) * 100}%`
          }}></div>
        </div>

        {q.textBase && (
          <div style={{ marginBottom: 24, padding: 16, borderRadius: 8, background: "var(--s2)", border: "1px solid var(--b2)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t3)", marginBottom: 12, textTransform: "uppercase" }}>
              📚 Texto
            </div>
            <div style={{
              fontSize: 13,
              color: "var(--t1)",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word"
            }}>
              {q.textBase}
            </div>
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--t1)", marginBottom: 16 }}>
            {q.enunciado}
          </div>

          {q.tipo === "ce" ? (
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => {
                  tentativasModule.responder(tentativaId, q.id, "C");
                  setQuestaoAtual(questaoAtual + 1);
                }}
                style={{
                  flex: 1, padding: "12px", borderRadius: 6,
                  border: "2px solid var(--green)", background: "transparent",
                  color: "var(--green)", fontSize: 14, fontWeight: 600,
                  cursor: "pointer", transition: "all 0.15s"
                }}
              >
                ✓ Certo
              </button>
              <button
                onClick={() => {
                  tentativasModule.responder(tentativaId, q.id, "E");
                  setQuestaoAtual(questaoAtual + 1);
                }}
                style={{
                  flex: 1, padding: "12px", borderRadius: 6,
                  border: "2px solid var(--red)", background: "transparent",
                  color: "var(--red)", fontSize: 14, fontWeight: 600,
                  cursor: "pointer", transition: "all 0.15s"
                }}
              >
                ✗ Errado
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {q.alternativas.map((alt, i) => (
                <button
                  key={i}
                  onClick={() => {
                    tentativasModule.responder(tentativaId, q.id, alt);
                    setQuestaoAtual(questaoAtual + 1);
                  }}
                  style={{
                    padding: "12px", borderRadius: 6,
                    border: "1px solid var(--b2)", background: "var(--s2)",
                    color: "var(--t1)", fontSize: 13,
                    cursor: "pointer", textAlign: "left",
                    transition: "all 0.15s"
                  }}
                  onMouseOver={(e) => { e.target.style.background = "var(--s3)"; }}
                  onMouseOut={(e) => { e.target.style.background = "var(--s2)"; }}
                >
                  {String.fromCharCode(65 + i)}. {alt}
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            onClick={() => { setQuestaoAtual(questaoAtual + 1); }}
            style={{ flex: 1, padding: "10px 12px", borderRadius: 6, border: "1px solid var(--b2)", background: "transparent", color: "var(--t3)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Deixar em branco
          </button>
          <button
            onClick={() => {
              if (await confirmar({ titulo: "Finalizar simulado?", mensagem: "As questões não respondidas contarão como em branco.", tipo: "destrutivo", confirmLabel: "Finalizar" })) {
                tentativasModule.finalizar(tentativaId, tempoDecorridoSegundos);
                onVoltar();
              }
            }}
            style={{ flex: 1, padding: "10px 12px", borderRadius: 6, border: "none", background: "var(--blue)", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer" }}
          >
            Finalizar agora
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ALUNO: Ranking (visão do aluno — vê a si mesmo no ranking)
// ============================================================
function AlunoRanking({ user }) {
  const editais = editaisModule.getByAluno(user.id);
  const [editalId, setEditalId] = useState(editais[0]?.id || "");
  const planos = storage.get().planos;

  const edital = editaisModule.getById(editalId);
  if (!edital) return (
    <div><div className="ph"><div><h1>🏆 Ranking</h1></div></div>
    <div className="card"><div className="empty"><h3>Nenhum edital associado</h3></div></div></div>
  );

  // Pega todos os alunos que têm plano neste edital
  const todosAlunos = usersModule.getAlunos().filter(a => planos.some(p => p.alunoId === a.id && p.editalId === editalId));

  const ranking = todosAlunos.map(a => {
    const plano = planos.find(p => p.alunoId === a.id && p.editalId === editalId);
    const xp = plano ? gamificacaoModule.calcXP(a.id, plano.id) : 0;
    const stats = plano ? progressoModule.getStats(a.id, plano.id) : null;
    const streak = plano ? gamificacaoModule.getStreakAtual(a.id, plano.id) : 0;
    const nivel = gamificacaoModule.getNivel(xp);
    return { aluno: a, xp, aulas: stats?.aulasFeitas || 0, streak, nivel, pct: stats?.pct || 0, isMe: a.id === user.id };
  }).sort((a, b) => b.xp - a.xp || b.aulas - a.aulas);

  const posClass = (i) => i===0?"rank-1":i===1?"rank-2":i===2?"rank-3":"";
  const posEmoji = (i) => i===0?"🥇":i===1?"🥈":i===2?"🥉":"";
  const myPos = ranking.findIndex(r => r.isMe);

  return (
    <div>
      <div className="ph"><div><h1>🏆 Ranking</h1><p>Sua posição entre os colegas</p></div></div>
      {editais.length > 1 && (
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
          {editais.map(e => (
            <button key={e.id} className={`preset-btn${editalId===e.id?" active":""}`} onClick={()=>setEditalId(e.id)}>{e.name}</button>
          ))}
        </div>
      )}
      {myPos >= 0 && (
        <div style={{background:"var(--green-d)",border:"1.5px solid var(--green)",borderRadius:12,padding:"14px 18px",marginBottom:20,display:"flex",alignItems:"center",gap:16}}>
          <div style={{fontSize:32}}>{posEmoji(myPos)||`#${myPos+1}`}</div>
          <div>
            <div style={{fontFamily:"Cabinet Grotesk",fontWeight:900,fontSize:18,color:"var(--green)"}}>Você está em {myPos===0?"1º lugar":`${myPos+1}º lugar`}!</div>
            <div style={{fontSize:12,color:"var(--t2)",marginTop:2}}>{ranking[myPos].xp} XP · {ranking[myPos].aulas} aulas concluídas</div>
          </div>
        </div>
      )}
      <div className="card">
        <div className="card-title" style={{marginBottom:16}}>{edital.name}</div>
        {ranking.length === 0 ? (
          <p className="text-muted text-sm">Nenhum colega com plano neste edital ainda.</p>
        ) : (
          <table className="rank-table">
            <thead>
              <tr>
                <th style={{width:50}}>#</th>
                <th>Aluno</th>
                <th>Nível</th>
                <th>XP</th>
                <th>Aulas</th>
                <th>🔥</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r, i) => (
                <tr key={r.aluno.id} style={r.isMe ? {background:"var(--green-d)"} : {}}>
                  <td><div className={`rank-pos ${posClass(i)}`}>{posEmoji(i)||`${i+1}`}</div></td>
                  <td>
                    <div className="fw6" style={r.isMe?{color:"var(--green)"}:{}}>{r.aluno.name}{r.isMe&&" (você)"}</div>
                  </td>
                  <td><span className="badge bn">{r.nivel.emoji} {r.nivel.name}</span></td>
                  <td><span style={{fontFamily:"Cabinet Grotesk",fontWeight:900,color:"var(--purple)"}}>{r.xp}</span></td>
                  <td><span style={{fontFamily:"Cabinet Grotesk",fontWeight:700,color:"var(--green)"}}>{r.aulas}</span></td>
                  <td><span style={{fontFamily:"Cabinet Grotesk",fontWeight:700,color:"var(--amber)"}}>{r.streak}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================
// COACH: Upload de Conteúdo/Materiais
// ============================================================
function CoachConteudo({ user, refresh }) {
  const editais = editaisModule.getByCoach(user.id);
  const [editalId, setEditalId] = useState(editais[0]?.id || "");
  const [selectedEditaisForUpload, setSelectedEditaisForUpload] = useState(new Set([editais[0]?.id || ""]));
  const [urlInput, setUrlInput] = useState({});
  const [fileTypeInput, setFileTypeInput] = useState({});
  const [savingUrl, setSavingUrl] = useState({});
  const [urlError, setUrlError] = useState("");
  const [urlSuccess, setUrlSuccess] = useState("");

  const toggleEditalSelection = (editalIdToToggle) => {
    const newSelected = new Set(selectedEditaisForUpload);
    if (newSelected.has(editalIdToToggle)) {
      newSelected.delete(editalIdToToggle);
    } else {
      newSelected.add(editalIdToToggle);
    }
    setSelectedEditaisForUpload(newSelected);
  };

  const edital = editaisModule.getById(editalId);

  const handleSaveUrl = (topicId, topicName) => {
    const url = urlInput[topicId]?.trim();
    const fileType = fileTypeInput[topicId]?.trim() || "Material";

    if (!url) {
      setUrlError("Insira um URL válido");
      setTimeout(() => setUrlError(""), 3000);
      return;
    }

    if (selectedEditaisForUpload.size === 0) {
      setUrlError("Selecione pelo menos um edital");
      setTimeout(() => setUrlError(""), 3000);
      return;
    }

    setSavingUrl(s => ({ ...s, [topicId]: true }));
    setUrlError("");
    setUrlSuccess("");

    try {
      // Extrair o nome do arquivo do URL
      const filename = url.split('/').pop() || url;
      const newFile = { url, filename, type: fileType, addedAt: new Date().toISOString() };

      // Buscar ou criar entrada de materiais para este tópico em MÚLTIPLOS editais
      const materiais = storage.get().materiais || [];

      // Para cada edital selecionado, salvar o arquivo
      selectedEditaisForUpload.forEach(selectedEditalId => {
        let existing = materiais.find(m => m.topicId === topicId && m.editalId === selectedEditalId);

        if (existing) {
          // Adicionar à lista de arquivos existente
          existing.files = existing.files || [];
          existing.files.push(newFile);
        } else {
          // Criar novo registro
          materiais.push({
            topicId,
            editalId: selectedEditalId,
            topicName,
            files: [newFile]
          });
        }
      });

      storage.get().materiais = materiais;
      persistToSupabase(storage.get());

      const editaisCount = selectedEditaisForUpload.size;
      setUrlSuccess(`Arquivo "${fileType}" adicionado em ${editaisCount} edital${editaisCount > 1 ? 'is' : ''}!`);
      setTimeout(() => setUrlSuccess(""), 3000);
      setUrlInput(u => ({ ...u, [topicId]: "" }));
      setFileTypeInput(u => ({ ...u, [topicId]: "" }));
      refresh?.();
    } catch (err) {
      setUrlError(`Erro: ${err.message}`);
    } finally {
      setSavingUrl(s => ({ ...s, [topicId]: false }));
    }
  };

  const handleRemoveFile = (topicId, fileIndex) => {
    const materiais = storage.get().materiais || [];
    const existing = materiais.find(m => m.topicId === topicId && m.editalId === editalId);

    if (existing) {
      existing.files = existing.files || [];
      existing.files.splice(fileIndex, 1);

      // Se não houver mais arquivos, remover o registro
      if (existing.files.length === 0) {
        const filtered = materiais.filter(m => !(m.topicId === topicId && m.editalId === editalId));
        storage.get().materiais = filtered;
      } else {
        storage.get().materiais = materiais;
      }

      persistToSupabase(storage.get());
      refresh?.();
    }
  };

  const getMaterialsList = (topicId) => {
    const materiais = storage.get().materiais || [];
    const existing = materiais.find(m => m.topicId === topicId && m.editalId === editalId);
    return existing?.files || [];
  };

  return (
    <div>
      <div className="ph"><div><h1>📚 Conteúdo</h1><p>Adicione links de materiais por tópico</p></div></div>

      {urlSuccess && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          background: 'var(--green-d)',
          color: 'var(--green)',
          marginBottom: 16,
          fontSize: 13,
          fontWeight: 600
        }}>✓ {urlSuccess}</div>
      )}

      {urlError && (
        <div style={{
          padding: '12px 16px',
          borderRadius: 8,
          background: 'var(--red-d)',
          color: 'var(--red)',
          marginBottom: 16,
          fontSize: 13,
          fontWeight: 600
        }}>✗ {urlError}</div>
      )}

      <div style={{ marginBottom: 20, padding: 16, borderRadius: 10, background: "var(--s2)", border: "1px solid var(--b1)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t2)", marginBottom: 12 }}>
          📚 Selecione os editais para este conteúdo:
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {editais.map(e => (
            <label
              key={e.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 8,
                border: `1.5px solid ${selectedEditaisForUpload.has(e.id) ? "var(--green)" : "var(--b2)"}`,
                background: selectedEditaisForUpload.has(e.id) ? "var(--green-d)" : "var(--s1)",
                cursor: "pointer",
                transition: "all 0.15s"
              }}
            >
              <input
                type="checkbox"
                checked={selectedEditaisForUpload.has(e.id)}
                onChange={() => toggleEditalSelection(e.id)}
                style={{ cursor: "pointer", width: 18, height: 18 }}
              />
              <span style={{ color: selectedEditaisForUpload.has(e.id) ? "var(--green)" : "var(--t1)", fontWeight: 600, fontSize: 13 }}>
                {e.name}
              </span>
            </label>
          ))}
        </div>
      </div>

      {!edital ? (
        <div className="card"><div className="empty"><h3>Nenhum edital</h3></div></div>
      ) : (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 20 }}>{edital.name}</div>

          {edital.materias?.length === 0 ? (
            <p className="text-muted text-sm">Nenhuma matéria neste edital.</p>
          ) : (
            <div style={{ display: "grid", gap: 24 }}>
              {edital.materias.map(materia => (
                <div key={materia.id} style={{ borderLeft: `4px solid ${materia.color}`, paddingLeft: 16 }}>
                  <h3 style={{ margin: "0 0 12px 0", fontSize: 15, fontWeight: 700, color: "var(--t1)" }}>
                    {materia.name}
                  </h3>

                  <div style={{ display: "grid", gap: 12 }}>
                    {materia.topicos?.map(topic => {
                      const files = getMaterialsList(topic.id);
                      return (
                        <div
                          key={topic.id}
                          style={{
                            padding: 12,
                            borderRadius: 8,
                            background: "var(--s2)",
                            border: `1px solid ${files.length > 0 ? "var(--green)" : "var(--b2)"}`,
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--t1)", marginBottom: 12 }}>
                            {topic.name}
                          </div>

                          {/* Lista de arquivos */}
                          {files.length > 0 && (
                            <div style={{ marginBottom: 12, display: "grid", gap: 8 }}>
                              {files.map((file, idx) => (
                                <div
                                  key={idx}
                                  style={{
                                    padding: 8,
                                    borderRadius: 6,
                                    background: "var(--s3)",
                                    border: "1px solid var(--green)",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                    gap: 8
                                  }}
                                >
                                  <div style={{ fontSize: 11, flex: 1 }}>
                                    <div style={{ fontWeight: 600, color: "var(--green)", marginBottom: 2 }}>
                                      {file.type}
                                    </div>
                                    <div style={{ color: "var(--t3)", wordBreak: "break-all" }}>
                                      {file.filename}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => handleRemoveFile(topic.id, idx)}
                                    style={{
                                      padding: "4px 8px",
                                      borderRadius: 4,
                                      border: "none",
                                      background: "var(--red-d)",
                                      color: "var(--red)",
                                      fontSize: 11,
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      whiteSpace: "nowrap",
                                      flexShrink: 0
                                    }}
                                  >
                                    🗑️
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Formulário para adicionar novo arquivo */}
                          <div style={{ display: "grid", gap: 8 }}>
                            <input
                              type="text"
                              placeholder="Tipo do arquivo (ex: Lei, Resumo, Aula)"
                              value={fileTypeInput[topic.id] || ""}
                              onChange={(e) => setFileTypeInput(u => ({ ...u, [topic.id]: e.target.value }))}
                              style={{
                                padding: "8px 10px",
                                borderRadius: 6,
                                border: "1px solid var(--b2)",
                                background: "var(--s3)",
                                color: "var(--t1)",
                                fontSize: 12,
                                fontFamily: "inherit"
                              }}
                            />
                            <div style={{ display: "flex", gap: 8 }}>
                              <input
                                type="text"
                                placeholder="Colar link do arquivo (ex: https://...)"
                                value={urlInput[topic.id] || ""}
                                onChange={(e) => setUrlInput(u => ({ ...u, [topic.id]: e.target.value }))}
                                style={{
                                  flex: 1,
                                  padding: "8px 10px",
                                  borderRadius: 6,
                                  border: "1px solid var(--b2)",
                                  background: "var(--s3)",
                                  color: "var(--t1)",
                                  fontSize: 12,
                                  fontFamily: "inherit"
                                }}
                              />
                              <button
                                onClick={() => handleSaveUrl(topic.id, topic.name)}
                                disabled={savingUrl[topic.id]}
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: 6,
                                  border: "none",
                                  background: "var(--blue)",
                                  color: "white",
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: savingUrl[topic.id] ? "not-allowed" : "pointer",
                                  opacity: savingUrl[topic.id] ? 0.6 : 1,
                                  transition: "all 0.15s",
                                  whiteSpace: "nowrap"
                                }}
                              >
                                {savingUrl[topic.id] ? "⏳" : "➕"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// COACH: Resumos de Alunos
// ============================================================
function CoachResumos({ user, refresh }) {
  const alunos = usersModule.getAlunos(user.id);
  const editaisCoach = editaisModule.getByCoach(user.id);
  const [alunoId, setAlunoId] = useState(alunos[0]?.id || "");
  const [editalId, setEditalId] = useState(editaisCoach[0]?.id || "");
  const [expandedTopic, setExpandedTopic] = useState(null);
  const [editComment, setEditComment] = useState({});
  const [editAddition, setEditAddition] = useState({});
  const [savingState, setSavingState] = useState({});
  const [modalMarcarData, setModalMarcarData] = useState(null); // { topicId, scheduledDate }
  const [dataRealizacao, setDataRealizacao] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const aluno = alunos.find(a => a.id === alunoId);
  const edital = editaisCoach.find(e => e.id === editalId);
  const plano = storage.get().planos.find(p => p.alunoId === alunoId && p.editalId === editalId);

  const getAllTopics = () => {
    if (!edital) return [];
    const topics = [];
    edital.materias?.forEach(mat => {
      mat.topicos?.forEach(topic => {
        topics.push({ ...topic, materiaId: mat.id, materiaName: mat.name, materiaColor: mat.color });
      });
    });
    return topics;
  };

  const allTopics = getAllTopics();

  const saveComment = (topicId) => {
    if (!plano) return;
    const comment = editComment[topicId] || "";
    setSavingState(s => ({ ...s, [topicId]: true }));
    resumoModule.saveCoachComment(alunoId, plano.id, topicId, user.id, comment);
    persistToSupabase(storage.get());
    setTimeout(() => {
      setSavingState(s => ({ ...s, [topicId]: false }));
      setEditComment(c => ({ ...c, [topicId]: "" }));
      refresh?.();
    }, 300);
  };

  const saveAddition = (topicId) => {
    if (!plano) return;
    const addition = editAddition[topicId] || "";
    setSavingState(s => ({ ...s, [`add-${topicId}`]: true }));
    resumoModule.saveCoachAddition(alunoId, plano.id, topicId, user.id, addition);
    persistToSupabase(storage.get());
    setTimeout(() => {
      setSavingState(s => ({ ...s, [`add-${topicId}`]: false }));
      setEditAddition(a => ({ ...a, [topicId]: "" }));
      refresh?.();
    }, 300);
  };

  const marcarConcluida = (topicId) => {
    if (!plano) return;
    // Find the scheduled date for this topic in the plan
    let dateKey = null;
    Object.entries(plano.plan || {}).forEach(([dk, day]) => {
      if (day.topicos?.find(t => t.id === topicId)) dateKey = dk;
    });
    // Fall back to today if not found in plan
    if (!dateKey) dateKey = localDateKey();

    // Open modal to select completion date
    setModalMarcarData({ topicId, scheduledDate: dateKey });
    setDataRealizacao(dateKey); // Default to scheduled date
  };

  const confirmarMarcarConcluida = () => {
    if (!modalMarcarData || !plano) return;
    const { topicId } = modalMarcarData;
    const dataParaUsar = dataRealizacao || modalMarcarData.scheduledDate;

    progressoModule.saveDone(alunoId, plano.id, `${dataParaUsar}-${topicId}`);
    // Ensure reviews are scheduled from the lesson date (re-create if missing)
    const topicObj = Object.values(plano.plan || {}).flatMap(d => d.topicos).find(t => t.id === topicId);
    if (topicObj) {
      storage.set(db => {
        const planos = db.planos.map(p => {
          if (p.id !== plano.id) return p;
          const np = JSON.parse(JSON.stringify(p.plan));
          const lessonDate = new Date(dataParaUsar + "T12:00:00");
          const intervals = REVIEW_PRESETS[topicObj.materiaReviewPreset || "moderada"] || REVIEW_INTERVALS;
          intervals.forEach(interval => {
            const rd = new Date(lessonDate); rd.setDate(rd.getDate() + interval);
            const rk = localDateKey(rd);
            if (!np[rk]) np[rk] = { date: rk, topicos: [], reviews: [] };
            if (!np[rk].reviews.find(r => r.id === topicId))
              np[rk].reviews.push({ ...topicObj, reviewInterval: interval });
          });
          return { ...p, plan: np };
        });
        return { ...db, planos };
      });
    }
    persistToSupabase(storage.get());
    setModalMarcarData(null);
    setDataRealizacao("");

    // Show success message
    const topicName = allTopics.find(t => t.id === topicId)?.name || "Aula";
    setSuccessMessage(`✅ ${topicName} marcada como concluída em ${new Date(dataParaUsar + "T12:00:00").toLocaleDateString("pt-BR")}`);
    setTimeout(() => setSuccessMessage(""), 4000);

    // Force a state update to re-render the component
    setExpandedTopic(null);
    setTimeout(() => {
      refresh?.();
    }, 100);
  };

  return (
    <div>
      <div className="ph"><div><h1>✍️ Resumos</h1><p>Visualize e comente os resumos dos alunos</p></div></div>

      {successMessage && (
        <div style={{
          padding: '14px 16px',
          borderRadius: 8,
          background: 'var(--green-d)',
          color: 'var(--green)',
          marginBottom: 16,
          fontSize: 13,
          fontWeight: 600,
          border: '1px solid var(--green)',
          animation: 'fadeIn 0.3s ease'
        }}>
          {successMessage}
        </div>
      )}

      <div style={{ display: "flex", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 250 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--t2)" }}>
            Selecione um aluno:
          </label>
          <select
            value={alunoId}
            onChange={(e) => setAlunoId(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--b2)",
              background: "var(--s2)",
              color: "var(--t1)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer"
            }}
          >
            {alunos.map(a => (
              <option key={a.id} value={a.id}>{a.name} ({a.email})</option>
            ))}
          </select>
        </div>

        {editaisCoach.length > 1 && (
          <div style={{ flex: 1, minWidth: 250 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--t2)" }}>
              Selecione um edital:
            </label>
            <select
              value={editalId}
              onChange={(e) => setEditalId(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--b2)",
                background: "var(--s2)",
                color: "var(--t1)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer"
              }}
            >
              {editaisCoach.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!aluno || !edital || !plano ? (
        <div className="card"><div className="empty"><h3>Nenhum plano ativo para este aluno neste edital</h3></div></div>
      ) : (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 20 }}>{aluno.name} — {edital.name}</div>

          {allTopics.length === 0 ? (
            <p className="text-muted text-sm">Nenhum tópico neste edital.</p>
          ) : (
            <div style={{ display: "grid", gap: 16 }}>
              {allTopics.filter(topic => {
                const studentNote = progressoModule.getNote(alunoId, plano.id, topic.id);
                return studentNote.trim().length > 0;
              }).length === 0 ? (
                <p className="text-muted text-sm">Nenhum resumo enviado pelos alunos ainda.</p>
              ) : (
                <>
                  {allTopics.filter(topic => {
                    const studentNote = progressoModule.getNote(alunoId, plano.id, topic.id);
                    return studentNote.trim().length > 0;
                  }).map(topic => {
                    const studentNote = progressoModule.getNote(alunoId, plano.id, topic.id);
                    const coachComment = resumoModule.getCoachComment(alunoId, plano.id, topic.id);
                    const coachAddition = resumoModule.getCoachAddition(alunoId, plano.id, topic.id);
                    const isExpanded = expandedTopic === topic.id;
                    const hasResume = studentNote.trim().length > 0;
                    // Check if lesson is marked done (search all possible dates in the plan)
                    const isDoneAula = plano ? Object.entries(plano.plan || {}).some(([dk]) =>
                      progressoModule.isDone(alunoId, plano.id, `${dk}-${topic.id}`)
                    ) : false;

                return (
                  <div
                    key={topic.id}
                    style={{
                      borderLeft: `4px solid ${topic.materiaColor}`,
                      paddingLeft: 16,
                      paddingTop: 12,
                      paddingRight: 12,
                      paddingBottom: 12,
                      borderRadius: 8,
                      background: "var(--s2)",
                      cursor: "pointer",
                      transition: "all 0.15s"
                    }}
                    onClick={() => setExpandedTopic(isExpanded ? null : topic.id)}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", marginBottom: 4 }}>
                          {topic.name}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 4 }}>
                          {topic.materiaName}
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 600 }}>
                          {hasResume ? (
                            <span style={{ color: "var(--green)" }}>✓ Resumo enviado</span>
                          ) : (
                            <span style={{ color: "var(--t3)" }}>○ Sem resumo</span>
                          )}
                          {isDoneAula ? (
                            <span style={{ marginLeft: 12, color: "var(--green)" }}>✅ Concluída</span>
                          ) : (
                            <span style={{ marginLeft: 12, color: "var(--amber)" }}>⏳ Pendente</span>
                          )}
                          {coachComment && <span style={{ marginLeft: 12, color: "var(--blue)" }}>💬 Comentário</span>}
                          {coachAddition && <span style={{ marginLeft: 12, color: "var(--amber)" }}>➕ Complementado</span>}
                        </div>
                      </div>
                      <div style={{ fontSize: 18, transition: "all 0.2s" }}>
                        {isExpanded ? "▼" : "▶"}
                      </div>
                    </div>

                    {isExpanded && (
                      <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--b2)" }} onClick={(e) => e.stopPropagation()}>
                        {/* Resumo do Aluno */}
                        {hasResume ? (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", marginBottom: 8 }}>
                              📝 Resumo do Aluno:
                            </div>
                            <div
                              style={{
                                padding: 12,
                                borderRadius: 6,
                                background: "var(--s3)",
                                fontSize: 13,
                                color: "var(--t1)",
                                lineHeight: 1.5,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-word",
                                maxHeight: 200,
                                overflowY: "auto",
                                marginBottom: 12
                              }}
                            >
                              {studentNote}
                            </div>
                          </div>
                        ) : (
                          <div style={{ padding: 12, borderRadius: 6, background: "var(--s3)", fontSize: 12, color: "var(--t3)", marginBottom: 16 }}>
                            O aluno ainda não enviou um resumo para este tópico.
                          </div>
                        )}

                        {/* Comentário do Coach */}
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", marginBottom: 8 }}>
                            💬 Seu Comentário:
                          </div>
                          <textarea
                            value={editComment[topic.id] || coachComment}
                            onChange={(e) => setEditComment(c => ({ ...c, [topic.id]: e.target.value }))}
                            placeholder="Adicione seu comentário sobre a qualidade do resumo..."
                            style={{
                              width: "100%",
                              minHeight: 80,
                              padding: 10,
                              borderRadius: 6,
                              border: "1px solid var(--b2)",
                              background: "var(--s3)",
                              color: "var(--t1)",
                              fontSize: 12,
                              fontFamily: "inherit",
                              marginBottom: 8,
                              resize: "vertical"
                            }}
                          />
                          <button
                            onClick={(e) => { e.stopPropagation(); saveComment(topic.id); }}
                            disabled={savingState[topic.id]}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 6,
                              border: "none",
                              background: "var(--blue)",
                              color: "white",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: savingState[topic.id] ? "not-allowed" : "pointer",
                              opacity: savingState[topic.id] ? 0.6 : 1,
                              transition: "all 0.15s"
                            }}
                          >
                            {savingState[topic.id] ? "💾 Salvando..." : "💾 Salvar Comentário"}
                          </button>
                        </div>

                        {/* Marcar como concluída */}
                        {!isDoneAula && hasResume && (
                          <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "rgba(34,197,94,0.08)", border: "1px solid var(--green)" }}>
                            <div style={{ fontSize: 12, color: "var(--t2)", marginBottom: 8 }}>
                              O aluno enviou o resumo mas a aula ainda não está marcada como concluída no plano.
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); marcarConcluida(topic.id); }}
                              style={{
                                padding: "6px 14px", borderRadius: 6, border: "none",
                                background: "var(--green)", color: "white",
                                fontSize: 12, fontWeight: 700, cursor: "pointer"
                              }}
                            >
                              ✅ Marcar como Concluída
                            </button>
                          </div>
                        )}

                        {/* Complemento do Coach */}
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--t1)", marginBottom: 8 }}>
                            ➕ Complementar Resumo:
                          </div>
                          <textarea
                            value={editAddition[topic.id] || coachAddition}
                            onChange={(e) => setEditAddition(a => ({ ...a, [topic.id]: e.target.value }))}
                            placeholder="Adicione conteúdo adicional ou correções ao resumo..."
                            style={{
                              width: "100%",
                              minHeight: 80,
                              padding: 10,
                              borderRadius: 6,
                              border: "1px solid var(--b2)",
                              background: "var(--s3)",
                              color: "var(--t1)",
                              fontSize: 12,
                              fontFamily: "inherit",
                              marginBottom: 8,
                              resize: "vertical"
                            }}
                          />
                          <button
                            onClick={(e) => { e.stopPropagation(); saveAddition(topic.id); }}
                            disabled={savingState[`add-${topic.id}`]}
                            style={{
                              padding: "6px 12px",
                              borderRadius: 6,
                              border: "none",
                              background: "var(--amber)",
                              color: "white",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: savingState[`add-${topic.id}`] ? "not-allowed" : "pointer",
                              opacity: savingState[`add-${topic.id}`] ? 0.6 : 1,
                              transition: "all 0.15s"
                            }}
                          >
                            {savingState[`add-${topic.id}`] ? "💾 Salvando..." : "💾 Salvar Complemento"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal — Marcar Conclusão com Data */}
      {modalMarcarData && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9999
        }} onClick={() => setModalMarcarData(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--s1)", borderRadius: 12, padding: "24px 20px", maxWidth: 400,
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 16, color: "var(--t1)" }}>
              ✅ Marcar como Concluída
            </div>
            <p style={{ fontSize: 13, color: "var(--t2)", marginBottom: 14 }}>
              Em qual data o aluno concluiu esta aula?
            </p>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--t2)", marginBottom: 8 }}>
                Data de Conclusão:
              </label>
              <input
                type="date"
                value={dataRealizacao}
                onChange={(e) => setDataRealizacao(e.target.value)}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 8,
                  border: "1.5px solid var(--b2)", background: "var(--s2)",
                  color: "var(--t1)", fontSize: 13, fontWeight: 500
                }}
              />
              {dataRealizacao && (
                <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 6 }}>
                  📅 {new Date(dataRealizacao + "T12:00:00").toLocaleDateString("pt-BR")}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => {
                  setModalMarcarData(null);
                  setDataRealizacao("");
                }}
                style={{
                  flex: 1, padding: "10px 12px", borderRadius: 8,
                  border: "1.5px solid var(--b2)", background: "var(--s2)",
                  color: "var(--t1)", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", transition: "all 0.15s"
                }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarMarcarConcluida}
                style={{
                  flex: 1, padding: "10px 12px", borderRadius: 8,
                  border: "none", background: "var(--green)",
                  color: "white", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", transition: "all 0.15s"
                }}
              >
                ✅ Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// COACH: Simulados
// ============================================================
function CoachSimulados({ user, refresh }) {
  const editais = editaisModule.getByCoach(user.id);
  const [editalId, setEditalId] = useState(editais[0]?.id || "");
  const [criando, setCriando] = useState(false);
  const [selecionado, setSelecionado] = useState(null);
  const alunos = usersModule.getAlunos(user.id);

  const edital = editaisModule.getById(editalId);
  const simulados = edital ? simuladosModule.getByEdital(editalId) : [];

  return (
    <div>
      <div className="ph"><div><h1>📝 Simulados</h1><p>Crie e gerencie simulados para seus alunos</p></div></div>

      <div style={{ display: "flex", gap: 16, marginBottom: 24, alignItems: "flex-end", flexWrap: "wrap" }}>
        {editais.length > 1 && (
          <div style={{ flex: 1, minWidth: 250 }}>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--t2)" }}>
              Selecione um edital:
            </label>
            <select
              value={editalId}
              onChange={(e) => setEditalId(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--b2)",
                background: "var(--s2)",
                color: "var(--t1)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer"
              }}
            >
              {editais.map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
        )}

        <button
          onClick={() => setCriando(true)}
          style={{
            padding: "10px 16px",
            borderRadius: 6,
            border: "none",
            background: "var(--blue)",
            color: "white",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer"
          }}
        >
          + Novo Simulado
        </button>
      </div>

      {!edital ? (
        <div className="card"><div className="empty"><h3>Nenhum edital disponível</h3></div></div>
      ) : simulados.length === 0 ? (
        <div className="card"><div className="empty"><h3>Nenhum simulado criado ainda</h3></div></div>
      ) : (
        <div className="card">
          <div className="card-title" style={{ marginBottom: 20 }}>Simulados de {edital.name}</div>
          <div style={{ display: "grid", gap: 12 }}>
            {simulados.map(sim => {
              const questoes = questoesModule.getBySimulado(sim.id);
              const tentativas = (storage.get().tentativas || []).filter(t => t.simuladoId === sim.id);
              const finalizadas = tentativas.filter(t => t.status === "finalizada");

              return (
                <div
                  key={sim.id}
                  style={{
                    padding: 16,
                    borderRadius: 8,
                    background: "var(--s2)",
                    border: "1px solid var(--b2)",
                    cursor: "pointer",
                    transition: "all 0.15s"
                  }}
                  onClick={() => setSelecionado(sim.id)}
                  onMouseOver={(e) => { e.currentTarget.style.borderColor = "var(--blue)"; }}
                  onMouseOut={(e) => { e.currentTarget.style.borderColor = "var(--b2)"; }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--t1)", marginBottom: 4 }}>
                        {sim.nome}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--t3)", marginBottom: 8 }}>
                        {sim.tipo === "geral" ? "Simulado Geral" : "Simulado Específico"}
                        {sim.descricao && ` • ${sim.descricao}`}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--t2)" }}>
                        {questoes.length} questão{questoes.length !== 1 ? 's' : ''} • {finalizadas.length} tentativa{finalizadas.length !== 1 ? 's' : ''} realizadas
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (await confirmar({ titulo: "Deletar simulado?", mensagem: `Tem certeza que deseja deletar o simulado "${sim.nome}"? Todas as questões e tentativas serão removidas.`, tipo: "destrutivo" })) {
                            simuladosModule.delete(sim.id);
                            refresh?.();
                          }
                        }}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 6,
                          border: "none",
                          background: "var(--red)",
                          color: "white",
                          fontSize: 11,
                          cursor: "pointer",
                          transition: "all 0.15s"
                        }}
                        onMouseOver={(e) => { e.target.style.opacity = "0.8"; }}
                        onMouseOut={(e) => { e.target.style.opacity = "1"; }}
                      >
                        🗑️ Deletar
                      </button>
                      <div style={{ fontSize: 18 }}>▶</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {criando && (
        <ModalCriarSimulado
          editalId={editalId}
          coachId={user.id}
          alunos={alunos}
          onClose={() => { setCriando(false); refresh?.(); }}
        />
      )}

      {selecionado && (
        <ModalGerenciarSimulado
          simuladoId={selecionado}
          coachId={user.id}
          onClose={() => { setSelecionado(null); refresh?.(); }}
        />
      )}
    </div>
  );
}

// Modal para criar simulado
function ModalCriarSimulado({ editalId, coachId, alunos, onClose }) {
  const edital = editaisModule.getById(editalId);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("geral");
  const [materiaId, setMateriaId] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tempoLimite, setTempoLimite] = useState("");
  const [temTextoMotivador, setTemTextoMotivador] = useState(false);
  const [textoMotivador, setTextoMotivador] = useState("");
  const [numQuestoes, setNumQuestoes] = useState(1);
  const [destinatario, setDestinatario] = useState("todos"); // "todos" | "especificos"
  const [alunosSelecionados, setAlunosSelecionados] = useState([]);

  function toggleAluno(id) {
    setAlunosSelecionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  const materia = edital?.materias?.find(m => m.id === materiaId);
  const ehLinguaPortuguesa = materia?.name?.includes("Língua Portuguesa") || materia?.name?.includes("Português");

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000
    }}>
      <div style={{
        background: "var(--s1)", padding: 24, borderRadius: 12, maxWidth: 450, width: "90%"
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--t1)", marginBottom: 20 }}>
          Novo Simulado
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--t2)" }}>
            Nome do simulado:
          </label>
          <input
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="ex: Simulado de Direito Constitucional"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid var(--b2)",
              background: "var(--s2)",
              color: "var(--t1)",
              fontSize: 13
            }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--t2)" }}>
            Tipo:
          </label>
          <div style={{ display: "flex", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="radio"
                checked={tipo === "geral"}
                onChange={() => setTipo("geral")}
              />
              <span style={{ fontSize: 13, color: "var(--t1)" }}>Geral</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="radio"
                checked={tipo === "especifico"}
                onChange={() => setTipo("especifico")}
              />
              <span style={{ fontSize: 13, color: "var(--t1)" }}>Específico</span>
            </label>
          </div>
        </div>

        {tipo === "especifico" && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--t2)" }}>
                Matéria:
              </label>
              <select
                value={materiaId}
                onChange={(e) => setMateriaId(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--b2)",
                  background: "var(--s2)",
                  color: "var(--t1)",
                  fontSize: 13
                }}
              >
                <option value="">Selecione uma matéria</option>
                {edital?.materias?.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            {ehLinguaPortuguesa && (
              <div style={{ marginBottom: 16, padding: 12, borderRadius: 6, background: "var(--s2)", border: "1px solid var(--b2)" }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: "var(--t1)" }}>
                  📚 Há um texto motivador para este simulado?
                </div>
                <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flex: 1 }}>
                    <input
                      type="radio"
                      checked={!temTextoMotivador}
                      onChange={() => { setTemTextoMotivador(false); setTextoMotivador(""); setNumQuestoes(1); }}
                    />
                    <span style={{ fontSize: 12, color: "var(--t1)" }}>Não</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flex: 1 }}>
                    <input
                      type="radio"
                      checked={temTextoMotivador}
                      onChange={() => setTemTextoMotivador(true)}
                    />
                    <span style={{ fontSize: 12, color: "var(--t1)" }}>Sim</span>
                  </label>
                </div>

                {temTextoMotivador && (
                  <>
                    <textarea
                      value={textoMotivador}
                      onChange={(e) => setTextoMotivador(e.target.value)}
                      placeholder="Cole aqui o texto motivador..."
                      style={{
                        width: "100%",
                        minHeight: 80,
                        padding: "10px 12px",
                        borderRadius: 6,
                        border: "1px solid var(--b2)",
                        background: "var(--s3)",
                        color: "var(--t1)",
                        fontSize: 12,
                        fontFamily: "inherit",
                        resize: "vertical",
                        marginBottom: 12
                      }}
                    />
                    <div>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--t2)" }}>
                        Quantas questões usarão este texto?
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={numQuestoes}
                        onChange={(e) => setNumQuestoes(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{
                          width: "100%",
                          padding: "8px 10px",
                          borderRadius: 6,
                          border: "1px solid var(--b2)",
                          background: "var(--s3)",
                          color: "var(--t1)",
                          fontSize: 12
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--t2)" }}>
            Descrição (opcional):
          </label>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            placeholder="ex: Simulado com questões de 2024"
            style={{
              width: "100%",
              minHeight: 60,
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid var(--b2)",
              background: "var(--s2)",
              color: "var(--t1)",
              fontSize: 13,
              fontFamily: "inherit",
              resize: "vertical"
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--t2)" }}>
            Tempo Limite (opcional, em minutos):
          </label>
          <input
            type="number"
            value={tempoLimite}
            onChange={(e) => setTempoLimite(e.target.value)}
            placeholder="ex: 60"
            min="0"
            style={{
              width: "100%",
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid var(--b2)",
              background: "var(--s2)",
              color: "var(--t1)",
              fontSize: 13
            }}
          />
          <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 6 }}>
            Deixe em branco para sem limite de tempo
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 8, color: "var(--t2)" }}>
            Quem pode responder este simulado?
          </label>
          <div style={{ display: "flex", gap: 16, marginBottom: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="radio" checked={destinatario === "todos"} onChange={() => { setDestinatario("todos"); setAlunosSelecionados([]); }} />
              <span style={{ fontSize: 13, color: "var(--t1)" }}>Todos os alunos</span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input type="radio" checked={destinatario === "especificos"} onChange={() => setDestinatario("especificos")} />
              <span style={{ fontSize: 13, color: "var(--t1)" }}>Alunos específicos</span>
            </label>
          </div>
          {destinatario === "especificos" && (
            <div style={{ maxHeight: 160, overflowY: "auto", border: "1px solid var(--b2)", borderRadius: 8, padding: "8px 12px", background: "var(--s2)", display: "flex", flexDirection: "column", gap: 6 }}>
              {(!alunos || alunos.length === 0) ? (
                <div style={{ fontSize: 12, color: "var(--t3)", padding: "8px 0" }}>Nenhum aluno cadastrado</div>
              ) : alunos.map(a => (
                <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "4px 0" }}>
                  <input
                    type="checkbox"
                    checked={alunosSelecionados.includes(a.id)}
                    onChange={() => toggleAluno(a.id)}
                  />
                  <span style={{ fontSize: 13, color: "var(--t1)" }}>{a.name}</span>
                </label>
              ))}
            </div>
          )}
          {destinatario === "especificos" && alunosSelecionados.length > 0 && (
            <div style={{ fontSize: 11, color: "var(--green)", marginTop: 6 }}>
              {alunosSelecionados.length} aluno{alunosSelecionados.length > 1 ? "s" : ""} selecionado{alunosSelecionados.length > 1 ? "s" : ""}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          <button
            onClick={() => {
              const permitidos = destinatario === "especificos" && alunosSelecionados.length > 0 ? alunosSelecionados : null;
              const sim = simuladosModule.create(coachId, editalId, nome, tipo, materiaId, descricao, permitidos);
              const updates = {};
              if (tempoLimite) {
                updates.tempoLimiteMinutos = parseInt(tempoLimite);
              }
              if (ehLinguaPortuguesa && temTextoMotivador && textoMotivador) {
                updates.textoMotivador = textoMotivador;
                updates.numQuestoes = numQuestoes;
              }
              if (ehLinguaPortuguesa) {
                updates.isPortuguese = true;
              }
              if (Object.keys(updates).length > 0) {
                simuladosModule.update(sim.id, updates);
              }
              onClose();
            }}
            disabled={!nome || (tipo === "especifico" && !materiaId) || (ehLinguaPortuguesa && temTextoMotivador && !textoMotivador)}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 6,
              border: "none",
              background: "var(--blue)",
              color: "white",
              fontSize: 13,
              fontWeight: 600,
              cursor: !nome || (tipo === "especifico" && !materiaId) || (ehLinguaPortuguesa && temTextoMotivador && !textoMotivador) ? "not-allowed" : "pointer",
              opacity: !nome || (tipo === "especifico" && !materiaId) || (ehLinguaPortuguesa && temTextoMotivador && !textoMotivador) ? 0.5 : 1
            }}
          >
            Criar
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid var(--b2)",
              background: "transparent",
              color: "var(--t2)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal para gerenciar simulado
function ModalGerenciarSimulado({ simuladoId, coachId, onClose }) {
  const simulado = simuladosModule.getById(simuladoId);
  const questoes = questoesModule.getBySimulado(simuladoId);
  const [adicionandoQuestao, setAdicionandoQuestao] = useState(false);
  const [tab, setTab] = useState("questoes"); // "questoes" | "resultados"
  const [feedbackTentativaId, setFeedbackTentativaId] = useState(null);
  const [relatorioTentativaId, setRelatorioTentativaId] = useState(null);
  const [tick, setTick] = useState(0);
  const [questaoIdx, setQuestaoIdx] = useState(0);
  const tentativas = (storage.get().tentativas || []).filter(t => t.simuladoId === simuladoId && t.status === "finalizada");
  const alunos = usersModule.getAlunos(coachId);

  if (!simulado) return null;

  const qi = Math.min(questaoIdx, Math.max(0, questoes.length - 1));
  const questaoAtual = questoes[qi] || null;

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: "20px 12px"
    }}>
      <div style={{
        background: "var(--s1)", borderRadius: 12, maxWidth: 600, width: "90%",
        display: "flex", flexDirection: "column", maxHeight: "90vh", overflow: "hidden"
      }} onClick={(e) => e.stopPropagation()}>
        {/* Header fixo */}
        <div style={{ padding: "20px 24px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--t1)" }}>
              {simulado.nome}
            </div>
            <div style={{ fontSize: 12, color: "var(--t3)" }}>
              {questoes.length} questão{questoes.length !== 1 ? 's' : ''}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "none",
              background: "var(--b2)",
              color: "var(--t1)",
              fontSize: 13,
              cursor: "pointer"
            }}
          >
            Fechar
          </button>
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 0, borderBottom: "1px solid var(--b2)", paddingBottom: 12 }}>
          <button
            onClick={() => setTab("questoes")}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: tab === "questoes" ? "var(--blue)" : "transparent",
              color: tab === "questoes" ? "white" : "var(--t2)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            📝 Questões ({questoes.length})
          </button>
          <button
            onClick={() => setTab("resultados")}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: tab === "resultados" ? "var(--blue)" : "transparent",
              color: tab === "resultados" ? "white" : "var(--t2)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer"
            }}
          >
            📊 Resultados ({tentativas.length})
          </button>
        </div>
        </div>{/* fim header fixo */}

        {/* Corpo com scroll */}
        <div style={{ overflowY: "auto", flex: 1, padding: "16px 24px 24px" }}>

        {tab === "questoes" && (
          <div>
            {/* Botão adicionar */}
            <div style={{ marginBottom: 14 }}>
              <button
                onClick={() => setAdicionandoQuestao(true)}
                style={{ padding: "8px 16px", borderRadius: 6, border: "none", background: "var(--green)", color: "white", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
              >
                + Adicionar Questão
              </button>
            </div>

            {questoes.length === 0 ? (
              <div style={{ padding: 16, borderRadius: 8, background: "var(--s2)", color: "var(--t3)", textAlign: "center" }}>
                Nenhuma questao adicionada ainda
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <button
                    onClick={() => setQuestaoIdx(prev => Math.max(0, prev - 1))}
                    disabled={qi === 0}
                    style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: qi === 0 ? "var(--s3)" : "var(--b2)", color: qi === 0 ? "var(--t3)" : "var(--t1)", fontSize: 13, fontWeight: 700, cursor: qi === 0 ? "default" : "pointer" }}
                  >Anterior</button>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--t2)" }}>
                    Questao {qi + 1} de {questoes.length}
                  </span>
                  <button
                    onClick={() => setQuestaoIdx(prev => Math.min(questoes.length - 1, prev + 1))}
                    disabled={qi === questoes.length - 1}
                    style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: qi === questoes.length - 1 ? "var(--s3)" : "var(--b2)", color: qi === questoes.length - 1 ? "var(--t3)" : "var(--t1)", fontSize: 13, fontWeight: 700, cursor: qi === questoes.length - 1 ? "default" : "pointer" }}
                  >Proxima</button>
                </div>
                {questaoAtual && (
                  <div style={{ padding: 16, borderRadius: 10, background: "var(--s2)", border: "1px solid var(--b2)" }}>
                    <div style={{ fontSize: 11, color: "var(--t3)", fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
                      {questaoAtual.tipo === "ce" ? "Certo ou Errado" : "Multipla Escolha"}
                    </div>
                    <div style={{ fontSize: 14, color: "var(--t1)", lineHeight: 1.6, marginBottom: 12 }}>
                      {questaoAtual.enunciado}
                    </div>
                    {questaoAtual.tipo === "multipla" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                        {(questaoAtual.alternativas || []).map((alt, idx) => {
                          const letra = String.fromCharCode(65 + idx);
                          const isGab = letra === questaoAtual.gabarito;
                          return (
                            <div key={idx} style={{ padding: "7px 12px", borderRadius: 7, background: isGab ? "var(--green-d)" : "var(--s3)", border: isGab ? "1px solid var(--green)" : "1px solid transparent", fontSize: 13, color: isGab ? "var(--green)" : "var(--t2)", display: "flex", gap: 8, alignItems: "center" }}>
                              <span style={{ fontWeight: 700, minWidth: 20 }}>{letra}.</span>
                              <span style={{ flex: 1 }}>{alt}</span>
                              {isGab && <span style={{ fontSize: 10, fontWeight: 700 }}>Gabarito</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {questaoAtual.tipo === "ce" && (
                      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                        {["C","E"].map(op => (
                          <div key={op} style={{ padding: "7px 18px", borderRadius: 7, background: op === questaoAtual.gabarito ? "var(--green-d)" : "var(--s3)", border: op === questaoAtual.gabarito ? "1px solid var(--green)" : "1px solid transparent", fontSize: 13, fontWeight: 700, color: op === questaoAtual.gabarito ? "var(--green)" : "var(--t2)" }}>
                            {op === "C" ? "Certo" : "Errado"}{op === questaoAtual.gabarito ? " (gabarito)" : ""}
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                      <button
                        onClick={async () => { if (await confirmar({ titulo: "Deletar questão?", mensagem: "Esta ação não pode ser desfeita.", tipo: "destrutivo" })) { questoesModule.delete(questaoAtual.id); setQuestaoIdx(prev => Math.max(0, prev - 1)); setTick(t=>t+1); } }}
                        style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: "var(--red)", color: "white", fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                      >Deletar Questao</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === "resultados" && (
          <div>
            {tentativas.length === 0 ? (
              <div style={{ padding: 16, borderRadius: 8, background: "var(--s2)", color: "var(--t3)", textAlign: "center" }}>
                Nenhuma tentativa realizada ainda
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {tentativas.map(tent => {
                  const aluno = alunos.find(a => a.id === tent.alunoId);
                  const minutos = Math.floor((tent.tempoDecorridoSegundos||0) / 60);
                  const segundos = (tent.tempoDecorridoSegundos||0) % 60;
                  const fb = feedbackModule.getByTentativa(tent.id);
                  const fbEnviado = fb?.status === "enviado";
                  const pct = questoes.length > 0 ? Math.round((tent.acertos / questoes.length) * 100) : 0;

                  return (
                    <div key={tent.id} style={{ padding: 14, borderRadius: 8, background: "var(--s2)", border: `1px solid ${fbEnviado ? "rgba(34,211,165,0.3)" : "var(--b2)"}` }}>
                      {/* Cabeçalho */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)", marginBottom: 2 }}>
                            {aluno?.name || "Aluno"}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--t3)" }}>
                            {new Date(tent.finishedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            {tent.tempoDecorridoSegundos ? ` · ⏱️ ${minutos}m ${segundos}s` : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                          <div style={{ fontSize: 20, fontWeight: 900, fontFamily: "Cabinet Grotesk", color: pct >= 60 ? "var(--green)" : "var(--red)" }}>
                            {tent.acertos}/{questoes.length}
                          </div>
                          <span className={`badge ${pct >= 60 ? "bg" : "br"}`}>{pct}%</span>
                        </div>
                      </div>

                      {/* Grid acertos/erros */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                        <div style={{ padding: 8, borderRadius: 6, background: "var(--s3)", textAlign: "center" }}>
                          <div style={{ fontSize: 11, color: "var(--green)", fontWeight: 700 }}>✓ Acertos</div>
                          <div style={{ fontSize: 18, fontWeight: 900, color: "var(--green)" }}>{tent.acertos}</div>
                        </div>
                        <div style={{ padding: 8, borderRadius: 6, background: "var(--s3)", textAlign: "center" }}>
                          <div style={{ fontSize: 11, color: "var(--red)", fontWeight: 700 }}>✗ Erros</div>
                          <div style={{ fontSize: 18, fontWeight: 900, color: "var(--red)" }}>{tent.erros}</div>
                        </div>
                      </div>

                      {/* Botões */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 10, borderTop: "1px solid var(--b2)", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 11, color: fbEnviado ? "var(--green)" : "var(--t3)", fontWeight: 600 }}>
                          {fbEnviado ? "✅ Feedback enviado ao aluno" : fb ? "📝 Rascunho salvo" : "⏳ Sem feedback ainda"}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button
                            onClick={() => setRelatorioTentativaId(tent.id)}
                            style={{
                              padding: "6px 14px", borderRadius: 6, border: "none",
                              background: fbEnviado ? "var(--green-d)" : "var(--blue-d)",
                              color: fbEnviado ? "var(--green)" : "var(--blue)",
                              fontSize: 12, fontWeight: 700, cursor: "pointer"
                            }}
                          >
                            {fbEnviado ? "✅ Ver Resultado Completo" : "🔍 Ver Resultado Completo"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        </div>{/* fim corpo com scroll */}

        {relatorioTentativaId && (
          <ModalResultadoCompleto
            tentativaId={relatorioTentativaId}
            coachId={coachId}
            questoes={questoes}
            alunos={alunos}
            onClose={() => { setRelatorioTentativaId(null); setTick(t=>t+1); }}
          />
        )}

        {adicionandoQuestao && (
          <ModalAdicionarQuestao
            simuladoId={simuladoId}
            onClose={() => { setAdicionandoQuestao(false); onClose(); }}
          />
        )}
      </div>
    </div>
  );
}

// Subcomponente para um formulário de questão individual
function FormQuestao({ index, data, onChange, textosUsados, comTextoMotivador }) {
  const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--b2)", background: "var(--s2)", color: "var(--t1)", fontSize: 12 };
  return (
    <div style={{ padding: 12, borderRadius: 8, background: "var(--s3)", border: "1px solid var(--b2)", marginBottom: 12 }}>
      {comTextoMotivador && (
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--blue)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
          Questão {index + 1}
        </div>
      )}

      <div style={{ marginBottom: 10 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4, color: "var(--t2)" }}>Tipo:</label>
        <div style={{ display: "flex", gap: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, color: "var(--t1)" }}>
            <input type="radio" checked={data.tipo === "ce"} onChange={() => onChange({ ...data, tipo: "ce", gabarito: "", alternativas: ["","","",""] })} />
            Certo ou Errado
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, color: "var(--t1)" }}>
            <input type="radio" checked={data.tipo === "multipla"} onChange={() => onChange({ ...data, tipo: "multipla", gabarito: "" })} />
            Múltipla Escolha
          </label>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4, color: "var(--t2)" }}>Enunciado:</label>
        <textarea
          value={data.enunciado}
          onChange={(e) => onChange({ ...data, enunciado: e.target.value })}
          placeholder="Digite o enunciado da questão..."
          style={{ ...inputStyle, minHeight: 70, fontFamily: "inherit", resize: "vertical" }}
        />
      </div>

      {data.tipo === "ce" ? (
        <div>
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 6, color: "var(--t2)" }}>Gabarito:</label>
          <div style={{ display: "flex", gap: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, color: "var(--t1)" }}>
              <input type="radio" checked={data.gabarito === "C"} onChange={() => onChange({ ...data, gabarito: "C" })} />
              Certo
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, color: "var(--t1)" }}>
              <input type="radio" checked={data.gabarito === "E"} onChange={() => onChange({ ...data, gabarito: "E" })} />
              Errado
            </label>
          </div>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4, color: "var(--t2)" }}>Alternativas:</label>
            {data.alternativas.map((alt, i) => (
              <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, color: "var(--t3)", minWidth: 18 }}>{String.fromCharCode(65 + i)}.</span>
                <input
                  type="text"
                  value={alt}
                  onChange={(e) => {
                    const alts = [...data.alternativas]; alts[i] = e.target.value;
                    onChange({ ...data, alternativas: alts });
                  }}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, marginBottom: 4, color: "var(--t2)" }}>Gabarito:</label>
            <select value={data.gabarito} onChange={(e) => onChange({ ...data, gabarito: e.target.value })} style={inputStyle}>
              <option value="">Selecione o gabarito</option>
              {data.alternativas.map((alt, i) => alt && (
                <option key={i} value={alt}>{String.fromCharCode(65 + i)}. {alt}</option>
              ))}
            </select>
          </div>
        </>
      )}
    </div>
  );
}

const questaoVazia = () => ({ tipo: "ce", enunciado: "", alternativas: ["", "", "", ""], gabarito: "" });

// Modal para adicionar questão
function ModalAdicionarQuestao({ simuladoId, onClose }) {
  const questoesExistentes = questoesModule.getBySimulado(simuladoId);
  const textosUsados = [...new Map(questoesExistentes.map(q => [q.textBase, q.textBase])).values()].filter(Boolean);

  // Etapa: "pergunta" → "formulario"
  const [etapa, setEtapa] = useState("pergunta");
  const [temTextoMotivador, setTemTextoMotivador] = useState(null); // null = não respondido
  const [textoMotivador, setTextoMotivador] = useState("");
  const [numQuestoes, setNumQuestoes] = useState(1);
  const [questoesData, setQuestoesData] = useState([questaoVazia()]);

  const atualizarNumQuestoes = (n) => {
    const num = Math.max(1, Math.min(20, n));
    setNumQuestoes(num);
    setQuestoesData(prev => {
      const novo = Array.from({ length: num }, (_, i) => prev[i] || questaoVazia());
      return novo;
    });
  };

  const atualizarQuestao = (i, data) => {
    setQuestoesData(prev => prev.map((q, idx) => idx === i ? data : q));
  };

  const todasValidas = () => {
    if (temTextoMotivador && !textoMotivador.trim()) return false;
    return questoesData.every(q => q.enunciado.trim() && q.gabarito);
  };

  const handleAdicionar = () => {
    questoesData.forEach(q => {
      const nova = questoesModule.create(simuladoId, q.tipo, q.enunciado, q.tipo === "multipla" ? q.alternativas : [], q.gabarito);
      if (temTextoMotivador && textoMotivador.trim()) {
        questoesModule.update(nova.id, { textBase: textoMotivador, numQuestoes });
      }
    });
    onClose();
  };

  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 6, border: "1px solid var(--b2)", background: "var(--s2)", color: "var(--t1)", fontSize: 13 };
  const btnStyle = (active) => ({ padding: "10px 20px", borderRadius: 8, border: active ? "2px solid var(--blue)" : "2px solid var(--b2)", background: active ? "var(--blue-d)" : "transparent", color: active ? "var(--blue)" : "var(--t2)", fontSize: 13, fontWeight: 700, cursor: "pointer", flex: 1, transition: "all 0.15s" });

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1001, overflowY: "auto", padding: "20px 0"
    }}>
      <div style={{
        background: "var(--s1)", padding: 24, borderRadius: 12, maxWidth: 540, width: "90%",
        margin: "auto", maxHeight: "90vh", overflowY: "auto"
      }} onClick={(e) => e.stopPropagation()}>

        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--t1)", marginBottom: 20 }}>
          {etapa === "pergunta" ? "Nova Questão" : temTextoMotivador ? `Questões do Texto Motivador` : "Nova Questão"}
        </div>

        {/* ETAPA 1: Pergunta sobre texto motivador */}
        {etapa === "pergunta" && (
          <>
            <div style={{ marginBottom: 20, padding: 16, borderRadius: 8, background: "var(--s2)", border: "1px solid var(--b2)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--t1)", marginBottom: 16 }}>
                📚 Esta questão possui texto motivador?
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <button onClick={() => { setTemTextoMotivador(false); setEtapa("formulario"); atualizarNumQuestoes(1); }} style={btnStyle(temTextoMotivador === false)}>
                  ✗ Não
                </button>
                <button onClick={() => setTemTextoMotivador(true)} style={btnStyle(temTextoMotivador === true)}>
                  ✓ Sim
                </button>
              </div>
            </div>

            {temTextoMotivador === true && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--t2)" }}>
                    Cole o texto motivador:
                  </label>
                  <textarea
                    value={textoMotivador}
                    onChange={(e) => setTextoMotivador(e.target.value)}
                    placeholder="Cole aqui o texto para interpretação..."
                    style={{ ...inputStyle, minHeight: 120, fontFamily: "inherit", resize: "vertical" }}
                  />
                </div>

                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--t2)" }}>
                    Quantas questões usarão este texto?
                  </label>
                  <input
                    type="number"
                    min="1" max="20"
                    value={numQuestoes}
                    onChange={(e) => atualizarNumQuestoes(parseInt(e.target.value) || 1)}
                    style={inputStyle}
                  />
                </div>

                <button
                  onClick={() => { atualizarNumQuestoes(numQuestoes); setEtapa("formulario"); }}
                  disabled={!textoMotivador.trim()}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 8, border: "none",
                    background: textoMotivador.trim() ? "var(--blue)" : "var(--b2)",
                    color: "white", fontSize: 13, fontWeight: 700, cursor: textoMotivador.trim() ? "pointer" : "not-allowed"
                  }}
                >
                  Continuar → Preencher {numQuestoes} Questão{numQuestoes > 1 ? "s" : ""}
                </button>
              </>
            )}
          </>
        )}

        {/* ETAPA 2: Formulário(s) de questão */}
        {etapa === "formulario" && (
          <>
            {temTextoMotivador && (
              <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: "var(--s2)", border: "1px solid var(--b2)" }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--t3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  📚 Texto Motivador
                </div>
                <div style={{ fontSize: 12, color: "var(--t1)", lineHeight: 1.6, maxHeight: 100, overflowY: "auto" }}>
                  {textoMotivador}
                </div>
                <button
                  onClick={() => setEtapa("pergunta")}
                  style={{ marginTop: 8, fontSize: 11, color: "var(--blue)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  ← Editar texto
                </button>
              </div>
            )}

            <div style={{ maxHeight: "50vh", overflowY: "auto", paddingRight: 4 }}>
              {questoesData.map((q, i) => (
                <FormQuestao
                  key={i}
                  index={i}
                  data={q}
                  onChange={(data) => atualizarQuestao(i, data)}
                  textosUsados={textosUsados}
                  comTextoMotivador={temTextoMotivador}
                />
              ))}
            </div>
          </>
        )}

        {/* Botões de ação */}
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          {etapa === "formulario" && (
            <button
              onClick={handleAdicionar}
              disabled={!todasValidas()}
              style={{
                flex: 1, padding: "10px 12px", borderRadius: 6, border: "none",
                background: "var(--blue)", color: "white", fontSize: 13, fontWeight: 600,
                cursor: todasValidas() ? "pointer" : "not-allowed",
                opacity: todasValidas() ? 1 : 0.5
              }}
            >
              Adicionar {questoesData.length > 1 ? `${questoesData.length} Questões` : "Questão"}
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              flex: etapa === "formulario" ? 1 : undefined, padding: "10px 12px", borderRadius: 6,
              border: "1px solid var(--b2)", background: "transparent",
              color: "var(--t2)", fontSize: 13, fontWeight: 600, cursor: "pointer",
              width: etapa === "pergunta" && temTextoMotivador === null ? "100%" : undefined
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PDF EXPORT HELPER
// ============================================================
function gerarPDFSimulado(tentativa, simulado, aluno, questoes, fb) {
  const total = questoes.length;
  const pct = total > 0 ? Math.round((tentativa.acertos / total) * 100) : 0;
  const data = new Date(tentativa.finishedAt).toLocaleDateString("pt-BR", { day:"2-digit", month:"long", year:"numeric" });
  const linhasQuestoes = questoes.map((q, i) => {
    const resp = tentativa.respostas?.find(r => r.questaoId === q.id);
    const respostaAluno = resp?.resposta || "—";
    const acertou = respostaAluno === q.gabarito;
    const coment = fb?.comentariosQuestoes?.find(c => c.questaoId === q.id);
    const altRows = q.tipo === "multipla"
      ? (q.alternativas || []).map((alt, idx) => {
          const letra = String.fromCharCode(65 + idx);
          const isGab = letra === q.gabarito;
          const isResp = letra === respostaAluno;
          const bg = isGab ? "#d1fae5" : (isResp && !acertou ? "#fee2e2" : "#f3f4f6");
          const fw = (isGab || (isResp && !acertou)) ? "bold" : "normal";
          const mark = isGab ? " ✓ gabarito" : (isResp && !acertou ? " ← resposta" : "");
          return `<div style="background:${bg};padding:4px 8px;border-radius:4px;font-size:12px;font-weight:${fw};margin:2px 0">${letra}. ${alt}${mark}</div>`;
        }).join("")
      : (() => {
          const ops = ["C","E"].map(op => {
            const label = op === "C" ? "Certo" : "Errado";
            const isGab = op === q.gabarito;
            const isResp = op === respostaAluno;
            const bg = isGab ? "#d1fae5" : (isResp && !acertou ? "#fee2e2" : "#f3f4f6");
            const mark = isGab ? " ✓" : (isResp && !acertou ? " ←" : "");
            return `<span style="background:${bg};padding:4px 12px;border-radius:4px;font-size:12px;font-weight:bold;margin-right:6px">${label}${mark}</span>`;
          });
          return ops.join("");
        })();
    const comentHtml = coment?.comentario
      ? `<div style="margin-top:8px;padding:8px;background:#eff6ff;border-left:3px solid #3b82f6;border-radius:4px;font-size:12px"><strong>💬 Comentário do professor:</strong><br>${coment.comentario}</div>` : "";
    const border = acertou ? "#10b981" : "#ef4444";
    const icon = acertou ? "✓" : "✗";
    const iconBg = acertou ? "#10b981" : "#ef4444";
    return `<div style="border:1.5px solid ${border};border-radius:8px;padding:14px;margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="background:${iconBg};color:white;width:22px;height:22px;border-radius:5px;display:inline-flex;align-items:center;justify-content:center;font-weight:bold;font-size:12px">${icon}</span>
        <strong style="font-size:12px">Questão ${i+1}</strong>
        <span style="font-size:11px;color:#6b7280">${q.tipo==="ce"?"Certo/Errado":"Múltipla Escolha"}</span>
      </div>
      <div style="font-size:13px;margin-bottom:8px;line-height:1.5">${q.enunciado}</div>
      ${altRows}
      <div style="margin-top:8px;font-size:12px;font-weight:bold;color:${acertou?"#10b981":"#ef4444"}">${acertou ? "✓ Correto" : `✗ Respondeu: ${respostaAluno} · Gabarito: ${q.gabarito}`}</div>
      ${comentHtml}
    </div>`;
  }).join("");
  const orientHtml = fb?.orientacoesGerais ? `<div style="padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:12px"><strong>📋 Orientações Gerais:</strong><br><span style="font-size:13px">${fb.orientacoesGerais}</span></div>` : "";
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Relatório − ${aluno?.name || "Aluno"}</title>
  <style>body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:24px;color:#1f2937}@media print{button{display:none}}</style></head><body>
  <h1 style="font-size:22px;margin-bottom:4px">📄 Relatório de Correção</h1>
  <div style="font-size:14px;color:#6b7280;margin-bottom:20px">${simulado?.nome} · ${aluno?.name || "Aluno"} · ${data}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
    <div style="text-align:center;padding:12px;background:#f0fdf4;border-radius:8px"><div style="font-size:26px;font-weight:900;color:#10b981">${tentativa.acertos}</div><div style="font-size:11px;font-weight:bold;text-transform:uppercase;color:#10b981">Acertos</div></div>
    <div style="text-align:center;padding:12px;background:#fef2f2;border-radius:8px"><div style="font-size:26px;font-weight:900;color:#ef4444">${tentativa.erros}</div><div style="font-size:11px;font-weight:bold;text-transform:uppercase;color:#ef4444">Erros</div></div>
    <div style="text-align:center;padding:12px;background:#f3f4f6;border-radius:8px"><div style="font-size:26px;font-weight:900;color:${pct>=60?"#10b981":"#ef4444"}">${pct}%</div><div style="font-size:11px;font-weight:bold;text-transform:uppercase">Aproveitamento</div></div>
  </div>
  ${orientHtml}
  <h2 style="font-size:15px;margin-bottom:12px">Questões</h2>
  ${linhasQuestoes}
  <button onclick="window.print()" style="margin-top:16px;padding:10px 20px;background:#10b981;color:white;border:none;border-radius:6px;font-size:14px;font-weight:bold;cursor:pointer">🖨️ Imprimir / Salvar PDF</button>
  </body></html>`;
  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
}

// ============================================================
// COACH: Modal Resultado Completo (correção + comentários + PDF + envio)
// ============================================================
function ModalResultadoCompleto({ tentativaId, coachId, questoes, alunos, onClose }) {
  const tentativa = tentativasModule.getById(tentativaId);
  const fbExistente = feedbackModule.getByTentativa(tentativaId);
  if (!tentativa) return null;
  const aluno = alunos?.find(a => a.id === tentativa.alunoId) || usersModule.getById(tentativa.alunoId);
  const simulado = simuladosModule.getById(tentativa.simuladoId);
  const total = questoes.length;
  const pct = total > 0 ? Math.round((tentativa.acertos / total) * 100) : 0;

  const initComents = () => questoes.map(q => {
    const ex = fbExistente?.comentariosQuestoes?.find(c => c.questaoId === q.id);
    const resp = tentativa?.respostas?.find(r => r.questaoId === q.id);
    const acertou = resp?.resposta === q.gabarito;
    return { questaoId: q.id, acertou, comentario: ex?.comentario || "" };
  });

  const [comentarios, setComentarios] = useState(initComents);
  const [orientacoesGerais, setOrientacoesGerais] = useState(fbExistente?.orientacoesGerais || "");
  const [saved, setSaved] = useState(false);
  const [enviado, setEnviado] = useState(fbExistente?.status === "enviado");

  function updateComentario(idx, val) {
    setComentarios(prev => prev.map((c, i) => i === idx ? { ...c, comentario: val } : c));
  }

  function salvar(status) {
    feedbackModule.salvar(coachId, tentativaId, {
      comentariosQuestoes: comentarios.map(c => ({ ...c, explicacao: "" })),
      orientacoesGerais, status,
      sugestoesConteudo: fbExistente?.sugestoesConteudo || "",
      temasRevisar: fbExistente?.temasRevisar || [],
    });
    if (status === "enviado") { setEnviado(true); setSaved(true); setTimeout(onClose, 800); }
    else { setSaved(true); setTimeout(() => setSaved(false), 2000); }
  }

  function handlePDF() {
    const fb = { comentariosQuestoes: comentarios, orientacoesGerais };
    gerarPDFSimulado(tentativa, simulado, aluno, questoes, fb);
  }

  const overlay = { position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:2000,padding:"20px 12px",overflowY:"auto" };
  const box = { background:"var(--s1)",borderRadius:14,maxWidth:720,width:"100%",padding:28,margin:"0 auto",maxHeight:"calc(100vh - 40px)",overflowY:"auto" };
  const inp = { width:"100%",padding:"8px 10px",borderRadius:6,border:"1px solid var(--b2)",background:"var(--s3)",color:"var(--t1)",fontSize:12,fontFamily:"inherit",resize:"vertical",boxSizing:"border-box" };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20 }}>
          <div>
            <div style={{ fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:"var(--t3)",marginBottom:4 }}>Resultado Completo</div>
            <h2 style={{ fontSize:18,fontWeight:900,marginBottom:2 }}>🔍 {aluno?.name || "Aluno"}</h2>
            <div style={{ fontSize:12,color:"var(--t3)" }}>{simulado?.nome} · {new Date(tentativa.finishedAt).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"})}</div>
          </div>
          <div style={{ display:"flex",gap:8,flexWrap:"wrap",justifyContent:"flex-end" }}>
            <button onClick={handlePDF} style={{ padding:"8px 14px",borderRadius:8,border:"none",background:"var(--amber)",color:"#07080f",fontSize:12,fontWeight:700,cursor:"pointer" }}>📄 Gerar PDF</button>
            <button onClick={onClose} style={{ padding:"8px 14px",borderRadius:8,border:"none",background:"var(--b2)",color:"var(--t1)",fontSize:12,fontWeight:700,cursor:"pointer" }}>✕ Fechar</button>
          </div>
        </div>

        {/* Placar */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20 }}>
          <div style={{ padding:14,borderRadius:10,background:"var(--green-d)",textAlign:"center" }}>
            <div style={{ fontSize:26,fontWeight:900,fontFamily:"Cabinet Grotesk",color:"var(--green)" }}>{tentativa.acertos}</div>
            <div style={{ fontSize:10,color:"var(--green)",fontWeight:700,textTransform:"uppercase" }}>✓ Acertos</div>
          </div>
          <div style={{ padding:14,borderRadius:10,background:"rgba(239,68,68,.1)",textAlign:"center" }}>
            <div style={{ fontSize:26,fontWeight:900,fontFamily:"Cabinet Grotesk",color:"var(--red)" }}>{tentativa.erros}</div>
            <div style={{ fontSize:10,color:"var(--red)",fontWeight:700,textTransform:"uppercase" }}>✗ Erros</div>
          </div>
          <div style={{ padding:14,borderRadius:10,background:"var(--s2)",textAlign:"center" }}>
            <div style={{ fontSize:26,fontWeight:900,fontFamily:"Cabinet Grotesk",color:pct>=60?"var(--green)":"var(--red)" }}>{pct}%</div>
            <div style={{ fontSize:10,color:"var(--t3)",fontWeight:700,textTransform:"uppercase" }}>Aproveitamento</div>
          </div>
        </div>

        {/* Questões */}
        <div style={{ display:"flex",flexDirection:"column",gap:14,marginBottom:20 }}>
          {questoes.map((q, i) => {
            const resp = tentativa.respostas?.find(r => r.questaoId === q.id);
            const respostaAluno = resp?.resposta;
            const acertou = respostaAluno === q.gabarito;
            const c = comentarios[i] || {};

            return (
              <div key={q.id} style={{ padding:16,borderRadius:10,background:acertou?"var(--green-d)":"rgba(239,68,68,.08)",border:`1.5px solid ${acertou?"var(--green)":"var(--red)"}` }}>
                {/* Q header */}
                <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:10 }}>
                  <div style={{ width:26,height:26,borderRadius:6,background:acertou?"var(--green)":"var(--red)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900,color:"white",flexShrink:0 }}>{acertou?"✓":"✗"}</div>
                  <div style={{ fontSize:12,fontWeight:700,color:"var(--t3)",textTransform:"uppercase",letterSpacing:.5 }}>Questão {i+1} · {q.tipo==="ce"?"Certo/Errado":"Múltipla Escolha"}</div>
                </div>
                <div style={{ fontSize:13,color:"var(--t1)",lineHeight:1.6,marginBottom:10 }}>{q.enunciado}</div>

                {/* Alternativas múltipla */}
                {q.tipo==="multipla" && (
                  <div style={{ display:"flex",flexDirection:"column",gap:4,marginBottom:10 }}>
                    {(q.alternativas||[]).map((alt,idx) => {
                      const letra = String.fromCharCode(65+idx);
                      const isGab = letra===q.gabarito;
                      const isResp = letra===respostaAluno;
                      let bg="var(--s3)",color="var(--t2)",border="1px solid transparent";
                      if (isGab) { bg="var(--green-d)"; color="var(--green)"; border="1px solid var(--green)"; }
                      else if (isResp&&!acertou) { bg="rgba(239,68,68,.12)"; color="var(--red)"; border="1px solid var(--red)"; }
                      return (
                        <div key={idx} style={{ padding:"6px 10px",borderRadius:6,background:bg,color,border,fontSize:12,display:"flex",gap:8,alignItems:"center" }}>
                          <span style={{ fontWeight:700,minWidth:18 }}>{letra}.</span>
                          <span style={{ flex:1 }}>{alt}</span>
                          {isGab&&<span style={{ fontSize:10,fontWeight:700 }}>✓ Gabarito</span>}
                          {isResp&&!acertou&&<span style={{ fontSize:10,fontWeight:700 }}>← Aluno</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Certo/Errado */}
                {q.tipo==="ce" && (
                  <div style={{ display:"flex",gap:8,marginBottom:10 }}>
                    {["C","E"].map(op => {
                      const label=op==="C"?"Certo":"Errado";
                      const isGab=op===q.gabarito;
                      const isResp=op===respostaAluno;
                      let bg="var(--s3)",color="var(--t2)",border="1px solid transparent";
                      if(isGab){bg="var(--green-d)";color="var(--green)";border="1px solid var(--green)";}
                      else if(isResp&&!acertou){bg="rgba(239,68,68,.12)";color="var(--red)";border="1px solid var(--red)";}
                      return (
                        <div key={op} style={{ padding:"6px 16px",borderRadius:6,background:bg,color,border,fontSize:13,fontWeight:700,display:"flex",gap:5,alignItems:"center" }}>
                          {label}
                          {isGab&&<span style={{ fontSize:10 }}>✓</span>}
                          {isResp&&!acertou&&<span style={{ fontSize:10 }}>←</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ fontSize:12,color:acertou?"var(--green)":"var(--red)",fontWeight:700,marginBottom:10 }}>
                  {acertou ? "✓ Resposta correta" : respostaAluno ? `✗ Respondeu ${respostaAluno} · Gabarito: ${q.gabarito}` : `✗ Não respondida · Gabarito: ${q.gabarito}`}
                </div>

                {/* Campo de comentário */}
                <div>
                  <label style={{ fontSize:11,fontWeight:700,letterSpacing:.5,textTransform:"uppercase",color:"var(--t3)",display:"block",marginBottom:5 }}>💬 Comentário do professor (opcional)</label>
                  <textarea style={inp} rows={2} value={c.comentario||""} onChange={e=>updateComentario(i,e.target.value)} placeholder={acertou ? "Reforce o ponto positivo ou explique o conceito..." : "Explique o erro, oriente o aluno..."}/>
                </div>
              </div>
            );
          })}
        </div>

        {/* Orientações gerais */}
        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:11,fontWeight:700,letterSpacing:.5,textTransform:"uppercase",color:"var(--t3)",display:"block",marginBottom:8 }}>📋 Orientações Gerais (visível ao aluno)</label>
          <textarea style={{ ...inp,minHeight:80 }} value={orientacoesGerais} onChange={e=>setOrientacoesGerais(e.target.value)} placeholder="Pontos de atenção, sugestões de estudo, parabéns, etc..."/>
        </div>

        {/* Ações */}
        <div style={{ display:"flex",gap:10,flexWrap:"wrap" }}>
          <button onClick={()=>salvar("rascunho")} style={{ flex:1,minWidth:130,padding:"12px",borderRadius:10,border:"none",background:"var(--s3)",color:"var(--t1)",fontSize:13,fontWeight:700,cursor:"pointer" }}>
            {saved&&!enviado ? "✅ Salvo!" : "💾 Salvar Rascunho"}
          </button>
          <button onClick={()=>salvar("enviado")} disabled={enviado} style={{ flex:2,minWidth:180,padding:"12px",borderRadius:10,border:"none",background:enviado?"var(--green-d)":"var(--green)",color:enviado?"var(--green)":"#07080f",fontSize:13,fontWeight:900,cursor:enviado?"default":"pointer",fontFamily:"Cabinet Grotesk" }}>
            {enviado ? "✅ Relatório já enviado ao aluno" : "📨 Enviar Relatório ao Aluno"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// ALUNO: Modal para visualizar feedback recebido do coach
// ============================================================
function ModalVerFeedback({ tentativaId, onClose }) {
  const tentativa = tentativasModule.getById(tentativaId);
  const fb = feedbackModule.getEnviadoParaAluno(tentativaId);
  if (!tentativa || !fb) return null;

  const simulado = simuladosModule.getById(tentativa.simuladoId);
  const questoes = questoesModule.getBySimulado(tentativa.simuladoId);
  const total = questoes.length;
  const pct = total > 0 ? Math.round((tentativa.acertos / total) * 100) : 0;
  const coach = usersModule.getById(fb.coachId);

  function handlePDF() {
    gerarPDFSimulado(tentativa, simulado, { name: "Você" }, questoes, fb);
  }

  return (
    <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:2000,overflowY:"auto",padding:"20px 12px" }}>
      <div style={{ background:"var(--s1)",borderRadius:14,maxWidth:700,width:"100%",padding:28 }} onClick={e=>e.stopPropagation()}>

        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20 }}>
          <div>
            <div style={{ fontSize:11,fontWeight:700,letterSpacing:1,textTransform:"uppercase",color:"var(--green)",marginBottom:4 }}>📘 Revisão do Professor</div>
            <h2 style={{ fontSize:18,fontWeight:900,marginBottom:2 }}>{simulado?.nome}</h2>
            <div style={{ fontSize:12,color:"var(--t3)" }}>Enviado por {coach?.name||"Coach"} · {new Date(fb.enviadoEm).toLocaleDateString("pt-BR",{day:"2-digit",month:"short",year:"numeric"})}</div>
          </div>
          <div style={{ display:"flex",gap:8 }}>
            <button onClick={handlePDF} style={{ padding:"8px 14px",borderRadius:8,border:"none",background:"var(--amber)",color:"#07080f",fontSize:12,fontWeight:700,cursor:"pointer" }}>📄 Gerar PDF</button>
            <button onClick={onClose} style={{ padding:"8px 14px",borderRadius:8,border:"none",background:"var(--b2)",color:"var(--t1)",fontSize:12,fontWeight:700,cursor:"pointer" }}>Fechar</button>
          </div>
        </div>

        {/* Placar */}
        <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10,marginBottom:20 }}>
          <div style={{ padding:12,borderRadius:10,background:"var(--green-d)",textAlign:"center" }}>
            <div style={{ fontSize:24,fontWeight:900,fontFamily:"Cabinet Grotesk",color:"var(--green)" }}>{tentativa.acertos}</div>
            <div style={{ fontSize:10,color:"var(--green)",fontWeight:700,textTransform:"uppercase" }}>Acertos</div>
          </div>
          <div style={{ padding:12,borderRadius:10,background:"rgba(239,68,68,.1)",textAlign:"center" }}>
            <div style={{ fontSize:24,fontWeight:900,fontFamily:"Cabinet Grotesk",color:"var(--red)" }}>{tentativa.erros}</div>
            <div style={{ fontSize:10,color:"var(--red)",fontWeight:700,textTransform:"uppercase" }}>Erros</div>
          </div>
          <div style={{ padding:12,borderRadius:10,background:"var(--s2)",textAlign:"center" }}>
            <div style={{ fontSize:24,fontWeight:900,fontFamily:"Cabinet Grotesk",color:pct>=60?"var(--green)":"var(--red)" }}>{pct}%</div>
            <div style={{ fontSize:10,color:"var(--t3)",fontWeight:700,textTransform:"uppercase" }}>Aproveitamento</div>
          </div>
        </div>

        {/* Orientações gerais */}
        {fb.orientacoesGerais && (
          <div style={{ padding:14,borderRadius:10,background:"var(--blue-d)",border:"1px solid var(--blue)",marginBottom:16 }}>
            <div style={{ fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:.5,color:"var(--blue)",marginBottom:6 }}>📋 Orientações do Professor</div>
            <div style={{ fontSize:13,color:"var(--t1)",lineHeight:1.6 }}>{fb.orientacoesGerais}</div>
          </div>
        )}

        {/* Todas as questões */}
        <div style={{ fontSize:11,fontWeight:700,letterSpacing:.5,textTransform:"uppercase",color:"var(--t3)",marginBottom:10 }}>Questão por Questão</div>
        <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
          {questoes.map((q, i) => {
            const resp = tentativa.respostas?.find(r => r.questaoId === q.id);
            const respostaAluno = resp?.resposta;
            const acertou = respostaAluno === q.gabarito;
            const coment = fb.comentariosQuestoes?.find(c => c.questaoId === q.id);

            return (
              <div key={q.id} style={{ padding:14,borderRadius:10,background:acertou?"var(--green-d)":"rgba(239,68,68,.08)",border:`1.5px solid ${acertou?"var(--green)":"var(--red)"}` }}>
                <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8 }}>
                  <div style={{ width:24,height:24,borderRadius:5,background:acertou?"var(--green)":"var(--red)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,color:"white",flexShrink:0 }}>{acertou?"✓":"✗"}</div>
                  <div style={{ fontSize:12,fontWeight:700,color:"var(--t3)",textTransform:"uppercase",letterSpacing:.5 }}>Questão {i+1}</div>
                </div>
                <div style={{ fontSize:13,color:"var(--t1)",lineHeight:1.6,marginBottom:8 }}>{q.enunciado}</div>

                {q.tipo==="multipla" && (
                  <div style={{ display:"flex",flexDirection:"column",gap:3,marginBottom:8 }}>
                    {(q.alternativas||[]).map((alt,idx)=>{
                      const letra=String.fromCharCode(65+idx);
                      const isGab=letra===q.gabarito;
                      const isResp=letra===respostaAluno;
                      let bg="var(--s3)",color="var(--t2)",border="1px solid transparent";
                      if(isGab){bg="var(--green-d)";color="var(--green)";border="1px solid var(--green)";}
                      else if(isResp&&!acertou){bg="rgba(239,68,68,.12)";color="var(--red)";border="1px solid var(--red)";}
                      return(
                        <div key={idx} style={{padding:"5px 10px",borderRadius:5,background:bg,color,border,fontSize:12,display:"flex",gap:7,alignItems:"center"}}>
                          <span style={{fontWeight:700,minWidth:16}}>{letra}.</span>
                          <span style={{flex:1}}>{alt}</span>
                          {isGab&&<span style={{fontSize:10,fontWeight:700}}>✓ Gabarito</span>}
                          {isResp&&!acertou&&<span style={{fontSize:10,fontWeight:700}}>← Sua resposta</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {q.tipo==="ce" && (
                  <div style={{display:"flex",gap:8,marginBottom:8}}>
                    {["C","E"].map(op=>{
                      const label=op==="C"?"Certo":"Errado";
                      const isGab=op===q.gabarito;
                      const isResp=op===respostaAluno;
                      let bg="var(--s3)",color="var(--t2)",border="1px solid transparent";
                      if(isGab){bg="var(--green-d)";color="var(--green)";border="1px solid var(--green)";}
                      else if(isResp&&!acertou){bg="rgba(239,68,68,.12)";color="var(--red)";border="1px solid var(--red)";}
                      return(
                        <div key={op} style={{padding:"5px 14px",borderRadius:5,background:bg,color,border,fontSize:12,fontWeight:700,display:"flex",gap:5,alignItems:"center"}}>
                          {label}{isGab&&<span style={{fontSize:10}}>✓</span>}{isResp&&!acertou&&<span style={{fontSize:10}}>←</span>}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div style={{ fontSize:12,color:acertou?"var(--green)":"var(--red)",fontWeight:700,marginBottom: coment?.comentario?8:0 }}>
                  {acertou?"✓ Correto":respostaAluno?`✗ Você respondeu ${respostaAluno} · Gabarito: ${q.gabarito}`:`✗ Não respondida · Gabarito: ${q.gabarito}`}
                </div>

                {coment?.comentario && (
                  <div style={{ padding:"10px 12px",borderRadius:8,background:"var(--blue-d)",border:"1px solid var(--blue)" }}>
                    <div style={{ fontSize:10,fontWeight:700,textTransform:"uppercase",color:"var(--blue)",marginBottom:4 }}>💬 Comentário do professor</div>
                    <div style={{ fontSize:12,color:"var(--t1)",lineHeight:1.6 }}>{coment.comentario}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button onClick={onClose} style={{ width:"100%",marginTop:20,padding:"12px",borderRadius:10,border:"none",background:"var(--s3)",color:"var(--t1)",fontSize:14,fontWeight:700,cursor:"pointer" }}>Fechar</button>
      </div>
    </div>
  );
}

// ============================================================
// COACH: Ranking
// ============================================================
function CoachRanking({ user }) {
  const [tick, setTick] = useState(0);
  const alunos = usersModule.getAlunos(user.id);
  function buildRanking(a) {
    const plano = planosModule.getByAluno(a.id)[0];
    if (!plano) return null;
    const xp = gamificacaoModule.calcXP(a.id, plano.id);
    const nivel = gamificacaoModule.getNivel(xp);
    const streak = gamificacaoModule.getStreakAtual(a.id, plano.id);
    const stats = progressoModule.getStats(a.id, plano.id);
    return { aluno: a, xp, aulas: stats?.aulasFeitas || 0, streak, nivel, plano, pct: stats?.pct || 0 };
  }
  const ranking = alunos.map(buildRanking).filter(Boolean).sort((a,b) => b.xp - a.xp);

  return (
    <div>
      <div className="ph"><div><h1>Ranking</h1><p>Desempenho dos alunos</p></div></div>
      {ranking.length === 0
        ? <div className="card"><div className="empty"><h3>Nenhum aluno com plano ativo</h3></div></div>
        : (
          <div className="card">
            <table className="rank-table">
              <thead><tr><th>#</th><th>Aluno</th><th>XP</th><th>Nível</th><th>Aulas</th><th>Streak</th><th>%</th></tr></thead>
              <tbody>
                {ranking.map((r, i) => (
                  <tr key={r.aluno.id}>
                    <td><div className={`rank-pos rank-${i+1}`}>{i+1}</div></td>
                    <td><div style={{fontWeight:600}}>{r.aluno.name}</div></td>
                    <td><div style={{fontWeight:700,color:"var(--amber)"}}>{r.xp} XP</div></td>
                    <td><div style={{fontSize:12}}>{r.nivel.icon} {r.nivel.name}</div></td>
                    <td>{r.aulas}</td>
                    <td>{r.streak > 0 ? `🔥 ${r.streak}` : "—"}</td>
                    <td>
                      <div style={{fontSize:11,color:"var(--t3)",marginBottom:4}}>{r.pct}%</div>
                      <PBar pct={r.pct}/>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
    </div>
  );
}

// ============================================================
// GERADOR DE PROMPT
// ============================================================
// ============================================================
// BATALHA: Coach cria e gerencia batalhas
// ============================================================
function CoachBatalha({ user, refresh }) {
  const [tick, setTick] = useState(0);
  const [criando, setCriando] = useState(false);
  const [verRanking, setVerRanking] = useState(null);
  const batalhas = batalhasModule.getByCoach(user.id);
  const alunos = usersModule.getAlunos(user.id);
  const editais = editaisModule.getByCoach(user.id);
  const simuladosList = editais.flatMap(e => simuladosModule.getByEdital(e.id));

  function reload() { setTick(t => t+1); refresh && refresh(); }

  const emojis = ["⚔️","🔥","🧠","🏆","💥","🎯","⚡","🥊"];
  const emoji = (b) => emojis[b.id.charCodeAt(0) % emojis.length];

  return (
    <div>
      <div className="ph" style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div><h1>⚔️ Batalhas</h1><p>Crie competicoes entre seus alunos</p></div>
        <button className="btn btn-green" onClick={() => setCriando(true)}>+ Nova Batalha</button>
      </div>

      {batalhas.length === 0 ? (
        <div className="card"><div className="empty"><h3>Nenhuma batalha criada ainda</h3><p>Crie uma batalha para engajar seus alunos!</p></div></div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {batalhas.map(b => {
            const sim = simuladosModule.getById(b.simuladoId);
            const total = b.participantes?.length || 0;
            const finalizados = b.participantes?.filter(p => p.finalizado).length || 0;
            const vencedor = batalhasModule.getRanking(b.id)[0];
            const vencedorUser = vencedor ? usersModule.getById(vencedor.alunoId) : null;
            return (
              <div key={b.id} style={{ padding:20, borderRadius:12, background:"var(--s1)", border:"1px solid var(--b2)" }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
                  <div>
                    <div style={{ fontSize:18, fontWeight:900, fontFamily:"Cabinet Grotesk", marginBottom:4 }}>
                      {emoji(b)} {b.nome}
                    </div>
                    <div style={{ fontSize:12, color:"var(--t3)" }}>
                      {sim?.nome || "Simulado"} · Encerra: {b.dataFim ? new Date(b.dataFim+"T00:00:00").toLocaleDateString("pt-BR") : "Sem limite"}
                    </div>
                  </div>
                  <span className={"badge " + (b.status === "ativa" ? "bg" : "br")}>
                    {b.status === "ativa" ? "Ativa" : "Encerrada"}
                  </span>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:12 }}>
                  <div style={{ padding:10, borderRadius:8, background:"var(--s2)", textAlign:"center" }}>
                    <div style={{ fontSize:20, fontWeight:900, fontFamily:"Cabinet Grotesk" }}>{total}</div>
                    <div style={{ fontSize:10, color:"var(--t3)", textTransform:"uppercase" }}>Participantes</div>
                  </div>
                  <div style={{ padding:10, borderRadius:8, background:"var(--s2)", textAlign:"center" }}>
                    <div style={{ fontSize:20, fontWeight:900, fontFamily:"Cabinet Grotesk", color:"var(--green)" }}>{finalizados}</div>
                    <div style={{ fontSize:10, color:"var(--t3)", textTransform:"uppercase" }}>Finalizaram</div>
                  </div>
                  <div style={{ padding:10, borderRadius:8, background:"var(--s2)", textAlign:"center" }}>
                    <div style={{ fontSize:13, fontWeight:700, color:"var(--amber)" }}>{vencedorUser ? vencedorUser.name.split(" ")[0] : "-"}</div>
                    <div style={{ fontSize:10, color:"var(--t3)", textTransform:"uppercase" }}>Lider</div>
                  </div>
                </div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => setVerRanking(b.id)} style={{ flex:1, padding:"8px", borderRadius:8, border:"none", background:"var(--blue-d)", color:"var(--blue)", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    Ver Ranking
                  </button>
                  {b.status === "ativa" && (
                    <button onClick={() => { batalhasModule.encerrar(b.id); reload(); }} style={{ padding:"8px 14px", borderRadius:8, border:"1px solid var(--b2)", background:"transparent", color:"var(--t2)", fontSize:12, cursor:"pointer" }}>
                      Encerrar
                    </button>
                  )}
                  <button onClick={async () => { if(await confirmar({ titulo: "Deletar batalha?", mensagem: "A batalha e todos os participantes serão removidos.", tipo: "destrutivo" })) { batalhasModule.delete(b.id); reload(); } }} style={{ padding:"8px 10px", borderRadius:8, border:"none", background:"rgba(239,68,68,.1)", color:"var(--red)", fontSize:12, cursor:"pointer" }}>
                    Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {criando && <ModalCriarBatalha coachId={user.id} alunos={alunos} simulados={simuladosList} onClose={() => { setCriando(false); reload(); }} />}
      {verRanking && <ModalRankingBatalha batalhaId={verRanking} onClose={() => setVerRanking(null)} />}
    </div>
  );
}

function ModalCriarBatalha({ coachId, alunos, simulados, onClose }) {
  const [nome, setNome] = useState("");
  const [simuladoId, setSimuladoId] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [tempoLimite, setTempoLimite] = useState("");
  const [selecionados, setSelecionados] = useState([]);

  function toggleAluno(id) {
    setSelecionados(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function criar() {
    if (!simuladoId) { alert("Selecione um simulado."); return; }
    if (selecionados.length < 2) { alert("Selecione pelo menos 2 alunos."); return; }
    batalhasModule.create(coachId, simuladoId, nome || "Batalha", dataFim || null, tempoLimite ? parseInt(tempoLimite) : null, selecionados);
    onClose();
  }

  const inp = { width:"100%", padding:"9px 12px", borderRadius:8, border:"1px solid var(--b2)", background:"var(--s2)", color:"var(--t1)", fontSize:13, boxSizing:"border-box" };

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:2000, padding:"20px 12px" }}>
      <div style={{ background:"var(--s1)", borderRadius:14, maxWidth:520, width:"100%", maxHeight:"90vh", overflowY:"auto", padding:28 }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:18, fontWeight:900, marginBottom:20 }}>⚔️ Nova Batalha</div>

        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:11, fontWeight:700, color:"var(--t3)", textTransform:"uppercase", letterSpacing:.5, display:"block", marginBottom:5 }}>Nome da batalha (opcional)</label>
          <input style={inp} value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Batalha Direito Constitucional" />
        </div>

        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:11, fontWeight:700, color:"var(--t3)", textTransform:"uppercase", letterSpacing:.5, display:"block", marginBottom:5 }}>Simulado *</label>
          <select style={inp} value={simuladoId} onChange={e => setSimuladoId(e.target.value)}>
            <option value="">Selecione um simulado...</option>
            {simulados.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:"var(--t3)", textTransform:"uppercase", letterSpacing:.5, display:"block", marginBottom:5 }}>Data limite</label>
            <input type="date" style={inp} value={dataFim} onChange={e => setDataFim(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:"var(--t3)", textTransform:"uppercase", letterSpacing:.5, display:"block", marginBottom:5 }}>Tempo (min)</label>
            <input type="number" style={inp} value={tempoLimite} onChange={e => setTempoLimite(e.target.value)} placeholder="Sem limite" min="1" />
          </div>
        </div>

        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:11, fontWeight:700, color:"var(--t3)", textTransform:"uppercase", letterSpacing:.5, display:"block", marginBottom:8 }}>Participantes * (min. 2)</label>
          <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:200, overflowY:"auto" }}>
            {alunos.length === 0 ? (
              <div style={{ fontSize:13, color:"var(--t3)" }}>Nenhum aluno cadastrado.</div>
            ) : alunos.map(a => {
              const sel = selecionados.includes(a.id);
              return (
                <div key={a.id} onClick={() => toggleAluno(a.id)} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", borderRadius:10, border:"1.5px solid " + (sel ? "var(--green)" : "var(--b2)"), background: sel ? "var(--s2)" : "var(--s1)", cursor:"pointer" }}>
                  <div style={{ width:18, height:18, borderRadius:5, border:"2px solid " + (sel ? "var(--green)" : "var(--b2)"), background: sel ? "var(--green)" : "transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"#07080f", fontWeight:900, flexShrink:0 }}>
                    {sel && "V"}
                  </div>
                  <div style={{ fontSize:13, fontWeight:600, color: sel ? "var(--green)" : "var(--t1)" }}>{a.name}</div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize:11, color:"var(--t3)", marginTop:6 }}>{selecionados.length} aluno(s) selecionado(s)</div>
        </div>

        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:"12px", borderRadius:10, border:"1px solid var(--b2)", background:"transparent", color:"var(--t2)", fontSize:13, fontWeight:600, cursor:"pointer" }}>Cancelar</button>
          <button onClick={criar} style={{ flex:2, padding:"12px", borderRadius:10, border:"none", background:"var(--green)", color:"#07080f", fontSize:13, fontWeight:900, cursor:"pointer", fontFamily:"Cabinet Grotesk" }}>Criar Batalha</button>
        </div>
      </div>
    </div>
  );
}

function ModalRankingBatalha({ batalhaId, onClose }) {
  const batalha = batalhasModule.getById(batalhaId);
  if (!batalha) return null;
  const sim = simuladosModule.getById(batalha.simuladoId);
  const questoes = questoesModule.getBySimulado(batalha.simuladoId);
  const isCE = questoes.every(q => q.tipo === "ce");
  const ranking = batalhasModule.getRanking(batalhaId);
  const naoFinalizados = (batalha.participantes || []).filter(p => !p.finalizado);

  const medal = (i) => i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "var(--amber)" : "var(--t3)";
  const medalEmoji = (i) => i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "#" + (i+1);

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)", display:"flex", alignItems:"flex-start", justifyContent:"center", zIndex:2000, padding:"20px 12px", overflowY:"auto" }}>
      <div style={{ background:"var(--s1)", borderRadius:14, maxWidth:600, width:"100%", padding:28, margin:"0 auto" }} onClick={e => e.stopPropagation()}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:1, textTransform:"uppercase", color:"var(--t3)", marginBottom:4 }}>Ranking da Batalha</div>
            <h2 style={{ fontSize:18, fontWeight:900, marginBottom:2 }}>⚔️ {batalha.nome}</h2>
            <div style={{ fontSize:12, color:"var(--t3)" }}>{sim?.nome} · {isCE ? "Pontuacao Cebraspe + Tradicional" : "Percentual tradicional"}</div>
          </div>
          <button onClick={onClose} style={{ padding:"6px 12px", borderRadius:6, border:"none", background:"var(--b2)", color:"var(--t1)", fontSize:13, cursor:"pointer" }}>Fechar</button>
        </div>

        {ranking.length === 0 ? (
          <div style={{ padding:24, borderRadius:10, background:"var(--s2)", textAlign:"center", color:"var(--t3)", fontSize:13 }}>
            Nenhum aluno finalizou ainda.
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
            {ranking.map((p, i) => {
              const u = usersModule.getById(p.alunoId);
              const min = Math.floor(p.tempoGasto / 60);
              const seg = p.tempoGasto % 60;
              return (
                <div key={p.alunoId} style={{ padding:16, borderRadius:12, background: i === 0 ? "rgba(255,215,0,.08)" : "var(--s2)", border:"1.5px solid " + (i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "var(--amber)" : "var(--b2)") }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10 }}>
                    <div style={{ fontSize:22, fontWeight:900, fontFamily:"Cabinet Grotesk", color: medal(i), minWidth:36 }}>{medalEmoji(i)}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:700, color:"var(--t1)" }}>{u?.name || "Aluno"}</div>
                      <div style={{ fontSize:11, color:"var(--t3)" }}>Tempo: {min}m {seg}s</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:22, fontWeight:900, fontFamily:"Cabinet Grotesk", color: p.percentual >= 60 ? "var(--green)" : "var(--red)" }}>{p.percentual}%</div>
                      {isCE && <div style={{ fontSize:11, color:"var(--t3)" }}>Liq: {p.pontosCebraspe} pts</div>}
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns: isCE ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap:6 }}>
                    <div style={{ padding:"6px 8px", borderRadius:6, background:"var(--s3)", textAlign:"center" }}>
                      <div style={{ fontSize:14, fontWeight:900, color:"var(--green)" }}>{p.acertos}</div>
                      <div style={{ fontSize:9, color:"var(--t3)", textTransform:"uppercase" }}>Acertos</div>
                    </div>
                    <div style={{ padding:"6px 8px", borderRadius:6, background:"var(--s3)", textAlign:"center" }}>
                      <div style={{ fontSize:14, fontWeight:900, color:"var(--red)" }}>{p.erros}</div>
                      <div style={{ fontSize:9, color:"var(--t3)", textTransform:"uppercase" }}>Erros</div>
                    </div>
                    <div style={{ padding:"6px 8px", borderRadius:6, background:"var(--s3)", textAlign:"center" }}>
                      <div style={{ fontSize:14, fontWeight:900, color:"var(--t2)" }}>{p.brancos}</div>
                      <div style={{ fontSize:9, color:"var(--t3)", textTransform:"uppercase" }}>Em branco</div>
                    </div>
                    {isCE && (
                      <div style={{ padding:"6px 8px", borderRadius:6, background:"var(--s3)", textAlign:"center" }}>
                        <div style={{ fontSize:14, fontWeight:900, color: p.pontosCebraspe >= 0 ? "var(--green)" : "var(--red)" }}>{p.pontosCebraspe}</div>
                        <div style={{ fontSize:9, color:"var(--t3)", textTransform:"uppercase" }}>Pts Liq.</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {naoFinalizados.length > 0 && (
          <div style={{ padding:14, borderRadius:10, background:"var(--s2)", border:"1px solid var(--b2)" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"var(--t3)", textTransform:"uppercase", marginBottom:8 }}>Aguardando ({naoFinalizados.length})</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
              {naoFinalizados.map(p => {
                const u = usersModule.getById(p.alunoId);
                return <span key={p.alunoId} style={{ fontSize:12, padding:"4px 10px", borderRadius:20, background:"var(--s3)", color:"var(--t2)" }}>{u?.name || "?"}</span>;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


// ============================================================
// GERADOR DE PROMPT — para estudar com IA
// ============================================================
function GeradorDePrompt() {
  const [tema, setTema] = useState("");
  const [temaErro, setTemaErro] = useState(false);
  const [materia, setMateria] = useState("");
  const [modo, setModo] = useState("apostila-completa");
  const [nivel, setNivel] = useState("intermediario");
  const [banca, setBanca] = useState("");
  // Campos editáveis do prompt-padrão (Apostila Completa)
  const [especialidade, setEspecialidade] = useState("concursos públicos");
  const [foco, setFoco] = useState("Tribunais de Contas (Banca CESPE)");
  const [concursoAlvo, setConcursoAlvo] = useState("cebraspe tcerj");
  const [perfilProf, setPerfilProf] = useState("professor-concurso"); // perfil do professor
  const [promptGerado, setPromptGerado] = useState("");
  const [copied, setCopied] = useState(false);

  const PERFIS_PROF = [
    { id: "professor-concurso", label: "Professor de Concurso", desc: "Didático, foco em aprovação, linguagem acessível" },
    { id: "examinador", label: "Examinador de Banca", desc: "Visão de quem elabora a prova, foco em pegadinhas e distratores" },
    { id: "professor-alto-nivel", label: "Professor de Alto Nível", desc: "Aprofundamento máximo, doutrina e jurisprudência avançada" },
  ];

  const MODOS = [
    { id: "apostila-completa",    icon: "📘", label: "Apostila Completa (DOCX)", desc: "Material premium em 8 seções — visão geral, teoria, resumo, pegadinhas, 25+ questões, CESPE C/E, dicas e decoreba." },
    { id: "estudo-padrao",        icon: "🎓", label: "Estudo Padrão",        desc: "Aula completa com explicação, exemplos e questões." },
    { id: "revisao-rapida",       icon: "⚡", label: "Revisão Rápida",       desc: "Resumão dos pontos-chave em formato direto." },
    { id: "questoes-comentadas",  icon: "✍️", label: "Questões Comentadas",  desc: "10 questões CESPE-style com gabarito comentado." },
    { id: "mapa-mental",          icon: "🧠", label: "Mapa Mental",          desc: "Estrutura hierárquica do tema em tópicos." },
    { id: "resumo",               icon: "📖", label: "Resumo Completo",      desc: "Síntese clara e objetiva do conteúdo." },
    { id: "macetes",              icon: "🎯", label: "Macetes & Pegadinhas", desc: "Truques e armadilhas comuns da banca." },
    { id: "comparativo",          icon: "🔄", label: "Quadro Comparativo",   desc: "Tabela comparando conceitos parecidos." },
    { id: "jurisprudencia",       icon: "⚖️", label: "Jurisprudência",      desc: "Decisões relevantes do STF/STJ/TCU sobre o tema." },
  ];

  const NIVEIS = [
    { id: "iniciante", label: "Iniciante", desc: "Quero entender do zero" },
    { id: "intermediario", label: "Intermediário", desc: "Já tenho noção, quero aprofundar" },
    { id: "avancado", label: "Avançado", desc: "Quero pegadinhas e nível alta cobrança" },
  ];

  const perfilLabel = PERFIS_PROF.find(p => p.id === perfilProf)?.label || "Professor de Concurso";
  const BASE = `Você é um ${perfilLabel} especialista em ${(especialidade||"").trim()||"concursos públicos"} de alto nível, com foco em provas de ${(foco||"").trim()||"Tribunais de Contas (Banca CESPE)"}, banca ${(banca||"").trim()||"CESPE/Cebraspe"}, e especialista em didática para aprovação.`;

  // Apostila completa: prompt-padrão de alto nível para gerar material em DOCX.
  // Os campos especialidade / foco / concursoAlvo são editáveis pelo aluno na UI.
  function buildApostilaCompleta(temaArg, materiaArg) {
    const especTxt = (especialidade || "").trim() || "concursos públicos";
    const focoTxt  = (foco || "").trim() || "Tribunais de Contas (Banca CESPE)";
    const alvoTxt  = (concursoAlvo || "").trim() || "cebraspe tcerj";
    const materiaTxt = (materiaArg || "").trim();
    const materiaLine = materiaTxt ? `\nMatéria: ${materiaTxt}` : "";
    const bancaTxt = (banca || "").trim() || "CESPE/Cebraspe";
    return `Você é um ${perfilLabel} especialista em ${especTxt} de alto nível, com foco em provas de ${focoTxt} e um especialista em produção de conteúdo em formato docx.
Banca: ${bancaTxt}
Sua tarefa é criar um MATERIAL COMPLETO em formato de apostila para estudo, com linguagem clara, didática e aprofundada, sobre o seguinte tema em formato docx pronto para download para ${alvoTxt} com o seguinte tema:
${temaArg}${materiaLine}
O material deve seguir EXATAMENTE a estrutura abaixo:
📘 1. VISÃO GERAL DO TEMA

* Explique o tema de forma simples e objetiva
* Contextualize para concursos públicos
* Destaque a importância do tema para provas de controle externo
📚 2. FUNDAMENTAÇÃO TEÓRICA COMPLETA

* Aborde TODOS os conceitos relevantes
* Use linguagem didática, mas com profundidade de prova
* Estruture com subtítulos bem organizados
* Inclua:
   * definições formais
   * classificações
   * princípios
   * exceções
   * pegadinhas de prova
* Sempre que possível, relacione com:
   * Constituição Federal
   * legislação aplicável
   * jurisprudência relevante
🧠 3. RESUMO ESTRUTURADO (REVISÃO RÁPIDA)

* Bullet points objetivos
* Ideal para revisão pré-prova
* Destaque palavras-chave
⚠️ 4. PRINCIPAIS PEGADINHAS DE PROVA

* Liste os erros mais comuns
* Explique por que são pegadinhas
* Mostre como a banca costuma cobrar
📝 5. QUESTÕES DE FIXAÇÃO (MUITAS)
Crie no mínimo:
·         10 questões nível fácil

* 10 questões nível médio
* 5 questões nível difícil
Formato:

* Múltipla escolha (A a E)
* C/E (certo errado estilo cespe)
* Formate de forma correta (pulando uma linha após cada questão para organizar melhor)

⚠️ ORDEM OBRIGATÓRIA:
1. PRIMEIRO mostre TODAS as 25 questões SEM as respostas (sem indicar gabarito, sem comentários, sem dicas).
2. DEPOIS, em uma seção separada chamada "GABARITO COMENTADO — QUESTÕES DE FIXAÇÃO", repita CADA questão com:
   * o gabarito (letra ou C/E)
   * explicação detalhada do porquê da alternativa correta
   * explicação de por que cada alternativa errada está errada
   * fundamentação legal/normativa quando aplicável

🎯 6. QUESTÕES ESTILO CERTO/ERRADO (CESPE)

⚠️ ORDEM OBRIGATÓRIA (igual à seção 5):
1. PRIMEIRO mostre as 20 assertivas SEM gabarito e SEM comentários.
2. DEPOIS, em uma seção separada chamada "GABARITO COMENTADO — CESPE C/E", repita CADA assertiva com:
   * gabarito (Certo / Errado)
   * justificativa detalhada (citando legislação, jurisprudência, doutrina)
   * indicação da pegadinha quando houver
🧩 7. DICAS DE PROVA

* Estratégias práticas
* Como identificar respostas corretas
* Padrões das bancas
🧩 8. DECOREBA

* Gere uma seção com todo o conteúdo que deve ser decorado na semana da prova
* Esse tipo de conteúdo é de memorização de curto prazo, então o aluno só estuda na semana da prova para não esquecer
* Ex: Prazos, Quantidade de Membros em uma Comissão, etc (sem prejuízo de outras)
📌 REGRAS IMPORTANTES

* NÃO resuma demais — quero conteúdo completo
* NÃO seja superficial
* Use exemplos práticos sempre que possível
* Escreva como se fosse uma apostila premium
* Linguagem clara, mas técnica
* Foco total em aprovação
* SEMPRE coloque as questões SEM as respostas primeiro e o GABARITO COMENTADO no final, em seção separada — isso vale para a seção 5 (questões de fixação) e a seção 6 (CESPE C/E). Nunca misture pergunta e resposta no mesmo bloco.
Agora gere o conteúdo completo.`;
  }

  function handleGerar() {
    if (!tema.trim()) { setTemaErro(true); return; }
    setTemaErro(false);

    // Defer heavy prompt building to avoid blocking the main thread (INP)
    setTimeout(() => {
    // Modo "Apostila Completa" usa o prompt-padrão completo, sem cabeçalho extra.
    if (modo === "apostila-completa") {
      const prompt = buildApostilaCompleta(tema.trim(), materia);
      setPromptGerado(prompt);
      setTimeout(() => { const el = document.getElementById("gp-output"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 150);
      return;
    }

    const modoSel = MODOS.find(m => m.id === modo);
    const nivelSel = NIVEIS.find(n => n.id === nivel);

    const ctx = [];
    if (materia.trim()) ctx.push(`MATÉRIA: ${materia.trim()}`);
    ctx.push(`TEMA: ${tema.trim()}`);
    if (banca.trim()) ctx.push(`BANCA / CONCURSO ALVO: ${banca.trim()}`);
    ctx.push(`NÍVEL DO ALUNO: ${nivelSel?.label || nivel}`);
    ctx.push(`MODO SOLICITADO: ${modoSel?.label || modo}`);

    let instrucao = "";
    switch (modo) {
      case "estudo-padrao":
        instrucao = `Produza uma aula completa e didática sobre "${tema}".
A aula deve conter:
1. Conceito-chave em 3 linhas (definição formal e objetiva)
2. Explicação aprofundada com exemplos práticos e situações reais de prova
3. Fundamentação legal/normativa (citar artigos da CF, leis, decretos)
4. Jurisprudência relevante (STF, STJ, TCU) quando aplicável
5. Pegadinhas e armadilhas que a banca costuma usar neste tema
6. 10 questões estilo ${(banca||"").trim()||"CESPE"} no final:
   - PRIMEIRO: mostre todas as 10 questões SEM gabarito
   - DEPOIS: seção "GABARITO COMENTADO" com cada questão repetida + gabarito + explicação detalhada de cada alternativa
7. Resumo final com os 5 tópicos mais importantes para a prova
8. Seção "DECOREBA" com prazos, números e dados que devem ser memorizados`;
        break;
      case "revisao-rapida":
        instrucao = `Faça uma revisão RÁPIDA e DIRETA sobre "${tema}".
Estrutura obrigatória:
1. CONCEITOS-CHAVE: bullets objetivos com as definições essenciais
2. O QUE MAIS CAI: os 5 pontos mais cobrados pela banca ${(banca||"").trim()||"CESPE"}
3. PEGADINHAS: as 3 armadilhas mais comuns neste tema
4. DIFERENÇAS IMPORTANTES: comparações que confundem candidatos
5. DECOREBA: prazos, números, exceções que precisam ser memorizados
6. FRASE-RESUMO: uma frase que sintetiza o tema inteiro

Seja direto, sem rodeios. Máximo 1 página. Foque APENAS no que cai em prova.`;
        break;
      case "questoes-comentadas":
        instrucao = `Crie 20 questões sobre "${tema}" no estilo da banca ${(banca||"").trim()||"CESPE/Cebraspe"}.

Distribuição:
- 10 questões em formato C/E (Certo/Errado)
- 5 questões de múltipla escolha (A a E) nível médio
- 5 questões de múltipla escolha (A a E) nível difícil

⚠️ ORDEM OBRIGATÓRIA:
1. PRIMEIRO: mostre TODAS as 20 questões SEM gabarito, SEM comentários, numeradas.
2. DEPOIS: seção separada "GABARITO COMENTADO" com cada questão repetida + gabarito + explicação detalhada:
   - Por que a alternativa correta está certa (com fundamentação legal)
   - Por que cada alternativa errada está errada
   - Indicação da pegadinha quando houver
   - Base legal/normativa/jurisprudencial

Nunca misture pergunta e resposta no mesmo bloco.`;
        break;
      case "mapa-mental":
        instrucao = `Construa um mapa mental textual COMPLETO do tema "${tema}".
Use estrutura hierárquica com indentação clara:

TEMA CENTRAL: ${tema}
├── Conceito 1
│   ├── Subconceito 1.1
│   │   └── Detalhe / Exceção
│   └── Subconceito 1.2
├── Conceito 2
│   ├── ...
└── Conceito N

Requisitos:
- Inclua TODOS os conceitos relevantes para prova
- Marque com ⚠️ os pontos que são pegadinha
- Marque com ⭐ os pontos mais cobrados
- Inclua fundamentação legal entre parênteses (Art. X, Lei Y)
- No final, adicione seção "CONEXÕES ENTRE CONCEITOS" mostrando relações cruzadas
- Adicione seção "TOP 5 COBRANÇAS EM PROVA" com os itens mais frequentes`;
        break;
      case "resumo":
        instrucao = `Faça um resumo completo e didático sobre "${tema}" para concurso ${(concursoAlvo||"").trim()||"público"}.
O resumo deve:
1. Começar com DEFINIÇÃO FORMAL (1-2 linhas)
2. CLASSIFICAÇÕES E ESPÉCIES — listar todas com breve explicação
3. PRINCÍPIOS APLICÁVEIS — enumerar e explicar cada um
4. EXCEÇÕES E CASOS ESPECIAIS — o que foge da regra geral
5. FUNDAMENTAÇÃO LEGAL — artigos da CF, leis, decretos relevantes
6. JURISPRUDÊNCIA — súmulas e decisões importantes
7. QUADRO-RESUMO — tabela comparativa quando aplicável
8. TOP 5 DO QUE MAIS CAI — os pontos mais cobrados pela banca ${(banca||"").trim()||"CESPE"}
9. PEGADINHAS — as 3 armadilhas mais comuns
10. DECOREBA — prazos, números, dados para memorizar

Use negrito para conceitos-chave. Máximo 3 páginas.`;
        break;
      case "macetes":
        instrucao = `Liste os MACETES, MNEMÔNICOS e PEGADINHAS sobre "${tema}" para a banca ${(banca||"").trim()||"CESPE"}.

Estrutura:
1. MNEMÔNICOS — crie frases/acrônimos para memorizar listas e classificações
2. MACETES DE PROVA — truques para identificar a resposta correta/errada rapidamente
3. PEGADINHAS DA BANCA — as armadilhas mais usadas pela ${(banca||"").trim()||"CESPE"} neste tema:
   - Mostre o enunciado típico da pegadinha
   - Explique por que o candidato erra
   - Dê a resposta correta com fundamentação
4. PALAVRAS-CHAVE — termos que indicam resposta CERTA vs ERRADA
   - Ex: "sempre", "nunca", "exclusivamente" → geralmente ERRADO
   - Ex: "em regra", "salvo disposição" → geralmente CERTO
5. DIFERENÇAS SUTIS — conceitos parecidos que confundem (com tabela comparativa)
6. DICAS DE ELIMINAÇÃO — como eliminar alternativas sem saber 100% do conteúdo`;
        break;
      case "comparativo":
        instrucao = `Crie um QUADRO COMPARATIVO COMPLETO sobre "${tema}" para concurso ${(concursoAlvo||"").trim()||"público"}.

Formato obrigatório:
1. TABELA PRINCIPAL em markdown com colunas: Conceito | Definição | Hipóteses/Requisitos | Efeitos/Consequências | Fundamentação Legal | Pegadinha de Prova

2. TABELA DE DIFERENÇAS CRÍTICAS — compare os conceitos que mais confundem:
   | Aspecto | Conceito A | Conceito B |
   Com destaque para o que a banca ${(banca||"").trim()||"CESPE"} cobra

3. RESUMO DAS DIFERENÇAS — em bullets, as distinções mais cobradas

4. QUESTÕES COMPARATIVAS — 5 questões C/E que exploram as diferenças:
   - PRIMEIRO todas sem gabarito
   - DEPOIS gabarito comentado explicando a distinção

5. DICA FINAL — como identificar qual conceito a banca está cobrando pelo enunciado`;
        break;
      case "jurisprudencia":
        instrucao = `Liste as principais DECISÕES, SÚMULAS e TESES FIXADAS sobre "${tema}" relevantes para concurso ${(concursoAlvo||"").trim()||"público"}.

Para cada item, apresente:
1. ÓRGÃO + IDENTIFICAÇÃO (ex: STF, RE 123.456 / Súmula Vinculante 13 / Acórdão TCU 1234/2023)
2. CONTEXTO — breve resumo do caso ou situação
3. TESE FIXADA — o que foi decidido (transcrever o trecho relevante)
4. IMPACTO PARA PROVA — por que isso cai e como a banca ${(banca||"").trim()||"CESPE"} cobra
5. PEGADINHA — como a banca distorce a tese para criar alternativa errada

Organize por:
- Súmulas Vinculantes do STF
- Súmulas do STJ
- Decisões do TCU
- Teses de Repercussão Geral
- Jurisprudência recente (últimos 3 anos)

No final, crie 5 questões C/E baseadas nessas decisões (primeiro sem gabarito, depois comentadas).`;
        break;
      default:
        instrucao = `Aborde o tema "${tema}" de forma completa para concurso ${(concursoAlvo||"").trim()||"público"}, banca ${(banca||"").trim()||"CESPE"}.`;
    }

    const prompt = `${BASE}\n\n${ctx.join("\n")}\n\n${instrucao}\n\nUse linguagem clara, exemplos concretos e referências à legislação quando aplicável. Adapte a profundidade ao nível "${nivelSel?.label || nivel}".`;
    setPromptGerado(prompt);
    setTimeout(() => { const el = document.getElementById("gp-output"); if (el) el.scrollIntoView({ behavior:"smooth", block:"start" }); }, 150);
    }, 0); // end setTimeout defer
  }

  function handleCopiar() {
    if (!promptGerado) return;
    navigator.clipboard.writeText(promptGerado).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  }

  function handleDownload() {
    if (!promptGerado) return;
    const blob = new Blob([promptGerado], { type:"text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "prompt-" + tema.trim().replace(/\s+/g,"-").toLowerCase().substring(0,40) + ".txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleAbrirChatGPT() {
    if (!promptGerado) return;
    handleCopiar();
    window.open("https://chat.openai.com/", "_blank");
  }

  function handleAbrirClaude() {
    if (!promptGerado) return;
    handleCopiar();
    window.open("https://claude.ai/", "_blank");
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 26, fontWeight: 900, fontFamily: "Cabinet Grotesk", marginBottom: 8 }}>🧠 Gerador Inteligente de Prompts para Concursos</h1>
        <p style={{ color: "var(--t2)", fontSize: 15, margin: 0 }}>Crie prompts premium para estudar qualquer assunto com IA (ChatGPT, Claude, Gemini).</p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: .6, textTransform: "uppercase", color: temaErro ? "var(--red,#ef4444)" : "var(--t3)", display: "block", marginBottom: 6 }}>📖 Tema da aula *</label>
            <input className="inp" value={tema} onChange={e => { setTema(e.target.value); if (e.target.value.trim()) setTemaErro(false); }} onKeyDown={e => e.key === "Enter" && handleGerar()} placeholder="Ex: Controle de Constitucionalidade · Licitações Lei 14.133" style={temaErro ? { borderColor: "var(--red,#ef4444)", boxShadow: "0 0 0 2px rgba(239,68,68,0.2)" } : {}} />
            {temaErro && <div style={{ fontSize: 11, color: "var(--red,#ef4444)", marginTop: 4, fontWeight: 600 }}>⚠️ O tema da aula é obrigatório</div>}
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: .6, textTransform: "uppercase", color: "var(--t3)", display: "block", marginBottom: 6 }}>📚 Matéria (opcional)</label>
            <input className="inp" value={materia} onChange={e => setMateria(e.target.value)} placeholder="Ex: Direito Constitucional" />
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: .6, textTransform: "uppercase", color: "var(--t3)", display: "block", marginBottom: 6 }}>🏛️ Banca / Concurso (opcional, para outros modos)</label>
          <input className="inp" value={banca} onChange={e => setBanca(e.target.value)} placeholder="Ex: TCE-RJ 2026 · CESPE/Cebraspe · FGV" />
        </div>

        {modo === "apostila-completa" && (
          <div style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: "var(--s2)", border: "1px dashed var(--b2)" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: .8, textTransform: "uppercase", color: "var(--green)", marginBottom: 10 }}>📘 Personalização da Apostila Completa</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: .6, textTransform: "uppercase", color: "var(--t3)", display: "block", marginBottom: 6 }}>👤 Perfil do Professor</label>
                <select className="inp" value={perfilProf} onChange={e => setPerfilProf(e.target.value)}>
                  {PERFIS_PROF.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: .6, textTransform: "uppercase", color: "var(--t3)", display: "block", marginBottom: 6 }}>🎓 Área de Especialidade</label>
                <input className="inp" value={especialidade} onChange={e => setEspecialidade(e.target.value)} placeholder="Ex: concursos públicos · medicina · direito tributário" />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: .6, textTransform: "uppercase", color: "var(--t3)", display: "block", marginBottom: 6 }}>🎯 Foco em provas de</label>
                <input className="inp" value={foco} onChange={e => setFoco(e.target.value)} placeholder="Ex: Tribunais de Contas (Banca CESPE)" />
              </div>
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: .6, textTransform: "uppercase", color: "var(--t3)", display: "block", marginBottom: 6 }}>📥 Pronto para download para</label>
              <input className="inp" value={concursoAlvo} onChange={e => setConcursoAlvo(e.target.value)} placeholder="Ex: cebraspe tcerj · prova TCU 2026" />
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--t3)" }}>
              💡 Esses 3 campos preenchem automaticamente o cabeçalho do prompt. Os valores padrão são "concursos públicos", "Tribunais de Contas (Banca CESPE)" e "cebraspe tcerj".
            </div>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: .6, textTransform: "uppercase", color: "var(--t3)", display: "block", marginBottom: 8 }}>📊 Seu nível neste tema</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {NIVEIS.map(n => (
              <label key={n.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", borderRadius: 8, background: nivel === n.id ? "var(--blue-d)" : "var(--s2)", border: "1.5px solid " + (nivel === n.id ? "var(--blue)" : "var(--b2)"), cursor: "pointer", transition: "all .15s" }}>
                <input type="radio" name="nivel" checked={nivel === n.id} onChange={() => setNivel(n.id)} style={{ accentColor: "var(--blue)", flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{n.label}</div>
                  <div style={{ fontSize: 10, color: "var(--t3)", marginTop: 2 }}>{n.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 4 }}>
          <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: .6, textTransform: "uppercase", color: "var(--t3)", display: "block", marginBottom: 8 }}>🎯 O que você quer fazer?</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
            {MODOS.map(m => (
              <label key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px", borderRadius: 10, background: modo === m.id ? "var(--green-d)" : "var(--s2)", border: "1.5px solid " + (modo === m.id ? "var(--green)" : "var(--b2)"), cursor: "pointer", transition: "all .15s" }}>
                <input type="radio" name="modo" checked={modo === m.id} onChange={() => setModo(m.id)} style={{ accentColor: "var(--green)", flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{m.icon} {m.label}</div>
                  <div style={{ fontSize: 11, color: "var(--t3)", marginTop: 2 }}>{m.desc}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
      </div>

      <button className="btn btn-primary" onClick={handleGerar} style={{ width: "100%", padding: "14px", fontSize: 15, fontWeight: 700 }}>✨ Gerar Prompt</button>

      {promptGerado && (
        <div id="gp-output" className="card" style={{ marginTop: 24 }}>
          <div className="row-b" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--t1)" }}>📋 Prompt gerado</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="btn btn-ghost btn-xs" onClick={handleCopiar}>{copied ? "✓ Copiado" : "📋 Copiar"}</button>
              <button className="btn btn-ghost btn-xs" onClick={handleDownload}>⬇ Baixar .txt</button>
              <button className="btn btn-ghost btn-xs" onClick={handleAbrirChatGPT}>🤖 Abrir ChatGPT</button>
              <button className="btn btn-ghost btn-xs" onClick={handleAbrirClaude}>🧡 Abrir Claude</button>
            </div>
          </div>
          <pre style={{ margin: 0, padding: 14, background: "var(--bg)", borderRadius: 8, fontSize: 13, lineHeight: 1.6, color: "var(--t1)", whiteSpace: "pre-wrap", fontFamily: "ui-monospace, monospace", border: "1px solid var(--b1)" }}>{promptGerado}</pre>
          <div style={{ marginTop: 12, fontSize: 11, color: "var(--t3)" }}>
            💡 Dica: copie o prompt e cole no ChatGPT, Claude, Gemini ou qualquer IA. Para resultados melhores, use modelos pagos (GPT-4o, Claude Opus/Sonnet 4.x).
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================================
// BATALHA: Area do aluno
// ============================================================
function AlunoBatalha({ user, refresh }) {
  const batalhas = batalhasModule.getByAluno(user.id);
  return (
    <div>
      <div className="ph"><div><h1>⚔️ Batalha</h1><p>Compita com seus colegas resolvendo simulados</p></div></div>
      <div className="card">
        {batalhas.length === 0 ? (
          <p className="text-muted text-sm">Nenhuma batalha disponível no momento.</p>
        ) : (
          <div>{batalhas.length} batalha(s) disponível(eis). Recurso completo será restaurado em breve.</div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ErrorBoundary — evita "tela preta" quando um componente filho
// dispara exceção durante o render. Mostra fallback amigável e
// permite tentar novamente sem perder a sessão.
// ============================================================
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    try { console.error("[EstudaAI] ErrorBoundary capturou:", error, info); } catch(_){}
    try { logModule.add("system", `Erro de render: ${error?.message || error}`, { stack: (error?.stack||"").slice(0, 800) }); } catch(_){}
  }
  reset = () => this.setState({ error: null });
  render() {
    if (!this.state.error) return this.props.children;
    const msg = this.state.error?.message || String(this.state.error);
    return (
      <div className="card" style={{ maxWidth: 560, margin: "60px auto", padding: 28 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
        <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Algo deu errado nesta tela</h2>
        <p style={{ fontSize: 13, color: "var(--t2)", marginBottom: 14 }}>
          A interface encontrou um erro e não pôde ser exibida. Seus dados estão a salvo.
        </p>
        <details style={{ marginBottom: 16, fontSize: 12, color: "var(--t3)" }}>
          <summary style={{ cursor: "pointer" }}>Detalhes técnicos</summary>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 8, padding: 10, background: "var(--s2)", borderRadius: 8, fontSize: 11 }}>{msg}</pre>
        </details>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-green" onClick={this.reset}>Tentar novamente</button>
          <button className="btn btn-ghost" onClick={() => window.location.reload()}>Recarregar página</button>
        </div>
      </div>
    );
  }
}

// ============================================================
// GLOBAL: Modal de Confirmação Customizado (substitui window.confirm/alert)
// ============================================================
let _modalResolve = null;
let _modalSetState = null;

function confirmar({ titulo, mensagem, tipo = "neutro", confirmLabel, cancelLabel }) {
  return new Promise((resolve) => {
    _modalResolve = resolve;
    if (_modalSetState) {
      _modalSetState({
        open: true,
        titulo: titulo || "Confirmar",
        mensagem: mensagem || "",
        tipo, // "destrutivo" | "neutro" | "info"
        confirmLabel: confirmLabel || (tipo === "destrutivo" ? "Excluir" : "Confirmar"),
        cancelLabel: cancelLabel || "Cancelar",
      });
    } else {
      // Fallback se modal não montado
      resolve(window.confirm(mensagem || titulo));
    }
  });
}

function alertar({ titulo, mensagem }) {
  return new Promise((resolve) => {
    _modalResolve = () => resolve(true);
    if (_modalSetState) {
      _modalSetState({
        open: true,
        titulo: titulo || "Aviso",
        mensagem: mensagem || "",
        tipo: "info",
        confirmLabel: "OK",
        cancelLabel: null, // sem botão cancelar
      });
    } else {
      window.alert(mensagem || titulo);
      resolve(true);
    }
  });
}

function ModalConfirmacao() {
  const [state, setState] = useState({ open: false, titulo: "", mensagem: "", tipo: "neutro", confirmLabel: "Confirmar", cancelLabel: "Cancelar" });
  useEffect(() => { _modalSetState = setState; return () => { _modalSetState = null; }; }, []);

  if (!state.open) return null;

  const handleConfirm = () => { setState(s => ({ ...s, open: false })); if (_modalResolve) { _modalResolve(true); _modalResolve = null; } };
  const handleCancel = () => { setState(s => ({ ...s, open: false })); if (_modalResolve) { _modalResolve(false); _modalResolve = null; } };

  const btnColor = state.tipo === "destrutivo" ? "var(--red,#ef4444)" : "var(--green,#22c55e)";

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:9999,padding:16}} onClick={handleCancel}>
      <div className="card" style={{maxWidth:440,width:"100%",animation:"fadeIn .15s"}} onClick={e => e.stopPropagation()}>
        <h3 style={{margin:"0 0 10px",fontSize:16,color:"var(--t1)"}}>{state.titulo}</h3>
        <p style={{margin:"0 0 20px",fontSize:13,color:"var(--t2)",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{state.mensagem}</p>
        <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
          {state.cancelLabel && (
            <button className="btn btn-ghost" onClick={handleCancel}>{state.cancelLabel}</button>
          )}
          <button className="btn" style={{background:btnColor,color:"#fff"}} onClick={handleConfirm}>{state.confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [page, setPage] = useState("dashboard");
  const [tick, setTick] = useState(0);
  const [dbLoaded, setDbLoaded] = useState(false);
  const refresh = () => setTick(t => t + 1);

  useEffect(() => {
    storage.load().then(() => {
      setDbLoaded(true);
      try { planosModule.iniciarRemanejamentoAutomatico(); }
      catch(e) { console.warn("[EstudaAI] iniciarRemanejamentoAutomatico:", e); }
      try {
        const savedId = localStorage.getItem('estudaai_session');
        if (savedId) {
          const u = storage.get().users.find(x => x.id === savedId);
          if (u) { _session = u; setUser(u); }
        }
      } catch(e) {}
    });

    // Quando um conflito for detectado e recarregarmos do servidor, força re-render
    storage.onRemoteReload(() => refresh());

    // Realtime: se outra aba/dispositivo alterar o app_state, recarrega
    let channel = null;
    try {
      channel = supabase
        .channel('app_state_changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'app_state', filter: 'id=eq.main' },
          () => { storage.load().then(() => refresh()); }
        )
        .subscribe();
    } catch (e) {
      console.warn("[EstudaAI] Realtime subscribe error:", e);
    }

    // Recarrega quando a aba volta ao foco — protege contra abas dormentes com dados antigos
    const onFocus = () => { storage.load().then(() => refresh()); };
    const onVisibility = () => { if (document.visibilityState === 'visible') onFocus(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      try { if (channel) supabase.removeChannel(channel); } catch(e) {}
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  function handleLogin(u)  {
    try { localStorage.setItem('estudaai_session', u.id); } catch(e) {}
    setUser(u); setPage("dashboard");
  }
  function handleLogout()  {
    try { localStorage.removeItem('estudaai_session'); } catch(e) {}
    googleLogout();
    authModule.logout(); setUser(null); setPage("dashboard");
  }

  if (!dbLoaded) return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", minHeight:"100vh", background:"var(--bg)", flexDirection:"column", gap:"16px" }}>
        <div style={{ width:40, height:40, border:"3px solid var(--b2)", borderTop:"3px solid var(--blue)", borderRadius:"50%", animation:"spin 0.8s linear infinite" }}/>
        <div style={{ fontSize:13, color:"var(--t3)" }}>Carregando...</div>
      </div>
    </>
  );

  if (!user) return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <ModalConfirmacao />
      <LoginPage onLogin={handleLogin} />
    </>
  );

  function renderPage() {
    if (user.role === "admin") {
      if (page === "dashboard") return <AdminDashboard refresh={refresh}/>;
      if (page === "coaches")   return <AdminCoaches   refresh={refresh}/>;
      if (page === "alunos")    return <AdminAlunos    refresh={refresh}/>;
      if (page === "logs")      return <AdminLogs/>;
      if (page === "debug")     return <AdminDebug/>;
    }
    if (user.role === "coach") {
      if (page === "dashboard")       return <CoachDashboard       user={user} refresh={refresh}/>;
      if (page === "alunos")          return <CoachAlunos          user={user} refresh={refresh}/>;
      if (page === "editais")         return <CoachEditais         user={user} refresh={refresh}/>;
      if (page === "gerenciar-plano") return <CoachGerenciarPlanos user={user} refresh={refresh}/>;
      if (page === "progresso")       return <CoachProgresso       user={user}/>;
      if (page === "conteudo")        return <CoachConteudo        user={user} refresh={refresh}/>;
      if (page === "resumos")         return <CoachResumos         user={user} refresh={refresh}/>;
      if (page === "simulados")       return <CoachSimulados       user={user} refresh={refresh}/>;
      if (page === "ranking")         return <CoachRanking         user={user}/>;
      if (page === "gerador-prompt")  return <GeradorDePrompt/>;
      if (page === "batalha")         return <CoachBatalha user={user} refresh={refresh}/>;
    }
    if (user.role === "aluno") {
      if (page === "dashboard") return <AlunoDashboard user={user} refresh={refresh} setPage={setPage}/>;
      if (page === "plano")     return <AlunoPlano     user={user} refresh={refresh}/>;
      if (page === "rotina")    return <AlunoRotina    user={user} refresh={refresh}/>;
      if (page === "progresso") return <AlunoProgresso user={user}/>;
      if (page === "resumos")   return <AlunoResumos   user={user} refresh={refresh}/>;
      if (page === "conteudos") return <AlunoConteudos user={user}/>;
      if (page === "simulados") return <AlunoSimulados user={user} refresh={refresh}/>;
      if (page === "ranking")   return <AlunoRanking   user={user}/>;
      if (page === "gerador-prompt") return <GeradorDePrompt/>;
      if (page === "batalha")   return <AlunoBatalha user={user} refresh={refresh}/>;
    }
    return null;
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <ModalConfirmacao />
      <Layout user={user} page={page} setPage={setPage} onLogout={handleLogout}>
        <ErrorBoundary key={`${user?.id || "anon"}-${page}`}>
          {renderPage()}
        </ErrorBoundary>
      </Layout>
    </>
  );
}

