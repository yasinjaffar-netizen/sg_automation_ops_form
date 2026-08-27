import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import InterTeamForm from './InterTeamForm.jsx'
import JobsheetForm from './JobsheetForm.jsx'
import HomePage from './HomePage.jsx'

const path = window.location.pathname.replace(/\/+$/, '') || '/'

const routes = {
  '/home': <HomePage />,
  '/interteam': <InterTeamForm />,
  '/jobsheet': <JobsheetForm />,
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {routes[path] ?? <App />}
  </StrictMode>
)
