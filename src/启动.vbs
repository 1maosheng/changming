' 启动.vbs —— 启动「常明」
Option Explicit
Dim fso, sh, root, shellDir, engineData, electron
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
shellDir = root & "\shell"
engineData = root & "\data\.dsh"
If Not fso.FolderExists(engineData) Then fso.CreateFolder engineData
Set env = sh.Environment("PROCESS")
env("DSH_PORT") = "3083"
env("DSH_CUSTOMER_HOME") = engineData
env("DSH_SHELL_DIR") = shellDir
electron = shellDir & "\node_modules\electron\dist\electron.exe"
If fso.FileExists(electron) Then
  sh.CurrentDirectory = shellDir
  sh.Run """" & electron & """ .", 1, False
Else
  MsgBox "还没装依赖：先在 外壳 目录里运行 npm install" & vbCrLf & shellDir, 48, "常明"
End If
