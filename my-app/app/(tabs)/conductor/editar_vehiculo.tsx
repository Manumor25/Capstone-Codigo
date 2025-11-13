import React, { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
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
import { db } from '@/firebaseConfig';
import { collection, doc, updateDoc, getDocs, query, where, serverTimestamp, writeBatch } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { makeShadow } from '@/utils/shadow';

export default function EditarVehiculoScreen() {
  const router = useRouter();
  useSyncRutActivo();
  const params = useLocalSearchParams();

  const [patente, setPatente] = useState(params.patente?.toString() || '');
  const [modelo, setModelo] = useState(params.modelo?.toString() || '');
  const [ano, setAno] = useState(params.ano?.toString() || '');
  const [rutUsuario, setRutUsuario] = useState('');
  const [vehiculoId, setVehiculoId] = useState(params.id?.toString() || '');
  const [loading, setLoading] = useState(false);
  const [cargandoDatos, setCargandoDatos] = useState(false);

  const [errores, setErrores] = useState({
    patente: '',
    modelo: '',
    ano: '',
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

  // 🔹 Validar año
  const validarAno = (ano: string) => {
    const añoNum = parseInt(ano);
    return !isNaN(añoNum) && añoNum >= 1900 && añoNum <= new Date().getFullYear() + 1;
  };

  // 🔹 Actualizar vehículo en Firestore
  const manejarActualizarVehiculo = async () => {
    const nuevosErrores = {
      patente: !patente ? 'Ingresa la patente del vehículo' : '',
      modelo: !modelo ? 'Ingresa el modelo del vehículo' : '',
      ano: !ano ? 'Ingresa el año del vehículo' : !validarAno(ano) ? 'Ingresa un año válido' : '',
    };

    setErrores(nuevosErrores);

    if (Object.values(nuevosErrores).some((msg) => msg !== '')) return;

    if (!rutUsuario || !vehiculoId) {
      Alert.alert('Error', 'No se puede actualizar el vehículo sin los datos necesarios.');
      return;
    }

    try {
      setLoading(true);

      const patenteNormalizada = patente.toUpperCase().trim();
      const patenteAnterior = params.patente?.toString().toUpperCase().trim() || '';

      // 1. Actualizar en la colección Vehiculos
      const vehiculoRef = doc(db, 'Vehiculos', vehiculoId);
      
      await updateDoc(vehiculoRef, {
        patente: patenteNormalizada,
        modelo: modelo.trim(),
        ano: ano.trim(),
        rutUsuario,
        actualizadoEn: serverTimestamp(),
      });

      // 2. Si el vehículo está promocionado (existe en Furgones), también actualizar allí
      try {
        const furgonesRef = collection(db, 'Furgones');
        let queryFurgones;
        
        // Buscar por patente anterior si cambió, o por patente actual
        if (patenteAnterior && patenteAnterior !== patenteNormalizada) {
          queryFurgones = query(furgonesRef, where('patente', '==', patenteAnterior));
        } else {
          queryFurgones = query(furgonesRef, where('patente', '==', patenteNormalizada));
        }
        
        const furgonesSnapshot = await getDocs(queryFurgones);
        
        if (!furgonesSnapshot.empty) {
          // Actualizar todos los documentos de Furgones que coincidan
          const batch = writeBatch(db);
          furgonesSnapshot.docs.forEach((docSnap) => {
            const furgonRef = doc(db, 'Furgones', docSnap.id);
            batch.update(furgonRef, {
              patente: patenteNormalizada,
              modelo: modelo.trim(),
              ano: ano.trim(),
              actualizadoEn: serverTimestamp(),
            });
          });
          await batch.commit();
          console.log('✅ Furgones actualizados:', furgonesSnapshot.docs.length);
        }
      } catch (errorFurgones) {
        console.warn('⚠️ No se pudieron actualizar los Furgones (puede que no esté promocionado):', errorFurgones);
        // No es crítico si falla, el vehículo ya se actualizó
      }

      Alert.alert('✅ Éxito', 'Vehículo actualizado correctamente.');
      router.back();
    } catch (error) {
      console.error('❌ Error al actualizar en Firebase:', error);
      Alert.alert('Error', 'No se pudo actualizar la información del vehículo.');
    } finally {
      setLoading(false);
    }
  };

  const handleVolver = () => {
    if (router.canGoBack?.()) {
      router.back();
    } else {
      router.replace('/(tabs)/conductor/lista_vehiculos');
    }
  };

  return (
    <View style={styles.container}>
      {/* Header con título y botón de volver */}
      <View style={styles.header}>
        <Pressable style={styles.backButtonHeader} onPress={handleVolver}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </Pressable>
        <Text style={styles.headerTitle}>Editar Datos Vehículo</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Imagen de vehículo */}
        <View style={styles.vehicleImageContainer}>
          <Image
            source={require('@/assets/images/truck_icon.png')}
            style={styles.vehicleImage}
            contentFit="contain"
          />
        </View>

        {/* Campos del formulario */}
        <View style={styles.formContainer}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Patente</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa la patente"
              value={patente}
              onChangeText={setPatente}
              autoCapitalize="characters"
            />
            {errores.patente ? <Text style={styles.errorText}>{errores.patente}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Modelo</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa el modelo"
              value={modelo}
              onChangeText={setModelo}
            />
            {errores.modelo ? <Text style={styles.errorText}>{errores.modelo}</Text> : null}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Año</Text>
            <TextInput
              style={styles.input}
              placeholder="Ingresa el año"
              value={ano}
              onChangeText={setAno}
              keyboardType="numeric"
              maxLength={4}
            />
            {errores.ano ? <Text style={styles.errorText}>{errores.ano}</Text> : null}
          </View>
        </View>

        {/* Botón Actualizar */}
        <Pressable style={styles.button} onPress={manejarActualizarVehiculo} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Actualizar</Text>
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
  header: {
    width: '100%',
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: '#127067',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  backButtonHeader: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    flex: 1,
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    alignItems: 'center',
    paddingTop: 40,
  },
  vehicleImageContainer: {
    backgroundColor: '#e6e6e6',
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
  },
  vehicleImage: {
    width: 60,
    height: 60,
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
});
