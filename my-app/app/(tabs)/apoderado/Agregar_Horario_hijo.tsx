import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Checkbox from 'expo-checkbox';
import { useRouter } from 'expo-router';
import React, { useEffect, useState, useMemo } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';

interface HorarioDia {
  id: string;
  etiqueta: string;
  asiste: boolean;
  horaEntrada: string;
  horaSalida: string;
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

export default function AgregarHorarioHijoScreen() {
  const router = useRouter();
  useSyncRutActivo();

  const [horarios, setHorarios] = useState<HorarioDia[]>(DIAS_SEMANA);
  const [cargando, setCargando] = useState(true);
  
  // Generar opciones de horas una sola vez
  const opcionesHoras = useMemo(() => generarOpcionesHoras(), []);

  useEffect(() => {
    const verificarDatosPrevios = async () => {
      try {
        const hijoDraft = await AsyncStorage.getItem('nuevoHijoData');
        if (!hijoDraft) {
          Alert.alert('Faltan datos', 'Primero completa la información del niño.');
          router.replace('/(tabs)/apoderado/Agregar-hijo');
          return;
        }
        const horarioDraft = await AsyncStorage.getItem('nuevoHijoHorario');
        if (horarioDraft) {
          const parsed: HorarioDia[] = JSON.parse(horarioDraft);
          setHorarios(parsed);
        }
      } catch (error) {
        console.error('Error al recuperar borradores de horario:', error);
      } finally {
        setCargando(false);
      }
    };

    verificarDatosPrevios();
  }, [router]);

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
      await AsyncStorage.setItem('nuevoHijoHorario', JSON.stringify(horarios));
      router.push('/(tabs)/apoderado/Agregar-informe_hijo');
    } catch (error) {
      console.error('Error al guardar el horario del niño:', error);
      Alert.alert('Error', 'No se pudo guardar el horario localmente.');
    }
  };

  if (cargando) {
    return (
      <View style={styles.feedbackContainer}>
        <Text style={styles.feedbackText}>Preparando formulario...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      <Text style={styles.title}>Horario del niño</Text>
      <Text style={styles.subtitle}>Indica los días y horarios en que asiste al colegio.</Text>

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
        <Text style={styles.buttonText}>Continuar</Text>
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
  },
});
