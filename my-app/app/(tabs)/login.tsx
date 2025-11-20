import React, { useState, useRef } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ScrollView, Platform, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { db } from '@/firebaseConfig';
import { collection, query, where, getDocs, DocumentData } from 'firebase/firestore';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';

interface Usuario {
  nombres: string;
  apellidos: string;
  correo: string;
  contrasena: string;
  rut: string;
  rol: string; // Nuevo campo para el rol
}

export default function LoginScreen() {
  const [correo, setCorreo] = useState<string>('');
  const [contrasena, setContrasena] = useState<string>('');
  const [errorLogin, setErrorLogin] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const router = useRouter();
  const isProcessingRef = useRef<boolean>(false);
  useSyncRutActivo();

  const manejarLogin = async () => {
    // Prevenir múltiples clics
    if (isProcessingRef.current || loading) {
      return;
    }

    setErrorLogin('');

    // Validación básica
    if (!correo || !contrasena) {
      setErrorLogin('Por favor, ingresa tu correo y contraseña.');
      return;
    }

    // Validar formato de correo básico
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(correo.trim())) {
      setErrorLogin('Por favor, ingresa un correo electrónico válido.');
      return;
    }

    isProcessingRef.current = true;
    setLoading(true);

    try {
      // Validar que Firebase esté inicializado
      if (!db) {
        throw new Error('Firebase no está inicializado correctamente.');
      }

      const usuariosRef = collection(db, 'usuarios');
      const correoNormalizado = correo.trim().toLowerCase();
      
      // Primero intentar buscar con el correo normalizado (minúsculas)
      let q = query(usuariosRef, where('correo', '==', correoNormalizado));
      let querySnapshot = await getDocs(q);

      // Si no se encuentra, buscar todos los usuarios y filtrar en el cliente
      // (esto maneja el caso donde el correo está guardado con mayúsculas)
      let userData: Usuario | null = null;
      if (!querySnapshot.empty) {
        const docData = querySnapshot.docs[0].data();
        if (docData) {
          userData = docData as Usuario;
        }
      } else {
        try {
          const allUsersSnapshot = await getDocs(usuariosRef);
          const matchingDoc = allUsersSnapshot.docs.find(
            (doc) => {
              const data = doc.data();
              return data?.correo?.toLowerCase() === correoNormalizado;
            }
          );
          
          if (matchingDoc) {
            const docData = matchingDoc.data();
            if (docData) {
              userData = docData as Usuario;
            }
          }
        } catch (searchError) {
          console.error('Error al buscar usuarios:', searchError);
          throw new Error('Error al buscar usuario en la base de datos.');
        }
      }

      console.log('Usuarios encontrados:', userData ? 1 : 0);

      if (userData) {
        console.log('Datos del usuario encontrado');

        // Validar que los datos del usuario sean válidos
        if (!userData.nombres || !userData.apellidos) {
          throw new Error('Los datos del usuario están incompletos.');
        }

        // Validar contraseña
        if (userData.contrasena !== contrasena) {
          setErrorLogin('Correo o contraseña incorrectos.');
          isProcessingRef.current = false;
          setLoading(false);
          return;
        }

        // Validar que tenga rut
        if (!userData.rut || String(userData.rut).trim() === '') {
          Alert.alert('Error', 'El usuario no tiene un RUT asignado en la base de datos.');
          isProcessingRef.current = false;
          setLoading(false);
          return;
        }

        // Validar que tenga rol
        if (!userData.rol || String(userData.rol).trim() === '') {
          Alert.alert('Error', 'El usuario no tiene un rol asignado en la base de datos.');
          isProcessingRef.current = false;
          setLoading(false);
          return;
        }

        // Guardar datos en AsyncStorage con manejo de errores
        try {
          const rutString = String(userData.rut).trim();
          const nombreCompleto = `${userData.nombres} ${userData.apellidos}`.trim();
          const rolString = String(userData.rol).trim();

          if (!rutString || !nombreCompleto || !rolString) {
            throw new Error('Datos del usuario incompletos para guardar.');
          }

          await AsyncStorage.setItem('rutUsuario', rutString);
          await AsyncStorage.setItem('userName', nombreCompleto);
          await AsyncStorage.setItem('userRole', rolString);

          console.log('✅ Login exitoso, RUT y nombre guardados:', rutString, nombreCompleto);
          console.log('✅ Rol del usuario:', rolString);

          // Verificar que los datos se guardaron correctamente
          const rutVerificado = await AsyncStorage.getItem('rutUsuario');
          if (!rutVerificado || rutVerificado !== rutString) {
            throw new Error('Error al guardar los datos de sesión.');
          }

          // Redirigir según el rol del usuario
          // Usar setTimeout para asegurar que AsyncStorage se guarde antes de navegar
          setTimeout(() => {
            try {
              if (rolString === 'Conductor') {
                router.replace('/(tabs)/conductor/pagina-principal-conductor');
              } else if (rolString === 'Apoderado') {
                router.replace('/(tabs)/apoderado/pagina-principal-apoderado');
              } else {
                Alert.alert('Error', 'Rol de usuario no válido.');
                isProcessingRef.current = false;
                setLoading(false);
              }
            } catch (navError: any) {
              console.error('Error al navegar:', navError);
              const errorMessage = navError?.message || 'Error desconocido al navegar';
              Alert.alert('Error', `Ocurrió un error al redirigir: ${errorMessage}. Por favor, intenta de nuevo.`);
              isProcessingRef.current = false;
              setLoading(false);
            }
          }, 200);
        } catch (storageError: any) {
          console.error('Error al guardar en AsyncStorage:', storageError);
          const errorMessage = storageError?.message || 'Error desconocido';
          setErrorLogin(`Error al guardar sesión: ${errorMessage}`);
          isProcessingRef.current = false;
          setLoading(false);
        }
      } else {
        setErrorLogin('Correo o contraseña incorrectos.');
        isProcessingRef.current = false;
        setLoading(false);
      }
    } catch (error: any) {
      console.error('Error al iniciar sesión:', error);
      
      // Mensajes de error más específicos
      let errorMessage = 'Ocurrió un error al iniciar sesión.';
      
      if (error?.message) {
        if (error.message.includes('network') || error.message.includes('Network')) {
          errorMessage = 'Error de conexión. Verifica tu conexión a internet.';
        } else if (error.message.includes('Firebase')) {
          errorMessage = 'Error de conexión con la base de datos. Intenta de nuevo.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setErrorLogin(errorMessage);
      isProcessingRef.current = false;
      setLoading(false);
      
      // En Android, también mostrar un Alert para asegurar que el usuario vea el error
      if (Platform.OS === 'android') {
        Alert.alert('Error de inicio de sesión', errorMessage);
      }
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable style={styles.backButton} onPress={() => router.push('/')}>
          <Ionicons name="arrow-back" size={28} color="#127067" />
        </Pressable>

        <Image
          source={require('@/assets/images/Furgo_Truck.png')}
          style={styles.logo}
          contentFit="contain"
        />

        <Text style={styles.title}>Ingreso</Text>

        <TextInput
          style={styles.input}
          placeholder="Correo"
          placeholderTextColor="#999"
          keyboardType="email-address"
          autoCapitalize="none"
          value={correo}
          onChangeText={setCorreo}
        />

        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor="#999"
          secureTextEntry
          value={contrasena}
          onChangeText={setContrasena}
        />

        {errorLogin ? <Text style={styles.errorText}>{errorLogin}</Text> : null}

        <Pressable 
          style={[styles.button, (loading || isProcessingRef.current) && styles.buttonDisabled]} 
          onPress={manejarLogin}
          disabled={loading || isProcessingRef.current}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Iniciar Sesión</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.forgotPasswordLink}
          onPress={() => router.push('/(tabs)/forgot-password')}
        >
          <Text style={styles.forgotPasswordText}>¿Olvidaste tu contraseña?</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 40,
    left: 20,
    zIndex: 10,
    padding: 5,
  },
  errorText: {
    color: 'red',
    fontSize: 13,
    marginBottom: 5,
    alignSelf: 'flex-start',
    marginLeft: 20,
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 20,
  },
  input: {
    width: '90%',
    borderColor: '#127067',
    borderWidth: 1.5,
    borderRadius: 20,
    padding: 10,
    marginBottom: 10,
    color: '#000',
  },
  button: {
    backgroundColor: '#127067',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 6,
    marginTop: 10,
    width: 150,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  forgotPasswordLink: {
    marginTop: 15,
  },
  forgotPasswordText: {
    color: '#127067',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
