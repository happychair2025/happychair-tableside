import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/app.css'
import { ENV_PROBLEM, IS_STAGING } from './lib/supabase'

const root = document.getElementById('root')!

if (ENV_PROBLEM) {
  // Never falls back to another project: the guest is told plainly that this page cannot serve them.
  root.textContent = 'This page is not available. Please ask your server for help.'
  throw new Error(`Tableside not started: ${ENV_PROBLEM}`)
}

if (IS_STAGING) {
  const tag = document.createElement('div')
  tag.textContent = 'STAGING — test only, not a real table'
  tag.setAttribute('role', 'status')
  tag.style.cssText =
    'position:fixed;left:0;right:0;top:env(safe-area-inset-top,0px);height:20px;z-index:2147483647;' +
    'background:#b45309;color:#fff;font:700 12px/20px system-ui,sans-serif;letter-spacing:.06em;' +
    'text-align:center;pointer-events:none'
  document.body.appendChild(tag)
  document.title = `[STAGING] ${document.title}`
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
