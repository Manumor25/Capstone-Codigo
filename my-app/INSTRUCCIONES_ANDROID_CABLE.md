# Instrucciones para Ejecutar la App en Dispositivo Android por Cable

## Requisitos Previos

1. **Android Studio instalado** (para tener las herramientas de desarrollo)
   - Descarga desde: https://developer.android.com/studio
   - Asegúrate de instalar Android SDK y Android SDK Platform-Tools

2. **Node.js y npm instalados** (ya deberías tenerlos)

3. **Dispositivo Android físico** con:
   - Android 7.0 (API 24) o superior
   - Al menos 1GB de espacio libre
   - Cable USB para conectar al computador

## Paso 1: Habilitar Opciones de Desarrollador en tu Dispositivo Android

1. Ve a **Configuración** → **Acerca del teléfono**
2. Encuentra **"Número de compilación"** o **"Build number"**
3. Toca **7 veces** sobre "Número de compilación" hasta que veas el mensaje "Ahora eres desarrollador"
4. Regresa a **Configuración** y busca **"Opciones de desarrollador"** o **"Developer options"**
5. Activa **"Depuración USB"** o **"USB debugging"**
6. (Opcional pero recomendado) Activa **"Instalar vía USB"** o **"Install via USB"**

## Paso 2: Conectar el Dispositivo por USB

1. Conecta tu dispositivo Android al computador con el cable USB
2. En tu dispositivo, aparecerá un diálogo preguntando "¿Permitir depuración USB?"
3. Marca la casilla **"Permitir siempre desde este computador"**
4. Toca **"Permitir"** o **"OK"**

## Paso 3: Verificar que el Dispositivo sea Reconocido

### Si `adb` no es reconocido (Error común en Windows)

Si al ejecutar `adb devices` ves el error "El término 'adb' no se reconoce", tienes dos opciones:

#### Opción A: Usar la ruta completa (Rápido)

En PowerShell, usa la ruta completa de ADB:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
```

#### Opción B: Agregar ADB al PATH (Permanente - Recomendado)

1. Abre PowerShell como **Administrador**
2. Ejecuta este comando para agregar ADB al PATH permanentemente:

```powershell
$adbPath = "$env:LOCALAPPDATA\Android\Sdk\platform-tools"
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentPath -notlike "*$adbPath*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentPath;$adbPath", "User")
    Write-Host "✅ ADB agregado al PATH. Cierra y vuelve a abrir PowerShell."
} else {
    Write-Host "✅ ADB ya está en el PATH."
}
```

3. **Cierra y vuelve a abrir PowerShell** para que los cambios surtan efecto
4. Ahora puedes usar `adb devices` directamente

### Verificar el Dispositivo

Una vez que `adb` funcione, ejecuta:

```bash
adb devices
```

Deberías ver algo como:
```
List of devices attached
R52R209GMGH    device
```

Si ves `unauthorized`, acepta el diálogo en tu dispositivo Android.
Si no ves tu dispositivo, verifica:
- Que el cable USB funcione correctamente
- Que hayas habilitado la depuración USB
- Que hayas aceptado el diálogo de depuración USB

## Paso 4: Instalar Dependencias (si no lo has hecho)

Abre una terminal en la carpeta del proyecto y ejecuta:

```bash
cd my-app
npm install
```

## Paso 5: Ejecutar la App en tu Dispositivo

### Opción A: Usando Expo CLI (Recomendado)

```bash
npm run android
```

O directamente:

```bash
npx expo run:android
```

Este comando:
- Compilará la app nativa de Android
- Instalará la app en tu dispositivo
- Iniciará la app automáticamente
- Conectará con Metro Bundler para recargar cambios en tiempo real

### Opción B: Usando Gradle directamente

Si prefieres usar Gradle directamente:

```bash
cd android
.\gradlew installDebug
```

Luego inicia Metro Bundler en otra terminal:

```bash
cd my-app
npm start
```

## Paso 6: Ver Logs y Depurar

Para ver los logs de tu dispositivo en tiempo real:

```bash
adb logcat
```

Para filtrar solo los logs de React Native:

```bash
adb logcat *:S ReactNative:V ReactNativeJS:V
```

## Solución de Problemas Comunes

### El dispositivo no aparece en `adb devices`

1. Verifica que la depuración USB esté habilitada
2. Desconecta y vuelve a conectar el cable USB
3. Prueba con otro cable USB
4. Reinicia el servidor ADB:
   ```bash
   # Si adb está en el PATH:
   adb kill-server
   adb start-server
   adb devices
   
   # Si adb NO está en el PATH, usa la ruta completa:
   & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" kill-server
   & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" start-server
   & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
   ```

### Error: "adb no se reconoce como comando"

Este es un problema común en Windows. Soluciones:

1. **Solución rápida**: Usa siempre la ruta completa:
   ```powershell
   & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
   ```

2. **Solución permanente**: Agrega ADB al PATH (ver Paso 3, Opción B arriba)

3. **Verificar ubicación de ADB**: Si Android Studio está instalado en otra ubicación, busca:
   - `C:\Users\TuUsuario\AppData\Local\Android\Sdk\platform-tools\adb.exe`
   - O en la ubicación personalizada donde instalaste Android Studio

### Error: "No devices found"

- Asegúrate de que el dispositivo esté conectado y autorizado
- Verifica que los drivers USB estén instalados (Windows puede instalarlos automáticamente)
- Prueba cambiar el modo de conexión USB en tu dispositivo (MTP, PTP, etc.)

### Error de compilación

- Asegúrate de tener Android SDK instalado
- Verifica que `ANDROID_HOME` esté configurado (normalmente se configura automáticamente con Android Studio)
- Limpia el proyecto:
  ```bash
  cd android
  .\gradlew clean
  cd ..
  npm run android
  ```

### Error de enlace C++ con react-native-worklets

Si ves errores como "undefined symbol" relacionados con `react-native-worklets` o el NDK:

1. **Limpia completamente el proyecto:**
   ```bash
   cd android
   .\gradlew clean
   cd ..
   # Limpia caché de Metro
   npm start -- --reset-cache
   # En otra terminal, intenta de nuevo:
   npm run android
   ```

2. **Limpia caché de Gradle:**
   ```bash
   cd android
   .\gradlew cleanBuildCache
   cd ..
   ```

3. **Si el problema persiste**, puede ser un problema de compatibilidad con la nueva arquitectura. Considera:
   - Usar Expo Go temporalmente para desarrollo (más rápido)
   - Verificar que todas las dependencias sean compatibles con la nueva arquitectura
   - Revisar issues en GitHub de `react-native-worklets`

### La app se instala pero no se abre

- Verifica que tu dispositivo tenga Android 7.0 o superior
- Revisa los logs con `adb logcat` para ver errores específicos
- Asegúrate de que Metro Bundler esté corriendo

### Error de permisos en Windows

Si tienes problemas con permisos, ejecuta PowerShell o CMD como Administrador.

## Comandos Útiles

```bash
# Ver dispositivos conectados
adb devices

# Reiniciar servidor ADB
adb kill-server && adb start-server

# Desinstalar la app del dispositivo
adb uninstall com.joesalgado.myapp

# Ver logs filtrados
adb logcat | findstr "ReactNative"

# Limpiar caché de Metro
npm start -- --reset-cache
```

## Notas Importantes

- La primera vez que ejecutas `npm run android`, puede tardar varios minutos mientras Gradle descarga dependencias
- Mantén el dispositivo conectado mientras desarrollas para recargar cambios automáticamente
- Si cambias código nativo, necesitarás recompilar con `npm run android`
- Si solo cambias código JavaScript/TypeScript, Metro Bundler recargará automáticamente (Hot Reload)

## Desarrollo Continuo

Una vez que la app esté corriendo:
- Los cambios en archivos `.tsx`, `.ts`, `.js` se recargarán automáticamente
- Agita el dispositivo o presiona `R` dos veces en Metro Bundler para recargar manualmente
- Presiona `Ctrl+M` (o `Cmd+M` en Mac) en el dispositivo para abrir el menú de desarrollador

