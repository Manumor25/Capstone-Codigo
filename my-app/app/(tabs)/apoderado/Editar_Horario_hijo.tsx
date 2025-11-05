import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Checkbox from 'expo-checkbox';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
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

export default function EditarHorarioHijoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  useSyncRutActivo();

  const [datosHijo, setDatosHijo] = useState<DatosHijoDraft | null>(null);
  const [horarios, setHorarios] = useState<HorarioDia[]>(DIAS_SEMANA);
  const [cargando, setCargando] = useState(true);

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
          base = base.map((dia) => {
            const encontrado =
              horarioAsistencia.find(
                (item) =>
                  (item.id || item.dia || '').toString().toLowerCase() === dia.id.toLowerCase(),
              ) || {};
            return {
              ...dia,
              asiste: Boolean(encontrado.asiste ?? encontrado.horaEntrada),
              horaEntrada: encontrado.horaEntrada || '',
              horaSalida: encontrado.horaSalida || '',
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

  // Función para formatear hora automáticamente (HH:MM)
  const formatearHora = (text: string): string => {
    // Remover todo excepto números
    let numeros = text.replace(/[^0-9]/g, '');
    
    // Si no hay nada, retornar vacío
    if (numeros.length === 0) {
      return '';
    }
    
    // Limitar a máximo 4 dígitos (HHMM)
    if (numeros.length > 4) {
      numeros = numeros.slice(0, 4);
    }
    
    // Formatear según la longitud
    if (numeros.length <= 2) {
      // Si tiene 1 o 2 dígitos, solo mostrar los números
      return numeros;
    } else {
      // Si tiene 3 o 4 dígitos, agregar los dos puntos
      // Formato: HH:MM
      const horas = numeros.slice(0, 2);
      const minutos = numeros.slice(2);
      return horas + ':' + minutos;
    }
  };

  const actualizarHorario = (id: string, campo: 'horaEntrada' | 'horaSalida', valor: string) => {
    // Formatear la hora automáticamente
    const horaFormateada = formatearHora(valor);
    
    setHorarios((prev) =>
      prev.map((dia) => (dia.id === id ? { ...dia, [campo]: horaFormateada } : dia)),
    );
  };

  const manejarContinuar = async () => {
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
      await AsyncStorage.setItem('editarHijoHorario', JSON.stringify(horarios));
      router.push({
        pathname: '/(tabs)/apoderado/Editar_informe_hijo',
        params: { id: datosHijo?.id || params.id?.toString() || '' },
      });
    } catch (error) {
      console.error('Error al guardar el horario editado:', error);
      Alert.alert('Error', 'No se pudo guardar el horario localmente.');
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
      <Pressable style={styles.backButton} onPress={() => router.back()}>
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
                  <TextInput
                    style={styles.timeInput}
                    placeholder="HH:MM"
                    value={dia.horaEntrada}
                    onChangeText={(texto) => actualizarHorario(dia.id, 'horaEntrada', texto)}
                    keyboardType="numeric"
                    maxLength={5}
                  />
                </View>
                <View style={styles.timeGroup}>
                  <Text style={styles.timeLabel}>Salida</Text>
                  <TextInput
                    style={styles.timeInput}
                    placeholder="HH:MM"
                    value={dia.horaSalida}
                    onChangeText={(texto) => actualizarHorario(dia.id, 'horaSalida', texto)}
                    keyboardType="numeric"
                    maxLength={5}
                  />
                </View>
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <Pressable style={styles.button} onPress={manejarContinuar}>
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
    justifyContent: 'space-between',
    marginTop: 14,
  },
  timeGroup: {
    flex: 1,
    marginRight: 8,
  },
  timeLabel: {
    fontSize: 14,
    color: '#555',
    marginBottom: 4,
  },
  timeInput: {
    borderWidth: 1,
    borderColor: '#127067',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
