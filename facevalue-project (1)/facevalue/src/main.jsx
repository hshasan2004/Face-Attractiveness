import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import './styles/components.css'
import './styles/admin.css'
import App from './App'

// Inject decorative orbs into body
const orbGold = document.createElement('div')
orbGold.id = 'orb-gold'
document.body.appendChild(orbGold)

const orbPurple = document.createElement('div')
orbPurple.id = 'orb-purple'
document.body.appendChild(orbPurple)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
