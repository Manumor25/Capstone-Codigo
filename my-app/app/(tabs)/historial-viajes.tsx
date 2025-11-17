import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';

export default function HistorialViajes() {
  useSyncRutActivo();
  const router = useRouter();

  useEffect(() => {
    const redirigirSegunRol = async () => {
      try {
        const rol = await AsyncStorage.getItem('userRole') || await AsyncStorage.getItem('rolUsuario') || '';
        const rolNormalizado = rol.toLowerCase();

        if (rolNormalizado === 'conductor') {
          router.replace('/(tabs)/conductor/historial-viajes-conductor');
        } else if (rolNormalizado === 'apoderado') {
          router.replace('/(tabs)/apoderado/historial-viajes-apoderado');
        } else {
          // Si no se puede determinar el rol, redirigir a conductor por defecto
          router.replace('/(tabs)/conductor/historial-viajes-conductor');
        }
      } catch (error) {
        console.error('Error al determinar rol:', error);
        // Redirigir a conductor por defecto en caso de error
        router.replace('/(tabs)/conductor/historial-viajes-conductor');
      }
    };

    redirigirSegunRol();
  }, [router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#127067" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F7F8',
  },
});
