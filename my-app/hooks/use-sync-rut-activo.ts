import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const RUT_USUARIO_KEY = 'rutUsuario';
const RUT_USUARIO_ACTIVO_KEY = 'rutUsuarioActivo';

/**
 * Sincroniza el RUT del usuario activo en cada cambio de pestaña/focus.
 */
export function useSyncRutActivo() {
  useEffect(() => {
    let isMounted = true;

    const sincronizarRut = async () => {
      try {
        const rut = await AsyncStorage.getItem(RUT_USUARIO_KEY);
        if (!isMounted || !rut) {
          return;
        }
        await AsyncStorage.setItem(RUT_USUARIO_ACTIVO_KEY, rut);
      } catch (error) {
        console.error('Error al guardar el RUT activo:', error);
      }
    };

    sincronizarRut();

    return () => {
      isMounted = false;
    };
  }, []);
}
