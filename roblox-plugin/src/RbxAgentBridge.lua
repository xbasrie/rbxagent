--!strict
-- RbxAgent Studio Bridge Client Plugin (Two-Way)
-- Letakkan file ini di: %localappdata%/Roblox/Plugins/RbxAgentBridge.lua

local HttpService = game:GetService("HttpService")
local ScriptEditorService = game:GetService("ScriptEditorService")
local RunService = game:GetService("RunService")

local BRIDGE_URL = "http://127.0.0.1:39024"
local SYNC_INTERVAL = 5 -- detik
local PATCH_POLL_INTERVAL = 2 -- detik
local MAX_SYNC_SCRIPTS = 150
local MAX_SOURCE_LENGTH = 32000
local lastSync = 0
local lastPatchPoll = 0

print("[RbxAgent] Initializing RbxAgent Studio Bridge Plugin (Two-Way)...")

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
            Headers = { ["Content-Type"] = "application/json" },
            Body = HttpService:JSONEncode(payload)
        })
    end)
end

-- Scan script containers untuk sync ke desktop
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
            Headers = { ["Content-Type"] = "application/json" },
            Body = HttpService:JSONEncode(scripts)
        })
    end)
end

-- Resolve script instance dari path string
local function resolveScriptByPath(path: string): LuaSourceContainer?
    local targets = {
        game:GetService("ServerScriptService"),
        game:GetService("ReplicatedStorage"),
        game:GetService("ServerStorage"),
        game:GetService("StarterPlayer"),
        game:GetService("StarterGui"),
        workspace
    }

    for _, container in ipairs(targets) do
        for _, inst in ipairs(container:GetDescendants()) do
            if inst:IsA("LuaSourceContainer") then
                if inst:GetFullName() == path or inst.Name == path then
                    return inst :: LuaSourceContainer
                end
            end
        end
    end
    return nil
end

-- TWO-WAY PATCHING: Poll pending patches dari Desktop App dan apply ke Studio
local function pollAndApplyPatches()
    local success, response = pcall(function()
        return HttpService:RequestAsync({
            Url = BRIDGE_URL .. "/patches/poll",
            Method = "GET",
            Headers = { ["Accept"] = "application/json" }
        })
    end)

    if not success or not response.Success then return end

    local ok, patches = pcall(function()
        return HttpService:JSONDecode(response.Body)
    end)

    if not ok or type(patches) ~= "table" then return end

    for _, patch in ipairs(patches) do
        local scriptPath = patch.script_path or ""
        local newSource = patch.new_source or ""
        local scriptId = patch.script_id or ""

        if scriptPath ~= "" and newSource ~= "" then
            local target = resolveScriptByPath(scriptPath)
            local applySuccess = false

            if target then
                local writeOk, writeErr = pcall(function()
                    ScriptEditorService:UpdateSourceAsync(target, function(_oldSource)
                        return newSource
                    end)
                end)

                applySuccess = writeOk
                if writeOk then
                    print("[RbxAgent] Applied patch to: " .. scriptPath)
                else
                    warn("[RbxAgent] Failed to apply patch to " .. scriptPath .. ": " .. tostring(writeErr))
                end
            else
                warn("[RbxAgent] Script not found for patch: " .. scriptPath)
            end

            -- Report result back to desktop
            pcall(function()
                HttpService:RequestAsync({
                    Url = BRIDGE_URL .. "/patches/result",
                    Method = "POST",
                    Headers = { ["Content-Type"] = "application/json" },
                    Body = HttpService:JSONEncode({
                        script_id = scriptId,
                        script_path = scriptPath,
                        success = applySuccess
                    })
                })
            end)
        end
    end
end

-- Main Loop
RunService.Heartbeat:Connect(function(dt)
    lastSync = lastSync + dt
    lastPatchPoll = lastPatchPoll + dt

    if lastSync >= SYNC_INTERVAL then
        lastSync = 0
        task.spawn(sendHeartbeat)
        task.spawn(scanScripts)
    end

    if lastPatchPoll >= PATCH_POLL_INTERVAL then
        lastPatchPoll = 0
        task.spawn(pollAndApplyPatches)
    end
end)

print("[RbxAgent] Bridge active (Two-Way). Connected to " .. BRIDGE_URL)
