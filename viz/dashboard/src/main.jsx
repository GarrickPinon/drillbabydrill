import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import FullTerminal from './FullTerminal.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FullTerminal />
  </StrictMode>,
)
