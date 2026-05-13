-- ============================================================
-- EstudaAI — Schema Relacional para Supabase (PostgreSQL)
-- Gerado em: 2026-05-12
-- ============================================================

-- Extensão para gerar UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. USERS
-- ============================================================
CREATE TABLE users (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  email      TEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'coach', 'aluno')),
  coach_id   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_coach_id ON users(coach_id);

-- ============================================================
-- 2. EDITAIS
-- ============================================================
CREATE TABLE editais (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  coach_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_editais_coach_id ON editais(coach_id);

-- ============================================================
-- 3. MATERIAS
-- ============================================================
CREATE TABLE materias (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  edital_id     UUID NOT NULL REFERENCES editais(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  color         TEXT,
  review_preset TEXT DEFAULT 'moderada' CHECK (review_preset IN ('baixa', 'moderada', 'intensa')),
  ordem         INT DEFAULT 0
);

CREATE INDEX idx_materias_edital_id ON materias(edital_id);

-- ============================================================
-- 4. TOPICOS
-- ============================================================
CREATE TABLE topicos (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  materia_id      UUID NOT NULL REFERENCES materias(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  conteudo_baixa  TEXT,
  conteudo_media  TEXT,
  conteudo_alta   TEXT,
  material_url    TEXT,
  material_name   TEXT,
  ordem           INT DEFAULT 0
);

CREATE INDEX idx_topicos_materia_id ON topicos(materia_id);

-- ============================================================
-- 5. ALUNO_EDITAIS (associativa)
-- ============================================================
CREATE TABLE aluno_editais (
  aluno_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  edital_id UUID NOT NULL REFERENCES editais(id) ON DELETE CASCADE,
  PRIMARY KEY (aluno_id, edital_id)
);

-- ============================================================
-- 6. PLANOS
-- ============================================================
CREATE TABLE planos (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aluno_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  edital_id        UUID NOT NULL REFERENCES editais(id) ON DELETE CASCADE,
  rotina           JSONB,
  plan             JSONB,
  nivel_cobertura  JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_planos_aluno_id ON planos(aluno_id);
CREATE INDEX idx_planos_edital_id ON planos(edital_id);

-- ============================================================
-- 7. PROGRESSO
-- ============================================================
CREATE TABLE progresso (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aluno_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plano_id  UUID NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
  key       TEXT NOT NULL,
  done      BOOLEAN NOT NULL DEFAULT false,
  at        TIMESTAMPTZ,
  UNIQUE (aluno_id, plano_id, key)
);

CREATE INDEX idx_progresso_aluno_plano ON progresso(aluno_id, plano_id);

-- ============================================================
-- 8. STUDY_NOTES
-- ============================================================
CREATE TABLE study_notes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aluno_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plano_id   UUID NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
  topic_id   TEXT NOT NULL,
  note       TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (aluno_id, plano_id, topic_id)
);

CREATE INDEX idx_study_notes_aluno ON study_notes(aluno_id);

-- ============================================================
-- 9. RESUMO_COMMENTS
-- ============================================================
CREATE TABLE resumo_comments (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aluno_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plano_id      UUID NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
  topic_id      TEXT NOT NULL,
  coach_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_comment TEXT,
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (aluno_id, plano_id, topic_id)
);

-- ============================================================
-- 10. RESUMO_ADDITIONS
-- ============================================================
CREATE TABLE resumo_additions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aluno_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plano_id   UUID NOT NULL REFERENCES planos(id) ON DELETE CASCADE,
  topic_id   TEXT NOT NULL,
  coach_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addition   TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (aluno_id, plano_id, topic_id)
);

-- ============================================================
-- 11. GAMIFICACAO
-- ============================================================
CREATE TABLE gamificacao (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  aluno_id  UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_goal INT NOT NULL DEFAULT 5
);

-- ============================================================
-- 12. SIMULADOS
-- ============================================================
CREATE TABLE simulados (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coach_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  edital_id         UUID NOT NULL REFERENCES editais(id) ON DELETE CASCADE,
  nome              TEXT NOT NULL,
  tipo              TEXT CHECK (tipo IN ('geral', 'materia')),
  materia_id        UUID REFERENCES materias(id) ON DELETE SET NULL,
  descricao         TEXT,
  alunos_permitidos UUID[],
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_simulados_coach_id ON simulados(coach_id);
CREATE INDEX idx_simulados_edital_id ON simulados(edital_id);

-- ============================================================
-- 13. QUESTOES
-- ============================================================
CREATE TABLE questoes (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  simulado_id   UUID NOT NULL REFERENCES simulados(id) ON DELETE CASCADE,
  tipo          TEXT CHECK (tipo IN ('ce', 'multipla')),
  enunciado     TEXT NOT NULL,
  alternativas  JSONB,
  gabarito      TEXT NOT NULL,
  ordem         INT DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_questoes_simulado_id ON questoes(simulado_id);

-- ============================================================
-- 14. TENTATIVAS
-- ============================================================
CREATE TABLE tentativas (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  simulado_id      UUID NOT NULL REFERENCES simulados(id) ON DELETE CASCADE,
  aluno_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  respostas        JSONB DEFAULT '[]'::jsonb,
  status           TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento', 'finalizada')),
  acertos          INT,
  erros            INT,
  brancos          INT,
  pontos_cebraspe  NUMERIC,
  percentual       NUMERIC,
  tempo_gasto      INT,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at      TIMESTAMPTZ
);

CREATE INDEX idx_tentativas_simulado_id ON tentativas(simulado_id);
CREATE INDEX idx_tentativas_aluno_id ON tentativas(aluno_id);

-- ============================================================
-- 15. BATALHAS
-- ============================================================
CREATE TABLE batalhas (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome         TEXT,
  coach_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  simulado_id  UUID NOT NULL REFERENCES simulados(id) ON DELETE CASCADE,
  data_fim     TIMESTAMPTZ,
  tempo_limite INT,
  status       TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'encerrada')),
  criada_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_batalhas_coach_id ON batalhas(coach_id);

-- ============================================================
-- 16. BATALHA_PARTICIPANTES
-- ============================================================
CREATE TABLE batalha_participantes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batalha_id      UUID NOT NULL REFERENCES batalhas(id) ON DELETE CASCADE,
  aluno_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tentativa_id    UUID REFERENCES tentativas(id) ON DELETE SET NULL,
  finalizado      BOOLEAN NOT NULL DEFAULT false,
  acertos         INT DEFAULT 0,
  erros           INT DEFAULT 0,
  brancos         INT DEFAULT 0,
  pontos_cebraspe NUMERIC,
  percentual      NUMERIC DEFAULT 0,
  tempo_gasto     INT DEFAULT 0
);

CREATE INDEX idx_batalha_part_batalha ON batalha_participantes(batalha_id);
CREATE INDEX idx_batalha_part_aluno ON batalha_participantes(aluno_id);

-- ============================================================
-- 17. FEEDBACK_SIMULADO
-- ============================================================
CREATE TABLE feedback_simulado (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tentativa_id          UUID UNIQUE NOT NULL REFERENCES tentativas(id) ON DELETE CASCADE,
  simulado_id           UUID NOT NULL REFERENCES simulados(id) ON DELETE CASCADE,
  aluno_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coach_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comentarios_questoes  JSONB DEFAULT '[]'::jsonb,
  orientacoes_gerais    TEXT,
  sugestoes_conteudo    TEXT,
  temas_revisar         TEXT,
  status                TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'enviado')),
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em         TIMESTAMPTZ DEFAULT now(),
  enviado_em            TIMESTAMPTZ
);

CREATE INDEX idx_feedback_aluno ON feedback_simulado(aluno_id);
CREATE INDEX idx_feedback_coach ON feedback_simulado(coach_id);

-- ============================================================
-- 18. LOGS
-- ============================================================
CREATE TABLE logs (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_id   TEXT NOT NULL,
  message    TEXT NOT NULL,
  meta       JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_logs_actor ON logs(actor_id);
CREATE INDEX idx_logs_created ON logs(created_at DESC);
