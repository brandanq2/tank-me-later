import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import '@tml/shared/styles.css'
import App from './App'
import AugsPage from './AugsPage'
import OpenLeaderboardPage from './OpenLeaderboardPage'
import StrikeTeamPage from './StrikeTeamPage'
import { RedirectToTitleWatch } from './titleWatchUrl'
import { FlagsProvider } from '@tml/shared/hooks/useFlags'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FlagsProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<OpenLeaderboardPage />} />
          <Route path="/tanks" element={<App />} />
          <Route path="/augs" element={<AugsPage />} />
          <Route path="/clb" element={<Navigate to="/" replace />} />
          {/* Invite-only — gated by code, not by being unlisted. */}
          <Route path="/strike-team" element={<StrikeTeamPage />} />
          {/* Moved to the title-watch project. */}
          <Route path="/watch" element={<RedirectToTitleWatch />} />
          <Route path="/command-room" element={<RedirectToTitleWatch path="/command-room" />} />
        </Routes>
      </BrowserRouter>
    </FlagsProvider>
  </StrictMode>,
)
