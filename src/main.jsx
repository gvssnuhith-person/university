import React from 'react'
import ReactDOM from 'react-dom/client'
import VoicesApp from './VoicesApp.jsx'
import GvsAcademicPortal from './GvsAcademicPortal.jsx'
import Hub from './Hub.jsx'
import './index.css'

const AppSelector = () => {
  const hostname = window.location.hostname.toLowerCase();
  const pathname = window.location.pathname.toLowerCase();
  const appType = import.meta.env.VITE_APP_TYPE;
  
  // URL Path-based detection (for local dev)
  if (pathname.startsWith('/voices')) return <VoicesApp />;
  if (pathname.startsWith('/university') || pathname.startsWith('/portal')) return <GvsAcademicPortal />;

  // Hostname-based detection (Automatic for Vercel)
  if (hostname.includes('voices')) return <VoicesApp />;
  if (hostname.includes('university') || hostname.includes('portal')) return <GvsAcademicPortal />;
  
  // Env-based detection (Manual override)
  if (appType === 'voices') return <VoicesApp />;
  if (appType === 'university') return <GvsAcademicPortal />;
  
  // Default to Hub landing page for combined access
  return <Hub />;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppSelector />
  </React.StrictMode>,
)
