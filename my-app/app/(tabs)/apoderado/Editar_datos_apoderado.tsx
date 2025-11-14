import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { makeShadow } from '@/utils/shadow';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Picker } from '@react-native-picker/picker';
import { Platform } from 'react-native';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

export default function EditarDatosApoderadoScreen() {
  const router = useRouter();
  useSyncRutActivo();

  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [rut, setRut] = useState('');
  const [direccion, setDireccion] = useState('');
  const [preguntaSeguridad, setPreguntaSeguridad] = useState('');
  const [respuestaSeguridad, setRespuestaSeguridad] = useState('');
  const [rutUsuario, setRutUsuario] = useState('');
  const [userId, setUserId] = useState('');
  const [loading, setLoading] = useState(false);
  const [cargando, setCargando] = useState(true);

  const [errores, setErrores] = useState({
    nombres: '',
    apellidos: '',
    correo: '',
    telefono: '',
    rut: '',
    direccion: '',
    preguntaSeguridad: '',
    respuestaSeguridad: '',
  });

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const rutGuardado = await AsyncStorage.getItem('rutUsuario');
        if (!rutGuardado) {
          Alert.alert('Error', 'No se encontró el RUT del usuario activo.');
          setCargando(false);
          return;
        }
        setRutUsuario(rutGuardado);

        const usuariosRef = collection(db, 'usuarios');
        const q = query(usuariosRef, where('rut', '==', rutGuardado));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          Alert.alert('Error', 'No se encontraron datos del apoderado.');
          setCargando(false);
          return;
        }

        const docUsuario = snapshot.docs[0];
        const data = docUsuario.data() || {};

        setUserId(docUsuario.id);
        setNombres(data.nombres || '');
        setApellidos(data.apellidos || '');
        setCorreo(data.correo || '');
        setTelefono(data.telefono || '');
        setRut(data.rut || '');
        setDireccion(data.direccion || '');
        setPreguntaSeguridad(data.preguntaSeguridad || '');
        setRespuestaSeguridad(data.respuestaSeguridad || '');
      } catch (error) {
        console.error('Error al cargar datos del apoderado:', error);
        Alert.alert('Error', 'No se pudieron cargar los datos del apoderado.');
      } finally {
        setCargando(false);
      }
    };

    cargarDatos();
  }, []);

  // Lista de preguntas de seguridad típicas
  const preguntasSeguridad = [
    '¿Cuál es el nombre de tu primera mascota?',
    '¿Cuál es el nombre de tu madre?',
    '¿Cuál es el nombre de tu ciudad natal?',
    '¿Cuál era el nombre de tu mejor amigo/a de la infancia?',
    '¿Cuál es tu comida favorita?',
    '¿Cuál es el nombre de tu primera escuela?',
    '¿Cuál es el nombre de tu película favorita?',
    '¿Cuál es el apellido de soltera de tu madre?',
    '¿En qué ciudad naciste?',
    '¿Cuál es el nombre de tu abuela materna?',
  ];

  const validarEmail = (email: string) => email.includes('@');

  // Función para filtrar el teléfono: solo números y + al inicio
  const manejarCambioTelefono = (text: string) => {
    // Permitir solo números y el símbolo +
    let textoFiltrado = text.replace(/[^0-9+]/g, '');
    
    // Si hay un +, solo permitirlo al inicio
    if (textoFiltrado.includes('+')) {
      // Si el + no está al inicio, moverlo al inicio o eliminarlo
      const tieneMasAlInicio = textoFiltrado.startsWith('+');
      const numeros = textoFiltrado.replace(/\+/g, '');
      
      if (tieneMasAlInicio) {
        textoFiltrado = '+' + numeros;
      } else {
        // Si el + no está al inicio, solo dejar los números
        textoFiltrado = numeros;
      }
    }
    
    setTelefono(textoFiltrado);
  };

  const validarTelefono = (tel: string) => {
    // Eliminar espacios, guiones y paréntesis
    let telefonoLimpio = tel.replace(/[\s\-\(\)]/g, '');
    
    // Si tiene + al inicio, removerlo para contar dígitos
    if (telefonoLimpio.startsWith('+')) {
      telefonoLimpio = telefonoLimpio.substring(1);
    }
    
    // Validar que tenga entre 8 y 12 dígitos
    return /^\d{8,12}$/.test(telefonoLimpio);
  };

  const manejarActualizar = async () => {
    const nuevosErrores = {
      nombres: !nombres ? 'Debes ingresar tu nombre' : '',
      apellidos: !apellidos ? 'Debes ingresar tu apellido' : '',
      correo: !validarEmail(correo) ? 'El correo debe contener un "@"' : '',
      telefono: !telefono ? 'Debes ingresar tu número telefónico' : (!validarTelefono(telefono) ? 'El teléfono debe tener entre 8 y 12 dígitos' : ''),
      rut: !rut ? 'Debes ingresar tu RUT' : '',
      direccion: !direccion ? 'Debes ingresar tu dirección' : '',
      preguntaSeguridad: '',
      respuestaSeguridad: preguntaSeguridad && preguntaSeguridad !== '' && !respuestaSeguridad.trim() ? 'Debes ingresar la respuesta si has configurado una pregunta' : '',
    };

    setErrores(nuevosErrores);

    if (Object.values(nuevosErrores).some((msg) => msg !== '')) return;

    if (!rutUsuario || !userId) {
      Alert.alert('Error', 'No se puede actualizar el apoderado sin los datos necesarios.');
      return;
    }

    try {
      setLoading(true);
      const usuarioRef = doc(db, 'usuarios', userId);
      const datosActualizacion: any = {
        nombres,
        apellidos,
        correo,
        telefono,
        rut,
        direccion,
        rol: 'Apoderado',
        actualizadoEn: serverTimestamp(),
      };

      // Solo actualizar pregunta y respuesta si se han proporcionado
      if (preguntaSeguridad.trim()) {
        datosActualizacion.preguntaSeguridad = preguntaSeguridad.trim();
        datosActualizacion.respuestaSeguridad = respuestaSeguridad.trim().toLowerCase();
      }

      await updateDoc(usuarioRef, datosActualizacion);

      await AsyncStorage.setItem('userName', `${nombres} ${apellidos}`);

      Alert.alert('Éxito', 'Datos actualizados correctamente.');
      router.back();
    } catch (error) {
      console.error('Error al actualizar apoderado:', error);
      Alert.alert('Error', 'No se pudo actualizar la información.');
    } finally {
      setLoading(false);
    }
  };

  if (cargando) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#127067" />
        <Text style={styles.loadingText}>Cargando datos...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.profileImageContainer}>
          <Image
            source={require('@/assets/images/user_icon.png')}
            style={styles.profileImage}
            contentFit="cover"
          />
        </View>

        <Text style={styles.title}>Editar datos del apoderado</Text>

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
              value={correo}
              onChangeText={setCorreo}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {errores.correo ? <Text style={styles.errorText}>{errores.correo}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Número Celular</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa tu número celular"
              value={telefono}
              onChangeText={manejarCambioTelefono}
              keyboardType="phone-pad"
            />
            {errores.telefono ? <Text style={styles.errorText}>{errores.telefono}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>RUT</Text>
            <TextInput style={styles.input} placeholder="Ingresa tu RUT" value={rut} onChangeText={setRut} />
            {errores.rut ? <Text style={styles.errorText}>{errores.rut}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Dirección</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa tu dirección"
              value={direccion}
              onChangeText={setDireccion}
            />
            {errores.direccion ? <Text style={styles.errorText}>{errores.direccion}</Text> : null}
          </View>

          <View style={styles.sectionDivider}>
            <Text style={styles.sectionTitle}>Pregunta de Seguridad</Text>
            <Text style={styles.sectionSubtitle}>
              Configura una pregunta y respuesta para recuperar tu contraseña si la olvidas
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Pregunta de Seguridad</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={preguntaSeguridad}
                onValueChange={(itemValue) => {
                  setPreguntaSeguridad(itemValue);
                  setErrores((prev) => ({ ...prev, preguntaSeguridad: '' }));
                }}
                style={styles.picker}
                itemStyle={Platform.OS === 'ios' ? styles.pickerItem : undefined}
              >
                <Picker.Item label="Selecciona una pregunta..." value="" color="#999" />
                {preguntasSeguridad.map((pregunta, index) => (
                  <Picker.Item key={index} label={pregunta} value={pregunta} />
                ))}
              </Picker>
            </View>
            {errores.preguntaSeguridad ? (
              <Text style={styles.errorText}>{errores.preguntaSeguridad}</Text>
            ) : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Respuesta</Text>
            <TextInput
              style={styles.input}
              placeholder="Respuesta"
              value={respuestaSeguridad}
              onChangeText={(text) => {
                setRespuestaSeguridad(text);
                setErrores((prev) => ({ ...prev, respuestaSeguridad: '' }));
              }}
              autoCapitalize="none"
            />
            {errores.respuestaSeguridad ? (
              <Text style={styles.errorText}>{errores.respuestaSeguridad}</Text>
            ) : null}
          </View>
        </View>

        <Pressable style={styles.button} onPress={manejarActualizar} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Actualizar</Text>}
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
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 16,
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
  title: {
    fontSize: 22,
    marginBottom: 20,
    fontWeight: '500',
    color: '#333',
    textAlign: 'center',
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
  sectionDivider: {
    marginTop: 20,
    marginBottom: 10,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    width: '100%',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 5,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 15,
  },
  multilineInput: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  pickerContainer: {
    width: '100%',
    borderColor: '#127067',
    borderWidth: 1.5,
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
    backgroundColor: '#F5F7F8',
  },
  picker: {
    width: '100%',
    height: Platform.OS === 'ios' ? 200 : 50,
  },
  pickerItem: {
    fontSize: 16,
  },
});
