import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { Ionicons } from '@expo/vector-icons';
import Checkbox from 'expo-checkbox';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { addDoc, collection, getDocs, query, where } from 'firebase/firestore';
import React, { useRef, useState } from 'react';
import { Picker } from '@react-native-picker/picker';
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  ScrollView,
  Platform,
} from 'react-native';
import { db } from '../../firebaseConfig';

export default function RegisterScreen() {
  const router = useRouter();
  useSyncRutActivo();

  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [repetirContrasena, setRepetirContrasena] = useState('');
  const [rut, setRut] = useState('');
  const rutAnteriorRef = useRef('');
  const [esConductor, setEsConductor] = useState(false);
  const [aceptaCondiciones, setAceptaCondiciones] = useState(false);
  const [preguntaSeguridad, setPreguntaSeguridad] = useState('');
  const [respuestaSeguridad, setRespuestaSeguridad] = useState('');

  // Mensajes de error
  const [errores, setErrores] = useState({
    nombres: '',
    apellidos: '',
    correo: '',
    telefono: '',
    contrasena: '',
    repetirContrasena: '',
    rut: '',
    aceptaCondiciones: '',
    preguntaSeguridad: '',
    respuestaSeguridad: '',
  });

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

  const validarContrasena = (password: string) => {
    const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;
    return regex.test(password);
  };

  // Función para formatear RUT automáticamente (XX.XXX.XXX-K o XX.XXX.XXX-9)
  const formatearRUT = (text: string, agregarGuionAuto: boolean = true): string => {
    // Remover todo excepto números y la letra K/k
    // Esto automáticamente rechaza cualquier otra letra
    let rutLimpio = text.replace(/[^0-9kK]/g, '');
    
    // Si no hay nada, retornar vacío
    if (rutLimpio.length === 0) {
      return '';
    }
    
    // Convertir k minúscula a K mayúscula
    rutLimpio = rutLimpio.replace(/k/g, 'K');
    
    // Separar los números del dígito verificador
    // El dígito verificador puede ser un número (0-9) o la letra K
    let rutSinDV = rutLimpio;
    let digitoVerificador = '';
    
    // Si hay 9 o más caracteres, el último es el dígito verificador
    if (rutLimpio.length >= 9) {
      rutSinDV = rutLimpio.slice(0, 8);
      digitoVerificador = rutLimpio.slice(8);
      // Limitar el dígito verificador a un solo carácter
      if (digitoVerificador.length > 1) {
        digitoVerificador = digitoVerificador.slice(0, 1);
      }
    } else if (rutLimpio.length === 8) {
      // Si tiene exactamente 8 caracteres, todos son números del RUT
      rutSinDV = rutLimpio;
    }
    
    // Limitar a máximo 8 dígitos para el RUT (sin el dígito verificador)
    if (rutSinDV.length > 8) {
      rutSinDV = rutSinDV.slice(0, 8);
    }
    
    // Si no hay dígitos del RUT, solo retornar el dígito verificador si existe
    if (rutSinDV.length === 0) {
      return digitoVerificador ? '-' + digitoVerificador : '';
    }
    
    // Formatear los números con puntos
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
    
    // Si hay exactamente 8 dígitos y agregarGuionAuto es true, agregar guión automáticamente
    if (rutSinDV.length === 8 && agregarGuionAuto) {
      return rutFormateado + '-';
    }
    
    return rutFormateado;
  };

  // Función para validar RUT
  const validarRUT = (rut: string): boolean => {
    // Formato: XX.XXX.XXX-K o XX.XXX.XXX-9 (permite 7 u 8 dígitos)
    // El dígito verificador puede ser un número (0-9) o la letra K/k
    // Ejemplos válidos: 20.027.576-K, 20.027.576-9, 1.234.567-5
    const rutPattern = /^\d{1,2}\.\d{3}\.\d{3}-[0-9Kk]$/;
    return rutPattern.test(rut);
  };

  // Función para manejar el cambio de RUT
  const manejarCambioRUT = (text: string) => {
    // Si el texto está vacío, limpiar todo
    if (text.length === 0) {
      setRut('');
      rutAnteriorRef.current = '';
      setErrores((prev) => ({
        ...prev,
        rut: '',
      }));
      return;
    }
    
    // Detectar si el usuario está borrando comparando con el valor anterior
    const estaBorrando = text.length < rutAnteriorRef.current.length;
    
    // Si el usuario está borrando, permitir que borre los símbolos
    // No agregar el guión automáticamente cuando está borrando
    if (estaBorrando) {
      // Obtener solo los números y K del texto que el usuario escribió
      // No agregar guión automáticamente cuando está borrando
      const rutFormateado = formatearRUT(text, false);
      setRut(rutFormateado);
      rutAnteriorRef.current = rutFormateado;
      
      // Limpiar errores si está borrando
      if (rutFormateado.length === 0) {
        setErrores((prev) => ({
          ...prev,
          rut: '',
        }));
      } else if (!rutFormateado.includes('-')) {
        // Si no tiene guión, aún no está completo, limpiar error
        setErrores((prev) => ({
          ...prev,
          rut: '',
        }));
      } else if (validarRUT(rutFormateado)) {
        // Si es válido, limpiar error
        setErrores((prev) => ({
          ...prev,
          rut: '',
        }));
      }
      return;
    }
    
    // Si está escribiendo, aplicar el formateo automático
    const rutFormateado = formatearRUT(text);
    setRut(rutFormateado);
    rutAnteriorRef.current = rutFormateado;
    
    // Validar formato solo si hay contenido
    if (rutFormateado && rutFormateado.length > 0) {
      // Si el RUT está completo (tiene guión y dígito verificador), validarlo
      if (rutFormateado.includes('-')) {
        if (!validarRUT(rutFormateado)) {
          setErrores((prev) => ({
            ...prev,
            rut: 'Rut Invalido',
          }));
        } else {
          setErrores((prev) => ({
            ...prev,
            rut: '',
          }));
        }
      } else {
        // Si aún no está completo, limpiar el error
        setErrores((prev) => ({
          ...prev,
          rut: '',
        }));
      }
    } else {
      setErrores((prev) => ({
        ...prev,
        rut: '',
      }));
    }
  };

  const manejarRegistro = async () => {
    let nuevosErrores = {
      nombres: '',
      apellidos: '',
      correo: '',
      telefono: '',
      contrasena: '',
      repetirContrasena: '',
      rut: '',
      aceptaCondiciones: '',
      preguntaSeguridad: '',
      respuestaSeguridad: '',
    };

    if (!nombres) nuevosErrores.nombres = 'Debes ingresar tu nombre';
    if (!apellidos) nuevosErrores.apellidos = 'Debes ingresar tu apellido';
    if (!validarEmail(correo)) nuevosErrores.correo = 'El correo debe contener un "@"';
    if (!telefono) {
      nuevosErrores.telefono = 'Debes ingresar tu número telefónico';
    } else if (!validarTelefono(telefono)) {
      nuevosErrores.telefono = 'El teléfono debe tener entre 8 y 12 dígitos';
    }
    if (!validarContrasena(contrasena))
      nuevosErrores.contrasena =
        'Debe tener al menos 8 caracteres, incluyendo mayúscula, minúscula, número y carácter especial.';
    if (contrasena !== repetirContrasena)
      nuevosErrores.repetirContrasena = 'Las contraseñas no coinciden';
    if (!rut) {
      nuevosErrores.rut = 'Debes ingresar tu RUT';
    } else if (!validarRUT(rut)) {
      nuevosErrores.rut = 'El RUT debe tener el formato XX.XXX.XXX-X donde el último carácter es un número (0-9) o la letra K';
    }
    if (!preguntaSeguridad || preguntaSeguridad === '') {
      nuevosErrores.preguntaSeguridad = 'Debes seleccionar una pregunta de seguridad';
    }
    if (!respuestaSeguridad.trim()) {
      nuevosErrores.respuestaSeguridad = 'Debes ingresar la respuesta a tu pregunta de seguridad';
    }
    if (!aceptaCondiciones)
      nuevosErrores.aceptaCondiciones = 'Debes aceptar los términos y condiciones para continuar.';

    setErrores(nuevosErrores);

    if (Object.values(nuevosErrores).some((msg) => msg !== '')) return;

    // Normalizar el correo a minúsculas para verificación y guardado
    const correoNormalizado = correo.trim().toLowerCase();

    try {
      // Verificar si el correo ya existe en Firestore (case-insensitive)
      const usuariosRef = collection(db, 'usuarios');
      
      // Primero intentar buscar con el correo normalizado (minúsculas)
      let q = query(usuariosRef, where('correo', '==', correoNormalizado));
      let querySnapshot = await getDocs(q);
      
      // Si no se encuentra, buscar todos los usuarios y filtrar en el cliente
      // (esto maneja el caso donde el correo está guardado con mayúsculas)
      let correoExiste = !querySnapshot.empty;
      if (!correoExiste) {
        const allUsersSnapshot = await getDocs(usuariosRef);
        correoExiste = allUsersSnapshot.docs.some(
          (doc) => doc.data().correo?.toLowerCase() === correoNormalizado
        );
      }
      
      if (correoExiste) {
        setErrores((prev) => ({ ...prev, correo: 'Este correo ya está registrado.' }));
        return;
      }
    } catch (error) {
      Alert.alert('Error', 'No se pudo verificar el correo. Intenta de nuevo.');
      return;
    }

    // Normalizar el RUT para guardarlo de forma consistente (sin espacios)
    const rutNormalizado = rut.trim();

    const usuario = {
      nombres,
      apellidos,
      correo: correoNormalizado, // Guardar correo en minúsculas para consistencia
      telefono,
      contrasena,
      rut: rutNormalizado, // Guardar RUT sin espacios para consistencia
      rol: esConductor ? 'Conductor' : 'Apoderado',
      preguntaSeguridad: preguntaSeguridad.trim(),
      respuestaSeguridad: respuestaSeguridad.trim().toLowerCase(),
    };

    try {
      await addDoc(collection(db, 'usuarios'), usuario);
      console.log('✅ Usuario registrado exitosamente:', {
        nombres,
        rut: rutNormalizado,
        rol: usuario.rol,
      });
      Alert.alert('¡Registro exitoso!', `Bienvenido, ${nombres}`);
      router.push('/(tabs)/login');
    } catch (error) {
      console.error('Error al registrar usuario:', error);
      Alert.alert('Error', 'No se pudo guardar el usuario en la nube. Intenta de nuevo.');
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

        <Text style={styles.title}>Registro</Text>

        <TextInput
          style={styles.input}
          placeholder="Nombres"
          placeholderTextColor="#999"
          value={nombres}
          onChangeText={setNombres}
        />
        {errores.nombres ? <Text style={styles.errorText}>{errores.nombres}</Text> : null}

        <TextInput
          style={styles.input}
          placeholder="Apellidos"
          placeholderTextColor="#999"
          value={apellidos}
          onChangeText={setApellidos}
        />
        {errores.apellidos ? <Text style={styles.errorText}>{errores.apellidos}</Text> : null}

        <TextInput
          style={styles.input}
          placeholder="Correo"
          placeholderTextColor="#999"
          keyboardType="email-address"
          autoCapitalize="none"
          value={correo}
          onChangeText={setCorreo}
        />
        {errores.correo ? <Text style={styles.errorText}>{errores.correo}</Text> : null}

        <TextInput
          style={styles.input}
          placeholder="Número Celular"
          placeholderTextColor="#999"
          keyboardType="phone-pad"
          value={telefono}
          onChangeText={manejarCambioTelefono}
        />
        {errores.telefono ? <Text style={styles.errorText}>{errores.telefono}</Text> : null}

        <TextInput
          style={styles.input}
          placeholder="Contraseña"
          placeholderTextColor="#999"
          secureTextEntry
          value={contrasena}
          onChangeText={setContrasena}
        />
        {errores.contrasena ? <Text style={styles.errorText}>{errores.contrasena}</Text> : null}

        <TextInput
          style={styles.input}
          placeholder="Repetir Contraseña"
          placeholderTextColor="#999"
          secureTextEntry
          value={repetirContrasena}
          onChangeText={setRepetirContrasena}
        />
        {errores.repetirContrasena ? <Text style={styles.errorText}>{errores.repetirContrasena}</Text> : null}

        <TextInput
          style={styles.input}
          placeholder="RUT"
          placeholderTextColor="#999"
          value={rut}
          onChangeText={manejarCambioRUT}
          keyboardType="default"
          autoCapitalize="characters"
          maxLength={13}
        />
        {errores.rut ? <Text style={styles.errorText}>{errores.rut}</Text> : null}

      <Text style={styles.sectionTitle}>Pregunta de Seguridad</Text>
      <Text style={styles.sectionSubtitle}>
        Selecciona una pregunta que te ayudará a recuperar tu contraseña si la olvidas
      </Text>

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

      <TextInput
        style={styles.input}
        placeholder="Respuesta"
        placeholderTextColor="#999"
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

      <View style={styles.switchContainer}>
        <Text style={styles.switchLabel}>Conductor de furgón</Text>
        <Switch
          value={esConductor}
          onValueChange={setEsConductor}
          thumbColor={esConductor ? '#127067' : '#ccc'}
          trackColor={{ false: '#ccc', true: '#85d7c0' }}
          style={styles.switch}
        />
      </View>

      <View style={styles.checkboxContainer}>
        <Checkbox
          value={aceptaCondiciones}
          onValueChange={setAceptaCondiciones}
          color={aceptaCondiciones ? '#127067' : undefined}
        />
        <Text style={styles.checkboxLabel}>Acepto condiciones de uso y servicio</Text>
      </View>
      {errores.aceptaCondiciones ? <Text style={styles.errorText}>{errores.aceptaCondiciones}</Text> : null}

      <Pressable
        style={[styles.button, { backgroundColor: aceptaCondiciones ? '#127067' : '#ccc' }]}
        onPress={manejarRegistro}
        disabled={!aceptaCondiciones}
      >
        <Text style={styles.buttonText}>Regístrate</Text>
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
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 50,
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
    fontWeight: '600',
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
  switchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
    justifyContent: 'space-between',
    width: '90%',
  },
  switchLabel: {
    marginRight: 10,
  },
  switch: {
    marginLeft: 10,
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
    flexWrap: 'wrap',
    width: '90%',
  },
  checkboxLabel: {
    marginLeft: 10,
    fontSize: 14,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 6,
    marginTop: 20,
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
    marginLeft: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 15,
    marginBottom: 5,
    alignSelf: 'flex-start',
    marginLeft: 20,
    color: '#333',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
    alignSelf: 'flex-start',
    marginLeft: 20,
    marginRight: 20,
  },
  pickerContainer: {
    width: '90%',
    borderColor: '#127067',
    borderWidth: 1.5,
    borderRadius: 20,
    marginBottom: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  picker: {
    width: '100%',
    height: Platform.OS === 'ios' ? 200 : 50,
  },
  pickerItem: {
    fontSize: 16,
  },
});
