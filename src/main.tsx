import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import App from './App'
import AugsPage from './AugsPage'
import OpenLeaderboardPage from './OpenLeaderboardPage'
import TitleWatchPage from './TitleWatchPage'
import CommandRoomPage from './CommandRoomPage'
import { FlagsProvider } from './hooks/useFlags'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FlagsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<OpenLeaderboardPage />} />
          <Route path="/watch" element={<TitleWatchPage />} />
          <Route path="/command-room" element={<CommandRoomPage />} />
          <Route path="/tanks" element={<App />} />
          <Route path="/augs" element={<AugsPage />} />
          <Route path="/clb" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </FlagsProvider>
  </StrictMode>,
)
