-- Border overlays, rank badge, shimmer animation, and minimap button.

TankMeLater = TankMeLater or {}
local TML = TankMeLater

local BORDER_THICKNESS = 2   -- default static edge thickness
local BORDER_ALPHA      = 0.95
local CORNER_ARM        = 10  -- px: L-bracket arm length along each edge
local CORNER_THICK      = 3   -- px: L-bracket arm thickness (fixed, doesn't pulse)
local GLOW_PAD          = 5   -- px: outer glow ring width

-- Thickness pulse config for top tiers (minT → maxT and back).
local SHIMMER_CFG = {
    Challenger  = { speed = 1.6, minT = 0, maxT = 5 },
    Grandmaster = { speed = 1.2, minT = 0, maxT = 4 },
    Master      = { speed = 0.85, minT = 0, maxT = 3 },
}

-- ── Border ────────────────────────────────────────────────────────────────────

-- Border with L-bracket corner ornaments and resizable main edges.
-- Corner brackets are fixed at CORNER_THICK × CORNER_ARM and sit at all four
-- corners.  The four main edges run between the brackets and pulse in thickness
-- for shimmer tiers via overlay:SetThickness(t).
local function CreateBorderOverlay(parent, name)
    local overlay = CreateFrame("Frame", name, parent)
    overlay:SetAllPoints(parent)
    overlay:SetFrameLevel(parent:GetFrameLevel() + 10)

    local function Tex()
        local t = overlay:CreateTexture(nil, "OVERLAY")
        t:SetColorTexture(1, 1, 1, BORDER_ALPHA)
        return t
    end

    -- L-bracket arms: one horizontal + one vertical per corner.
    local function Bracket(anchor, isHoriz)
        local t = Tex()
        if isHoriz then t:SetSize(CORNER_ARM, CORNER_THICK)
        else             t:SetSize(CORNER_THICK, CORNER_ARM) end
        t:SetPoint(anchor, overlay, anchor, 0, 0)
        return t
    end

    local brackets = {
        Bracket("TOPLEFT",     true),  Bracket("TOPLEFT",     false),
        Bracket("TOPRIGHT",    true),  Bracket("TOPRIGHT",    false),
        Bracket("BOTTOMLEFT",  true),  Bracket("BOTTOMLEFT",  false),
        Bracket("BOTTOMRIGHT", true),  Bracket("BOTTOMRIGHT", false),
    }

    -- Main edges — hidden by default; pulse in via SetThickness during shimmer.
    local top = Tex(); top:SetHeight(0)
    top:SetPoint("TOPLEFT",  overlay, "TOPLEFT",   CORNER_ARM, 0)
    top:SetPoint("TOPRIGHT", overlay, "TOPRIGHT", -CORNER_ARM, 0)

    local bot = Tex(); bot:SetHeight(0)
    bot:SetPoint("BOTTOMLEFT",  overlay, "BOTTOMLEFT",   CORNER_ARM, 0)
    bot:SetPoint("BOTTOMRIGHT", overlay, "BOTTOMRIGHT", -CORNER_ARM, 0)

    local lft = Tex(); lft:SetWidth(0)
    lft:SetPoint("TOPLEFT",    overlay, "TOPLEFT",    0, -CORNER_ARM)
    lft:SetPoint("BOTTOMLEFT", overlay, "BOTTOMLEFT", 0,  CORNER_ARM)

    local rgt = Tex(); rgt:SetWidth(0)
    rgt:SetPoint("TOPRIGHT",    overlay, "TOPRIGHT",    0, -CORNER_ARM)
    rgt:SetPoint("BOTTOMRIGHT", overlay, "BOTTOMRIGHT", 0,  CORNER_ARM)

    function overlay:SetColor(r, g, b)
        for _, t in ipairs(brackets) do t:SetColorTexture(r, g, b, BORDER_ALPHA) end
        top:SetColorTexture(r, g, b, BORDER_ALPHA)
        bot:SetColorTexture(r, g, b, BORDER_ALPHA)
        lft:SetColorTexture(r, g, b, BORDER_ALPHA)
        rgt:SetColorTexture(r, g, b, BORDER_ALPHA)
    end

    -- Called every ~33 ms by the shimmer ticker to resize the main edges.
    function overlay:SetThickness(t)
        local s = math.max(0, t)
        top:SetHeight(s); top:ClearAllPoints()
        top:SetPoint("TOPLEFT",  overlay, "TOPLEFT",   CORNER_ARM, 0)
        top:SetPoint("TOPRIGHT", overlay, "TOPRIGHT", -CORNER_ARM, 0)

        bot:SetHeight(s); bot:ClearAllPoints()
        bot:SetPoint("BOTTOMLEFT",  overlay, "BOTTOMLEFT",   CORNER_ARM, 0)
        bot:SetPoint("BOTTOMRIGHT", overlay, "BOTTOMRIGHT", -CORNER_ARM, 0)

        lft:SetWidth(s); lft:ClearAllPoints()
        lft:SetPoint("TOPLEFT",    overlay, "TOPLEFT",    0, -CORNER_ARM)
        lft:SetPoint("BOTTOMLEFT", overlay, "BOTTOMLEFT", 0,  CORNER_ARM)

        rgt:SetWidth(s); rgt:ClearAllPoints()
        rgt:SetPoint("TOPRIGHT",    overlay, "TOPRIGHT",    0, -CORNER_ARM)
        rgt:SetPoint("BOTTOMRIGHT", overlay, "BOTTOMRIGHT", 0,  CORNER_ARM)
    end

    overlay.defaultThickness = 0
    return overlay
end

-- ── Shimmer ───────────────────────────────────────────────────────────────────

-- Flattens the curve at both extremes so the pulse lingers at min/max
-- instead of passing through them at full speed like raw sine.
local function Smoothstep(t) return t * t * (3 - 2 * t) end

local function StartShimmer(overlay, tier, r, g, b)
    local cfg = SHIMMER_CFG[tier]
    if not cfg then
        overlay:SetThickness(overlay.defaultThickness)
        if overlay.glowFrame then overlay.glowFrame:Hide() end
        return
    end

    if not overlay.glowFrame then
        local gf = CreateFrame("Frame", nil, overlay:GetParent())
        gf:SetFrameLevel(overlay:GetFrameLevel() - 1)
        gf:SetPoint("TOPLEFT",     overlay, "TOPLEFT",     -GLOW_PAD,  GLOW_PAD)
        gf:SetPoint("BOTTOMRIGHT", overlay, "BOTTOMRIGHT",  GLOW_PAD, -GLOW_PAD)

        local function GT()
            local t = gf:CreateTexture(nil, "BACKGROUND")
            t:SetColorTexture(r, g, b, 0)
            return t
        end
        local gt = GT(); gt:SetHeight(GLOW_PAD)
        gt:SetPoint("TOPLEFT",  gf, "TOPLEFT",  0, 0)
        gt:SetPoint("TOPRIGHT", gf, "TOPRIGHT", 0, 0)

        local gb = GT(); gb:SetHeight(GLOW_PAD)
        gb:SetPoint("BOTTOMLEFT",  gf, "BOTTOMLEFT",  0, 0)
        gb:SetPoint("BOTTOMRIGHT", gf, "BOTTOMRIGHT", 0, 0)

        local gl = GT(); gl:SetWidth(GLOW_PAD)
        gl:SetPoint("TOPLEFT",    gf, "TOPLEFT",    0, -GLOW_PAD)
        gl:SetPoint("BOTTOMLEFT", gf, "BOTTOMLEFT", 0,  GLOW_PAD)

        local gr = GT(); gr:SetWidth(GLOW_PAD)
        gr:SetPoint("TOPRIGHT",    gf, "TOPRIGHT",    0, -GLOW_PAD)
        gr:SetPoint("BOTTOMRIGHT", gf, "BOTTOMRIGHT", 0,  GLOW_PAD)

        gf.edges = { gt, gb, gl, gr }
        overlay.glowFrame = gf
    end

    for _, t in ipairs(overlay.glowFrame.edges) do t:SetColorTexture(r, g, b, 0) end
    overlay.glowFrame:Show()

    local elapsed = 0
    overlay.shimmerTicker = C_Timer.NewTicker(0.033, function()
        elapsed = elapsed + 0.033 * cfg.speed
        local progress = Smoothstep(0.5 + 0.5 * math.sin(elapsed))
        overlay:SetThickness(cfg.minT + (cfg.maxT - cfg.minT) * progress)
        local glowAlpha = progress * 0.25
        for _, t in ipairs(overlay.glowFrame.edges) do
            t:SetColorTexture(r, g, b, glowAlpha)
        end
    end)
end

local function StopShimmer(overlay)
    if overlay.shimmerTicker then
        overlay.shimmerTicker:Cancel()
        overlay.shimmerTicker = nil
    end
    overlay:SetThickness(overlay.defaultThickness or BORDER_THICKNESS)
    if overlay.glowFrame then overlay.glowFrame:Hide() end
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
        StartShimmer(TML.PVEBorder, rank.tier, r, g, b)
    end

    for _, key in ipairs({ "RIOProfileBorder", "RIOSearchBorder" }) do
        local border = TML[key]
        if border then
            border:SetColor(r, g, b)
            StopShimmer(border)
            StartShimmer(border, rank.tier, r, g, b)
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
