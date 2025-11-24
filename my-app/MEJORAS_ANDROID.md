# Mejoras para Android - Configuración Completa

## Cambios Realizados

### 1. AndroidManifest.xml
- ✅ Permisos de ubicación actualizados para Android 13+
- ✅ Permisos de almacenamiento para Android 10+ y Android 13+
- ✅ Permisos de red agregados
- ✅ Configuración para Mapbox

### 2. app.json
- ✅ Permisos explícitos agregados en la sección Android
- ✅ Plugin de expo-location configurado con mensajes de permisos
- ✅ Configuración de build properties mejorada
- ✅ Packaging options para evitar conflictos de librerías nativas

### 3. firebaseConfig.ts
- ✅ Mejor detección de plataforma (Web vs Android/iOS)
- ✅ Manejo de errores mejorado
- ✅ Logs de depuración para Android

### 4. login.tsx
- ✅ Manejo de errores de red mejorado
- ✅ Mensajes de error más específicos
- ✅ Validación de conexión a internet

## Pasos para Generar la APK

### Opción 1: Usando EAS Build (Recomendado)

1. **Instalar EAS CLI** (si no lo tienes):
```bash
npm install -g eas-cli
```

2. **Iniciar sesión en EAS**:
```bash
eas login
```

3. **Configurar el proyecto**:
```bash
eas build:configure
```

4. **Construir APK para Android**:
```bash
eas build --platform android --profile preview
```

5. **Descargar la APK**:
   - EAS te dará un enlace para descargar la APK
   - O puedes verla en: https://expo.dev/accounts/[tu-cuenta]/projects/my-app/builds

### Opción 2: Build Local (Requiere Android Studio)

1. **Pre-build** (generar carpetas nativas):
```bash
npx expo prebuild --platform android
```

2. **Construir APK**:
```bash
cd android
./gradlew assembleRelease
```

3. **Encontrar la APK**:
   - La APK estará en: `android/app/build/outputs/apk/release/app-release.apk`

## Verificaciones Antes de Generar la APK

### ✅ Checklist

- [ ] Verificar que `app.json` tenga el package correcto: `com.joesalgado.myapp`
- [ ] Verificar que todos los permisos estén en `AndroidManifest.xml`
- [ ] Verificar que Firebase esté configurado correctamente
- [ ] Probar el login en desarrollo antes de generar la APK
- [ ] Verificar que Mapbox funcione correctamente

## Solución de Problemas Comunes

### Error: "Firebase no está inicializado"
- **Solución**: Verifica tu conexión a internet
- Verifica que `firebaseConfig.ts` tenga la configuración correcta
- Revisa los logs en Android Studio o usando `adb logcat`

### Error: "No se puede iniciar sesión"
- **Solución**: 
  1. Verifica que tengas conexión a internet
  2. Verifica que Firebase esté configurado correctamente
  3. Revisa los logs de la aplicación
  4. Verifica que el correo y contraseña sean correctos

### Error: "Permisos de ubicación"
- **Solución**: 
  1. La app pedirá permisos automáticamente
  2. Si no los pide, verifica `AndroidManifest.xml`
  3. Ve a Configuración > Apps > Tu App > Permisos y habilita Ubicación

### Error: "Mapbox no funciona"
- **Solución**:
  1. Verifica que tengas conexión a internet
  2. Verifica que el token de Mapbox esté correcto
  3. En Android, Mapbox usa WebView, asegúrate de que funcione

## Configuración de Firebase para Android

Si necesitas agregar `google-services.json`:

1. Ve a Firebase Console: https://console.firebase.google.com/
2. Selecciona tu proyecto: `furgotruck-2a8e7`
3. Ve a Configuración del proyecto > Tus apps
4. Agrega una app Android con el package: `com.joesalgado.myapp`
5. Descarga `google-services.json`
6. Colócalo en: `android/app/google-services.json`
7. Asegúrate de que `android/build.gradle` tenga:
```gradle
dependencies {
    classpath 'com.google.gms:google-services:4.4.0'
}
```
8. Y en `android/app/build.gradle` al final:
```gradle
apply plugin: 'com.google.gms.google-services'
```

## Notas Importantes

- **MinSdkVersion**: 24 (Android 7.0)
- **TargetSdkVersion**: 34 (Android 14)
- **CompileSdkVersion**: 35
- **New Architecture**: Habilitada (requerida para Reanimated)

## Próximos Pasos

1. Generar la APK usando EAS Build
2. Probar la APK en un dispositivo Android físico
3. Verificar que el login funcione correctamente
4. Verificar que Mapbox funcione correctamente
5. Verificar que los permisos de ubicación funcionen

## Comandos Útiles

```bash
# Ver logs de Android
adb logcat | grep -i "react\|expo\|firebase"

# Limpiar build de Android
cd android && ./gradlew clean && cd ..

# Prebuild limpio
npx expo prebuild --clean

# Verificar configuración
npx expo-doctor
```

