import React, { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CryptoJS from 'crypto-js';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';

import { readAsStringAsync } from '@/utils/read-file';
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

const ENCRYPTION_SALT = 'RUTA_SEGURA_V1';

export default function EditarInformeHijoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  useSyncRutActivo();

  const [datosHijo, setDatosHijo] = useState<DatosHijoDraft | null>(null);
  const [horario, setHorario] = useState<HorarioDia[]>([]);
  const [descripcion, setDescripcion] = useState('');
  const [pdfNombre, setPdfNombre] = useState('');
  const [pdfCifrado, setPdfCifrado] = useState('');
  const [pdfActualNombre, setPdfActualNombre] = useState('');
  const [pdfActualCifrado, setPdfActualCifrado] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const [datosRaw, horarioRaw] = await Promise.all([
          AsyncStorage.getItem('editarHijoData'),
          AsyncStorage.getItem('editarHijoHorario'),
        ]);

        if (!datosRaw) {
          Alert.alert('Faltan datos', 'Primero actualiza la información del niño.');
          router.replace('/(tabs)/apoderado/perfil-apoderado');
          return;
        }

        const datos: DatosHijoDraft = JSON.parse(datosRaw);
        setDatosHijo(datos);

        if (horarioRaw) {
          try {
            const parsed: HorarioDia[] = JSON.parse(horarioRaw);
            if (Array.isArray(parsed)) {
              setHorario(parsed);
            }
          } catch (error) {
            console.warn('No se pudo interpretar el horario guardado:', error);
          }
        }

        const hijoId = (params.id as string) || datos.id;
        if (!hijoId) {
          Alert.alert('Error', 'No se identificó el registro del niño.');
          router.replace('/(tabs)/apoderado/lista-hijos');
          return;
        }

        const snapshot = await getDoc(doc(db, 'Hijos', hijoId));
        if (snapshot.exists()) {
          const data = snapshot.data() || {};
          setDescripcion(data.descripcionFichaMedica || '');
          if (data.fichaMedica?.nombreArchivo) {
            setPdfActualNombre(data.fichaMedica.nombreArchivo);
          }
          if (data.fichaMedica?.contenidoCifrado) {
            setPdfActualCifrado(data.fichaMedica.contenidoCifrado);
          }
        }
      } catch (error) {
        console.error('Error al cargar información del niño:', error);
        Alert.alert('Error', 'No se pudo cargar la información actual.');
        router.replace('/(tabs)/apoderado/lista-hijos');
      } finally {
        setCargando(false);
      }
    };

    cargarDatos();
  }, [params.id, router]);

  const seleccionarPdf = async () => {
    try {
      const resultado = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (resultado.canceled || !resultado.assets?.length) {
        return;
      }

      const asset = resultado.assets[0];
      const fileCopyUri = (asset as any)?.fileCopyUri as string | undefined;
      const uri = fileCopyUri ?? asset.uri ?? null;

      if (!uri) {
        Alert.alert('Error', 'No se pudo acceder al archivo seleccionado.');
        return;
      }

      if (!datosHijo) {
        Alert.alert('Error', 'No se encontraron los datos del niño.');
        return;
      }

      const base64 = await readAsStringAsync(uri, {
        encoding: 'base64',
      });

      const clave = `${datosHijo.rutUsuario || 'RUT'}-${ENCRYPTION_SALT}`;
      const cifrado = CryptoJS.AES.encrypt(base64, clave).toString();

      setPdfNombre(asset.name || 'ficha.pdf');
      setPdfCifrado(cifrado);
      Alert.alert('Documento listo', 'La ficha se cifró correctamente.');
    } catch (error) {
      console.error('Error al seleccionar o cifrar el PDF:', error);
      Alert.alert('Error', 'No se pudo preparar el PDF.');
    }
  };

  const manejarGuardar = async () => {
    if (!datosHijo) {
      Alert.alert('Error', 'No se encontraron los datos del niño.');
      return;
    }

    const horarioSeleccionado = horario
      .filter((dia) => dia.asiste)
      .map((dia) => ({
        id: dia.id,
        etiqueta: dia.etiqueta,
        asiste: dia.asiste,
        horaEntrada: dia.horaEntrada,
        horaSalida: dia.horaSalida,
      }));

    if (horarioSeleccionado.length === 0) {
      Alert.alert('Horario incompleto', 'Selecciona al menos un día con sus horarios.');
      return;
    }

    const nombreArchivoFinal = pdfNombre || pdfActualNombre;
    const contenidoCifradoFinal = pdfCifrado || pdfActualCifrado;

    if (!contenidoCifradoFinal) {
      Alert.alert('Ficha faltante', 'Debes adjuntar la ficha médica.');
      return;
    }

    try {
      const hijoId = datosHijo.id;
      const hijoRef = doc(db, 'Hijos', hijoId);

      await updateDoc(hijoRef, {
        nombres: datosHijo.nombres,
        apellidos: datosHijo.apellidos,
        rut: datosHijo.rut,
        fechaNacimiento: datosHijo.fechaNacimiento,
        edad: datosHijo.edad,
        rutUsuario: datosHijo.rutUsuario,
        descripcionFichaMedica: descripcion,
        horarioAsistencia: horarioSeleccionado,
        fichaMedica: {
          nombreArchivo: nombreArchivoFinal,
          contenidoCifrado: contenidoCifradoFinal,
        },
        actualizadoEn: serverTimestamp(),
      });

      await AsyncStorage.multiRemove(['editarHijoData', 'editarHijoHorario', 'editarHijoInforme', 'editarHijoId']);

      Alert.alert('Éxito', 'La información del niño se actualizó correctamente.');
      router.replace('/(tabs)/apoderado/lista-hijos');
    } catch (error) {
      console.error('Error al actualizar la información del niño:', error);
      Alert.alert('Error', 'No se pudieron guardar los cambios.');
    }
  };

  if (cargando) {
    return (
      <View style={styles.feedbackContainer}>
        <ActivityIndicator color="#127067" />
        <Text style={styles.feedbackText}>Cargando información...</Text>
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

      <View style={styles.avatarContainer}>
        <Image
          source={require('@/assets/images/user_icon.png')}
          style={styles.avatar}
          contentFit="cover"
        />
      </View>
      <Text style={styles.title}>Editar ficha médica</Text>

      <TextInput
        style={styles.input}
        placeholder="Descripción médica"
        value={descripcion}
        onChangeText={setDescripcion}
        multiline
      />

      <Pressable style={styles.uploadButton} onPress={seleccionarPdf}>
        <Ionicons name="document-text-outline" size={22} color="#127067" />
        <Text style={styles.uploadText}>{pdfNombre || pdfActualNombre || 'Seleccionar ficha médica'}</Text>
      </Pressable>

      <Pressable style={styles.saveButton} onPress={manejarGuardar}>
        <Text style={styles.saveText}>Guardar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    paddingHorizontal: 24,
    paddingTop: 70,
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    padding: 5,
  },
  avatarContainer: {
    alignSelf: 'center',
    backgroundColor: '#e6e6e6',
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 50,
    height: 50,
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#127067',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#127067',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
    backgroundColor: '#F8FBFB',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#127067',
    borderRadius: 12,
    paddingVertical: 14,
    backgroundColor: '#F8FBFB',
    marginBottom: 30,
    gap: 10,
  },
  uploadText: {
    color: '#127067',
    fontSize: 16,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#127067',
    paddingVertical: 14,
    borderRadius: 22,
    alignItems: 'center',
    marginBottom: 30,
  },
  saveText: {
    color: '#FFFFFF',
    fontSize: 18,
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
