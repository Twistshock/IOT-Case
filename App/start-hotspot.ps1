# Start Expo bound to the Windows Mobile Hotspot adapter (192.168.137.1)
# so a phone connected to the PC's hotspot can reach Metro.
# Usage:  .\start-hotspot.ps1

$hotspotIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -like '192.168.137.*' } |
    Select-Object -First 1).IPAddress

if (-not $hotspotIp) {
    Write-Host "Hotspot adapter not found. Turn on Windows Mobile Hotspot first (Win+A -> Mobile hotspot)." -ForegroundColor Red
    exit 1
}

$env:REACT_NATIVE_PACKAGER_HOSTNAME = $hotspotIp
Write-Host "Metro will advertise: exp://${hotspotIp}:8081" -ForegroundColor Green
Write-Host "Test from your phone's browser: http://${hotspotIp}:8081/status" -ForegroundColor Green

npx expo start --lan --clear
