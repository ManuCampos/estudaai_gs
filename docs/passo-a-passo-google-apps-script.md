# Passo a Passo — Google Apps Script para EstudaAI

## 1. Criar a Planilha de Users

1. Acesse [Google Sheets](https://sheets.google.com)
2. Crie uma nova planilha
3. Renomeie para: `estudaai_users`
4. Na primeira linha (headers), preencha exatamente assim:

```
A1: id
B1: name
C1: email
D1: role
E1: coach_id
F1: avatar_url
G1: created_at
```

5. Copie o ID da planilha — é o trecho da URL entre `/d/` e `/edit`:
   ```
   https://docs.google.com/spreadsheets/d/ESTE_TRECHO_AQUI/edit
   ```

6. (Opcional) Adicione um usuário admin manualmente para testes:
   ```
   A2: admin1
   B2: Administrador
   C2: seuemail@gmail.com
   D2: admin
   E2: (vazio)
   F2: (vazio)
   G2: 2026-05-12T00:00:00.000Z
   ```

---

## 2. Criar o Projeto no Google Apps Script

1. Acesse [script.google.com](https://script.google.com)
2. Clique em **Novo projeto**
3. Renomeie o projeto para: `EstudaAI API`
4. Apague todo o conteúdo do arquivo `Code.gs`
5. Cole o conteúdo do arquivo `google-apps-script/Code.gs` que está no seu projeto
6. Na linha que diz:
   ```javascript
   users: 'COLE_O_ID_DA_PLANILHA_USERS_AQUI',
   ```
   Substitua pelo ID que você copiou no passo 1.5

7. Salve (Ctrl+S)

---

## 3. Fazer o Deploy como Web App

1. No menu superior, clique em **Implantar** (Deploy) > **Nova implantação** (New deployment)
2. Clique na engrenagem ao lado de "Selecionar tipo" e escolha **App da Web** (Web app)
3. Preencha:
   - **Descrição:** `EstudaAI API v1`
   - **Executar como:** `Eu` (Me)
   - **Quem tem acesso:** `Qualquer pessoa` (Anyone)
4. Clique em **Implantar** (Deploy)
5. Na primeira vez, vai pedir autorização:
   - Clique em **Autorizar acesso**
   - Escolha sua conta Google
   - Se aparecer "Google não verificou este app", clique em **Avançado** > **Ir para EstudaAI API (não seguro)**
   - Clique em **Permitir**
6. Copie a **URL da implantação** — ela terá este formato:
   ```
   https://script.google.com/macros/s/AKfycbx.../exec
   ```

---

## 4. Testar a API

Abra o navegador e cole a URL adicionando parâmetros:

**Listar todos os usuários:**
```
https://script.google.com/macros/s/SUA_URL/exec?module=users&action=getAll
```

**Buscar por email:**
```
https://script.google.com/macros/s/SUA_URL/exec?module=users&action=getByEmail&email=seuemail@gmail.com
```

Se retornar um JSON com `{"status":"ok","data":[...]}`, está funcionando.

---

## 5. Configurar no Projeto React

1. Abra o arquivo `src/sheetsApi.js`
2. Substitua a URL:
   ```javascript
   const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/SUA_URL_AQUI/exec';
   ```

---

## 6. Configurar Google OAuth (Cloud Console)

1. Acesse [console.cloud.google.com](https://console.cloud.google.com)
2. Crie um novo projeto (ou use existente): `EstudaAI`
3. No menu lateral: **APIs e Serviços** > **Tela de consentimento OAuth**
   - Tipo: Externo
   - Preencha nome do app: `EstudaAI`
   - Email de suporte: seu email
   - Salve
4. Vá em **Credenciais** > **Criar credenciais** > **ID do cliente OAuth**
   - Tipo: Aplicativo da Web
   - Nome: `EstudaAI Web`
   - Origens JavaScript autorizadas:
     - `http://localhost:5173` (desenvolvimento)
     - `https://seudominio.com` (produção, quando tiver)
   - Clique em **Criar**
5. Copie o **Client ID** (formato: `123456789-abc.apps.googleusercontent.com`)
6. Abra `src/googleAuth.js` e substitua:
   ```javascript
   const GOOGLE_CLIENT_ID = 'SEU_CLIENT_ID.apps.googleusercontent.com';
   ```

---

## 7. Adicionar Script no index.html

Abra `index.html` e adicione antes do `</head>`:

```html
<script src="https://accounts.google.com/gsi/client" async></script>
```

---

## Resumo dos IDs que você precisa guardar

| O quê | Onde colar |
|-------|-----------|
| ID da planilha users | `Code.gs` → `SPREADSHEET_IDS.users` |
| URL do Apps Script | `src/sheetsApi.js` → `APPS_SCRIPT_URL` |
| Google OAuth Client ID | `src/googleAuth.js` → `GOOGLE_CLIENT_ID` |

---

## Dicas

- **Atualizando o código do Apps Script:** após editar o Code.gs, você precisa fazer um novo deploy (Deploy > Manage deployments > editar > nova versão) para as mudanças valerem.
- **Logs/Debug:** no Apps Script, use `console.log()` e veja em **Execuções** no menu lateral.
- **Cota:** o Apps Script gratuito permite ~20.000 chamadas/dia — mais que suficiente para 500 alunos.
