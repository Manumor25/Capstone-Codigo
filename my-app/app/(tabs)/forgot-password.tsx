import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, updateDoc, doc, where, getDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { db } from '../../firebaseConfig';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  useSyncRutActivo();

  const [paso, setPaso] = useState<'recuperacion' | 'nuevaContrasena'>('recuperacion');
  const [correo, setCorreo] = useState('');
  const [respuestaSeguridad, setRespuestaSeguridad] = useState('');
  const [nuevaContrasena, setNuevaContrasena] = useState('');
  const [repetirContrasena, setRepetirContrasena] = useState('');
  const [preguntaSeguridad, setPreguntaSeguridad] = useState('');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [preguntaCargada, setPreguntaCargada] = useState(false);
  const [mensajeExito, setMensajeExito] = useState(false);

  const [errores, setErrores] = useState({
    correo: '',
    respuestaSeguridad: '',
    nuevaContrasena: '',
    repetirContrasena: '',
  });

  const validarEmail = (email: string) => email.includes('@');

  const validarContrasena = (password: string) => {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    return regex.test(password);
  };

  const buscarUsuarioPorCorreo = async () => {
    if (!correo || !correo.trim()) {
      setErrores((prev) => ({ ...prev, correo: 'Debes ingresar un correo electrónico' }));
      return;
    }

    if (!validarEmail(correo)) {
      setErrores((prev) => ({ ...prev, correo: 'Debes ingresar un correo válido' }));
      return;
    }

    setErrores((prev) => ({ ...prev, correo: '', respuestaSeguridad: '' }));
    setLoading(true);
    setPreguntaCargada(false);
    setPreguntaSeguridad('');
    setRespuestaSeguridad('');

    try {
      const correoNormalizado = correo.trim().toLowerCase();
      const usuariosRef = collection(db, 'usuarios');

      console.log('Buscando usuario con correo:', correoNormalizado);

      // Primero intentar buscar con query directa
      let q = query(usuariosRef, where('correo', '==', correoNormalizado));
      let querySnapshot = await getDocs(q);

      let userDoc = null;
      let userData = null;

      if (!querySnapshot.empty) {
        userDoc = querySnapshot.docs[0];
        userData = userDoc.data();
        console.log('Usuario encontrado con query directa:', userData);
      } else {
        // Si no se encuentra, buscar todos y filtrar manualmente
        console.log('No se encontró con query directa, buscando en todos los usuarios...');
        const allUsersSnapshot = await getDocs(usuariosRef);
        const matchingDoc = allUsersSnapshot.docs.find(
          (doc) => doc.data().correo?.toLowerCase() === correoNormalizado
        );

        if (matchingDoc) {
          userDoc = matchingDoc;
          userData = matchingDoc.data();
          console.log('Usuario encontrado en búsqueda manual:', userData);
        }
      }

      if (userDoc && userData) {
        console.log('Datos del usuario encontrado:', {
          tienePregunta: !!userData.preguntaSeguridad,
          tieneRespuesta: !!userData.respuestaSeguridad,
          pregunta: userData.preguntaSeguridad,
        });

        if (userData.preguntaSeguridad && userData.respuestaSeguridad) {
          setPreguntaSeguridad(userData.preguntaSeguridad);
          setUserId(userDoc.id);
          setPreguntaCargada(true);
          setLoading(false);
          console.log('Pregunta cargada exitosamente');
        } else {
          setLoading(false);
          Alert.alert(
            'Pregunta de seguridad no configurada',
            'Esta cuenta no tiene configurada una pregunta de seguridad. Por favor, inicia sesión y configura una en tu perfil.',
            [{ text: 'OK' }]
          );
        }
      } else {
        setLoading(false);
        setErrores((prev) => ({ ...prev, correo: 'No se encontró una cuenta con este correo electrónico' }));
      }
    } catch (error) {
      console.error('Error al buscar usuario:', error);
      setLoading(false);
      Alert.alert('Error', 'No se pudo buscar el usuario. Intenta de nuevo.');
    }
  };

  const verificarRespuestaSeguridad = async () => {
    if (!respuestaSeguridad.trim()) {
      setErrores((prev) => ({ ...prev, respuestaSeguridad: 'Debes ingresar la respuesta' }));
      return;
    }

    if (!preguntaCargada || !userId) {
      Alert.alert('Error', 'Primero debes buscar tu cuenta con el correo electrónico.');
      return;
    }

    setErrores((prev) => ({ ...prev, respuestaSeguridad: '' }));
    setLoading(true);

    try {
      // Obtener el documento directamente usando el userId
      const userDocRef = doc(db, 'usuarios', userId);
      const userDocSnapshot = await getDoc(userDocRef);

      if (userDocSnapshot.exists()) {
        const userData = userDocSnapshot.data();
        const respuestaGuardada = (userData.respuestaSeguridad || '').toLowerCase().trim();
        const respuestaIngresada = respuestaSeguridad.toLowerCase().trim();

        if (respuestaGuardada === respuestaIngresada) {
          setPaso('nuevaContrasena');
        } else {
          setErrores((prev) => ({ ...prev, respuestaSeguridad: 'Respuesta incorrecta' }));
        }
      } else {
        Alert.alert('Error', 'No se encontró el usuario.');
      }
    } catch (error) {
      console.error('Error al verificar respuesta:', error);
      Alert.alert('Error', 'No se pudo verificar la respuesta. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  const cambiarContrasena = async () => {
    const nuevosErrores = {
      nuevaContrasena: '',
      repetirContrasena: '',
    };

    if (!validarContrasena(nuevaContrasena)) {
      nuevosErrores.nuevaContrasena =
        'Debe tener al menos 8 caracteres, incluyendo mayúscula, minúscula, número y carácter especial.';
    }
    if (nuevaContrasena !== repetirContrasena) {
      nuevosErrores.repetirContrasena = 'Las contraseñas no coinciden';
    }

    setErrores((prev) => ({ ...prev, ...nuevosErrores }));

    if (Object.values(nuevosErrores).some((msg) => msg !== '')) return;

    if (!userId) {
      Alert.alert('Error', 'No se encontró la información del usuario. Por favor, intenta de nuevo.');
      return;
    }

    setLoading(true);

    try {
      console.log('Cambiando contraseña para usuario:', userId);
      const userDoc = doc(db, 'usuarios', userId);
      await updateDoc(userDoc, {
        contrasena: nuevaContrasena,
      });

      console.log('Contraseña cambiada exitosamente en la base de datos');

      setLoading(false);
      setMensajeExito(true);

      // Mostrar el Alert y luego redirigir automáticamente después de 2 segundos
      Alert.alert(
        '¡Contraseña cambiada exitosamente!',
        'Tu contraseña ha sido cambiada correctamente. Serás redirigido al inicio de sesión.',
        [
          {
            text: 'OK',
            onPress: () => {
              console.log('Redirigiendo al login...');
              router.replace('/(tabs)/login');
            },
          },
        ],
        { cancelable: false }
      );

      // Redirección automática después de 3 segundos si el usuario no presiona el botón
      setTimeout(() => {
        console.log('Redirigiendo automáticamente al login...');
        router.replace('/(tabs)/login');
      }, 3000);
    } catch (error) {
      console.error('Error al cambiar contraseña:', error);
      setLoading(false);
      Alert.alert('Error', 'No se pudo cambiar la contraseña. Intenta de nuevo.');
    }
  };

  const renderizarPasoRecuperacion = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.title}>Recuperar Contraseña</Text>
      <Text style={styles.subtitle}>
        Responde tu pregunta de seguridad para recuperar tu contraseña
      </Text>

      <Text style={styles.label}>Correo electrónico</Text>
      <TextInput
        style={styles.input}
        placeholder="Ingresa tu correo electrónico"
        placeholderTextColor="#999"
        keyboardType="email-address"
        autoCapitalize="none"
        value={correo}
        onChangeText={(text) => {
          setCorreo(text);
          setErrores((prev) => ({ ...prev, correo: '' }));
          if (preguntaCargada) {
            setPreguntaCargada(false);
            setPreguntaSeguridad('');
            setRespuestaSeguridad('');
          }
        }}
        editable={!loading}
        onSubmitEditing={buscarUsuarioPorCorreo}
      />
      {errores.correo ? <Text style={styles.errorText}>{errores.correo}</Text> : null}

      {!preguntaCargada ? (
        <Pressable
          style={[styles.searchButton, loading && styles.buttonDisabled]}
          onPress={buscarUsuarioPorCorreo}
          disabled={loading || !correo.trim()}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.searchButtonText}>Buscar cuenta</Text>
          )}
        </Pressable>
      ) : null}

      {preguntaCargada && preguntaSeguridad ? (
        <View style={styles.preguntaContainer}>
          <Text style={styles.preguntaLabel}>Tu pregunta de seguridad:</Text>
          <Text style={styles.preguntaText}>{preguntaSeguridad}</Text>

          <Text style={styles.label}>Respuesta</Text>
          <TextInput
            style={styles.input}
            placeholder="Ingresa tu respuesta"
            placeholderTextColor="#999"
            value={respuestaSeguridad}
            onChangeText={(text) => {
              setRespuestaSeguridad(text);
              setErrores((prev) => ({ ...prev, respuestaSeguridad: '' }));
            }}
            autoCapitalize="none"
            editable={!loading}
            onSubmitEditing={verificarRespuestaSeguridad}
          />
          {errores.respuestaSeguridad ? (
            <Text style={styles.errorText}>{errores.respuestaSeguridad}</Text>
          ) : null}

          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={verificarRespuestaSeguridad}
            disabled={loading || !respuestaSeguridad.trim()}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Verificar y Cambiar Contraseña</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const renderizarPasoNuevaContrasena = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.title}>Nueva Contraseña</Text>
      <Text style={styles.subtitle}>Ingresa tu nueva contraseña</Text>

      {mensajeExito && (
        <View style={styles.successContainer}>
          <Text style={styles.successText}>¡Contraseña cambiada exitosamente!</Text>
          <Text style={styles.successSubtext}>Serás redirigido al inicio de sesión...</Text>
        </View>
      )}

      <TextInput
        style={styles.input}
        placeholder="Nueva contraseña"
        placeholderTextColor="#999"
        secureTextEntry
        value={nuevaContrasena}
        onChangeText={(text) => {
          setNuevaContrasena(text);
          setErrores((prev) => ({ ...prev, nuevaContrasena: '' }));
        }}
      />
      {errores.nuevaContrasena ? (
        <Text style={styles.errorText}>{errores.nuevaContrasena}</Text>
      ) : null}

      <TextInput
        style={styles.input}
        placeholder="Repetir contraseña"
        placeholderTextColor="#999"
        secureTextEntry
        value={repetirContrasena}
        onChangeText={(text) => {
          setRepetirContrasena(text);
          setErrores((prev) => ({ ...prev, repetirContrasena: '' }));
        }}
      />
      {errores.repetirContrasena ? (
        <Text style={styles.errorText}>{errores.repetirContrasena}</Text>
      ) : null}

      <Pressable
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={cambiarContrasena}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Cambiar Contraseña</Text>
        )}
      </Pressable>

      <Pressable
        style={styles.backButtonText}
        onPress={() => {
          setPaso('recuperacion');
          setNuevaContrasena('');
          setRepetirContrasena('');
          setRespuestaSeguridad('');
          setErrores((prev) => ({
            ...prev,
            nuevaContrasena: '',
            repetirContrasena: '',
            respuestaSeguridad: '',
          }));
        }}
      >
        <Text style={styles.backButtonLink}>Volver</Text>
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Image
          source={require('@/assets/images/Furgo_Truck.png')}
          style={styles.logo}
          contentFit="contain"
        />

        {paso === 'recuperacion' && renderizarPasoRecuperacion()}
        {paso === 'nuevaContrasena' && renderizarPasoNuevaContrasena()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    zIndex: 10,
    padding: 5,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 30,
  },
  stepContainer: {
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginTop: 15,
    alignSelf: 'flex-start',
    width: '100%',
  },
  preguntaContainer: {
    width: '100%',
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 2,
    borderTopColor: '#127067',
  },
  preguntaLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
    textAlign: 'left',
  },
  preguntaText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#127067',
    marginBottom: 20,
    textAlign: 'left',
    paddingHorizontal: 0,
  },
  searchButton: {
    backgroundColor: '#127067',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 20,
    marginTop: 10,
    marginBottom: 10,
    width: '100%',
    alignItems: 'center',
  },
  searchButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    width: '100%',
    borderColor: '#127067',
    borderWidth: 1.5,
    borderRadius: 20,
    padding: 15,
    marginBottom: 10,
    fontSize: 16,
    color: '#000',
  },
  button: {
    backgroundColor: '#127067',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 25,
    marginTop: 20,
    width: '100%',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  errorText: {
    color: 'red',
    fontSize: 13,
    marginBottom: 10,
    alignSelf: 'flex-start',
    marginLeft: 5,
  },
  backButtonText: {
    marginTop: 15,
  },
  backButtonLink: {
    color: '#127067',
    fontSize: 16,
    textDecorationLine: 'underline',
  },
  successContainer: {
    backgroundColor: '#d4edda',
    borderColor: '#28a745',
    borderWidth: 2,
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    width: '100%',
  },
  successText: {
    color: '#155724',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 5,
  },
  successSubtext: {
    color: '#155724',
    fontSize: 14,
    textAlign: 'center',
  },
});

