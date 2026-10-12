import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import EntryIntro from './components/EntryIntro'
import './index.css'
import './styles/intro.css'
import '@fontsource-variable/manrope'
import './styles/landing.css'
import './styles/motion.css'
import './styles/responsive.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    <EntryIntro />
  </React.StrictMode>,
)
