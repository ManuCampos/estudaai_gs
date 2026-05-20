Preciso que você crie 13 planilhas no Google Sheets e depois atualize o Apps Script. Faça tudo na ordem abaixo. Para cada planilha: acesse https://sheets.google.com, crie uma nova planilha em branco, renomeie com o nome indicado, preencha os headers na linha 1, e me informe o ID (trecho da URL entre /d/ e /edit).

---

PLANILHA 1: estudaai_planos
Headers: A1: id | B1: aluno_id | C1: edital_id | D1: rotina | E1: plan | F1: nivel_cobertura | G1: created_at

PLANILHA 2: estudaai_progresso
Headers: A1: id | B1: aluno_id | C1: plano_id | D1: key | E1: done | F1: at

PLANILHA 3: estudaai_study_notes
Headers: A1: id | B1: aluno_id | C1: plano_id | D1: topic_id | E1: note | F1: updated_at

PLANILHA 4: estudaai_gamificacao
Headers: A1: id | B1: aluno_id | C1: week_goal

PLANILHA 5: estudaai_simulados
Headers: A1: id | B1: coach_id | C1: edital_id | D1: nome | E1: tipo | F1: materia_id | G1: descricao | H1: alunos_permitidos | I1: created_at | J1: updated_at

PLANILHA 6: estudaai_questoes
Headers: A1: id | B1: simulado_id | C1: tipo | D1: enunciado | E1: alternativas | F1: gabarito | G1: ordem | H1: created_at

PLANILHA 7: estudaai_tentativas
Headers: A1: id | B1: simulado_id | C1: aluno_id | D1: respostas | E1: status | F1: acertos | G1: erros | H1: brancos | I1: pontos_cebraspe | J1: percentual | K1: tempo_gasto | L1: started_at | M1: finished_at

PLANILHA 8: estudaai_batalhas
Headers: A1: id | B1: nome | C1: coach_id | D1: simulado_id | E1: data_fim | F1: tempo_limite | G1: status | H1: criada_em

PLANILHA 9: estudaai_batalha_participantes
Headers: A1: id | B1: batalha_id | C1: aluno_id | D1: tentativa_id | E1: finalizado | F1: acertos | G1: erros | H1: brancos | I1: pontos_cebraspe | J1: percentual | K1: tempo_gasto

PLANILHA 10: estudaai_feedback_simulado
Headers: A1: id | B1: tentativa_id | C1: simulado_id | D1: aluno_id | E1: coach_id | F1: comentarios_questoes | G1: orientacoes_gerais | H1: sugestoes_conteudo | I1: temas_revisar | J1: status | K1: criado_em | L1: atualizado_em | M1: enviado_em

PLANILHA 11: estudaai_resumo_comments
Headers: A1: id | B1: aluno_id | C1: plano_id | D1: topic_id | E1: coach_id | F1: coach_comment | G1: updated_at

PLANILHA 12: estudaai_resumo_additions
Headers: A1: id | B1: aluno_id | C1: plano_id | D1: topic_id | E1: coach_id | F1: addition | G1: updated_at

PLANILHA 13: estudaai_logs
Headers: A1: id | B1: actor_id | C1: message | D1: meta | E1: created_at

---

Depois de criar todas as 13 planilhas, me informe os IDs de todas num formato assim:
- planos: ID
- progresso: ID
- study_notes: ID
- gamificacao: ID
- simulados: ID
- questoes: ID
- tentativas: ID
- batalhas: ID
- batalha_participantes: ID
- feedback_simulado: ID
- resumo_comments: ID
- resumo_additions: ID
- logs: ID

---

ÚLTIMA TAREFA — Atualizar o Apps Script:

1. Acesse https://script.google.com
2. Abra o projeto "EstudaAI API"
3. Selecione todo o conteúdo do Code.gs (Ctrl+A) e apague
4. Cole o código completo que vou fornecer abaixo (substitua os IDs pelos que acabou de criar)
5. Salve (Ctrl+S)
6. Vá em "Implantar" > "Gerenciar implantações" > clique no lápis > "Versão" selecione "Nova versão" > "Implantar"
7. Teste: https://script.google.com/macros/s/AKfycbyhT495ELPbDX_d9ph28WbFzUYzTdwu5sau9LkUZu7-FbReLWuXpC2I8GjuJrE3ZOVWGA/exec?module=simulados&action=getAll
8. Confirme que retorna {"status":"ok","data":[]}

O código para colar no Code.gs está no arquivo google-apps-script/Code.gs do projeto. Substitua os placeholders (PLANOS_ID, PROGRESSO_ID, etc.) pelos IDs reais das planilhas criadas acima.

---

Comece criando as planilhas uma por uma e me informe os IDs ao final.
