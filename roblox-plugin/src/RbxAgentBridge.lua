--!strict
-- RbxAgent Studio Bridge Client Plugin
-- Letakkan file ini di direktori Roblox Studio Plugins: %localappdata%/Roblox/Plugins/RbxAgentBridge.lua

local HttpService = game:GetService("HttpService")
local ScriptEditorService = game:GetService("ScriptEditorService")
local RunService = game:GetService("RunService")

local BRIDGE_URL = "http://127.0.0.1:39024"
local SYNC_INTERVAL = 5 -- detik
local lastSync = 0

print("[RbxAgent] Initializing RbxAgent Studio Bridge Plugin...")

-- Fungsi pengirim heartbeat status ke desktop
local function sendHeartbeat()
    local payload = {
        pid = 0,
        placeId = game.PlaceId,
        placeName = game.Name ~= "" and game.Name or "Untitled Game",
        timestamp = os.time()
    }

    local success, response = pcall(function()
        return HttpService:RequestAsync({
            Url = BRIDGE_URL .. "/heartbeat",
            Method = "POST",
            Headers = {
                ["Content-Type"] = "application/json"
            },
            Body = HttpService:JSONEncode(payload)
        })
    end)

    if success and response.Success then
        -- connected
    else
        -- disconnected / desktop app not open
    end
end

-- Fungsi scan semua Script di dalam DataModel
local function scanScripts()
    local scripts = {}
    local descendants = game:GetDescendants()

    for _, inst in ipairs(descendants) do
        if inst:IsA("LuaSourceContainer") and not inst:IsA("CoreScript") then
            local src = ""
            pcall(function()
                src = inst.Source
            end)

            table.insert(scripts, {
                id = inst:GetDebugId(),
                name = inst.Name,
                class_name = inst.ClassName,
                parent_path = inst:GetFullName(),
                source = src
            })
        end
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
