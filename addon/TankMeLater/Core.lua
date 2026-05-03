-- Rank lookup and player score retrieval.
-- All rank math is pre-computed in RankData.lua; this file is just array scans.

TankMeLater = TankMeLater or {}
local TML = TankMeLater

-- Returns the Cutoffs entry for `score`, or Iron IV as a fallback.
function TML:ScoreToRank(score)
    for _, c in ipairs(TML.Data.Cutoffs) do
        if score >= c.minScore then
            return c
        end
    end
    return TML.Data.Cutoffs[#TML.Data.Cutoffs]
end

-- Returns { nextRank, pointsNeeded } or nil if already Challenger.
function TML:GetNextRankInfo(score)
    for i, c in ipairs(TML.Data.Cutoffs) do
        if score >= c.minScore then
            if i == 1 then return nil end
            local next = TML.Data.Cutoffs[i - 1]
            local needed = math.ceil(next.minScore - score)
            if needed <= 0 then return nil end
            return { nextRank = next, pointsNeeded = needed }
        end
    end
    return nil
end

-- Returns (r, g, b) for a tier name.
function TML:GetTierColor(tier)
    local c = TML.Data.TierColors[tier]
    if c then return c.r, c.g, c.b end
    return 1, 1, 1
end

-- Returns the local player's current M+ score via the RaiderIO addon API.
-- Returns nil when RaiderIO is not installed or the profile hasn't loaded yet.
function TML:GetPlayerScore()
    if not RaiderIO then return nil end

    local ok, profile = pcall(RaiderIO.GetProfile, "player", "PLAYER")
    if not ok or type(profile) ~= "table" then return nil end

    -- Try every known field path across RaiderIO versions.
    return profile.mythicPlusScore
        or (profile.mythicPlusScoreRoles and profile.mythicPlusScoreRoles.all and profile.mythicPlusScoreRoles.all.score)
        or (profile.mythicKeystoneProfile and (
                profile.mythicKeystoneProfile.currentScore
             or profile.mythicKeystoneProfile.mainScore
           ))
end

-- Dumps the raw RaiderIO profile to chat — run /tml debug to call this.
function TML:DebugProfile()
    if not RaiderIO then
        print("|cff4fc3f7TankMeLater|r: RaiderIO global not found")
        return
    end

    local ok, profile = pcall(RaiderIO.GetProfile, "player", "PLAYER")
    if not ok or type(profile) ~= "table" then
        print("|cff4fc3f7TankMeLater|r: GetProfile failed or returned nil")
        print("  ok=" .. tostring(ok) .. "  type=" .. type(profile))
        return
    end

    print("|cff4fc3f7TankMeLater|r: RaiderIO profile keys:")
    for k, v in pairs(profile) do
        local vtype = type(v)
        if vtype == "table" then
            print(string.format("  [%s] = table {", k))
            for k2, v2 in pairs(v) do
                print(string.format("    [%s] = %s (%s)", k2, tostring(v2), type(v2)))
            end
            print("  }")
        else
            print(string.format("  [%s] = %s (%s)", k, tostring(v), vtype))
        end
    end
end
