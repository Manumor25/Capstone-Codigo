# Solución para Crash en Android al Iniciar Sesión

## Problema Identificado
La aplicación se cerraba al intentar iniciar sesión en Android. Esto se debía a:
1. Errores no capturados en la navegación
2. Problemas con AsyncStorage en Android
3. Falta de validación de Firebase antes de usarlo
4. Errores en las pantallas de destino al inicializar

## Soluciones Implementadas

### 1. ErrorBoundary Component
- ✅ Creado componente `ErrorBoundary.tsx` para capturar errores de React
- ✅ Agregado al `_layout.tsx` principal para proteger toda la aplicación
- ✅ Muestra mensaje amigable en lugar de cerrar la app

### 2. Mejoras en login.tsx
- ✅ **Guardado robusto de AsyncStorage**: Múltiples intentos (hasta 3) para asegurar que los datos se guarden
- ✅ **Verificación antes de navegar**: Valida que los datos estén guardados antes de redirigir
- ✅ **Navegación específica para Android**: Usa `router.replace` con delay mayor (500ms) en Android
- ✅ **Manejo de errores mejorado**: Captura errores específicos de red, Firebase, etc.
- ✅ **Validación del router**: Verifica que el router esté disponible antes de navegar
- ✅ **Fallback de navegación**: Si falla la navegación, intenta volver al login

### 3. Mejoras en firebaseConfig.ts
- ✅ **Detección de plataforma mejorada**: Mejor detección entre Web y Android/iOS
- ✅ **Manejo de errores robusto**: Múltiples niveles de fallback
- ✅ **Logs de depuración**: Para identificar problemas en Android

### 4. Mejoras en pantallas principales
- ✅ **Validación de Firebase**: Verifica que `db` esté inicializado antes de usarlo
- ✅ **Manejo de errores en useEffect**: Todos los useEffect tienen try-catch
- ✅ **Error handler global**: Captura errores no manejados en React Native
- ✅ **Validación de AsyncStorage**: Verifica que los datos existan antes de usarlos

### 5. Mejoras en AndroidManifest.xml
- ✅ **Permisos actualizados**: Para Android 13+
- ✅ **usesCleartextTraffic**: Habilitado para Mapbox y Firebase
- ✅ **Permisos de ubicación**: Configurados correctamente

## Cambios Específicos en el Código

### login.tsx
```typescript
// Guardado con múltiples intentos
let intentosGuardado = 0;
const maxIntentos = 3;
while (intentosGuardado < maxIntentos && !guardadoExitoso) {
  // Intenta guardar y verificar
}

// Navegación específica para Android
if (Platform.OS === 'android') {
  setTimeout(() => {
    // Verificar datos antes de navegar
    // Usar router.replace con validaciones
  }, 500);
}
```

### firebaseConfig.ts
```typescript
// Mejor detección de plataforma
const isAndroid = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';

// Múltiples niveles de fallback
try {
  db = getFirestore(app);
} catch (error) {
  // Fallback
  db = getFirestore(app);
}
```

### pagina-principal-conductor.tsx
```typescript
// Validación de Firebase antes de usar
if (!db) {
  console.error('Firebase no está inicializado');
  return;
}

// Manejo de errores en todas las operaciones de Firestore
try {
  await guardarUbicacionEnFirestore(coords);
} catch (firestoreError) {
  console.error('Error:', firestoreError);
  // No mostrar error al usuario, solo loguear
}
```

## Pasos para Generar Nueva APK

1. **Limpiar build anterior**:
```bash
cd android
./gradlew clean
cd ..
```

2. **Prebuild** (si es necesario):
```bash
npx expo prebuild --clean --platform android
```

3. **Generar APK con EAS**:
```bash
eas build --platform android --profile preview
```

4. **O build local**:
```bash
cd android
./gradlew assembleRelease
```

## Verificaciones Post-Build

1. ✅ Probar login con credenciales válidas
2. ✅ Verificar que no se cierre la app
3. ✅ Verificar que navegue correctamente según el rol
4. ✅ Verificar que Firebase funcione correctamente
5. ✅ Verificar que Mapbox funcione (si aplica)
6. ✅ Verificar permisos de ubicación

## Logs para Debug

Si la app aún se cierra, revisa los logs:
```bash
adb logcat | grep -i "react\|expo\|firebase\|error"
```

O usando React Native Debugger:
- Conecta el dispositivo
- Abre Chrome DevTools
- Ve a `chrome://inspect`
- Selecciona tu dispositivo

## Notas Importantes

- **AsyncStorage**: En Android puede ser más lento, por eso se agregaron múltiples intentos
- **Navegación**: Android requiere más tiempo para procesar la navegación, por eso el delay de 500ms
- **Firebase**: Siempre validar que esté inicializado antes de usarlo
- **ErrorBoundary**: Captura errores de render, pero no errores asíncronos (por eso se agregaron try-catch)

## Si Aún Hay Problemas

1. Verifica los logs de Android con `adb logcat`
2. Revisa que Firebase esté configurado correctamente
3. Verifica que todos los permisos estén en AndroidManifest.xml
4. Asegúrate de que el package name sea correcto
5. Prueba en un dispositivo físico (no solo emulador)

