-- Border overlays, rank badge, shimmer animation, and minimap button.

TankMeLater = TankMeLater or {}
local TML = TankMeLater

local BORDER_THICKNESS = 2
local BORDER_ALPHA      = 0.95

-- Tiers that get a pulsing shimmer on their border.
local SHIMMER_CFG = {
    Challenger  = { speed = 2.8, lo = 0.35, hi = 1.0 },
    Grandmaster = { speed = 2.0, lo = 0.45, hi = 1.0 },
    Master      = { speed = 1.3, lo = 0.55, hi = 1.0 },
}

-- ── Border ────────────────────────────────────────────────────────────────────

-- 8-piece border: 4 corners + 4 edges that don't overlap the corners.
local function CreateBorderOverlay(parent, name)
    local overlay = CreateFrame("Frame", name, parent)
    overlay:SetAllPoints(parent)
    overlay:SetFrameLevel(parent:GetFrameLevel() + 10)

    local S = BORDER_THICKNESS

    local function Tex()
        local t = overlay:CreateTexture(nil, "OVERLAY")
        t:SetColorTexture(1, 1, 1, BORDER_ALPHA)
        return t
    end

    local tl = Tex(); tl:SetSize(S, S); tl:SetPoint("TOPLEFT",     overlay, "TOPLEFT",     0, 0)
    local tr = Tex(); tr:SetSize(S, S); tr:SetPoint("TOPRIGHT",    overlay, "TOPRIGHT",    0, 0)
    local bl = Tex(); bl:SetSize(S, S); bl:SetPoint("BOTTOMLEFT",  overlay, "BOTTOMLEFT",  0, 0)
    local br = Tex(); br:SetSize(S, S); br:SetPoint("BOTTOMRIGHT", overlay, "BOTTOMRIGHT", 0, 0)

    local top = Tex(); top:SetHeight(S)
    top:SetPoint("TOPLEFT",  overlay, "TOPLEFT",   S,  0)
    top:SetPoint("TOPRIGHT", overlay, "TOPRIGHT", -S,  0)

    local bot = Tex(); bot:SetHeight(S)
    bot:SetPoint("BOTTOMLEFT",  overlay, "BOTTOMLEFT",   S, 0)
    bot:SetPoint("BOTTOMRIGHT", overlay, "BOTTOMRIGHT", -S, 0)

    local lft = Tex(); lft:SetWidth(S)
    lft:SetPoint("TOPLEFT",    overlay, "TOPLEFT",    0, -S)
    lft:SetPoint("BOTTOMLEFT", overlay, "BOTTOMLEFT", 0,  S)

    local rgt = Tex(); rgt:SetWidth(S)
    rgt:SetPoint("TOPRIGHT",    overlay, "TOPRIGHT",    0, -S)
    rgt:SetPoint("BOTTOMRIGHT", overlay, "BOTTOMRIGHT", 0,  S)

    local all = { tl, tr, bl, br, top, bot, lft, rgt }

    function overlay:SetColor(r, g, b)
        for _, t in ipairs(all) do t:SetColorTexture(r, g, b, BORDER_ALPHA) end
    end

    return overlay
end

-- ── Shimmer ───────────────────────────────────────────────────────────────────

local function StartShimmer(overlay, tier)
    local cfg = SHIMMER_CFG[tier]
    if not cfg then overlay:SetAlpha(1); return end
    local t = 0
    overlay.shimmerTicker = C_Timer.NewTicker(0.033, function()
        t = t + 0.033 * cfg.speed
        overlay:SetAlpha(cfg.lo + (cfg.hi - cfg.lo) * (0.5 + 0.5 * math.sin(t)))
    end)
end

local function StopShimmer(overlay)
    if overlay.shimmerTicker then
        overlay.shimmerTicker:Cancel()
        overlay.shimmerTicker = nil
    end
    overlay:SetAlpha(1)
end

-- ── Rank badge ────────────────────────────────────────────────────────────────

local function CreateRankBadge(parent)
    local badge = CreateFrame("Frame", "TankMeLaterRankBadge", parent)
    badge:SetSize(210, 66)
    badge:SetPoint("BOTTOMLEFT", parent, "TOPLEFT", 0, 4)
    badge:SetFrameLevel(parent:GetFrameLevel() + 15)

    -- Background
    local bg = badge:CreateTexture(nil, "BACKGROUND")
    bg:SetAllPoints(badge)
    bg:SetColorTexture(0, 0, 0, 0.72)

    -- Left accent bar
    local accent = badge:CreateTexture(nil, "BORDER")
    accent:SetWidth(3)
    accent:SetPoint("TOPLEFT",    badge, "TOPLEFT",    0, 0)
    accent:SetPoint("BOTTOMLEFT", badge, "BOTTOMLEFT", 0, 0)
    accent:SetColorTexture(1, 1, 1, 1)
    badge.accent = accent

    -- Row 1: header ("Your Rank" / player name) + score right-aligned
    local header = badge:CreateFontString(nil, "OVERLAY")
    header:SetFont("Fonts\\ARIALN.TTF", 10)
    header:SetPoint("TOPLEFT", badge, "TOPLEFT", 10, -6)
    header:SetTextColor(0.65, 0.65, 0.65)
    badge.header = header

    local scoreLabel = badge:CreateFontString(nil, "OVERLAY")
    scoreLabel:SetFont("Fonts\\ARIALN.TTF", 10)
    scoreLabel:SetPoint("TOPRIGHT", badge, "TOPRIGHT", -8, -6)
    scoreLabel:SetTextColor(0.85, 0.85, 0.85)
    badge.scoreLabel = scoreLabel

    -- Row 2: tier icon + rank label + top%
    local icon = badge:CreateTexture(nil, "ARTWORK")
    icon:SetSize(11, 11)
    icon:SetPoint("TOPLEFT", badge, "TOPLEFT", 10, -21)
    icon:SetTexture("Interface\\Buttons\\WHITE8x8")
    badge.icon = icon

    local rankLabel = badge:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    rankLabel:SetPoint("LEFT", icon, "RIGHT", 5, 0)
    badge.rankLabel = rankLabel

    local topPctLabel = badge:CreateFontString(nil, "OVERLAY")
    topPctLabel:SetFont("Fonts\\ARIALN.TTF", 10)
    topPctLabel:SetPoint("TOPRIGHT", badge, "TOPRIGHT", -8, -21)
    topPctLabel:SetTextColor(0.6, 0.6, 0.6)
    badge.topPctLabel = topPctLabel

    -- Row 3: progress bar
    local barBg = badge:CreateTexture(nil, "BORDER")
    barBg:SetHeight(4)
    barBg:SetPoint("TOPLEFT",  badge, "TOPLEFT",  10, -38)
    barBg:SetPoint("TOPRIGHT", badge, "TOPRIGHT", -10, -38)
    barBg:SetColorTexture(0.18, 0.18, 0.18, 1)
    badge.barBg = barBg

    local barFill = badge:CreateTexture(nil, "ARTWORK")
    barFill:SetHeight(4)
    barFill:SetPoint("TOPLEFT", badge, "TOPLEFT", 10, -38)
    barFill:SetWidth(2)
    barFill:SetColorTexture(1, 1, 1, 0.9)
    badge.barFill = barFill

    -- Row 4: next-rank label
    local nextLabel = badge:CreateFontString(nil, "OVERLAY")
    nextLabel:SetFont("Fonts\\ARIALN.TTF", 11)
    nextLabel:SetPoint("TOPLEFT", badge, "TOPLEFT", 10, -50)
    nextLabel:SetTextColor(0.70, 0.70, 0.70)
    badge.nextLabel = nextLabel

    badge:Hide()
    return badge
end

-- ── Theme application ─────────────────────────────────────────────────────────

local function ApplyRankTheme(score, charName, isOwnProfile)
    if not score then
        if TML.RankBadge then TML.RankBadge:Hide() end
        return
    end

    local rank    = TML:ScoreToRank(score)
    local r, g, b = TML:GetTierColor(rank.tier)

    -- Borders
    if TML.PVEBorder then
        TML.PVEBorder:SetColor(r, g, b)
        TML.PVEBorder:Show()
        StopShimmer(TML.PVEBorder)
        StartShimmer(TML.PVEBorder, rank.tier)
    end

    for _, key in ipairs({ "RIOProfileBorder", "RIOSearchBorder" }) do
        local border = TML[key]
        if border then
            border:SetColor(r, g, b)
            StopShimmer(border)
            StartShimmer(border, rank.tier)
        end
    end

    -- Badge
    if TML.RankBadge then
        local badge   = TML.RankBadge
        local maxW    = badge:GetWidth() - 20

        -- Header row
        badge.header:SetText(isOwnProfile and "Your Rank" or (charName or "Their Rank"))
        badge.scoreLabel:SetText(string.format("%d pts", math.floor(score)))

        -- Rank row
        badge.rankLabel:SetText(rank.label)
        badge.rankLabel:SetTextColor(r, g, b)
        badge.icon:SetVertexColor(r, g, b, 1)
        badge.accent:SetColorTexture(r, g, b, 1)

        -- Top%
        local pct = TML:ScoreToTopPercentApprox(score)
        if pct < 1 then
            badge.topPctLabel:SetText(string.format("Top %.2f%%", pct))
        else
            badge.topPctLabel:SetText(string.format("Top %.0f%%", pct))
        end

        -- Progress bar
        local progress = TML:ScoreToRankProgress(score)
        badge.barFill:SetWidth(math.max(2, progress * maxW))
        badge.barFill:SetColorTexture(r, g, b, 0.9)

        -- Next rank
        local info = TML:GetNextRankInfo(score)
        if info then
            badge.nextLabel:SetText(string.format("+%d pts to %s", info.pointsNeeded, info.nextRank.label))
            badge.nextLabel:SetTextColor(0.70, 0.70, 0.70)
        else
            badge.nextLabel:SetText("Max Rank!")
            badge.nextLabel:SetTextColor(r, g, b)
        end

        badge:Show()
    end

    -- Minimap button
    if TML.MinimapButton then
        TML.MinimapButton.dot:SetVertexColor(r, g, b, 1)
    end
end

-- ── PVEFrame ──────────────────────────────────────────────────────────────────

local function SetupPVEFrame()
    if not PVEFrame then return end
    TML.PVEBorder = CreateBorderOverlay(PVEFrame, "TankMeLaterPVEBorder")
    TML.PVEBorder:Hide()
    PVEFrame:HookScript("OnShow", function()
        local s, n, own = TML:GetProfileScore()
        ApplyRankTheme(s, n, own)
    end)
    PVEFrame:HookScript("OnHide", function()
        if TML.PVEBorder then
            StopShimmer(TML.PVEBorder)
            TML.PVEBorder:Hide()
        end
    end)
end

-- ── RaiderIO frames ───────────────────────────────────────────────────────────

local function HookRIOTooltipFrame(frameName, borderKey, withBadge)
    local frame = _G[frameName]
    if not frame or not frame.HookScript then return false end

    local border = CreateBorderOverlay(frame, "TankMeLater" .. borderKey)
    border:Hide()
    TML[borderKey] = border

    if withBadge then
        TML.RankBadge = CreateRankBadge(frame)
    end

    frame:HookScript("OnShow", function()
        local s, n, own = TML:GetProfileScore()
        ApplyRankTheme(s, n, own)
        border:Show()
    end)
    frame:HookScript("OnHide", function()
        StopShimmer(border)
        border:Hide()
        if withBadge and TML.RankBadge then TML.RankBadge:Hide() end
    end)

    return true
end

local function TryHookRIOFrames()
    local a = HookRIOTooltipFrame("RaiderIO_ProfileTooltip", "RIOProfileBorder", true)
    local b = HookRIOTooltipFrame("RaiderIO_SearchTooltip",  "RIOSearchBorder",  false)
    return a or b
end

-- ── Minimap button ────────────────────────────────────────────────────────────

local MINIMAP_RADIUS = 80

local function MinimapButtonPos(angle)
    return math.cos(math.rad(angle)) * MINIMAP_RADIUS,
           math.sin(math.rad(angle)) * MINIMAP_RADIUS
end

local function CreateMinimapButton()
    local db = TankMeLaterDB
    local btn = CreateFrame("Button", "TankMeLaterMinimapButton", Minimap)
    btn:SetSize(26, 26)
    btn:SetFrameLevel(8)
    btn:SetFrameStrata("MEDIUM")

    local x, y = MinimapButtonPos(db.minimapAngle)
    btn:SetPoint("CENTER", Minimap, "CENTER", x, y)

    -- Circular border texture
    local ring = btn:CreateTexture(nil, "OVERLAY")
    ring:SetSize(36, 36)
    ring:SetPoint("CENTER")
    ring:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")

    -- Colored dot (tier color applied at runtime)
    local dot = btn:CreateTexture(nil, "BACKGROUND")
    dot:SetSize(16, 16)
    dot:SetPoint("CENTER")
    dot:SetTexture("Interface\\Buttons\\WHITE8x8")
    dot:SetVertexColor(0.31, 0.765, 0.969, 1)  -- default: Diamond cyan
    btn.dot = dot

    -- Hover tooltip
    btn:SetScript("OnEnter", function(self)
        GameTooltip:SetOwner(self, "ANCHOR_LEFT")
        GameTooltip:AddLine("TankMeLater", 0.31, 0.765, 0.969)
        local score = TML:GetPlayerScore()
        if score then
            local rank    = TML:ScoreToRank(score)
            local r, g, b = TML:GetTierColor(rank.tier)
            GameTooltip:AddLine(rank.label, r, g, b)
            local pct = TML:ScoreToTopPercentApprox(score)
            if pct < 1 then
                GameTooltip:AddLine(string.format("%d pts  |  Top %.2f%%", math.floor(score), pct), 0.85, 0.85, 0.85)
            else
                GameTooltip:AddLine(string.format("%d pts  |  Top %.0f%%", math.floor(score), pct), 0.85, 0.85, 0.85)
            end
            local info = TML:GetNextRankInfo(score)
            if info then
                GameTooltip:AddLine(string.format("+%d pts to %s", info.pointsNeeded, info.nextRank.label), 0.6, 0.6, 0.6)
            end
        else
            GameTooltip:AddLine("No score data — RaiderIO required", 0.5, 0.5, 0.5)
        end
        GameTooltip:Show()
    end)
    btn:SetScript("OnLeave", function() GameTooltip:Hide() end)

    -- Drag around minimap edge
    btn:RegisterForDrag("LeftButton")
    btn:SetScript("OnDragStart", function(self) self:SetScript("OnUpdate", function(self)
        local mx, my = Minimap:GetCenter()
        local scale  = UIParent:GetEffectiveScale()
        local cx, cy = GetCursorPosition()
        cx, cy = cx / scale, cy / scale
        local angle  = math.deg(math.atan2(cy - my, cx - mx))
        db.minimapAngle = angle
        local nx, ny = MinimapButtonPos(angle)
        self:SetPoint("CENTER", Minimap, "CENTER", nx, ny)
    end) end)
    btn:SetScript("OnDragStop", function(self)
        self:SetScript("OnUpdate", nil)
    end)

    -- Refresh dot color immediately if score is available
    C_Timer.After(1, function()
        local score = TML:GetPlayerScore()
        if score then
            local rank    = TML:ScoreToRank(score)
            local r, g, b = TML:GetTierColor(rank.tier)
            btn.dot:SetVertexColor(r, g, b, 1)
        end
    end)

    TML.MinimapButton = btn
end

-- ── Init ──────────────────────────────────────────────────────────────────────

function TML:InitUI()
    SetupPVEFrame()

    if not TryHookRIOFrames() then
        C_Timer.After(3, TryHookRIOFrames)
    end

    CreateMinimapButton()
end
