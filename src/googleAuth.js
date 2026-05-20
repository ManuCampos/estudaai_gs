// ============================================================
// EstudaAI — Google OAuth Module
// ============================================================
// Usa Google Identity Services (GIS) — a lib mais recente do Google.
// Não depende do gapi antigo.
//
// SETUP:
// 1. Crie um projeto no Google Cloud Console
// 2. Ative a API "Google Identity" (OAuth consent screen)
// 3. Crie credenciais OAuth 2.0 (Web application)
//    - Authorized JavaScript origins: http://localhost:5173 (dev) + seu domínio
//    - Authorized redirect URIs: mesmo
// 4. Copie o Client ID e cole abaixo
// 5. Adicione o script no index.html:
//    <script src="https://accounts.google.com/gsi/client" async></script>
// ============================================================

const GOOGLE_CLIENT_ID = '161184392186-k9pg7q0gcfnj2c0nnolg74h3lb5kq5lc.apps.googleusercontent.com';

// ============================================================
// Inicializa o Google Identity Services
// ============================================================
let _tokenClient = null;
let _onLoginCallback = null;

export function initGoogleAuth(onLogin) {
  _onLoginCallback = onLogin;

  // Aguarda o script do Google carregar
  if (!window.google?.accounts) {
    window.addEventListener('load', () => _initClient());
    return;
  }
  _initClient();
}

function _initClient() {
  // Renderiza o botão "Sign in with Google" (One Tap)
  window.google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: _handleCredentialResponse,
    auto_select: true, // tenta login automático se já logou antes
  });
}

// ============================================================
// Renderiza o botão de login do Google num container
// ============================================================
export function renderGoogleButton(elementId) {
  if (!window.google?.accounts) {
    setTimeout(() => renderGoogleButton(elementId), 200);
    return;
  }
  window.google.accounts.id.renderButton(
    document.getElementById(elementId),
    {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
      width: 300,
    }
  );
}

// ============================================================
// Mostra o prompt One Tap
// ============================================================
export function promptOneTap() {
  if (window.google?.accounts) {
    window.google.accounts.id.prompt();
  }
}

// ============================================================
// Callback quando o usuário faz login
// ============================================================
function _handleCredentialResponse(response) {
  // response.credential é um JWT (id_token)
  const payload = _decodeJwt(response.credential);

  const googleUser = {
    email: payload.email,
    name: payload.name,
    avatar_url: payload.picture,
    googleId: payload.sub,
  };

  if (_onLoginCallback) {
    _onLoginCallback(googleUser);
  }
}

// ============================================================
// Decode JWT sem lib externa (payload apenas)
// ============================================================
function _decodeJwt(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(
    atob(base64)
      .split('')
      .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
  return JSON.parse(jsonPayload);
}

// ============================================================
// Logout
// ============================================================
export function googleLogout() {
  if (window.google?.accounts) {
    window.google.accounts.id.disableAutoSelect();
  }
}

// ============================================================
// Verifica se o token ainda é válido (não expirou)
// ============================================================
export function isTokenValid(token) {
  try {
    const payload = _decodeJwt(token);
    return payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export { GOOGLE_CLIENT_ID };
