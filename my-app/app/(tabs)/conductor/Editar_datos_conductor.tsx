import React, { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { db } from '@/firebaseConfig';
import { collection, doc, updateDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { makeShadow } from '@/utils/shadow';

export default function EditarUsuarioScreen() {
  const router = useRouter();
  useSyncRutActivo();

  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [rut, setRut] = useState('');
  const [rutUsuario, setRutUsuario] = useState('');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [cargandoDatos, setCargandoDatos] = useState(true);

  const [errores, setErrores] = useState({
    nombres: '',
    apellidos: '',
    correo: '',
    telefono: '',
    rut: '',
  });

  useEffect(() => {
    const cargarDatosUsuario = async () => {
      try {
        const rutGuardado = await AsyncStorage.getItem('rutUsuario');
        if (!rutGuardado) {
          Alert.alert('Error', 'No se encontró el RUT del usuario activo.');
          setCargandoDatos(false);
          return;
        }

        setRutUsuario(rutGuardado);

        const usuariosRef = collection(db, 'usuarios');
        const q = query(usuariosRef, where('rut', '==', rutGuardado));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const userDoc = querySnapshot.docs[0];
          const userData = userDoc.data();
          
          setUserId(userDoc.id);
          setNombres(userData.nombres || '');
          setApellidos(userData.apellidos || '');
          setCorreo(userData.correo || '');
          setTelefono(userData.telefono || '');
          setRut(userData.rut || '');
        } else {
          Alert.alert('Error', 'No se encontraron datos del usuario.');
        }
      } catch (error) {
        console.error('Error al cargar datos del usuario:', error);
        Alert.alert('Error', 'No se pudieron cargar los datos del usuario.');
      } finally {
        setCargandoDatos(false);
      }
    };

    cargarDatosUsuario();
  }, []);

  const validarEmail = (email: string) => email.includes('@');

  const validarTelefono = (tel: string) => {
    // Eliminar espacios, guiones y paréntesis
    const telefonoLimpio = tel.replace(/[\s\-\(\)]/g, '');
    // Validar que tenga entre 8 y 12 dígitos
    return /^\d{8,12}$/.test(telefonoLimpio);
  };

  const manejarActualizarUsuario = async () => {
    const nuevosErrores = {
      nombres: !nombres ? 'Debes ingresar tu nombre' : '',
      apellidos: !apellidos ? 'Debes ingresar tu apellido' : '',
      correo: !validarEmail(correo) ? 'El correo debe contener un "@"' : '',
      telefono: telefono && !validarTelefono(telefono) ? 'El teléfono debe tener entre 8 y 12 dígitos' : '',
      rut: !rut ? 'Debes ingresar tu RUT' : '',
    };

    setErrores(nuevosErrores);

    if (Object.values(nuevosErrores).some((msg) => msg !== '')) return;

    if (!rutUsuario || !userId) {
      Alert.alert('Error', 'No se puede actualizar el usuario sin los datos necesarios.');
      return;
    }

    try {
      setLoading(true);

      const usuarioRef = doc(db, 'usuarios', userId);
      
      await updateDoc(usuarioRef, {
        nombres,
        apellidos,
        correo,
        telefono: telefono || '',
        rut,
        actualizadoEn: serverTimestamp(),
      });

      const nombreCompleto = `${nombres} ${apellidos}`;
      await AsyncStorage.setItem('userName', nombreCompleto);

      Alert.alert('Éxito', 'Datos actualizados correctamente.');
      router.back();
    } catch (error) {
      console.error('Error al actualizar en Firebase:', error);
      Alert.alert('Error', 'No se pudo actualizar la información.');
    } finally {
      setLoading(false);
    }
  };

  if (cargandoDatos) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#127067" />
        <Text>Cargando datos del usuario...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Botón de volver */}
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      {/* Título debajo de la flecha */}
      <Text style={styles.headerTitle}>Editar Datos Usuario</Text>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileImageContainer}>
          <Image
            source={require('@/assets/images/user_icon.png')}
            style={styles.profileImage}
            contentFit="cover"
          />
        </View>

        <View style={styles.formContainer}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nombres</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa tus nombres"
              value={nombres}
              onChangeText={setNombres}
            />
            {errores.nombres ? <Text style={styles.errorText}>{errores.nombres}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Apellidos</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa tus apellidos"
              value={apellidos}
              onChangeText={setApellidos}
            />
            {errores.apellidos ? <Text style={styles.errorText}>{errores.apellidos}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Correo</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa tu correo"
              keyboardType="email-address"
              autoCapitalize="none"
              value={correo}
              onChangeText={setCorreo}
            />
            {errores.correo ? <Text style={styles.errorText}>{errores.correo}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Teléfono</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa tu teléfono (ej: +56 9 1234 5678)"
              keyboardType="phone-pad"
              value={telefono}
              onChangeText={setTelefono}
            />
            {errores.telefono ? <Text style={styles.errorText}>{errores.telefono}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>RUT</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa tu RUT"
              value={rut}
              onChangeText={setRut}
            />
            {errores.rut ? <Text style={styles.errorText}>{errores.rut}</Text> : null}
          </View>

        </View>

        <Pressable style={styles.button} onPress={manejarActualizarUsuario} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Actualizar</Text>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
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
  header: {
    width: '100%',
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: '#127067',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
  fontSize: 20,
  fontWeight: 'bold',
  color: '#127067',
  textAlign: 'center',
  marginTop: 80,
  marginLeft: 20,
  marginBottom: 10,
},

  scrollContent: {
    flexGrow: 1,
    padding: 20,
    alignItems: 'center',
    paddingTop: 40,
  },
  profileImageContainer: {
    backgroundColor: '#e6e6e6',
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  profileImage: {
    width: 50,
    height: 50,
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
  },
  inputGroup: {
    marginBottom: 20,
    width: '100%',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    marginLeft: 5,
  },
  input: {
    width: '100%',
    borderColor: '#127067',
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 15,
    backgroundColor: '#F5F7F8',
    fontSize: 16,
  },
  button: {
    backgroundColor: '#127067',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 25,
    marginTop: 20,
    marginBottom: 30,
    width: 200,
    alignItems: 'center',
    elevation: 3,
    ...makeShadow(
      '0 4px 8px rgba(0,0,0,0.12)',
      {
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      },
    ),
    alignSelf: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  errorText: {
    color: 'red',
    fontSize: 13,
    marginTop: 5,
    marginLeft: 5,
  },
});
