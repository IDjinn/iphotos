@echo off
rem Build the iPhotos APK via the WSL flow (scripts/build-wsl.sh).
rem Usage:  build-apk.bat [release|debug] [arm64-v8a|x86_64]
rem Defaults: release arm64-v8a (standalone APK for physical phones).
rem Output:  %USERPROFILE%\Downloads\iphotos-<variant>-<abi>.apk

setlocal
if "%~1"=="" (set "VARIANT=release") else (set "VARIANT=%~1")
if "%~2"=="" (set "ABI=arm64-v8a") else (set "ABI=%~2")

echo ==^> Building iPhotos %VARIANT% %ABI% in WSL (Ubuntu)...
wsl -d Ubuntu bash /mnt/c/dev/react-native/iphotos/frontend/scripts/build-wsl.sh %VARIANT% %ABI%
if errorlevel 1 (
    echo ==^> BUILD FAILED. See the log above.
    pause
    exit /b 1
)

echo.
echo ==^> Done: %USERPROFILE%\Downloads\iphotos-%VARIANT%-%ABI%.apk
pause
