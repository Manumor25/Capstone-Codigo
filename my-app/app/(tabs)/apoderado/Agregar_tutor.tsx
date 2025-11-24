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
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { makeShadow } from '@/utils/shadow';

export default function AddTutorScreen() {
  const router = useRouter();
  useSyncRutActivo();

  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [rut, setRut] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [edad, setEdad] = useState('');
  const [direccion, setDireccion] = useState('');
  const [rutUsuario, setRutUsuario] = useState('');
  const [loading, setLoading] = useState(false);

  const [errores, setErrores] = useState({
    nombres: '',
    apellidos: '',
    rut: '',
    fechaNacimiento: '',
    edad: '',
    direccion: '',
  });

  // 🔹 Obtener el rut del usuario desde AsyncStorage
  useEffect(() => {
    const obtenerRutUsuario = async () => {
      try {
        const rutGuardado = await AsyncStorage.getItem('rutUsuario');
        if (rutGuardado) {
          setRutUsuario(rutGuardado);
          console.log('✅ RUT del usuario cargado:', rutGuardado);
        } else {
          Alert.alert('Error', 'No se encontró el RUT del usuario activo.');
        }
      } catch (error) {
        console.error('❌ Error al obtener el RUT del usuario:', error);
      }
    };

    obtenerRutUsuario();
  }, []);

  // Función para formatear RUT (00.000.000-K)
  const formatearRUT = (text: string): string => {
    // Remover todo excepto números y la letra K
    let rutLimpio = text.replace(/[^0-9kK]/g, '');
    
    if (rutLimpio.length === 0) {
      return '';
    }
    
    // Separar el dígito verificador del resto
    const ultimoCaracter = rutLimpio.slice(-1).toUpperCase();
    const esDigitoVerificador = /[0-9kK]/.test(ultimoCaracter);
    
    let rutSinDV = '';
    let digitoVerificador = '';
    
    if (esDigitoVerificador && rutLimpio.length > 1) {
      rutSinDV = rutLimpio.slice(0, -1);
      digitoVerificador = ultimoCaracter;
    } else if (rutLimpio.length === 1 && /[0-9]/.test(rutLimpio)) {
      rutSinDV = rutLimpio;
    } else {
      rutSinDV = rutLimpio;
    }
    
    if (rutSinDV.length === 0) {
      return digitoVerificador;
    }
    
    let rutFormateado = '';
    let contador = 0;
    
    // Agregar puntos desde la derecha
    for (let i = rutSinDV.length - 1; i >= 0; i--) {
      if (contador === 3) {
        rutFormateado = '.' + rutFormateado;
        contador = 0;
      }
      rutFormateado = rutSinDV[i] + rutFormateado;
      contador++;
    }
    
    // Agregar el dígito verificador si existe
    if (digitoVerificador) {
      return rutFormateado + '-' + digitoVerificador;
    }
    
    return rutFormateado;
  };

  // Función para manejar el cambio de RUT
  const manejarCambioRUT = (text: string) => {
    // Solo permitir números y K/k (el guión debe estar al final para evitar problemas con el rango)
    const rutValido = text.replace(/[^0-9kK.\-]/g, '');
    const rutFormateado = formatearRUT(rutValido);
    setRut(rutFormateado);
    
    // Validar formato de RUT
    const rutPattern = /^\d{1,2}\.\d{3}\.\d{3}-[0-9kK]$/;
    if (rutFormateado && rutFormateado.length > 0) {
      if (!rutPattern.test(rutFormateado) && rutFormateado.length > 3) {
        setErrores(prev => ({
          ...prev,
          rut: 'Formato de RUT inválido. Use el formato: 12.345.678-9'
        }));
      } else {
        setErrores(prev => ({
          ...prev,
          rut: ''
        }));
      }
    } else {
      setErrores(prev => ({
        ...prev,
        rut: ''
      }));
    }
  };

  // Función para formatear fecha (dd/mm/yyyy)
  const formatearFecha = (text: string): string => {
    // Remover todo excepto números
    const numeros = text.replace(/[^0-9]/g, '');
    
    // Si no hay nada, retornar vacío
    if (numeros.length === 0) {
      return '';
    }
    
    // Limitar a 8 dígitos (ddmmyyyy)
    const numerosLimitados = numeros.slice(0, 8);
    
    // Formatear según la longitud
    if (numerosLimitados.length <= 2) {
      return numerosLimitados;
    } else if (numerosLimitados.length <= 4) {
      return numerosLimitados.slice(0, 2) + '/' + numerosLimitados.slice(2);
    } else {
      return numerosLimitados.slice(0, 2) + '/' + numerosLimitados.slice(2, 4) + '/' + numerosLimitados.slice(4);
    }
  };

  // Función para validar fecha
  const validarFecha = (fecha: string): boolean => {
    if (!fecha || fecha.length < 10) {
      return false;
    }
    
    const fechaPattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = fecha.match(fechaPattern);
    
    if (!match) {
      return false;
    }
    
    const dia = parseInt(match[1], 10);
    const mes = parseInt(match[2], 10);
    const año = parseInt(match[3], 10);
    
    // Validar rangos
    if (mes < 1 || mes > 12) {
      return false;
    }
    
    if (dia < 1 || dia > 31) {
      return false;
    }
    
    // Validar días según el mes
    const diasPorMes = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const esBisiesto = (año % 4 === 0 && año % 100 !== 0) || (año % 400 === 0);
    if (esBisiesto) {
      diasPorMes[1] = 29;
    }
    
    if (dia > diasPorMes[mes - 1]) {
      return false;
    }
    
    // Validar que el año sea razonable (entre 1900 y año actual)
    const añoActual = new Date().getFullYear();
    if (año < 1900 || año > añoActual) {
      return false;
    }
    
    return true;
  };

  // Función para manejar el cambio de fecha
  const manejarCambioFecha = (text: string) => {
    const fechaFormateada = formatearFecha(text);
    setFechaNacimiento(fechaFormateada);
    
    // Validar fecha
    if (fechaFormateada && fechaFormateada.length > 0) {
      if (fechaFormateada.length === 10) {
        if (!validarFecha(fechaFormateada)) {
          setErrores(prev => ({
            ...prev,
            fechaNacimiento: 'Fecha inválida. Use el formato: dd/mm/aaaa'
          }));
        } else {
          setErrores(prev => ({
            ...prev,
            fechaNacimiento: ''
          }));
        }
      } else {
        setErrores(prev => ({
          ...prev,
          fechaNacimiento: ''
        }));
      }
    } else {
      setErrores(prev => ({
        ...prev,
        fechaNacimiento: ''
      }));
    }
  };

  // 🔹 Guardar tutor en Firestore
  const manejarGuardarTutor = async () => {
    // Validar formato de RUT
    const rutPattern = /^\d{1,2}\.\d{3}\.\d{3}-[0-9kK]$/;
    const rutValido = rut && rutPattern.test(rut);
    
    // Validar formato de fecha
    const fechaValida = fechaNacimiento && validarFecha(fechaNacimiento);
    
    const nuevosErrores = {
      nombres: !nombres.trim() ? 'Ingresa el nombre del tutor' : '',
      apellidos: !apellidos.trim() ? 'Ingresa el apellido' : '',
      rut: !rut ? 'Ingresa el RUT del tutor' : (!rutValido ? 'Formato de RUT inválido. Use el formato: 12.345.678-9' : ''),
      fechaNacimiento: !fechaNacimiento ? 'Ingresa la fecha de nacimiento' : (!fechaValida ? 'Fecha inválida. Use el formato: dd/mm/aaaa' : ''),
      edad: !edad ? 'Ingresa la edad' : '',
      direccion: !direccion.trim() ? 'Ingresa la dirección' : '',
    };

    setErrores(nuevosErrores);

    if (Object.values(nuevosErrores).some((msg) => msg !== '')) return;

    if (!rutUsuario) {
      Alert.alert('Error', 'No se puede guardar el tutor sin el RUT del usuario.');
      return;
    }

    try {
      setLoading(true);
      const borrador = {
        nombres,
        apellidos,
        rut,
        fechaNacimiento,
        edad,
        direccion,
        rutUsuario,
      };

      await AsyncStorage.multiRemove(['nuevoTutorCIFrontal', 'nuevoTutorCITrasero']);
      await AsyncStorage.setItem('nuevoTutorData', JSON.stringify(borrador));
      router.push('/(tabs)/apoderado/Agregar_tutor_documentos');
    } catch (error) {
      console.error('Error al preparar la carga de documentos del tutor:', error);
      Alert.alert('Error', 'No se pudo preparar la carga de documentos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Botón de volver */}
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Imagen de perfil */}
        <View style={styles.profileImageContainer}>
          <Image
            source={require('@/assets/images/user_icon.png')}
            style={styles.profileImage}
            contentFit="cover"
          />
        </View>

        <Text style={styles.title}>Agregar tutor</Text>

        {/* Campos del formulario */}
        <View style={styles.formContainer}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nombres</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa los nombres"
              value={nombres}
              onChangeText={setNombres}
            />
            {errores.nombres ? <Text style={styles.errorText}>{errores.nombres}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Apellidos</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa los apellidos"
              value={apellidos}
              onChangeText={setApellidos}
            />
            {errores.apellidos ? <Text style={styles.errorText}>{errores.apellidos}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Rut</Text>
            <TextInput
              style={[styles.input, errores.rut ? styles.inputError : null]}
              placeholder="12.345.678-9"
              value={rut}
              onChangeText={manejarCambioRUT}
            />
            {errores.rut ? <Text style={styles.errorText}>{errores.rut}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Fecha de nacimiento</Text>
            <TextInput
              style={[styles.input, errores.fechaNacimiento ? styles.inputError : null]}
              placeholder="dd/mm/aaaa"
              value={fechaNacimiento}
              onChangeText={manejarCambioFecha}
              keyboardType="numeric"
            />
            {errores.fechaNacimiento ? (
              <Text style={styles.errorText}>{errores.fechaNacimiento}</Text>
            ) : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Edad</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa la edad"
              value={edad}
              keyboardType="numeric"
              onChangeText={setEdad}
            />
            {errores.edad ? <Text style={styles.errorText}>{errores.edad}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Dirección</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa la dirección"
              value={direccion}
              onChangeText={setDireccion}
            />
            {errores.direccion ? <Text style={styles.errorText}>{errores.direccion}</Text> : null}
          </View>
        </View>

        {/* Botón Siguiente */}
        <Pressable style={styles.button} onPress={manejarGuardarTutor} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Siguiente</Text>
          )}
        </Pressable>
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
    color: '#ffffff',
    textAlign: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    alignItems: 'center',
  },
  profileImageContainer: {
    backgroundColor: '#e6e6e6',
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    marginTop: 10,
  },
  profileImage: {
    width: 50,
    height: 50,
  },
  title: {
    fontSize: 22,
    marginBottom: 30,
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
  inputError: {
    borderColor: 'red',
    borderWidth: 2,
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

