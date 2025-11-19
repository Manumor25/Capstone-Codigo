import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Checkbox from 'expo-checkbox';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import React, { useEffect, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';

import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';

interface HorarioDia {
  id: string;
  etiqueta: string;
  asiste: boolean;
  horaEntrada: string;
  horaSalida: string;
}

interface DatosHijoDraft {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string;
  fechaNacimiento: string;
  edad: string;
  rutUsuario: string;
}

const DIAS_SEMANA: HorarioDia[] = [
  { id: 'lunes', etiqueta: 'Lunes', asiste: false, horaEntrada: '', horaSalida: '' },
  { id: 'martes', etiqueta: 'Martes', asiste: false, horaEntrada: '', horaSalida: '' },
  { id: 'miercoles', etiqueta: 'Miercoles', asiste: false, horaEntrada: '', horaSalida: '' },
  { id: 'jueves', etiqueta: 'Jueves', asiste: false, horaEntrada: '', horaSalida: '' },
  { id: 'viernes', etiqueta: 'Viernes', asiste: false, horaEntrada: '', horaSalida: '' },
];

// Función para generar opciones de horas desde 07:00 hasta 18:00 cada media hora
const generarOpcionesHoras = (): Array<{ label: string; value: string }> => {
  const opciones: Array<{ label: string; value: string }> = [];
  
  // Agregar opción vacía
  opciones.push({ label: 'Seleccionar hora', value: '' });
  
  // Generar horas desde las 7:00 (07:00) hasta las 18:00
  for (let hora = 7; hora <= 18; hora++) {
    // Para cada hora, generar :00 y :30
    for (let minuto = 0; minuto < 60; minuto += 30) {
      // Si llegamos a las 18:30, no incluirla (solo hasta 18:00)
      if (hora === 18 && minuto === 30) {
        break;
      }
      
      // Formatear hora en formato 24 horas (HH:MM)
      const hora24 = hora.toString().padStart(2, '0');
      const minutoStr = minuto.toString().padStart(2, '0');
      const valor = `${hora24}:${minutoStr}`;
      
      // Mostrar en formato 24 horas (HH:MM)
      const label = `${hora24}:${minutoStr}`;
      opciones.push({ label, value: valor });
    }
  }
  
  return opciones;
};

export default function EditarHorarioHijoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  useSyncRutActivo();

  const [datosHijo, setDatosHijo] = useState<DatosHijoDraft | null>(null);
  const [horarios, setHorarios] = useState<HorarioDia[]>(DIAS_SEMANA);
  const [cargando, setCargando] = useState(true);
  
  // Generar opciones de horas una sola vez
  const opcionesHoras = useMemo(() => generarOpcionesHoras(), []);

  useEffect(() => {
    const cargarHorario = async () => {
      try {
        const datosRaw = await AsyncStorage.getItem('editarHijoData');
        if (!datosRaw) {
          Alert.alert('Faltan datos', 'Primero actualiza la información del niño.');
          router.replace('/(tabs)/apoderado/Editar_hijo');
          return;
        }
        const datos: DatosHijoDraft = JSON.parse(datosRaw);
        setDatosHijo(datos);

        const hijoId = (params.id as string) || datos.id;
        if (!hijoId) {
          Alert.alert('Error', 'No se identificó el registro del niño.');
          router.replace('/(tabs)/apoderado/lista-hijos');
          return;
        }

        const hijoRef = doc(db, 'Hijos', hijoId);
        const snapshot = await getDoc(hijoRef);
        let base = [...DIAS_SEMANA];

        if (snapshot.exists()) {
          const data = snapshot.data() || {};
          const horarioAsistencia: any[] = Array.isArray(data.horarioAsistencia)
            ? data.horarioAsistencia
            : [];
          
          // Función para convertir hora de 12H a 24H si es necesario
          const convertirHoraSiNecesario = (hora: string): string => {
            if (!hora || hora.trim() === '') return hora;
            // Si ya está en formato 24H (HH:MM), retornar tal cual
            if (/^\d{2}:\d{2}$/.test(hora.trim())) {
              return hora.trim();
            }
            // Si está en formato 12H (ej: "7:30 AM" o "1:30 PM"), convertir
            const match12H = hora.match(/(\d{1,2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?)/i);
            if (match12H) {
              let horas = parseInt(match12H[1], 10);
              const minutos = match12H[2];
              const esPM = /p\.?\s*m\.?/i.test(match12H[3]);
              
              if (esPM && horas !== 12) {
                horas += 12;
              } else if (!esPM && horas === 12) {
                horas = 0;
              }
              
              return `${horas.toString().padStart(2, '0')}:${minutos}`;
            }
            // Si no coincide con ningún formato conocido, retornar tal cual
            return hora;
          };
          
          base = base.map((dia) => {
            const encontrado =
              horarioAsistencia.find(
                (item) =>
                  (item.id || item.dia || '').toString().toLowerCase() === dia.id.toLowerCase(),
              ) || {};
            return {
              ...dia,
              asiste: Boolean(encontrado.asiste ?? encontrado.horaEntrada),
              horaEntrada: convertirHoraSiNecesario(encontrado.horaEntrada || ''),
              horaSalida: convertirHoraSiNecesario(encontrado.horaSalida || ''),
            };
          });
        }

        const borradorHorario = await AsyncStorage.getItem('editarHijoHorario');
        if (borradorHorario) {
          try {
            const parsed: HorarioDia[] = JSON.parse(borradorHorario);
            if (Array.isArray(parsed) && parsed.length > 0) {
              base = DIAS_SEMANA.map((dia) => {
                const match = parsed.find((item) => item.id === dia.id);
                return match ? match : dia;
              });
            }
          } catch (error) {
            console.warn('No se pudo interpretar el horario guardado localmente:', error);
          }
        }

        setHorarios(base);
      } catch (error) {
        console.error('Error al cargar horario del niño:', error);
        Alert.alert('Error', 'No se pudo cargar el horario.');
        router.replace('/(tabs)/apoderado/lista-hijos');
      } finally {
        setCargando(false);
      }
    };

    cargarHorario();
  }, [params.id, router]);

  const actualizarAsistencia = (id: string, asiste: boolean) => {
    setHorarios((prev) =>
      prev.map((dia) => (dia.id === id ? { ...dia, asiste } : dia)),
    );
  };

  const actualizarHorario = (id: string, campo: 'horaEntrada' | 'horaSalida', valor: string) => {
    setHorarios((prev) =>
      prev.map((dia) => (dia.id === id ? { ...dia, [campo]: valor } : dia)),
    );
  };

  const manejarGuardar = async () => {
    const diasSeleccionados = horarios.filter((dia) => dia.asiste);

    if (diasSeleccionados.length === 0) {
      Alert.alert('Horario incompleto', 'Selecciona al menos un día y sus horarios.');
      return;
    }

    const diasConErrores = diasSeleccionados.filter(
      (dia) => !dia.horaEntrada.trim() || !dia.horaSalida.trim(),
    );

    if (diasConErrores.length > 0) {
      Alert.alert('Horario incompleto', 'Completa la hora de entrada y salida para cada día seleccionado.');
      return;
    }

    try {
      // Obtener el ID del hijo desde datosHijo o desde los parámetros
      const hijoId = datosHijo?.id || (params.id as string);
      if (!hijoId) {
        Alert.alert('Error', 'No se identificó el registro del niño.');
        router.replace('/(tabs)/apoderado/lista-hijos');
        return;
      }

      const horarioSeleccionado = diasSeleccionados.map((dia) => ({
        id: dia.id,
        etiqueta: dia.etiqueta,
        asiste: dia.asiste,
        horaEntrada: dia.horaEntrada,
        horaSalida: dia.horaSalida,
      }));

      const hijoRef = doc(db, 'Hijos', hijoId);
      
      await updateDoc(hijoRef, {
        horarioAsistencia: horarioSeleccionado,
        actualizadoEn: serverTimestamp(),
      });

      // Limpiar el borrador del horario de AsyncStorage
      await AsyncStorage.removeItem('editarHijoHorario').catch(() => {});

      Alert.alert('Éxito', 'El horario se actualizó correctamente.');
      router.replace('/(tabs)/apoderado/lista-hijos');
    } catch (error) {
      console.error('Error al guardar el horario:', error);
      Alert.alert('Error', 'No se pudo guardar el horario.');
    }
  };

  if (cargando) {
    return (
      <View style={styles.feedbackContainer}>
        <ActivityIndicator color="#127067" />
        <Text style={styles.feedbackText}>Cargando horario...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable 
        style={styles.backButton} 
        onPress={() => router.replace('/(tabs)/apoderado/perfil-apoderado')}
      >
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      <Text style={styles.title}>Editar horario</Text>
      <Text style={styles.subtitle}>Actualiza los días y horarios en que asiste al colegio.</Text>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {horarios.map((dia) => (
          <View key={dia.id} style={styles.dayCard}>
            <View style={styles.dayHeader}>
              <Checkbox
                value={dia.asiste}
                onValueChange={(value) => actualizarAsistencia(dia.id, value)}
                color={dia.asiste ? '#127067' : undefined}
              />
              <Text style={styles.dayLabel}>{dia.etiqueta}</Text>
            </View>
            {dia.asiste && (
              <View style={styles.timeInputs}>
                <View style={styles.timeGroup}>
                  <Text style={styles.timeLabel}>Entrada</Text>
                  <View style={styles.pickerContainer}>
                    <Picker
                      selectedValue={dia.horaEntrada}
                      onValueChange={(valor) => actualizarHorario(dia.id, 'horaEntrada', valor)}
                      style={styles.picker}
                      itemStyle={Platform.OS === 'ios' ? styles.pickerItem : undefined}
                    >
                      {opcionesHoras.map((opcion, index) => (
                        <Picker.Item
                          key={index}
                          label={opcion.label}
                          value={opcion.value}
                          color={opcion.value === '' ? '#999' : '#000'}
                        />
                      ))}
                    </Picker>
                  </View>
                </View>
                <View style={styles.timeGroup}>
                  <Text style={styles.timeLabel}>Salida</Text>
                  <View style={styles.pickerContainer}>
                    <Picker
                      selectedValue={dia.horaSalida}
                      onValueChange={(valor) => actualizarHorario(dia.id, 'horaSalida', valor)}
                      style={styles.picker}
                      itemStyle={Platform.OS === 'ios' ? styles.pickerItem : undefined}
                    >
                      {opcionesHoras.map((opcion, index) => (
                        <Picker.Item
                          key={index}
                          label={opcion.label}
                          value={opcion.value}
                          color={opcion.value === '' ? '#999' : '#000'}
                        />
                      ))}
                    </Picker>
                  </View>
                </View>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <Pressable style={styles.button} onPress={manejarGuardar}>
        <Text style={styles.buttonText}>Guardar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    padding: 5,
    zIndex: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#127067',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  dayCard: {
    borderWidth: 1,
    borderColor: '#127067',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    backgroundColor: '#F5F7F8',
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayLabel: {
    fontSize: 16,
    marginLeft: 10,
    color: '#127067',
    fontWeight: '600',
  },
  timeInputs: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 14,
  },
  timeGroup: {
    width: '45%',
    maxWidth: 160,
    marginRight: 12,
  },
  timeLabel: {
    fontSize: 14,
    color: '#555',
    marginBottom: 4,
    fontWeight: '500',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#127067',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  picker: {
    width: '100%',
    height: Platform.OS === 'ios' ? 150 : 50,
  },
  pickerItem: {
    fontSize: 16,
  },
  button: {
    backgroundColor: '#127067',
    paddingVertical: 12,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 30,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  feedbackContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 32,
  },
  feedbackText: {
    color: '#666',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 8,
  },
});
