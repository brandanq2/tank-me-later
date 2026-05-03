-- Border overlays, rank badge, and minimap button.

TankMeLater = TankMeLater or {}
local TML = TankMeLater

local BORDER_INSET = 3   -- px the overlay frame extends outside its parent

-- ── Border ────────────────────────────────────────────────────────────────────

local function CreateBorderOverlay(parent, name)
    local overlay = CreateFrame("Frame", name, parent, "BackdropTemplate")
    overlay:SetFrameLevel(parent:GetFrameLevel() + 10)
    overlay:SetPoint("TOPLEFT",     parent, "TOPLEFT",     -BORDER_INSET,  BORDER_INSET)
    overlay:SetPoint("BOTTOMRIGHT", parent, "BOTTOMRIGHT",  BORDER_INSET, -BORDER_INSET)

    overlay:SetBackdrop({
        edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
        edgeSize = 16,
        insets   = { left = 4, right = 4, top = 4, bottom = 4 },
    })
    overlay:SetBackdropBorderColor(1, 1, 1, 0.9)

    function overlay:SetColor(r, g, b)
        overlay:SetBackdropBorderColor(r, g, b, 0.9)
    end

    return overlay
end

-- ── Rank badge ────────────────────────────────────────────────────────────────

local function CreateRankBadge(parent)
    local badge = CreateFrame("Frame", "TankMeLaterRankBadge", parent)
    badge:SetSize(210, 66)
    badge:SetPoint("BOTTOMLEFT", parent, "TOPLEFT", 0, 4)
    badge:SetFrameLevel(parent:GetFrameLevel() + 15)

    local bg = badge:CreateTexture(nil, "BACKGROUND")
    bg:SetAllPoints(badge)
    bg:SetColorTexture(0, 0, 0, 0.72)

    local accent = badge:CreateTexture(nil, "BORDER")
    accent:SetWidth(3)
    accent:SetPoint("TOPLEFT",    badge, "TOPLEFT",    0, 0)
    accent:SetPoint("BOTTOMLEFT", badge, "BOTTOMLEFT", 0, 0)
    accent:SetColorTexture(1, 1, 1, 1)
    badge.accent = accent

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

    local barBg = badge:CreateTexture(nil, "BORDER")
    barBg:SetHeight(4)
    barBg:SetPoint("TOPLEFT",  badge, "TOPLEFT",   10, -38)
    barBg:SetPoint("TOPRIGHT", badge, "TOPRIGHT", -10, -38)
    barBg:SetColorTexture(0.18, 0.18, 0.18, 1)

    local barFill = badge:CreateTexture(nil, "ARTWORK")
    barFill:SetHeight(4)
    barFill:SetPoint("TOPLEFT", badge, "TOPLEFT", 10, -38)
    barFill:SetWidth(2)
    barFill:SetColorTexture(1, 1, 1, 0.9)
    badge.barFill = barFill

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

    if TML.PVEBorder then
        TML.PVEBorder:SetColor(r, g, b)
        TML.PVEBorder:Show()
    end

    for _, key in ipairs({ "RIOProfileBorder", "RIOSearchBorder" }) do
        local border = TML[key]
        if border then border:SetColor(r, g, b) end
    end

    if TML.RankBadge then
        local badge = TML.RankBadge
        local maxW  = badge:GetWidth() - 20

        badge.header:SetText(isOwnProfile and "Your Rank" or (charName or "Their Rank"))
        badge.scoreLabel:SetText(string.format("%d pts", math.floor(score)))

        badge.rankLabel:SetText(rank.label)
        badge.rankLabel:SetTextColor(r, g, b)
        badge.icon:SetVertexColor(r, g, b, 1)
        badge.accent:SetColorTexture(r, g, b, 1)

        local pct = TML:ScoreToTopPercentApprox(score)
        if pct < 1 then
            badge.topPctLabel:SetText(string.format("Top %.2f%%", pct))
        else
            badge.topPctLabel:SetText(string.format("Top %.0f%%", pct))
        end

        local progress = TML:ScoreToRankProgress(score)
        badge.barFill:SetWidth(math.max(2, progress * maxW))
        badge.barFill:SetColorTexture(r, g, b, 0.9)

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

    if TML.MinimapButton then
        local btn = TML.MinimapButton
        btn.dot:SetVertexColor(r, g, b, 1)
        -- Proc glow on the minimap button tinted to the rank color
        if ActionButton_ShowOverlayGlow then
            ActionButton_ShowOverlayGlow(btn)
        end
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
        if TML.PVEBorder then TML.PVEBorder:Hide() end
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

    local ring = btn:CreateTexture(nil, "OVERLAY")
    ring:SetSize(36, 36)
    ring:SetPoint("CENTER")
    ring:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")

    local dot = btn:CreateTexture(nil, "BACKGROUND")
    dot:SetSize(16, 16)
    dot:SetPoint("CENTER")
    dot:SetTexture("Interface\\Buttons\\WHITE8x8")
    dot:SetVertexColor(0.31, 0.765, 0.969, 1)
    btn.dot = dot

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

    C_Timer.After(1, function()
        local score = TML:GetPlayerScore()
        if score then
            local rank    = TML:ScoreToRank(score)
            local r, g, b = TML:GetTierColor(rank.tier)
            btn.dot:SetVertexColor(r, g, b, 1)
            if ActionButton_ShowOverlayGlow then
                ActionButton_ShowOverlayGlow(btn)
            end
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
