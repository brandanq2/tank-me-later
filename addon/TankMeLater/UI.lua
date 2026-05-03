-- Applies tier-colored border overlays to PVEFrame and the RaiderIO profile popup,
-- and injects a rank badge into the top-left corner of the RaiderIO profile window.

TankMeLater = TankMeLater or {}
local TML = TankMeLater

local BORDER_THICKNESS = 2
local BORDER_ALPHA      = 0.95

-- Creates a clean 8-piece border (4 edges + 4 corners, no overlap).
-- Returns the overlay frame with a :SetColor(r,g,b) method.
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

    -- Four corners (S×S squares).
    local tl = Tex(); tl:SetSize(S, S); tl:SetPoint("TOPLEFT",     overlay, "TOPLEFT",     0,  0)
    local tr = Tex(); tr:SetSize(S, S); tr:SetPoint("TOPRIGHT",    overlay, "TOPRIGHT",    0,  0)
    local bl = Tex(); bl:SetSize(S, S); bl:SetPoint("BOTTOMLEFT",  overlay, "BOTTOMLEFT",  0,  0)
    local br = Tex(); br:SetSize(S, S); br:SetPoint("BOTTOMRIGHT", overlay, "BOTTOMRIGHT", 0,  0)

    -- Four edges — inset by S on each end so they don't touch the corners.
    local top = Tex()
    top:SetHeight(S)
    top:SetPoint("TOPLEFT",  overlay, "TOPLEFT",   S,  0)
    top:SetPoint("TOPRIGHT", overlay, "TOPRIGHT", -S,  0)

    local bot = Tex()
    bot:SetHeight(S)
    bot:SetPoint("BOTTOMLEFT",  overlay, "BOTTOMLEFT",   S, 0)
    bot:SetPoint("BOTTOMRIGHT", overlay, "BOTTOMRIGHT", -S, 0)

    local lft = Tex()
    lft:SetWidth(S)
    lft:SetPoint("TOPLEFT",    overlay, "TOPLEFT",    0, -S)
    lft:SetPoint("BOTTOMLEFT", overlay, "BOTTOMLEFT", 0,  S)

    local rgt = Tex()
    rgt:SetWidth(S)
    rgt:SetPoint("TOPRIGHT",    overlay, "TOPRIGHT",    0, -S)
    rgt:SetPoint("BOTTOMRIGHT", overlay, "BOTTOMRIGHT", 0,  S)

    local all = { tl, tr, bl, br, top, bot, lft, rgt }

    function overlay:SetColor(r, g, b)
        for _, t in ipairs(all) do
            t:SetColorTexture(r, g, b, BORDER_ALPHA)
        end
    end

    return overlay
end

-- Creates the rank badge anchored to the top-left of `parent`.
local function CreateRankBadge(parent)
    local badge = CreateFrame("Frame", "TankMeLaterRankBadge", parent)
    badge:SetSize(190, 42)
    badge:SetPoint("BOTTOMLEFT", parent, "TOPLEFT", 0, 4)
    badge:SetFrameLevel(parent:GetFrameLevel() + 15)

    local bg = badge:CreateTexture(nil, "BACKGROUND")
    bg:SetAllPoints(badge)
    bg:SetColorTexture(0, 0, 0, 0.70)

    -- Thin colored accent bar on the left edge of the card.
    local accent = badge:CreateTexture(nil, "BORDER")
    accent:SetWidth(3)
    accent:SetPoint("TOPLEFT",    badge, "TOPLEFT",    0, 0)
    accent:SetPoint("BOTTOMLEFT", badge, "BOTTOMLEFT", 0, 0)
    accent:SetColorTexture(1, 1, 1, 1)
    badge.accent = accent

    -- Colored tier icon square (WHITE8x8 recolored at runtime).
    local icon = badge:CreateTexture(nil, "ARTWORK")
    icon:SetSize(12, 12)
    icon:SetPoint("TOPLEFT", badge, "TOPLEFT", 10, -8)
    icon:SetTexture("Interface\\Buttons\\WHITE8x8")
    icon:SetVertexColor(1, 1, 1, 1)
    badge.icon = icon

    -- Rank label sits to the right of the icon.
    local rankLabel = badge:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    rankLabel:SetPoint("LEFT", icon, "RIGHT", 5, 0)

    -- Points line uses Arial Narrow which renders a wider glyph set.
    local nextLabel = badge:CreateFontString(nil, "OVERLAY")
    nextLabel:SetFont("Fonts\\ARIALN.TTF", 11)
    nextLabel:SetPoint("TOPLEFT", badge, "TOPLEFT", 10, -24)
    nextLabel:SetTextColor(0.75, 0.75, 0.75)

    badge.rankLabel = rankLabel
    badge.nextLabel = nextLabel
    badge:Hide()
    return badge
end

-- Updates all tier-colored UI elements for the given score.
local function ApplyRankTheme(score)
    if not score then
        if TML.RankBadge then TML.RankBadge:Hide() end
        return
    end

    local rank   = TML:ScoreToRank(score)
    local r, g, b = TML:GetTierColor(rank.tier)

    if TML.PVEBorder then
        TML.PVEBorder:SetColor(r, g, b)
        TML.PVEBorder:Show()
    end

    if TML.RIOProfileBorder then TML.RIOProfileBorder:SetColor(r, g, b) end
    if TML.RIOSearchBorder  then TML.RIOSearchBorder:SetColor(r, g, b)  end

    if TML.RankBadge then
        local badge = TML.RankBadge
        badge.rankLabel:SetText(rank.label)
        badge.rankLabel:SetTextColor(r, g, b)
        badge.accent:SetColorTexture(r, g, b, 1)
        badge.icon:SetVertexColor(r, g, b, 1)

        local info = TML:GetNextRankInfo(score)
        if info then
            badge.nextLabel:SetText(string.format("+%d pts to %s", info.pointsNeeded, info.nextRank.label))
            badge.nextLabel:SetTextColor(0.75, 0.75, 0.75)
        else
            badge.nextLabel:SetText("Max Rank!")
            badge.nextLabel:SetTextColor(r, g, b)
        end

        badge:Show()
    end
end

-- Hooks into PVEFrame (the Dungeons & Raids window).
local function SetupPVEFrame()
    if not PVEFrame then return end

    TML.PVEBorder = CreateBorderOverlay(PVEFrame, "TankMeLaterPVEBorder")
    TML.PVEBorder:Hide()

    PVEFrame:HookScript("OnShow", function()
        ApplyRankTheme(TML:GetPlayerScore())
    end)
end

-- Attaches a themed border to a single named frame and wires OnShow/OnHide.
-- Pass withBadge=true for the frame that should also host the rank card.
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
        ApplyRankTheme(TML:GetPlayerScore())
        border:Show()
    end)
    frame:HookScript("OnHide", function()
        border:Hide()
        if withBadge and TML.RankBadge then TML.RankBadge:Hide() end
    end)

    return true
end

-- Hooks into both RaiderIO tooltip windows.
-- Both frames exist by PLAYER_LOGIN in practice, but we retry once if not.
local function TryHookRIOFrames()
    local profileOk = HookRIOTooltipFrame("RaiderIO_ProfileTooltip", "RIOProfileBorder", true)
    local searchOk  = HookRIOTooltipFrame("RaiderIO_SearchTooltip",  "RIOSearchBorder",  false)
    return profileOk or searchOk
end

function TML:InitUI()
    SetupPVEFrame()

    if not TryHookRIOFrames() then
        C_Timer.After(3, TryHookRIOFrames)
    end
end
