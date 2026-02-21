$port = 18794

# If already running, do nothing
$existing = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "overlay-writer already running"
    exit 0
}

Set-Location "C:\Users\swhol\clawd\services\overlay-writer"
Start-Process -FilePath "node" -ArgumentList "server.js" -WindowStyle Hidden