// ============================================================
// EstudaAI — Camada de acesso ao Google Sheets via Apps Script
// Módulos: Users, Editais, Materias, Topicos, AlunoEditais
// ============================================================

// URL do Google Apps Script Web App
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyhT495ELPbDX_d9ph28WbFzUYzTdwu5sau9LkUZu7-FbReLWuXpC2I8GjuJrE3ZOVWGA/exec';

// ============================================================
// HELPER — fetch genérico
// ============================================================
async function sheetsGet(module, action, params = {}) {
  const query = new URLSearchParams({ module, action, ...params }).toString();
  const res = await fetch(`${APPS_SCRIPT_URL}?${query}`);
  const json = await res.json();
  if (json.status === 'error') throw new Error(json.error);
  return json.data;
}

async function sheetsPost(module, action, body = {}) {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ module, action, ...body }),
  });
  const json = await res.json();
  if (json.status === 'error') throw new Error(json.error);
  return json.data;
}

// ============================================================
// CACHE LOCAL — reduz chamadas à API
// ============================================================
const _cache = {};
const CACHE_TTL = 30000; // 30 segundos

function getCached(key) {
  const entry = _cache[key];
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) return null;
  return entry.data;
}

function setCache(key, data) {
  _cache[key] = { data, ts: Date.now() };
}

function invalidateCache(key) {
  if (key) {
    Object.keys(_cache).forEach(k => { if (k.startsWith(key)) delete _cache[k]; });
  } else {
    Object.keys(_cache).forEach(k => delete _cache[k]);
  }
}

// ============================================================
// MODULE: sheetsUsersModule
// ============================================================
export const sheetsUsersModule = {
  async getAll(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = getCached('users_all');
      if (cached) return cached;
    }
    const users = await sheetsGet('users', 'getAll');
    setCache('users_all', users);
    return users;
  },

  async getById(id) {
    const cached = getCached('users_all');
    if (cached) {
      const found = cached.find(u => u.id === id);
      if (found) return found;
    }
    return await sheetsGet('users', 'getById', { id });
  },

  async getByEmail(email) {
    return await sheetsGet('users', 'getByEmail', { email });
  },

  async getCoaches() {
    const all = await this.getAll();
    return all.filter(u => u.role === 'coach');
  },

  async getAlunos(coachId = null) {
    if (coachId) {
      return await sheetsGet('users', 'getAlunos', { coachId });
    }
    const all = await this.getAll();
    return all.filter(u => u.role === 'aluno');
  },

  async create(data) {
    invalidateCache('users');
    return await sheetsPost('users', 'create', data);
  },

  async update(id, data) {
    invalidateCache('users');
    return await sheetsPost('users', 'update', { id, data });
  },

  async delete(id) {
    invalidateCache('users');
    return await sheetsPost('users', 'delete', { id });
  },

  async upsertByEmail({ email, name, avatar_url, role, coach_id }) {
    invalidateCache('users');
    return await sheetsPost('users', 'upsertByEmail', { email, name, avatar_url, role, coach_id });
  },
};

// ============================================================
// MODULE: sheetsEditaisModule
// ============================================================
export const sheetsEditaisModule = {
  async getAll(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = getCached('editais_all');
      if (cached) return cached;
    }
    const data = await sheetsGet('editais', 'getAll');
    setCache('editais_all', data);
    return data;
  },

  async getById(id) {
    const cached = getCached('editais_all');
    if (cached) {
      const found = cached.find(e => e.id === id);
      if (found) return found;
    }
    return await sheetsGet('editais', 'getById', { id });
  },

  async getByCoach(coachId) {
    return await sheetsGet('editais', 'getByCoach', { coachId });
  },

  async create(data) {
    invalidateCache('editais');
    return await sheetsPost('editais', 'create', data);
  },

  async update(id, data) {
    invalidateCache('editais');
    return await sheetsPost('editais', 'update', { id, data });
  },

  async delete(id) {
    invalidateCache('editais');
    return await sheetsPost('editais', 'delete', { id });
  },
};

// ============================================================
// MODULE: sheetsMateriasModule
// ============================================================
export const sheetsMateriasModule = {
  async getAll(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = getCached('materias_all');
      if (cached) return cached;
    }
    const data = await sheetsGet('materias', 'getAll');
    setCache('materias_all', data);
    return data;
  },

  async getById(id) {
    return await sheetsGet('materias', 'getById', { id });
  },

  async getByEdital(editalId) {
    const cacheKey = 'materias_edital_' + editalId;
    const cached = getCached(cacheKey);
    if (cached) return cached;
    const data = await sheetsGet('materias', 'getByEdital', { editalId });
    setCache(cacheKey, data);
    return data;
  },

  async create(data) {
    invalidateCache('materias');
    return await sheetsPost('materias', 'create', data);
  },

  async update(id, data) {
    invalidateCache('materias');
    return await sheetsPost('materias', 'update', { id, data });
  },

  async delete(id) {
    invalidateCache('materias');
    return await sheetsPost('materias', 'delete', { id });
  },

  async deleteByEdital(edital_id) {
    invalidateCache('materias');
    return await sheetsPost('materias', 'deleteByEdital', { edital_id });
  },
};

// ============================================================
// MODULE: sheetsTopicosModule
// ============================================================
export const sheetsTopicosModule = {
  async getAll(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = getCached('topicos_all');
      if (cached) return cached;
    }
    const data = await sheetsGet('topicos', 'getAll');
    setCache('topicos_all', data);
    return data;
  },

  async getById(id) {
    return await sheetsGet('topicos', 'getById', { id });
  },

  async getByMateria(materiaId) {
    const cacheKey = 'topicos_materia_' + materiaId;
    const cached = getCached(cacheKey);
    if (cached) return cached;
    const data = await sheetsGet('topicos', 'getByMateria', { materiaId });
    setCache(cacheKey, data);
    return data;
  },

  async getByEdital(editalId) {
    const cacheKey = 'topicos_edital_' + editalId;
    const cached = getCached(cacheKey);
    if (cached) return cached;
    const data = await sheetsGet('topicos', 'getByEdital', { editalId });
    setCache(cacheKey, data);
    return data;
  },

  async create(data) {
    invalidateCache('topicos');
    return await sheetsPost('topicos', 'create', data);
  },

  async createBatch(items) {
    invalidateCache('topicos');
    return await sheetsPost('topicos', 'createBatch', { items });
  },

  async update(id, data) {
    invalidateCache('topicos');
    return await sheetsPost('topicos', 'update', { id, data });
  },

  async delete(id) {
    invalidateCache('topicos');
    return await sheetsPost('topicos', 'delete', { id });
  },

  async deleteByMateria(materia_id) {
    invalidateCache('topicos');
    return await sheetsPost('topicos', 'deleteByMateria', { materia_id });
  },
};

// ============================================================
// MODULE: sheetsAlunoEditaisModule
// ============================================================
export const sheetsAlunoEditaisModule = {
  async getAll() {
    return await sheetsGet('aluno_editais', 'getAll');
  },

  async getByAluno(alunoId) {
    return await sheetsGet('aluno_editais', 'getByAluno', { alunoId });
  },

  async getByEdital(editalId) {
    return await sheetsGet('aluno_editais', 'getByEdital', { editalId });
  },

  async associar(aluno_id, edital_id) {
    return await sheetsPost('aluno_editais', 'associar', { aluno_id, edital_id });
  },

  async desassociar(aluno_id, edital_id) {
    return await sheetsPost('aluno_editais', 'desassociar', { aluno_id, edital_id });
  },
};

// ============================================================
// MODULE: sheetsPlanosModule
// ============================================================
export const sheetsPlanosModule = {
  async getAll() {
    return await sheetsGet('planos', 'getAll');
  },

  async getById(id) {
    return await sheetsGet('planos', 'getById', { id });
  },

  async getByAluno(alunoId) {
    return await sheetsGet('planos', 'getByAluno', { alunoId });
  },

  async getByAlunoEdital(alunoId, editalId) {
    return await sheetsGet('planos', 'getByAlunoEdital', { alunoId, editalId });
  },

  async create(data) {
    invalidateCache('planos');
    return await sheetsPost('planos', 'create', data);
  },

  async update(id, data) {
    invalidateCache('planos');
    return await sheetsPost('planos', 'update', { id, data });
  },

  async delete(id) {
    invalidateCache('planos');
    return await sheetsPost('planos', 'delete', { id });
  },

  async deleteByAlunoEdital(aluno_id, edital_id) {
    invalidateCache('planos');
    return await sheetsPost('planos', 'deleteByAlunoEdital', { aluno_id, edital_id });
  },
};

// ============================================================
// MODULE: sheetsProgressoModule
// ============================================================
export const sheetsProgressoModule = {
  async getByAlunoPlano(alunoId, planoId) {
    return await sheetsGet('progresso', 'getByAlunoPlano', { alunoId, planoId });
  },

  async getByAluno(alunoId) {
    return await sheetsGet('progresso', 'getByAluno', { alunoId });
  },

  async toggle(aluno_id, plano_id, key) {
    return await sheetsPost('progresso', 'toggle', { aluno_id, plano_id, key });
  },

  async set(aluno_id, plano_id, key, done) {
    return await sheetsPost('progresso', 'set', { aluno_id, plano_id, key, done });
  },

  async deleteByPlano(plano_id) {
    return await sheetsPost('progresso', 'deleteByPlano', { plano_id });
  },
};

// ============================================================
// MODULE: sheetsStudyNotesModule
// ============================================================
export const sheetsStudyNotesModule = {
  async getByAluno(alunoId) {
    return await sheetsGet('study_notes', 'getByAluno', { alunoId });
  },

  async getOne(alunoId, planoId, topicId) {
    return await sheetsGet('study_notes', 'getOne', { alunoId, planoId, topicId });
  },

  async save(aluno_id, plano_id, topic_id, note) {
    return await sheetsPost('study_notes', 'save', { aluno_id, plano_id, topic_id, note });
  },

  async delete(aluno_id, plano_id, topic_id) {
    return await sheetsPost('study_notes', 'delete', { aluno_id, plano_id, topic_id });
  },
};

// ============================================================
// MODULE: sheetsGamificacaoModule
// ============================================================
export const sheetsGamificacaoModule = {
  async getByAluno(alunoId) {
    return await sheetsGet('gamificacao', 'getByAluno', { alunoId });
  },

  async setMeta(aluno_id, week_goal) {
    return await sheetsPost('gamificacao', 'setMeta', { aluno_id, week_goal });
  },
};

// ============================================================
// EXPORTS
// ============================================================
export { APPS_SCRIPT_URL, sheetsGet, sheetsPost, invalidateCache };
