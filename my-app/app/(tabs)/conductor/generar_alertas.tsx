import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableHighlight,
  StyleSheet,
  Alert,
  Pressable,
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
  const [rutConductor, setRutConductor] = useState('');
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
    if (!descripcion || !tipoAlerta || !patenteSeleccionada) {
      Alert.alert('Error', 'Completa todos los campos.');
      return;
    }

    try {
      const listaRef = collection(db, 'lista_pasajeros');
      const pasajerosSnap = await getDocs(
        query(
          listaRef,
          where('patenteFurgon', '==', patenteSeleccionada),
          where('rutConductor', '==', rutConductor),
        ),
      );

      const destinatarios = new Map<
        string,
        { nombreApoderado: string; rutApoderado: string }
      >();

      pasajerosSnap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const rutApoderado = (data.rutApoderado || '').toString().trim();
        if (!rutApoderado) {
          return;
        }
        if (!destinatarios.has(rutApoderado)) {
          destinatarios.set(rutApoderado, {
            rutApoderado,
            nombreApoderado: (data.nombreApoderado || '').toString().trim(),
          });
        }
      });

      if (destinatarios.size === 0) {
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

      await Promise.all(
        Array.from(destinatarios.values()).map((destinatario) =>
          addDoc(alertasRef, {
            descripcion: descripcionLimpia,
            tipoAlerta: tipoLimpio,
            fecha: fechaLocal,
            creadoEn: serverTimestamp(),
            patenteFurgon: patenteSeleccionada,
            rutConductor,
            rutDestinatario: destinatario.rutApoderado,
            parametros: {
              patenteFurgon: patenteSeleccionada,
            },
            origen: 'conductor',
          }),
        ),
      );

      Alert.alert(
        'Éxito',
        `Alerta enviada a ${destinatarios.size} apoderado(s).`,
      );
      setDescripcion('');
      setTipoAlerta('');
      if (furgones.length !== 1) {
        setPatenteSeleccionada('');
      }
      router.back();
    } catch (error) {
      console.error('Error al guardar alerta:', error);
      Alert.alert('Error', 'No se pudo guardar la alerta.');
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

        <TouchableHighlight style={styles.button} onPress={guardarAlerta} underlayColor="#0c5c4e">
          <Text style={styles.buttonText}>Guardar Alerta</Text>
        </TouchableHighlight>
      </View>
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
  buttonText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
});
