// src/front/js/store/flux.js
// Fixed: Uses REACT_APP_BACKEND_URL, stores token + user info in state,
// authenticate() validates JWT properly

const BACKEND = process.env.REACT_APP_BACKEND_URL || '';

const getState = ({ getStore, getActions, setStore }) => {
  return {
    store: {
      token: localStorage.getItem('token') || null,
      user_id: localStorage.getItem('user_id') || null,
      username: localStorage.getItem('username') || null,
      isAuthenticated: false,
    },

    actions: {
      // ── Validate stored JWT token ──
      authenticate: async () => {
        const token = localStorage.getItem('token');
        if (!token || token.trim() === '') {
          console.log('[Auth] No token found');
          setStore({ isAuthenticated: false, token: null });
          return false;
        }

        try {
          const response = await fetch(`${BACKEND}/api/authenticate`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + token,
            },
          });

          if (response.status !== 200) {
            console.log('[Auth] Token invalid or expired:', response.status);
            // Clear stale token
            localStorage.removeItem('token');
            localStorage.removeItem('user_id');
            localStorage.removeItem('username');
            setStore({ isAuthenticated: false, token: null, user_id: null, username: null });
            return false;
          }

          const data = await response.json();
          setStore({
            isAuthenticated: true,
            token: token,
            user_id: String(data.user_id),
            username: data.username,
          });
          return true;
        } catch (err) {
          console.error('[Auth] Error:', err);
          setStore({ isAuthenticated: false });
          return false;
        }
      },

      // ── Login ──
      login: async (email, password) => {
        try {
          const res = await fetch(`${BACKEND}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });

          const data = await res.json();
          if (!res.ok) return { success: false, error: data.error || 'Login failed' };

          // Save to localStorage AND store
          localStorage.setItem('token', data.token);
          localStorage.setItem('user_id', String(data.user_id));
          localStorage.setItem('username', data.username);

          setStore({
            token: data.token,
            user_id: String(data.user_id),
            username: data.username,
            isAuthenticated: true,
          });

          return { success: true };
        } catch (err) {
          console.error('[Login] Error:', err);
          return { success: false, error: 'Network error' };
        }
      },

      // ── Logout ──
      logout: () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user_id');
        localStorage.removeItem('username');
        setStore({
          token: null,
          user_id: null,
          username: null,
          isAuthenticated: false,
        });
      },

      // ── Helper: get auth header ──
      getAuthHeaders: () => {
        const token = localStorage.getItem('token');
        return {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
      },
    },
  };
};

export default getState;