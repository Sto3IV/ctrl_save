@echo off
rem Removes the helper registration. Remove the extension itself in vivaldi://extensions.
for %%K in ("Chromium" "Google\Chrome") do reg delete "HKCU\Software\%%~K\NativeMessagingHosts\com.quicksave.images" /f >nul 2>&1
echo Helper unregistered.
