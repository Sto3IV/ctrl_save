@echo off
setlocal
rem Builds the native helper with the C# compiler that ships with Windows and registers it for Vivaldi.
set "HOST=com.quicksave.images"
set "DIR=%~dp0host"
set "CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" set "CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe"
if not exist "%CSC%" (echo The .NET Framework 4 C# compiler was not found.& exit /b 1)

"%CSC%" /nologo /target:exe /optimize+ /win32manifest:"%DIR%\app.manifest" /r:System.Web.Extensions.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll /out:"%DIR%\QuickSaveHost.exe" "%DIR%\QuickSaveHost.cs" || (echo Build failed.& exit /b 1)

rem Vivaldi looks up native hosts under its Chromium key and falls back to the Google Chrome key.
for %%K in ("Chromium" "Google\Chrome") do (
  reg add "HKCU\Software\%%~K\NativeMessagingHosts\%HOST%" /ve /d "%DIR%\%HOST%.json" /f >nul || (echo Registry write failed.& exit /b 1)
)

rem Keep the files on disk, so OneDrive never swaps the helper for an online-only placeholder.
attrib +P "%~dp0*" /S /D >nul 2>&1

echo Helper installed: %DIR%\QuickSaveHost.exe
echo Next: vivaldi://extensions ^> Developer mode ^> Load unpacked ^> this folder.
