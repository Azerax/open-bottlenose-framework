$port = 18795

$existing = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "overlay-reader already running"
    exit 0
}

Set-Location "C:\Users\swhol\clawd\services\overlay-reader"
Start-Process -FilePath "node" -ArgumentList "server.js" -WindowStyle Hidden