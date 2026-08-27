import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import InterTeamForm from './InterTeamForm.jsx'
import JobsheetForm from './JobsheetForm.jsx'

const path = window.location.pathname

const routes = {
  '/interteam': <InterTeamForm />,
  '/jobsheet': <JobsheetForm />,
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {routes[path] ?? <App />}
  </StrictMode>
)
