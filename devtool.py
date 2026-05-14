#!/usr/bin/env python3
"""
DevTool - Deploy simplificado GitHub + Vercel
Fluxo guiado: seleciona/cria repo -> informa pasta -> push -> deploy
Ao criar repo no GitHub, pergunta se quer criar no Vercel tambem.
Uso:
    python devtool.py
"""
import os
import sys
import json
import subprocess
import urllib.request
import urllib.error

# ============================================================
# CONFIGURAÇÃO
# ============================================================
CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'devtool_config.json')

FRAMEWORKS = {
    'vite': 'vite',
    'nextjs': 'nextjs',
    'react': 'create-react-app',
    'vue': 'vue',
    'nuxt': 'nuxtjs',
    'svelte': 'svelte',
    'none': None,
}

def load_config():
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_config(config):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)

def setup_tokens():
    config = load_config()
    print("\n=== Configuracao de Tokens ===\n")
    token = input("GitHub Token (ghp_...): ").strip()
    if token:
        config['github_token'] = token
    token = input("Vercel Token: ").strip()
    if token:
        config['vercel_token'] = token
    save_config(config)
    print("\nTokens salvos!")
    return config

# ============================================================
# API HELPERS
# ============================================================
# Configura proxy do sistema automaticamente
proxy_handler = urllib.request.ProxyHandler()
opener = urllib.request.build_opener(proxy_handler, urllib.request.HTTPSHandler())
urllib.request.install_opener(opener)

def github_request(token, method, endpoint, data=None):
    url = f"https://api.github.com{endpoint}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header('Authorization', f'token {token}')
    req.add_header('Accept', 'application/vnd.github.v3+json')
    req.add_header('Content-Type', 'application/json')
    req.add_header('User-Agent', 'DevTool/1.0')
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status == 204:
                return {}
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        try:
            return {'error': json.loads(error_body).get('message', f'HTTP {e.code}')}
        except:
            return {'error': f'HTTP {e.code}: {error_body[:200]}'}

def vercel_request(token, method, endpoint, data=None):
    url = f"https://api.vercel.com{endpoint}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header('Authorization', f'Bearer {token}')
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status == 204:
                return {}
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode()
        try:
            return {'error': json.loads(error_body).get('error', {}).get('message', f'HTTP {e.code}')}
        except:
            return {'error': f'HTTP {e.code}: {error_body[:200]}'}

# ============================================================
# GIT OPERATIONS
# ============================================================
def run_git(project_dir, *args):
    try:
        result = subprocess.run(
            ['git'] + list(args),
            cwd=project_dir,
            capture_output=True,
            text=True,
            encoding='utf-8'
        )
        return result.returncode == 0, result.stdout.strip() or result.stderr.strip()
    except FileNotFoundError:
        return False, 'Git nao encontrado. Instale o Git.'

def git_push_flow(project_dir, repo_url, username):
    """Faz add, commit e push do projeto local para o GitHub."""
    print(f"\n  Diretorio: {project_dir}")

    # Verifica se ja eh um repo git
    is_git = os.path.isdir(os.path.join(project_dir, '.git'))

    if not is_git:
        print("  Inicializando repositorio git...")
        ok, msg = run_git(project_dir, 'init')
        if not ok:
            print(f"  ERRO ao inicializar: {msg}")
            return False
        run_git(project_dir, 'remote', 'add', 'origin', repo_url)
        print(f"  Remote configurado: {repo_url}")
    else:
        ok, remotes = run_git(project_dir, 'remote', '-v')
        if 'origin' not in remotes:
            run_git(project_dir, 'remote', 'add', 'origin', repo_url)
        else:
            run_git(project_dir, 'remote', 'set-url', 'origin', repo_url)

    # Status
    ok, status = run_git(project_dir, 'status', '--short')
    if ok and status:
        print(f"\n  Arquivos modificados:")
        for line in status.split('\n')[:20]:
            print(f"    {line}")
        if status.count('\n') > 20:
            print(f"    ... e mais {status.count(chr(10)) - 20} arquivos")
    elif ok and not status:
        print("  Nenhuma alteracao detectada.")

    # Add
    print("\n  [1/3] Staging todos os arquivos...")
    ok, msg = run_git(project_dir, 'add', '.')
    if not ok:
        print(f"  ERRO: {msg}")
        return False

    # Commit
    commit_msg = input("\n  Mensagem do commit: ").strip()
    if not commit_msg:
        commit_msg = "update"

    print("  [2/3] Criando commit...")
    ok, msg = run_git(project_dir, 'commit', '-m', commit_msg)
    if not ok:
        if 'nothing to commit' in msg:
            print("  Nada para commitar. Tentando push mesmo assim...")
        else:
            print(f"  ERRO: {msg}")

    # Push
    print("  [3/3] Enviando para GitHub...")
    ok, branch = run_git(project_dir, 'rev-parse', '--abbrev-ref', 'HEAD')
    if not ok or not branch:
        branch = 'main'

    ok, msg = run_git(project_dir, 'push', '-u', 'origin', branch)
    if ok:
        print(f"  Push OK! Branch: {branch}")
        return True
    else:
        if 'has no upstream' in msg or 'failed to push' in msg:
            print("  Tentando force push (primeiro push)...")
            ok, msg = run_git(project_dir, 'push', '--set-upstream', 'origin', branch)
            if ok:
                print(f"  Push OK! Branch: {branch}")
                return True

        print(f"  ERRO no push: {msg}")
        print("\n  Opcoes:")
        print("  1. Tentar pull + push")
        print("  2. Force push (CUIDADO: sobrescreve remoto)")
        print("  3. Cancelar")
        choice = input("  Escolha [1/2/3]: ").strip()

        if choice == '1':
            run_git(project_dir, 'pull', '--rebase', 'origin', branch)
            ok, msg = run_git(project_dir, 'push', 'origin', branch)
            if ok:
                print("  Push OK apos pull!")
                return True
            print(f"  ERRO: {msg}")
            return False
        elif choice == '2':
            ok, msg = run_git(project_dir, 'push', '--force', 'origin', branch)
            if ok:
                print("  Force push OK!")
                return True
            print(f"  ERRO: {msg}")
            return False
        else:
            print("  Cancelado.")
            return False

# ============================================================
# VERCEL: Criar projeto conectado ao GitHub
# ============================================================
def create_vercel_project(vc_token, username, repo_name, proj_name=None):
    """Cria projeto no Vercel conectado ao repo GitHub."""
    proj_name = proj_name or repo_name

    # Pergunta framework
    print("\n  Frameworks disponiveis: vite, nextjs, react, vue, nuxt, svelte, none")
    framework_input = input("  Framework [vite]: ").strip().lower() or 'vite'
    framework = FRAMEWORKS.get(framework_input, framework_input)

    print(f"\n  Criando projeto '{proj_name}' no Vercel...")
    result = vercel_request(vc_token, 'POST', '/v10/projects', {
        'name': proj_name,
        'framework': framework,
        'gitRepository': {
            'type': 'github',
            'repo': f'{username}/{repo_name}'
        }
    })

    if 'error' in result:
        print(f"  ERRO Vercel: {result['error']}")
        return None

    print(f"  Projeto Vercel criado e conectado ao GitHub!")
    print(f"  URL: https://{proj_name}.vercel.app")
    print(f"  Deploy automatico a cada push.")
    return result

# ============================================================
# FLUXO PRINCIPAL
# ============================================================
def main():
    print("\n" + "=" * 60)
    print("       DevTool - GitHub + Vercel Deploy")
    print("=" * 60)

    # Carrega config
    config = load_config()
    if not config.get('github_token') or not config.get('vercel_token'):
        config = setup_tokens()

    gh_token = config.get('github_token')
    vc_token = config.get('vercel_token')

    if not gh_token or not vc_token:
        print("\nERRO: Tokens sao obrigatorios.")
        sys.exit(1)

    # Valida GitHub
    print("\n  Validando GitHub...")
    user = github_request(gh_token, 'GET', '/user')
    if 'login' not in user:
        print(f"  ERRO GitHub: {user.get('error', user)}")
        print("  Verifique seu token. Rode novamente para reconfigurar.")
        os.remove(CONFIG_FILE)
        sys.exit(1)
    username = user['login']
    print(f"  GitHub: {username}")

    # Valida Vercel
    print("  Validando Vercel...")
    vc_user = vercel_request(vc_token, 'GET', '/v2/user')
    if 'user' not in vc_user:
        print(f"  ERRO Vercel: {vc_user.get('error', vc_user)}")
        sys.exit(1)
    print(f"  Vercel: {vc_user['user'].get('username', vc_user['user'].get('name', '?'))}")

    # ============================================================
    # PASSO 1: Listar e selecionar repositorio GitHub
    # ============================================================
    print("\n" + "-" * 60)
    print("  PASSO 1: Selecione o repositorio GitHub")
    print("-" * 60)

    all_repos = []
    page = 1
    while True:
        repos = github_request(gh_token, 'GET', f'/user/repos?per_page=100&page={page}&sort=updated&affiliation=owner')
        if isinstance(repos, dict) and 'error' in repos:
            print(f"  ERRO: {repos['error']}")
            sys.exit(1)
        if not repos:
            break
        all_repos.extend(repos)
        if len(repos) < 100:
            break
        page += 1

    print(f"\n  Seus repositorios ({len(all_repos)}):\n")
    for i, repo in enumerate(all_repos, 1):
        vis = "[PRIV]" if repo.get('private') else "[PUB] "
        print(f"  {i:3}. {vis} {repo['name']}")

    print(f"\n  0. Criar novo repositorio")

    selected_repo = None
    vercel_project = None

    while True:
        choice = input(f"\n  Selecione [0-{len(all_repos)}]: ").strip()
        try:
            choice = int(choice)
            if choice == 0:
                # Criar novo repo
                new_name = input("  Nome do novo repo: ").strip()
                if not new_name:
                    continue
                desc = input("  Descricao (Enter para vazio): ").strip()
                priv = input("  Privado? (s/n) [s]: ").strip().lower() != 'n'

                result = github_request(gh_token, 'POST', '/user/repos', {
                    'name': new_name,
                    'private': priv,
                    'description': desc,
                    'auto_init': True
                })
                if 'error' in result:
                    print(f"  ERRO: {result['error']}")
                    continue

                selected_repo = result
                print(f"  Repo criado: {result['html_url']}")

                # NOVO: Pergunta se quer criar no Vercel tambem
                create_vc = input("\n  Criar projeto no Vercel e conectar a este repo? (s/n) [s]: ").strip().lower()
                if create_vc != 'n':
                    vc_name = input(f"  Nome do projeto Vercel [{new_name}]: ").strip() or new_name
                    vercel_project = create_vercel_project(vc_token, username, new_name, vc_name)
                break

            elif 1 <= choice <= len(all_repos):
                selected_repo = all_repos[choice - 1]
                break
            else:
                print("  Numero invalido.")
        except ValueError:
            print("  Digite um numero.")

    repo_name = selected_repo['name']
    repo_url = selected_repo.get('clone_url', f'https://github.com/{username}/{repo_name}.git')
    print(f"\n  Selecionado: {username}/{repo_name}")
    print(f"  URL: {repo_url}")

    # ============================================================
    # PASSO 2: Informar caminho local do codigo
    # ============================================================
    print("\n" + "-" * 60)
    print("  PASSO 2: Informe o caminho do codigo local")
    print("-" * 60)

    last_path = config.get(f'last_path_{repo_name}', '')
    if last_path:
        print(f"  Ultimo caminho usado: {last_path}")
        use_last = input("  Usar este? (s/n) [s]: ").strip().lower()
        if use_last != 'n':
            project_dir = last_path
        else:
            project_dir = input("  Caminho da pasta do projeto: ").strip()
    else:
        project_dir = input("  Caminho da pasta do projeto: ").strip()

    project_dir = project_dir.strip('"').strip("'")

    if not os.path.isdir(project_dir):
        print(f"  ERRO: Pasta nao encontrada: {project_dir}")
        criar = input("  Criar pasta? (s/n): ").strip().lower()
        if criar == 's':
            os.makedirs(project_dir, exist_ok=True)
        else:
            sys.exit(1)

    config[f'last_path_{repo_name}'] = project_dir
    save_config(config)

    # ============================================================
    # PASSO 3: Git push
    # ============================================================
    print("\n" + "-" * 60)
    print("  PASSO 3: Enviando codigo para GitHub")
    print("-" * 60)

    push_ok = git_push_flow(project_dir, repo_url, username)

    # ============================================================
    # PASSO 4: Deploy no Vercel
    # ============================================================
    print("\n" + "-" * 60)
    print("  PASSO 4: Deploy no Vercel")
    print("-" * 60)

    # Se ja criou o projeto Vercel no passo 1, pula a criacao
    if vercel_project:
        project_name = vercel_project.get('name', repo_name)
        project_id = vercel_project.get('id', '')
        print(f"\n  Projeto Vercel ja criado: {project_name}")
        print(f"  Conectado ao GitHub. Deploy automatico no push.")

        if push_ok:
            print("\n  Deploy em andamento! Verifique em: https://vercel.com/dashboard")
    else:
        deploy = input("\n  Deseja fazer deploy no Vercel? (s/n): ").strip().lower()
        if deploy == 's':
            # Lista projetos existentes
            projects = vercel_request(vc_token, 'GET', '/v9/projects?limit=100')
            if 'projects' not in projects:
                print(f"  ERRO: {projects.get('error', projects)}")
            else:
                vc_projects = projects['projects']
                print(f"\n  Seus projetos Vercel ({len(vc_projects)}):\n")
                for i, p in enumerate(vc_projects, 1):
                    framework = p.get('framework', '-')
                    print(f"  {i:3}. {p['name']} ({framework})")

                print(f"\n  0. Criar novo projeto e conectar ao repo")

                while True:
                    choice = input(f"\n  Selecione [0-{len(vc_projects)}]: ").strip()
                    try:
                        choice = int(choice)
                        if choice == 0:
                            vc_name = input(f"  Nome do projeto Vercel [{repo_name}]: ").strip() or repo_name
                            vercel_project = create_vercel_project(vc_token, username, repo_name, vc_name)
                            if vercel_project:
                                project_name = vercel_project.get('name', repo_name)
                                project_id = vercel_project.get('id', '')
                            break
                        elif 1 <= choice <= len(vc_projects):
                            selected_project = vc_projects[choice - 1]
                            project_name = selected_project['name']
                            project_id = selected_project.get('id', '')

                            # Verifica conexao com GitHub
                            git_link = selected_project.get('link') or selected_project.get('gitRepository')
                            if not git_link:
                                print(f"\n  Projeto nao conectado ao GitHub.")
                                connect = input(f"  Conectar ao repo {username}/{repo_name}? (s/n): ").strip().lower()
                                if connect == 's':
                                    result = vercel_request(vc_token, 'PATCH', f'/v9/projects/{project_id}', {
                                        'gitRepository': {
                                            'type': 'github',
                                            'repo': f'{username}/{repo_name}'
                                        }
                                    })
                                    if 'error' not in result:
                                        print("  Conectado! Deploy automatico ativado.")
                                    else:
                                        print(f"  ERRO ao conectar: {result['error']}")
                            else:
                                print(f"  Projeto ja conectado ao GitHub.")
                            break
                        else:
                            print("  Numero invalido.")
                    except ValueError:
                        print("  Digite um numero.")

                # Mostra status dos deployments
                if project_id:
                    print("\n  Verificando deployments...")
                    deploys = vercel_request(vc_token, 'GET', f'/v6/deployments?projectId={project_id}&limit=3')
                    if 'deployments' in deploys and deploys['deployments']:
                        print(f"\n  Ultimos deployments:")
                        for d in deploys['deployments'][:3]:
                            state = d.get('state', d.get('readyState', '?'))
                            url = d.get('url', '-')
                            created = d.get('created', '')
                            if isinstance(created, int):
                                from datetime import datetime
                                created = datetime.fromtimestamp(created/1000).strftime('%d/%m/%Y %H:%M')
                            print(f"    [{state}] https://{url} | {created}")

                if push_ok:
                    print("\n  Deploy em andamento! Verifique em: https://vercel.com/dashboard")

    # ============================================================
    # FIM
    # ============================================================
    print("\n" + "=" * 60)
    print("  Concluido!")
    if push_ok:
        print(f"  GitHub: https://github.com/{username}/{repo_name}")
    if vercel_project:
        print(f"  Vercel: https://{vercel_project.get('name', repo_name)}.vercel.app")
    print("=" * 60 + "\n")

    again = input("  Rodar novamente? (s/n): ").strip().lower()
    if again == 's':
        main()

if __name__ == '__main__':
    main()
