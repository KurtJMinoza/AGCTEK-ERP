# Start nginx telematics TCP proxy (GT06 :5023 → Traccar :15023).
#
# PAUSED: active telematics is flespi MQTT (docs/SCM_FLESPI_VL502.md).
# Only run this when intentionally reviving Traccar (docs/SCM_NGINX_TRACCAR.md).
# Prefer: pm2 (nginx-telematics is commented out in ecosystem.config.cjs).

$ErrorActionPreference = 'Stop'
Write-Warning 'Traccar/nginx telematics is paused — flespi is the active path. Continuing only if you meant to revive Traccar.'
$NginxDir = Join-Path (Split-Path -Parent $PSScriptRoot) 'tools\nginx\nginx-1.28.0'
$NginxExe = Join-Path $NginxDir 'nginx.exe'

if (-not (Test-Path $NginxExe)) {
    Write-Error "nginx not found at $NginxExe — re-download from https://nginx.org/en/download.html"
}

Set-Location $NginxDir
& $NginxExe -t
if (Get-Process nginx -ErrorAction SilentlyContinue) {
    Write-Host 'Reloading nginx...'
    & $NginxExe -s reload
} else {
    Write-Host 'Starting nginx...'
    Start-Process -FilePath $NginxExe -WorkingDirectory $NginxDir -WindowStyle Hidden
}
Write-Host 'nginx telematics listening on 0.0.0.0:5023 → 127.0.0.1:15023'
