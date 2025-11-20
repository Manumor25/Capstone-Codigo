# Script para agregar ADB al PATH en Windows
# Ejecuta este script como Administrador

Write-Host "🔧 Agregando ADB al PATH..." -ForegroundColor Cyan

# Ruta común de ADB en Windows
$adbPath = "$env:LOCALAPPDATA\Android\Sdk\platform-tools"

# Verificar si ADB existe
if (Test-Path "$adbPath\adb.exe") {
    Write-Host "✅ ADB encontrado en: $adbPath" -ForegroundColor Green
    
    # Obtener el PATH actual del usuario
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    
    # Verificar si ya está en el PATH
    if ($currentPath -like "*$adbPath*") {
        Write-Host "ℹ️  ADB ya está en el PATH." -ForegroundColor Yellow
    } else {
        # Agregar al PATH
        $newPath = "$currentPath;$adbPath"
        [Environment]::SetEnvironmentVariable("Path", $newPath, "User")
        Write-Host "✅ ADB agregado al PATH exitosamente!" -ForegroundColor Green
        Write-Host ""
        Write-Host "⚠️  IMPORTANTE: Cierra y vuelve a abrir PowerShell para que los cambios surtan efecto." -ForegroundColor Yellow
        Write-Host "   Después de eso, podrás usar 'adb' directamente sin la ruta completa." -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ ADB no encontrado en la ubicación esperada: $adbPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "Posibles soluciones:" -ForegroundColor Yellow
    Write-Host "1. Verifica que Android Studio esté instalado" -ForegroundColor White
    Write-Host "2. Verifica que Android SDK Platform-Tools esté instalado" -ForegroundColor White
    Write-Host "3. Si Android Studio está en otra ubicación, edita este script con la ruta correcta" -ForegroundColor White
    Write-Host ""
    Write-Host "Ubicaciones comunes de ADB:" -ForegroundColor Cyan
    Write-Host "  - $env:LOCALAPPDATA\Android\Sdk\platform-tools" -ForegroundColor Gray
    Write-Host "  - $env:USERPROFILE\AppData\Local\Android\Sdk\platform-tools" -ForegroundColor Gray
    Write-Host "  - C:\Android\Sdk\platform-tools" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Presiona cualquier tecla para continuar..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

