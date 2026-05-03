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

-- Progress through the current rank tier (0 = just entered, 1 = at next boundary).
function TML:ScoreToRankProgress(score)
    local cutoffs = TML.Data.Cutoffs
    for i, c in ipairs(cutoffs) do
        if score >= c.minScore then
            if i == 1 then return 1.0 end
            local upper = cutoffs[i - 1]
            return (score - c.minScore) / (upper.minScore - c.minScore)
        end
    end
    return 0
end

-- Estimated top-% for a score, linearly interpolated between rank boundaries.
function TML:ScoreToTopPercentApprox(score)
    local cutoffs = TML.Data.Cutoffs
    for i, c in ipairs(cutoffs) do
        if score >= c.minScore then
            if i == 1 then
                return math.max(0.001, c.topPercent * c.minScore / score)
            end
            local upper = cutoffs[i - 1]
            local t = (score - c.minScore) / (upper.minScore - c.minScore)
            return c.topPercent - t * (c.topPercent - upper.topPercent)
        end
    end
    return 100
end

-- Returns score, characterName, isOwnProfile.
-- Tries mouseover then target so the profile card reflects whoever RaiderIO is showing.
function TML:GetProfileScore()
    if RaiderIO then
        for _, unit in ipairs({ "mouseover", "target" }) do
            if UnitExists(unit) and UnitIsPlayer(unit) and not UnitIsUnit(unit, "player") then
                local ok, p = pcall(RaiderIO.GetProfile, unit, "PLAYER")
                if ok and type(p) == "table" and p.mythicKeystoneProfile then
                    local s = p.mythicKeystoneProfile.currentScore
                    if s then return s, (p.name or UnitName(unit)), false end
                end
            end
        end
    end
    local s = TML:GetPlayerScore()
    return s, UnitName("player"), true
end

-- Returns the local player's current M+ score via the RaiderIO addon API.
-- Returns nil when RaiderIO is not installed or the profile hasn't loaded yet.
function TML:GetPlayerScore()
    if not RaiderIO then return nil end

    local ok, profile = pcall(RaiderIO.GetProfile, "player", "PLAYER")
    if not ok or type(profile) ~= "table" then return nil end

    local mkp = profile.mythicKeystoneProfile
    if not mkp then return nil end
    return mkp.currentScore
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
