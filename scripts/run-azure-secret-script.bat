@echo off
REM run-azure-secret-script.bat
REM Wrapper to run PowerShell script with bypass execution policy

echo Running Azure Client Secret Generator...
echo.

REM Run PowerShell script with execution policy bypass
powershell.exe -ExecutionPolicy Bypass -File "%~dp0Get-AzureClientSecret.ps1" %*

pause