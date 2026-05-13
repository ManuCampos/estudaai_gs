# EstudaAI — Migração para Google Sheets

## Arquitetura

```
App.jsx  →  sheetsApi.js  →  Google Apps Script (Web App)  →  Google Sheets
                                      ↕
                              Google OAuth (login)
```

## Planilhas Separadas (uma por domínio)

Cada planilha terá uma única aba com os dados tabulares. O Apps Script acessa todas via ID.

### 1. Planilha: `estudaai_users`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | UUID gerado no app |
| name | string | |
| email | string | email Google (OAuth) |
| role | string | admin / coach / aluno |
| coach_id | string | id do coach (se aluno) |
| avatar_url | string | foto do Google |
| created_at | string (ISO) | |

### 2. Planilha: `estudaai_editais`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | |
| name | string | |
| coach_id | string | FK → users |
| created_at | string (ISO) | |

### 3. Planilha: `estudaai_materias`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | |
| edital_id | string | FK → editais |
| name | string | |
| color | string | hex |
| review_preset | string | baixa/moderada/intensa |
| ordem | number | |

### 4. Planilha: `estudaai_topicos`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | |
| materia_id | string | FK → materias |
| name | string | |
| conteudo_baixa | string | |
| conteudo_media | string | |
| conteudo_alta | string | |
| material_url | string | |
| material_name | string | |
| ordem | number | |

### 5. Planilha: `estudaai_aluno_editais`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| aluno_id | string | FK → users |
| edital_id | string | FK → editais |

### 6. Planilha: `estudaai_planos`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | |
| aluno_id | string | FK → users |
| edital_id | string | FK → editais |
| rotina | string (JSON) | config serializada |
| plan | string (JSON) | mapa de dias serializado |
| nivel_cobertura | string (JSON) | array serializado |
| created_at | string (ISO) | |

### 7. Planilha: `estudaai_progresso`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | |
| aluno_id | string | |
| plano_id | string | |
| key | string | identificador dia/tópico |
| done | boolean | |
| at | string (ISO) | |

### 8. Planilha: `estudaai_study_notes`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | |
| aluno_id | string | |
| plano_id | string | |
| topic_id | string | |
| note | string | conteúdo do resumo |
| updated_at | string (ISO) | |

### 9. Planilha: `estudaai_simulados`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | |
| coach_id | string | |
| edital_id | string | |
| nome | string | |
| tipo | string | geral/materia |
| materia_id | string | |
| descricao | string | |
| alunos_permitidos | string (JSON) | array de IDs |
| created_at | string (ISO) | |
| updated_at | string (ISO) | |

### 10. Planilha: `estudaai_questoes`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | |
| simulado_id | string | |
| tipo | string | ce/multipla |
| enunciado | string | |
| alternativas | string (JSON) | |
| gabarito | string | |
| ordem | number | |
| created_at | string (ISO) | |

### 11. Planilha: `estudaai_tentativas`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | |
| simulado_id | string | |
| aluno_id | string | |
| respostas | string (JSON) | |
| status | string | em_andamento/finalizada |
| acertos | number | |
| erros | number | |
| brancos | number | |
| pontos_cebraspe | number | |
| percentual | number | |
| tempo_gasto | number | |
| started_at | string (ISO) | |
| finished_at | string (ISO) | |

### 12. Planilha: `estudaai_batalhas`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | |
| nome | string | |
| coach_id | string | |
| simulado_id | string | |
| data_fim | string (ISO) | |
| tempo_limite | number | |
| status | string | ativa/encerrada |
| criada_em | string (ISO) | |

### 13. Planilha: `estudaai_batalha_participantes`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | |
| batalha_id | string | |
| aluno_id | string | |
| tentativa_id | string | |
| finalizado | boolean | |
| acertos | number | |
| erros | number | |
| brancos | number | |
| pontos_cebraspe | number | |
| percentual | number | |
| tempo_gasto | number | |

### 14. Planilha: `estudaai_feedback_simulado`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | |
| tentativa_id | string | |
| simulado_id | string | |
| aluno_id | string | |
| coach_id | string | |
| comentarios_questoes | string (JSON) | |
| orientacoes_gerais | string | |
| sugestoes_conteudo | string | |
| temas_revisar | string | |
| status | string | rascunho/enviado |
| criado_em | string (ISO) | |
| atualizado_em | string (ISO) | |
| enviado_em | string (ISO) | |

### 15. Planilha: `estudaai_resumo_comments`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | |
| aluno_id | string | |
| plano_id | string | |
| topic_id | string | |
| coach_id | string | |
| coach_comment | string | |
| updated_at | string (ISO) | |

### 16. Planilha: `estudaai_resumo_additions`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | |
| aluno_id | string | |
| plano_id | string | |
| topic_id | string | |
| coach_id | string | |
| addition | string | |
| updated_at | string (ISO) | |

### 17. Planilha: `estudaai_gamificacao`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | |
| aluno_id | string | |
| week_goal | number | |

### 18. Planilha: `estudaai_logs`
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | string | |
| actor_id | string | |
| message | string | |
| meta | string (JSON) | |
| created_at | string (ISO) | |

---

## Plano de Migração Incremental

### Fase 1 — Fundação (atual)
1. Criar Apps Script com CRUD genérico
2. Implementar Google OAuth no App.jsx
3. Migrar módulo `users` (primeiro módulo)

### Fase 2 — Conteúdo
4. Migrar `editais` + `materias` + `topicos`
5. Migrar `aluno_editais`

### Fase 3 — Planos e Progresso
6. Migrar `planos`
7. Migrar `progresso` + `study_notes`
8. Migrar `gamificacao`

### Fase 4 — Simulados
9. Migrar `simulados` + `questoes`
10. Migrar `tentativas`
11. Migrar `batalhas` + `batalha_participantes`
12. Migrar `feedback_simulado`

### Fase 5 — Complementos
13. Migrar `resumo_comments` + `resumo_additions`
14. Migrar `logs`
15. Remover dependência do Supabase

---

## Notas Técnicas

- Campos complexos (rotina, plan, respostas, alternativas) são serializados como JSON string na célula.
- O Apps Script faz parse/stringify automaticamente.
- Cache local (memória) no App.jsx para reduzir chamadas à API.
- Batch writes quando possível (ex: salvar progresso de vários dias de uma vez).
