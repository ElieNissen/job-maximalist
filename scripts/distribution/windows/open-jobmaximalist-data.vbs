Set shell = CreateObject("WScript.Shell")
Set fileSystem = CreateObject("Scripting.FileSystemObject")

installDirectory = fileSystem.GetParentFolderName(WScript.ScriptFullName)
nodePath = installDirectory & "\Application Files\JobMAXIMALIST\Node Runtime\node.exe"
runtimeScriptPath = installDirectory & "\Application Files\JobMAXIMALIST\Application\jobmaximalist-runtime.mjs"

shell.Run """" & nodePath & """ """ & runtimeScriptPath & """ open-data", 0, False
