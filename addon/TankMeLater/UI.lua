-- Applies tier-colored border overlays to PVEFrame and the RaiderIO profile popup,
-- and injects a rank badge into the top-right corner of the M+ window.

TankMeLater = TankMeLater or {}
local TML = TankMeLater

local BORDER_THICKNESS = 3
local BORDER_ALPHA      = 0.90
local GLOW_ALPHA        = 0.25

-- Creates a thin colored border overlay parented to `parent`.
-- Returns the overlay frame with a :SetColor(r,g,b) method.
local function CreateBorderOverlay(parent, name)
    local overlay = CreateFrame("Frame", name, parent)
    overlay:SetAllPoints(parent)
    overlay:SetFrameLevel(parent:GetFrameLevel() + 10)

    local function MakeLine(point1, point2, isVertical)
        local tex = overlay:CreateTexture(nil, "OVERLAY")
        tex:SetPoint(point1, overlay, point1, 0, 0)
        tex:SetPoint(point2, overlay, point2, 0, 0)
        if isVertical then
            tex:SetWidth(BORDER_THICKNESS)
        else
            tex:SetHeight(BORDER_THICKNESS)
        end
        tex:SetColorTexture(1, 1, 1, BORDER_ALPHA)
        return tex
    end

    local top    = MakeLine("TOPLEFT",    "TOPRIGHT",    false)
    local bottom = MakeLine("BOTTOMLEFT", "BOTTOMRIGHT", false)
    local left   = MakeLine("TOPLEFT",    "BOTTOMLEFT",  true)
    local right  = MakeLine("TOPRIGHT",   "BOTTOMRIGHT", true)

    -- Soft inner glow — a slightly wider, translucent copy of each edge.
    local function MakeGlow(point1, point2, isVertical, offset)
        local tex = overlay:CreateTexture(nil, "OVERLAY")
        tex:SetPoint(point1, overlay, point1, isVertical and offset or 0,  isVertical and 0 or offset)
        tex:SetPoint(point2, overlay, point2, isVertical and offset or 0,  isVertical and 0 or -offset)
        if isVertical then
            tex:SetWidth(BORDER_THICKNESS * 2)
        else
            tex:SetHeight(BORDER_THICKNESS * 2)
        end
        tex:SetColorTexture(1, 1, 1, GLOW_ALPHA)
        return tex
    end

    local gTop    = MakeGlow("TOPLEFT",    "TOPRIGHT",    false, -BORDER_THICKNESS)
    local gBottom = MakeGlow("BOTTOMLEFT", "BOTTOMRIGHT", false,  BORDER_THICKNESS)
    local gLeft   = MakeGlow("TOPLEFT",    "BOTTOMLEFT",  true,   BORDER_THICKNESS)
    local gRight  = MakeGlow("TOPRIGHT",   "BOTTOMRIGHT", true,  -BORDER_THICKNESS)

    local all = { top, bottom, left, right, gTop, gBottom, gLeft, gRight }

    function overlay:SetColor(r, g, b)
        for _, tex in ipairs(all) do
            local a = (tex == top or tex == bottom or tex == left or tex == right)
                      and BORDER_ALPHA or GLOW_ALPHA
            tex:SetColorTexture(r, g, b, a)
        end
    end

    return overlay
end

-- Creates the rank badge anchored inside the top-right of `parent`.
local function CreateRankBadge(parent)
    local badge = CreateFrame("Frame", "TankMeLaterRankBadge", parent)
    badge:SetSize(170, 38)
    badge:SetPoint("TOPRIGHT", parent, "TOPRIGHT", -14, -38)
    badge:SetFrameLevel(parent:GetFrameLevel() + 15)

    local bg = badge:CreateTexture(nil, "BACKGROUND")
    bg:SetAllPoints(badge)
    bg:SetColorTexture(0, 0, 0, 0.65)

    local rankLabel = badge:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    rankLabel:SetPoint("TOPLEFT", badge, "TOPLEFT", 8, -5)

    local nextLabel = badge:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    nextLabel:SetPoint("TOPLEFT", badge, "TOPLEFT", 8, -19)
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

        local info = TML:GetNextRankInfo(score)
        if info then
            badge.nextLabel:SetText(string.format("↑ %d pts → %s", info.pointsNeeded, info.nextRank.label))
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

    TML.RankBadge = CreateRankBadge(PVEFrame)

    PVEFrame:HookScript("OnShow", function()
        ApplyRankTheme(TML:GetPlayerScore())
    end)
end

-- Attaches a themed border to a single named frame and wires OnShow/OnHide.
local function HookRIOTooltipFrame(frameName, borderKey)
    local frame = _G[frameName]
    if not frame or not frame.HookScript then return false end

    local border = CreateBorderOverlay(frame, "TankMeLater" .. borderKey)
    border:Hide()
    TML[borderKey] = border

    frame:HookScript("OnShow", function()
        ApplyRankTheme(TML:GetPlayerScore())
        border:Show()
    end)
    frame:HookScript("OnHide", function()
        border:Hide()
    end)

    return true
end

-- Hooks into both RaiderIO tooltip windows.
-- Both frames exist by PLAYER_LOGIN in practice, but we retry once if not.
local function TryHookRIOFrames()
    local profileOk = HookRIOTooltipFrame("RaiderIO_ProfileTooltip", "RIOProfileBorder")
    local searchOk  = HookRIOTooltipFrame("RaiderIO_SearchTooltip",  "RIOSearchBorder")
    return profileOk or searchOk
end

function TML:InitUI()
    SetupPVEFrame()

    if not TryHookRIOFrames() then
        C_Timer.After(3, TryHookRIOFrames)
    end
end
