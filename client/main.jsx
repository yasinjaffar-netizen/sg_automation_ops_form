import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import InterTeamForm from './InterTeamForm.jsx'

const path = window.location.pathname

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {path === '/interteam' ? <InterTeamForm /> : <App />}
  </StrictMode>
)