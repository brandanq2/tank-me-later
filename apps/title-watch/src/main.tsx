import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import '@tml/shared/styles.css'
import TitleWatchPage from './TitleWatchPage'
import CommandRoomPage from './CommandRoomPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TitleWatchPage />} />
        <Route path="/command-room" element={<CommandRoomPage />} />
        {/* Path these pages used to live under on tank-me-later. */}
        <Route path="/watch" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
