import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './index.css';

// Dev mode: auto-login with demo user so UI is viewable without backend
// Change the role param to 'client' or 'org_admin' to preview other layouts
if (import.meta.env.DEV) {
  const { seedDemoAuth } = await import('./dev-seed');
  await seedDemoAuth('counselor'); // 'counselor' | 'client' | 'org_admin'
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
