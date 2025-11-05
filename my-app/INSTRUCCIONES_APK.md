# Instrucciones para Generar APK en Android Studio

## Paso 1: Instalar Android Studio (si no lo tienes)
1. Descarga Android Studio desde: https://developer.android.com/studio
2. Instálalo con todas las opciones por defecto
3. Durante la instalación, asegúrate de instalar:
   - Android SDK
   - Android SDK Platform
   - Android Virtual Device (opcional, pero recomendado)

## Paso 2: Abrir el Proyecto en Android Studio
1. Abre Android Studio
2. Selecciona **"Open"** o **"Open an Existing Project"**
3. Navega a: `C:\Users\Joe Salgado\Documents\GitHub\a\Capstone-Codigo\my-app\android`
4. Selecciona la carpeta **`android`** y haz clic en **"OK"**

## Paso 3: Sincronizar el Proyecto
1. Android Studio detectará automáticamente que necesita configurar Gradle
2. Si aparece un mensaje "Gradle Sync", haz clic en **"Sync Now"**
3. Espera a que termine la sincronización (puede tardar varios minutos la primera vez)

## Paso 4: Generar la APK
### Opción A: Desde el Menú (Más fácil)
1. Ve al menú: **Build** → **Build Bundle(s) / APK(s)** → **Build APK(s)**
2. Espera a que termine el build (verás el progreso en la parte inferior)
3. Cuando termine, verás una notificación: **"APK(s) generated successfully"**
4. Haz clic en **"locate"** en la notificación para abrir la carpeta

### Opción B: Desde la Terminal de Android Studio
1. Abre la terminal integrada de Android Studio (View → Tool Windows → Terminal)
2. Ejecuta: `.\gradlew assembleRelease`
3. La APK estará en: `app\build\outputs\apk\release\app-release.apk`

## Ubicación de la APK
Una vez generada, la APK estará en:
```
android\app\build\outputs\apk\release\app-release.apk
```

## Instalar la APK en tu dispositivo
1. Transfiere el archivo `app-release.apk` a tu dispositivo Android
2. En tu dispositivo, ve a **Configuración** → **Seguridad** → **Activar "Fuentes desconocidas"**
3. Abre el archivo APK desde el explorador de archivos
4. Sigue las instrucciones para instalar

## Notas Importantes
- La primera vez que abres el proyecto en Android Studio puede tardar varios minutos
- Android Studio descargará automáticamente las dependencias necesarias
- Si ves errores de SDK, Android Studio te dará opciones para instalar los componentes faltantes

