import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import App from './App'
import AugsPage from './AugsPage'
import { FlagsProvider } from './hooks/useFlags'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FlagsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/augs" element={<AugsPage />} />
        </Routes>
      </BrowserRouter>
    </FlagsProvider>
  </StrictMode>,
)
