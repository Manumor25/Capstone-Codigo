import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function EditarHijoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  useSyncRutActivo();

  const [nombres, setNombres] = useState(params.nombres?.toString() || '');
  const [apellidos, setApellidos] = useState(params.apellidos?.toString() || '');
  const [rut, setRut] = useState(params.rut?.toString() || '');
  const [fechaNacimiento, setFechaNacimiento] = useState(params.fechaNacimiento?.toString() || '');
  const [edad, setEdad] = useState(params.edad?.toString() || '');
  const [rutUsuario, setRutUsuario] = useState('');
  const [loading, setLoading] = useState(false);

  const [errores, setErrores] = useState({
    nombres: '',
    apellidos: '',
    rut: '',
    fechaNacimiento: '',
    edad: '',
  });

  useEffect(() => {
    const obtenerRutUsuario = async () => {
      try {
        const rutGuardado = await AsyncStorage.getItem('rutUsuario');
        if (rutGuardado) {
          setRutUsuario(rutGuardado);
        } else {
          Alert.alert('Error', 'No se encontró el RUT del usuario activo.');
        }
      } catch (error) {
        console.error('Error al obtener el RUT del usuario:', error);
      }
    };

    obtenerRutUsuario();
  }, []);

  // Función para manejar el cambio de edad: solo números
  const manejarCambioEdad = (text: string) => {
    // Permitir solo números
    const edadFiltrada = text.replace(/[^0-9]/g, '');
    setEdad(edadFiltrada);
  };

  const manejarContinuar = async () => {
    const nuevosErrores = {
      nombres: !nombres ? 'Ingresa el nombre del hijo' : '',
      apellidos: !apellidos ? 'Ingresa el apellido' : '',
      rut: !rut ? 'Ingresa el RUT del hijo' : '',
      fechaNacimiento: !fechaNacimiento ? 'Ingresa la fecha de nacimiento' : '',
      edad: !edad ? 'Ingresa la edad' : '',
    };

    setErrores(nuevosErrores);

    if (Object.values(nuevosErrores).some((msg) => msg !== '')) return;

    if (!rutUsuario) {
      Alert.alert('Error', 'No se puede actualizar el hijo sin el RUT del usuario.');
      return;
    }

    const hijoId = params.id?.toString() || rut;

    if (!hijoId) {
      Alert.alert('Error', 'No se pudo identificar el registro del hijo.');
      return;
    }

    try {
      setLoading(true);
      const hijoRef = doc(db, 'Hijos', hijoId);
      const snapshot = await getDoc(hijoRef);
      if (!snapshot.exists()) {
        Alert.alert('Error', 'No se encontró el registro del hijo para editar.');
        return;
      }

      // Actualizar los datos básicos directamente en Firestore
      await updateDoc(hijoRef, {
        nombres,
        apellidos,
        rut,
        fechaNacimiento,
        edad,
        rutUsuario,
        actualizadoEn: serverTimestamp(),
      });

      const borrador = {
        id: hijoId,
        nombres,
        apellidos,
        rut,
        fechaNacimiento,
        edad,
        rutUsuario,
      };

      await AsyncStorage.multiSet([
        ['editarHijoData', JSON.stringify(borrador)],
        ['editarHijoId', hijoId],
      ]);
      await AsyncStorage.multiRemove(['editarHijoHorario', 'editarHijoInforme']);

      Alert.alert('Éxito', 'Los datos del hijo se actualizaron correctamente.');
      router.replace({
        pathname: '/(tabs)/apoderado/Editar_Horario_hijo',
        params: { id: hijoId },
      });
    } catch (error) {
      console.error('Error al preparar la edición del hijo:', error);
      Alert.alert('Error', 'No se pudo guardar la información del hijo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Botón de volver */}
      <Pressable 
        style={styles.backButton} 
        onPress={() => router.replace('/(tabs)/apoderado/perfil-apoderado')}
      >
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      {/* Imagen de perfil */}
      <View style={styles.profileImageContainer}>
        <Image
          source={require('@/assets/images/user_icon.png')}
          style={styles.profileImage}
          contentFit="cover"
        />
      </View>

      <Text style={styles.title}>Editar hijo</Text>

      {/* Campos */}
      <TextInput
        style={styles.input}
        placeholder="Nombres"
        value={nombres}
        onChangeText={setNombres}
      />
      {errores.nombres ? <Text style={styles.errorText}>{errores.nombres}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="Apellidos"
        value={apellidos}
        onChangeText={setApellidos}
      />
      {errores.apellidos ? <Text style={styles.errorText}>{errores.apellidos}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="RUT del hijo"
        value={rut}
        onChangeText={setRut}
      />
      {errores.rut ? <Text style={styles.errorText}>{errores.rut}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="Fecha de nacimiento (dd/mm/aaaa)"
        value={fechaNacimiento}
        onChangeText={setFechaNacimiento}
      />
      {errores.fechaNacimiento ? (
        <Text style={styles.errorText}>{errores.fechaNacimiento}</Text>
      ) : null}

      <TextInput
        style={styles.input}
        placeholder="Edad"
        value={edad}
        keyboardType="numeric"
        onChangeText={manejarCambioEdad}
      />
      {errores.edad ? <Text style={styles.errorText}>{errores.edad}</Text> : null}

      {/* Botón Actualizar */}
      <Pressable style={styles.button} onPress={manejarContinuar} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Continuar</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    zIndex: 10,
    padding: 5,
  },
  container: {
    flex: 1,
    paddingTop: 80,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileImageContainer: {
    backgroundColor: '#e6e6e6',
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  profileImage: {
    width: 50,
    height: 50,
  },
  title: {
    fontSize: 22,
    marginBottom: 20,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  input: {
    width: '90%',
    borderColor: '#127067',
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  button: {
    backgroundColor: '#127067',
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 20,
    marginTop: 10,
    width: 150,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
  },
  errorText: {
    color: 'red',
    fontSize: 13,
    marginBottom: 5,
    alignSelf: 'flex-start',
    marginLeft: 25,
  },
});
