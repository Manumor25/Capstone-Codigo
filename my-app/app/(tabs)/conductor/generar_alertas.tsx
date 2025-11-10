import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableHighlight,
  StyleSheet,
  Alert,
  Pressable,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { addDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import { Picker } from '@react-native-picker/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function GenerarAlerta() {
  const [descripcion, setDescripcion] = useState('');
  const [tipoAlerta, setTipoAlerta] = useState('');
  const [patenteSeleccionada, setPatenteSeleccionada] = useState('');
  const [furgones, setFurgones] = useState<{ id: string; patente: string; nombre: string }[]>([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [rutConductor, setRutConductor] = useState('');
  const [mostrarExito, setMostrarExito] = useState(false);
  const [mensajeExito, setMensajeExito] = useState('');
  const router = useRouter();
  useSyncRutActivo();

  useEffect(() => {
    const cargarFurgones = async () => {
      try {
        const rutGuardado = (await AsyncStorage.getItem('rutUsuario')) || '';
        if (!rutGuardado) {
          Alert.alert('Error', 'No se encontró el RUT del usuario activo.');
          return;
        }
        setRutConductor(rutGuardado);

        const furgonesRef = collection(db, 'Furgones');
        const q = query(furgonesRef, where('rutUsuario', '==', rutGuardado));
        const snapshot = await getDocs(q);
        const lista = snapshot.docs
          .map((docSnap) => {
            const data = docSnap.data() || {};
            const patente = data.patente?.toString().trim();
            if (!patente) {
              return null;
            }
            return {
              id: docSnap.id,
              patente,
              nombre: data.nombre?.toString() || 'Furgón',
            };
          })
          .filter(Boolean) as { id: string; patente: string; nombre: string }[];
        setFurgones(lista);
        if (lista.length === 1) {
          setPatenteSeleccionada(lista[0].patente);
        }
      } catch (error) {
        console.error('Error al cargar furgones del conductor:', error);
        Alert.alert('Error', 'No se pudieron obtener los furgones.');
      } finally {
        setCargando(false);
      }
    };

    cargarFurgones();
  }, []);

  const guardarAlerta = async () => {
    console.log('🔵 Botón presionado - guardarAlerta llamado');
    console.log('Estado actual:', { descripcion, tipoAlerta, patenteSeleccionada, guardando });
    
    if (!descripcion || !tipoAlerta || !patenteSeleccionada) {
      console.log('❌ Campos incompletos');
      Alert.alert('Error', 'Completa todos los campos.');
      return;
    }

    if (guardando) {
      console.log('⚠️ Ya se está guardando una alerta, esperando...');
      return;
    }

    console.log('✅ Iniciando proceso de guardado...');
    setGuardando(true);

    try {
      console.log('=== INICIANDO GENERACIÓN DE ALERTA ===');
      console.log('Patente seleccionada:', patenteSeleccionada);
      console.log('RUT Conductor:', rutConductor);
      
      // Normalizar patente para búsqueda consistente
      const patenteNormalizada = patenteSeleccionada.trim().toUpperCase();
      console.log('Patente normalizada:', patenteNormalizada);
      
      const listaRef = collection(db, 'lista_pasajeros');
      const pasajerosSnap = await getDocs(
        query(
          listaRef,
          where('rutConductor', '==', rutConductor),
        ),
      );

      console.log('Total pasajeros encontrados:', pasajerosSnap.docs.length);

      const destinatarios = new Map<
        string,
        { nombreApoderado: string; rutApoderado: string }
      >();

      // Filtrar pasajeros que coincidan con la patente normalizada
      pasajerosSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const patenteEnLista = (data.patenteFurgon || '').toString().trim().toUpperCase();
        
        console.log('Comparando patente:', {
          patenteEnLista,
          patenteNormalizada,
          coincide: patenteEnLista === patenteNormalizada,
        });
        
        // Solo incluir si la patente coincide
        if (patenteEnLista !== patenteNormalizada) {
          return;
        }
        
        const rutApoderado = (data.rutApoderado || '').toString().trim();
        if (!rutApoderado) {
          console.log('RUT apoderado vacío, saltando...');
          return;
        }
        if (!destinatarios.has(rutApoderado)) {
          destinatarios.set(rutApoderado, {
            rutApoderado,
            nombreApoderado: (data.nombreApoderado || '').toString().trim(),
          });
          console.log('Apoderado agregado:', {
            rut: rutApoderado,
            nombre: data.nombreApoderado,
          });
        }
      });

      console.log('Total destinatarios encontrados:', destinatarios.size);

      if (destinatarios.size === 0) {
        console.log('⚠ No se encontraron apoderados');
        setGuardando(false);
        Alert.alert(
          'Sin apoderados',
          'No se encontraron apoderados asociados a este furgón.',
        );
        return;
      }

      const alertasRef = collection(db, 'Alertas');
      const descripcionLimpia = descripcion.trim();
      const tipoLimpio = tipoAlerta.trim() || 'general';
      const fechaLocal = new Date().toISOString();

      console.log('Guardando alertas para', destinatarios.size, 'apoderados...');
      
      const alertasCreadas = await Promise.all(
        Array.from(destinatarios.values()).map(async (destinatario) => {
          const alertaData = {
            descripcion: descripcionLimpia,
            tipoAlerta: tipoLimpio,
            fecha: fechaLocal,
            creadoEn: serverTimestamp(),
            patenteFurgon: patenteNormalizada,
            rutConductor: rutConductor.trim(),
            rutDestinatario: destinatario.rutApoderado.trim(),
            parametros: {
              patenteFurgon: patenteNormalizada,
            },
            origen: 'conductor',
          };
          
          const rutDestinatarioFinal = destinatario.rutApoderado.trim();
          console.log('📝 Guardando alerta para:', {
            rutDestinatarioOriginal: destinatario.rutApoderado,
            rutDestinatarioFinal,
            rutDestinatarioNormalizado: rutDestinatarioFinal.replace(/[^0-9kK]/g, '').toUpperCase(),
            patente: patenteNormalizada,
          });
          
          // Asegurarse de que el RUT se guarde exactamente como está en lista_pasajeros
          alertaData.rutDestinatario = rutDestinatarioFinal;
          
          const docRef = await addDoc(alertasRef, alertaData);
          console.log('✓ Alerta creada con ID:', docRef.id);
          console.log('✓ Datos guardados:', {
            rutDestinatario: alertaData.rutDestinatario,
            patenteFurgon: alertaData.patenteFurgon,
            tipoAlerta: alertaData.tipoAlerta,
          });
          return docRef.id;
        }),
      );

      console.log('✓ Todas las alertas guardadas:', alertasCreadas.length);
      console.log('=== ALERTA GENERADA EXITOSAMENTE ===');

      // Limpiar campos antes de mostrar el mensaje
      setDescripcion('');
      setTipoAlerta('');
      if (furgones.length !== 1) {
        setPatenteSeleccionada('');
      }

      // Resetear estado de guardando
      setGuardando(false);

      // Mostrar mensaje de confirmación usando Modal
      console.log('📢 Mostrando mensaje de confirmación...');
      setMensajeExito(`Alerta enviada a ${destinatarios.size} apoderado(s).`);
      setMostrarExito(true);
      
      console.log('📢 Mensaje de confirmación mostrado');
    } catch (error) {
      console.error('✗ Error al guardar alerta:', error);
      console.error('Detalles del error:', error);
      setGuardando(false);
      Alert.alert(
        'Error',
        `No se pudo guardar la alerta: ${error instanceof Error ? error.message : 'Error desconocido'}`,
        [{ text: 'OK' }],
        { cancelable: false }
      );
    }
  };

  return (
    <View style={styles.container}>
      {/* Header con botón de volver */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#127067" />
        </Pressable>
        <Text style={styles.title}>Generar Alerta</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <Text style={styles.label}>Descripción</Text>
        <TextInput
          style={styles.input}
          placeholder="Escribe la descripción..."
          value={descripcion}
          onChangeText={setDescripcion}
        />

        <Text style={styles.label}>Tipo de Alerta</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={tipoAlerta}
          onValueChange={(itemValue) => setTipoAlerta(itemValue)}
          style={styles.picker}
        >
          <Picker.Item label="Selecciona un tipo..." value="" />
          <Picker.Item label="Tráfico" value="trafico" />
          <Picker.Item label="Vehicular" value="vehicular" />
          <Picker.Item label="Problemas niño" value="problemas niño" />
          <Picker.Item label="Demora colegio" value="demora colegio" />
        </Picker>
      </View>

      <Text style={styles.label}>Furgón asociado</Text>
      <View style={styles.pickerContainer}>
        <Picker
          enabled={!cargando && furgones.length > 0}
          selectedValue={patenteSeleccionada}
          onValueChange={(itemValue) => setPatenteSeleccionada(itemValue)}
          style={styles.picker}
        >
          <Picker.Item
            label={
              cargando
                ? 'Cargando furgones...'
                : furgones.length === 0
                ? 'No tienes furgones registrados'
                : 'Selecciona un furgón...'
            }
            value=""
          />
          {furgones.map((furgon) => (
            <Picker.Item
              key={furgon.id}
              label={`${furgon.patente} · ${furgon.nombre}`}
              value={furgon.patente}
            />
          ))}
        </Picker>
      </View>

        <TouchableHighlight 
          style={[styles.button, guardando && styles.buttonDisabled]} 
          onPress={() => {
            console.log('🔴 Botón presionado - onPress ejecutado');
            guardarAlerta();
          }} 
          underlayColor="#0c5c4e"
          disabled={guardando}
        >
          <Text style={styles.buttonText}>
            {guardando ? 'Guardando...' : 'Guardar Alerta'}
          </Text>
        </TouchableHighlight>
      </View>

      {/* Modal de éxito */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={mostrarExito}
        onRequestClose={() => {
          setMostrarExito(false);
          router.back();
        }}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => {
            setMostrarExito(false);
            router.back();
          }}
        >
          <Pressable 
            style={styles.modalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <Ionicons name="checkmark-circle" size={64} color="#127067" style={styles.modalIcon} />
            <Text style={styles.modalTitle}>Alerta generada!</Text>
            <Text style={styles.modalMessage}>{mensajeExito}</Text>
            <TouchableHighlight
              style={styles.modalButton}
              onPress={() => {
                setMostrarExito(false);
                router.back();
              }}
              underlayColor="#0c5c4e"
            >
              <Text style={styles.modalButtonText}>OK</Text>
            </TouchableHighlight>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7F8',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#127067',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  label: {
    fontSize: 16,
    color: '#333',
    marginTop: 10,
  },
  input: {
    backgroundColor: '#fff',
    borderColor: '#127067',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 5,
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderColor: '#127067',
    borderWidth: 1,
    borderRadius: 10,
    marginTop: 5,
  },
  picker: {
    height: 50,
    width: '100%',
    color: '#333',
  },
  button: {
    backgroundColor: '#127067',
    paddingVertical: 14,
    borderRadius: 20,
    marginTop: 30,
  },
  buttonDisabled: {
    backgroundColor: '#999',
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 30,
    width: '85%',
    maxWidth: 400,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalIcon: {
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#127067',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalButton: {
    backgroundColor: '#127067',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 20,
    marginTop: 10,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
