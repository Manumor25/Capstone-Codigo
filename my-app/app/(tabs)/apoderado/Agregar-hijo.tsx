import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

interface DatosHijoDraft {
  nombres: string;
  apellidos: string;
  rut: string;
  fechaNacimiento: string;
  edad: string;
  rutUsuario: string;
}

export default function AddChildScreen() {
  const router = useRouter();
  useSyncRutActivo();

  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [rut, setRut] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [edad, setEdad] = useState('');
  const [rutUsuario, setRutUsuario] = useState('');
  const [loading, setLoading] = useState(false);

  const [errores, setErrores] = useState({
    nombres: '',
    apellidos: '',
    rut: '',
    fechaNacimiento: '',
    edad: '',
  });

  // Función para formatear RUT (00.000.000-K)
  const formatearRUT = (text: string): string => {
    // Remover todo excepto números y la letra K
    let rutLimpio = text.replace(/[^0-9kK]/g, '');
    
    // Si no hay nada, retornar vacío
    if (rutLimpio.length === 0) {
      return '';
    }
    
    // Convertir k minúscula a K mayúscula
    rutLimpio = rutLimpio.replace(/k/g, 'K');
    
    // Si el último carácter es K o un número, ese es el dígito verificador
    const ultimoChar = rutLimpio.slice(-1);
    const esDigitoVerificador = /[0-9K]/.test(ultimoChar);
    
    let rutSinDV = '';
    let digitoVerificador = '';
    
    if (esDigitoVerificador && rutLimpio.length > 1) {
      // Separar dígitos del dígito verificador
      rutSinDV = rutLimpio.slice(0, -1);
      digitoVerificador = ultimoChar;
    } else {
      // Si solo hay números, todos son parte del RUT
      rutSinDV = rutLimpio;
      digitoVerificador = '';
    }
    
    // Si no hay dígitos del RUT, solo retornar el dígito verificador si existe
    if (rutSinDV.length === 0) {
      return digitoVerificador;
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
          rut: 'Formato de RUT inválido.'
        }));
      } else {
        setErrores(prev => ({
          ...prev,
          rut: ''
        }));
      }
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

  // Función para manejar el cambio de fecha
  const manejarCambioFecha = (text: string) => {
    // Si el usuario está borrando, permitir borrar
    if (text.length < fechaNacimiento.length) {
      setFechaNacimiento(text);
      setErrores(prev => ({
        ...prev,
        fechaNacimiento: ''
      }));
      return;
    }
    
    // Si el texto ya tiene formato con barras, mantenerlo pero validar
    if (text.includes('/')) {
      // Verificar que el formato sea correcto
      const fechaPattern = /^(\d{1,2})\/(\d{1,2})\/(\d{1,4})?$/;
      const match = text.match(fechaPattern);
      
      if (match) {
        // Permitir el formato con barras mientras se escribe
        setFechaNacimiento(text);
        
        // Validar solo si está completo
        if (text.length === 10) {
          const dia = parseInt(match[1], 10);
          const mes = parseInt(match[2], 10);
          const año = parseInt(match[3], 10);
          
          // Validar rangos
          if (dia < 1 || dia > 31 || mes < 1 || mes > 12 || año < 1900 || año > new Date().getFullYear()) {
            setErrores(prev => ({
              ...prev,
              fechaNacimiento: 'Fecha inválida'
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
        return;
      }
    }
    
    // Si no tiene barras, formatear automáticamente
    const fechaFormateada = formatearFecha(text);
    setFechaNacimiento(fechaFormateada);
    
    // Validar formato de fecha solo si está completo
    const fechaPattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    if (fechaFormateada && fechaFormateada.length === 10) {
      const match = fechaFormateada.match(fechaPattern);
      if (match) {
        const dia = parseInt(match[1], 10);
        const mes = parseInt(match[2], 10);
        const año = parseInt(match[3], 10);
        
        // Validar rangos
        if (dia < 1 || dia > 31 || mes < 1 || mes > 12 || año < 1900 || año > new Date().getFullYear()) {
          setErrores(prev => ({
            ...prev,
            fechaNacimiento: 'Fecha inválida'
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
          fechaNacimiento: 'Formato inválido. Use: dd/mm/yyyy'
        }));
      }
    } else if (fechaFormateada.length > 0 && fechaFormateada.length < 10) {
      setErrores(prev => ({
        ...prev,
        fechaNacimiento: ''
      }));
    }
  };

  // Función para manejar el cambio de edad: solo números
  const manejarCambioEdad = (text: string) => {
    // Permitir solo números
    const edadFiltrada = text.replace(/[^0-9]/g, '');
    setEdad(edadFiltrada);
  };

  // Función para abrir el calendario
  const abrirCalendario = () => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      // Crear un input de tipo date para abrir el calendario
      const input = document.createElement('input');
      input.type = 'date';
      input.max = new Date().toISOString().split('T')[0];
      
      // Estilos para centrar el calendario en la pantalla
      input.style.position = 'fixed';
      input.style.top = '50%';
      input.style.left = '50%';
      input.style.transform = 'translate(-50%, -50%)';
      input.style.zIndex = '99999';
      input.style.opacity = '0';
      input.style.width = '1px';
      input.style.height = '1px';
      input.style.pointerEvents = 'none';
      
      // Si hay una fecha actual, establecerla
      if (fechaNacimiento && fechaNacimiento.length === 10) {
        const partes = fechaNacimiento.split('/');
        if (partes.length === 3) {
          const dia = partes[0].padStart(2, '0');
          const mes = partes[1].padStart(2, '0');
          const año = partes[2];
          input.value = `${año}-${mes}-${dia}`;
        }
      }
      
      input.onchange = (e: any) => {
        if (e.target.value) {
          const fecha = new Date(e.target.value + 'T00:00:00');
          const dia = String(fecha.getDate()).padStart(2, '0');
          const mes = String(fecha.getMonth() + 1).padStart(2, '0');
          const año = fecha.getFullYear();
          const fechaFormateada = `${dia}/${mes}/${año}`;
          setFechaNacimiento(fechaFormateada);
          setErrores(prev => ({
            ...prev,
            fechaNacimiento: ''
          }));
        }
        // Remover el input del DOM después de usarlo
        setTimeout(() => {
          if (input.parentNode) {
            input.parentNode.removeChild(input);
          }
        }, 100);
      };
      
      input.onblur = () => {
        // Remover el input del DOM si se cierra sin seleccionar
        setTimeout(() => {
          if (input.parentNode) {
            input.parentNode.removeChild(input);
          }
        }, 200);
      };
      
      // Agregar al DOM
      document.body.appendChild(input);
      
      // Usar requestAnimationFrame para asegurar que el input esté en el DOM antes de abrir
      requestAnimationFrame(() => {
        // Intentar usar showPicker si está disponible (navegadores modernos)
        // Esto abrirá el calendario centrado en la pantalla
        if (typeof (input as any).showPicker === 'function') {
          try {
            (input as any).showPicker();
          } catch (error) {
            // Si showPicker falla, usar click
            input.style.opacity = '1';
            input.style.width = 'auto';
            input.style.height = 'auto';
            input.style.pointerEvents = 'auto';
            input.click();
          }
        } else {
          // Si showPicker no está disponible, usar click
          input.style.opacity = '1';
          input.style.width = 'auto';
          input.style.height = 'auto';
          input.style.pointerEvents = 'auto';
          input.click();
        }
      });
    }
  };

  useEffect(() => {
    const inicializar = async () => {
      try {
        const rutGuardado = await AsyncStorage.getItem('rutUsuario');
        if (rutGuardado) {
          setRutUsuario(rutGuardado);
        } else {
          Alert.alert('Error', 'No se encontr� el RUT del usuario activo.');
        }
        // Limpiar posibles borradores previos
        await AsyncStorage.multiRemove(['nuevoHijoData', 'nuevoHijoHorario', 'nuevoHijoInforme']);
      } catch (error) {
        console.error('Error al preparar el formulario de hijo:', error);
      }
    };

    inicializar();
  }, []);

  const manejarGuardarHijo = async () => {
    // Validar formato de RUT
    const rutPattern = /^\d{1,2}\.\d{3}\.\d{3}-[0-9kK]$/;
    const rutValido = rutPattern.test(rut);
    
    // Validar formato de fecha
    const fechaPattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const fechaValida = fechaPattern.test(fechaNacimiento);
    
    const nuevosErrores = {
      nombres: !nombres ? 'Ingresa el nombre del hijo' : '',
      apellidos: !apellidos ? 'Ingresa el apellido' : '',
      rut: !rut ? 'Ingresa el RUT del hijo' : !rutValido ? 'Formato de RUT inválido.' : '',
      fechaNacimiento: !fechaNacimiento ? 'Ingresa la fecha de nacimiento' : !fechaValida ? 'Formato de fecha inválido. Use: dd/mm/yyyy' : '',
      edad: !edad ? 'Ingresa la edad' : '',
    };

    setErrores(nuevosErrores);

    if (Object.values(nuevosErrores).some((msg) => msg !== '')) {
      return;
    }

    if (!rutUsuario) {
      Alert.alert('Error', 'No se puede continuar sin el RUT del usuario.');
      return;
    }

    try {
      setLoading(true);

      // Normalizar el rutUsuario para guardarlo de forma consistente (sin espacios)
      const rutUsuarioNormalizado = rutUsuario ? rutUsuario.trim() : '';

      const payload: DatosHijoDraft = {
        nombres,
        apellidos,
        rut,
        fechaNacimiento,
        edad,
        rutUsuario: rutUsuarioNormalizado, // Guardar RUT sin espacios para consistencia
      };

      console.log('✅ Guardando borrador de hijo con rutUsuario normalizado:', {
        rutHijo: rut,
        rutUsuario: rutUsuarioNormalizado,
      });

      await AsyncStorage.setItem('nuevoHijoData', JSON.stringify(payload));

      Alert.alert('Datos guardados', 'Ahora agrega el horario del ni�o.');
      router.push('/(tabs)/apoderado/Agregar_Horario_hijo');
    } catch (error) {
      console.error('Error al guardar el borrador del hijo:', error);
      Alert.alert('Error', 'No se pudo guardar la informaci�n localmente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      <View style={styles.profileImageContainer}>
        <Image
          source={require('@/assets/images/user_icon.png')}
          style={styles.profileImage}
          contentFit="cover"
        />
      </View>

      <Text style={styles.title}>Agregar hijo</Text>

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
        style={[styles.input, errores.rut ? styles.inputError : null]}
        placeholder="RUT del hijo"
        value={rut}
        onChangeText={manejarCambioRUT}
        maxLength={12}
        keyboardType="numeric"
      />
      {errores.rut ? <Text style={styles.errorText}>{errores.rut}</Text> : null}

      <View style={styles.fechaContainer}>
        <TextInput
          style={[styles.input, styles.fechaInput]}
          placeholder="dd/mm/yyyy"
          value={fechaNacimiento}
          onChangeText={manejarCambioFecha}
          maxLength={10}
          keyboardType="numeric"
        />
        <Pressable
          style={styles.calendarButton}
          onPress={abrirCalendario}
        >
          <Ionicons name="calendar-outline" size={24} color="#127067" />
        </Pressable>
      </View>
      {errores.fechaNacimiento ? <Text style={styles.errorText}>{errores.fechaNacimiento}</Text> : null}

      <TextInput
        style={styles.input}
        placeholder="Edad"
        value={edad}
        keyboardType="numeric"
        onChangeText={manejarCambioEdad}
      />
      {errores.edad ? <Text style={styles.errorText}>{errores.edad}</Text> : null}

      <Pressable style={styles.button} onPress={manejarGuardarHijo} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Continuar</Text>}
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
    padding: 20,
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
  inputError: {
    borderColor: 'red',
    borderWidth: 1.5,
  },
  fechaContainer: {
    width: '90%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  fechaInput: {
    flex: 1,
    marginBottom: 0,
  },
  calendarButton: {
    marginLeft: 10,
    padding: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#127067',
    minWidth: 48,
    minHeight: 48,
  },
});
