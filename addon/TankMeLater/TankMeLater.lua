-- Entry point: event registration and slash commands.

TankMeLater = TankMeLater or {}
local TML = TankMeLater
local ADDON_NAME = "TankMeLater"

local events = CreateFrame("Frame", "TankMeLaterEventFrame")
events:RegisterEvent("ADDON_LOADED")
events:RegisterEvent("PLAYER_LOGIN")

events:SetScript("OnEvent", function(_, event, arg1)
    if event == "ADDON_LOADED" and arg1 == ADDON_NAME then
        TankMeLaterDB = TankMeLaterDB or {}
        local d = TML.Data
        if d then
            print(string.format("|cff4fc3f7TankMeLater|r loaded — %s | data: %s",
                d.Season or "?", d.UpdatedDate or "?"))
        end
    elseif event == "PLAYER_LOGIN" then
        TML:InitUI()
    end
end)

-- /tml  or  /tankmelater
SLASH_TANKMELATER1 = "/tml"
SLASH_TANKMELATER2 = "/tankmelater"

SlashCmdList["TANKMELATER"] = function(msg)
    local cmd = (msg or ""):lower():match("^%s*(.-)%s*$")

    if cmd == "info" then
        local score = TML:GetPlayerScore()
        if not score then
            print("|cff4fc3f7TankMeLater|r: Score unavailable — is the RaiderIO addon installed?")
            return
        end

        local rank    = TML:ScoreToRank(score)
        local r, g, b = TML:GetTierColor(rank.tier)
        local hex     = string.format("|cff%02x%02x%02x", r * 255, g * 255, b * 255)

        print(string.format("|cff4fc3f7TankMeLater|r: Rank %s%s|r  (score: %.0f)", hex, rank.label, score))

        local info = TML:GetNextRankInfo(score)
        if info then
            print(string.format("|cff4fc3f7TankMeLater|r: +%d points to reach %s (min score %d)",
                info.pointsNeeded, info.nextRank.label, info.nextRank.minScore))
        else
            print(string.format("|cff4fc3f7TankMeLater|r: %sMax Rank — Challenger!|r", hex))
        end

    elseif cmd == "debug" then
        TML:DebugProfile()

    elseif cmd == "data" then
        local d = TML.Data
        print(string.format("|cff4fc3f7TankMeLater|r: Season %s | Updated %s",
            d and d.Season or "?", d and d.UpdatedDate or "?"))

    else
        print("|cff4fc3f7TankMeLater|r commands:")
        print("  |cffffff00/tml info|r   — your current rank and next-rank progress")
        print("  |cffffff00/tml data|r   — season and data-freshness info")
        print("  |cffffff00/tml debug|r  — dump raw RaiderIO profile to chat")
    end
end
