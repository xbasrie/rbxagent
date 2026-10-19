--!strict
-- RbxAgent Studio Bridge Client Plugin
-- Letakkan file ini di direktori Roblox Studio Plugins: %localappdata%/Roblox/Plugins/RbxAgentBridge.lua

local HttpService = game:GetService("HttpService")
local ScriptEditorService = game:GetService("ScriptEditorService")
local RunService = game:GetService("RunService")

local BRIDGE_URL = "http://127.0.0.1:39024"
local SYNC_INTERVAL = 5 -- detik
local MAX_SYNC_SCRIPTS = 150
local MAX_SOURCE_LENGTH = 32000
local lastSync = 0

print("[RbxAgent] Initializing RbxAgent Studio Bridge Plugin...")

-- Fungsi pengirim heartbeat status ke desktop
local function sendHeartbeat()
    local payload = {
        pid = 0,
        placeId = game.PlaceId,
        placeName = game.Name ~= "" and game.Name or "Untitled Place",
        timestamp = os.time()
    }

    pcall(function()
        HttpService:RequestAsync({
            Url = BRIDGE_URL .. "/heartbeat",
            Method = "POST",
            Headers = {
                ["Content-Type"] = "application/json"
            },
            Body = HttpService:JSONEncode(payload)
        })
    end)
end

-- Scan hanya script containers untuk menghindari lag freeze pada part ratusan ribu
local function collectScriptsFromContainer(container: Instance, list: {any})
    if not container then return end
    for _, inst in ipairs(container:GetDescendants()) do
        if #list >= MAX_SYNC_SCRIPTS then break end
        if inst:IsA("LuaSourceContainer") and not inst:IsA("CoreScript") then
            local src = ""
            pcall(function()
                src = (inst :: any).Source or ""
            end)

            if #src > MAX_SOURCE_LENGTH then
                src = string.sub(src, 1, MAX_SOURCE_LENGTH) .. "\n-- [Truncated by RbxAgent Bridge]"
            end

            local debugId = inst.Name
            pcall(function()
                debugId = inst:GetDebugId()
            end)

            table.insert(list, {
                id = debugId,
                name = inst.Name,
                class_name = inst.ClassName,
                parent_path = inst:GetFullName(),
                source = src
            })
        end
    end
end

local function scanScripts()
    local scripts = {}

    -- Prioritaskan container umum script
    local targets = {
        game:GetService("ServerScriptService"),
        game:GetService("ReplicatedStorage"),
        game:GetService("ServerStorage"),
        game:GetService("StarterPlayer"),
        game:GetService("StarterGui"),
        workspace
    }

    for _, container in ipairs(targets) do
        collectScriptsFromContainer(container, scripts)
        if #scripts >= MAX_SYNC_SCRIPTS then break end
    end

    pcall(function()
        HttpService:RequestAsync({
            Url = BRIDGE_URL .. "/scripts/sync",
            Method = "POST",
            Headers = {
                ["Content-Type"] = "application/json"
            },
            Body = HttpService:JSONEncode(scripts)
        })
    end)
end

-- Main Loop
RunService.Heartbeat:Connect(function(dt)
    lastSync = lastSync + dt
    if lastSync >= SYNC_INTERVAL then
        lastSync = 0
        task.spawn(sendHeartbeat)
        task.spawn(scanScripts)
    end
end)

print("[RbxAgent] Bridge active. Connected to " .. BRIDGE_URL)
