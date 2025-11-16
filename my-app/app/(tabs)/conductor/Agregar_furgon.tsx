// app/(tabs)/conductor/Agregar_furgon.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import CryptoJS from 'crypto-js';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { makeShadow } from '@/utils/shadow';

const ENCRYPTION_SALT = 'VEHICULO_IMG_V1';

type FotoSeleccionada = {
  base64: string;
  mimeType: string;
  uri?: string;
};

export default function AgregarFurgonScreen() {
  const router = useRouter();
  useSyncRutActivo();

  const [patente, setPatente] = useState('');
  const [modelo, setModelo] = useState('');
  const [ano, setAno] = useState('');
  const [cupos, setCupos] = useState('');
  const [fotoSeleccionada, setFotoSeleccionada] = useState<FotoSeleccionada | null>(null);
  const [rutUsuario, setRutUsuario] = useState('');
  const [loading, setLoading] = useState(false);

  const [errores, setErrores] = useState({
    patente: '',
    modelo: '',
    ano: '',
    cupos: '',
    fotoFurgon: '',
  });

  const fotoPreviewUri = useMemo(() => {
    if (!fotoSeleccionada) return null;
    return `data:${fotoSeleccionada.mimeType};base64,${fotoSeleccionada.base64}`;
  }, [fotoSeleccionada]);

  useEffect(() => {
    const obtenerRutUsuario = async () => {
      try {
        const rutGuardado = await AsyncStorage.getItem('rutUsuario');
        if (rutGuardado) {
          setRutUsuario(rutGuardado);
        } else {
          Alert.alert('Error', 'No se encontró el RUT del usuario activo.');
        }
      } catch (error) {
        console.error('Error al obtener el RUT del usuario:', error);
      }
    };

    obtenerRutUsuario();
  }, []);

  const seleccionarFoto = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== ImagePicker.PermissionStatus.GRANTED) {
        Alert.alert('Permiso requerido', 'Otorga acceso a tu galería para cargar la foto del furgón.');
        return;
      }

      const resultado = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: true,
      });

      if (resultado.canceled || !resultado.assets?.length) {
        return;
      }

      const asset = resultado.assets[0];
      if (!asset.base64) {
        Alert.alert('Error', 'No se pudo leer la imagen seleccionada.');
        return;
      }

      setFotoSeleccionada({
        base64: asset.base64,
        mimeType: asset.mimeType || 'image/jpeg',
        uri: asset.uri,
      });
      setErrores((prev) => ({ ...prev, fotoFurgon: '' }));
    } catch (error) {
      console.error('Error al seleccionar foto:', error);
      Alert.alert('Error', 'No se pudo seleccionar la foto.');
    }
  };

  const manejarGuardarVehiculo = async () => {
    const cuposNumero = parseInt(cupos, 10);
    const nuevosErrores = {
      patente: !patente ? 'Ingresa la patente del vehículo' : '',
      modelo: !modelo ? 'Ingresa el modelo del vehículo' : '',
      ano: !ano ? 'Ingresa el año del vehículo' : '',
      cupos: !cupos ? 'Ingresa la cantidad de cupos' : 
             isNaN(cuposNumero) || cuposNumero < 1 || cuposNumero > 20 
             ? 'Los cupos deben ser un número entre 1 y 20' : '',
      fotoFurgon: !fotoSeleccionada ? 'Debes cargar una foto del furgón.' : '',
    };

    setErrores(nuevosErrores);
    if (Object.values(nuevosErrores).some((msg) => msg !== '')) {
      return;
    }

    if (!rutUsuario) {
      Alert.alert('Error', 'No se puede guardar el vehículo sin el RUT del usuario.');
      return;
    }

    try {
      setLoading(true);

      const vehiculoData: Record<string, unknown> = {
        patente: patente.trim().toUpperCase(),
        modelo: modelo.trim(),
        ano: ano.trim(),
        cupos: cuposNumero,
        rutUsuario,
        creadoEn: serverTimestamp(),
      };

      if (fotoSeleccionada) {
        const clave = `${rutUsuario}-${ENCRYPTION_SALT}`;
        vehiculoData.fotoCifrada = CryptoJS.AES.encrypt(fotoSeleccionada.base64, clave).toString();
        vehiculoData.fotoMimeType = fotoSeleccionada.mimeType;
      }

      await addDoc(collection(db, 'Vehiculos'), vehiculoData);

      Alert.alert('Listo', 'Vehículo agregado correctamente.');
      setPatente('');
      setModelo('');
      setAno('');
      setCupos('');
      setFotoSeleccionada(null);
      router.push('/(tabs)/conductor/perfil-conductor');
    } catch (error) {
      console.error('Error al guardar en Firebase:', error);
      Alert.alert('Error', 'No se pudo guardar la información del vehículo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={26} color="#127067" />
      </Pressable>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.avatarContainer}>
          {fotoPreviewUri ? (
            <Image source={{ uri: fotoPreviewUri }} style={styles.avatarImage} contentFit="cover" />
          ) : (
            <Ionicons name="person-circle-outline" size={58} color="#7a8a8a" />
          )}
        </View>

        <Text style={styles.title}>Datos Del Vehículo</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Patente"
            placeholderTextColor="#127067"
            value={patente}
            onChangeText={setPatente}
            autoCapitalize="characters"
          />
          {errores.patente ? <Text style={styles.errorText}>{errores.patente}</Text> : null}

          <TextInput
            style={styles.input}
            placeholder="Modelo"
            placeholderTextColor="#127067"
            value={modelo}
            onChangeText={setModelo}
          />
          {errores.modelo ? <Text style={styles.errorText}>{errores.modelo}</Text> : null}

          <TextInput
            style={styles.input}
            placeholder="Año"
            placeholderTextColor="#127067"
            value={ano}
            onChangeText={setAno}
            keyboardType="numeric"
            maxLength={4}
          />
          {errores.ano ? <Text style={styles.errorText}>{errores.ano}</Text> : null}

          <TextInput
            style={styles.input}
            placeholder="Cupos disponibles (1-20)"
            placeholderTextColor="#127067"
            value={cupos}
            onChangeText={setCupos}
            keyboardType="numeric"
            maxLength={2}
          />
          {errores.cupos ? <Text style={styles.errorText}>{errores.cupos}</Text> : null}

          <Pressable
            style={[styles.uploadBox, fotoPreviewUri && styles.uploadBoxFilled]}
            onPress={seleccionarFoto}
          >
            {fotoPreviewUri ? (
              <>
                <Image source={{ uri: fotoPreviewUri }} style={styles.uploadPreview} contentFit="cover" />
                <Pressable
                  style={styles.removeButton}
                  onPress={(event) => {
                    event.stopPropagation();
                    setFotoSeleccionada(null);
                  }}
                >
                  <Ionicons name="close" size={18} color="#FFFFFF" />
                </Pressable>
              </>
            ) : (
              <>
                <Ionicons name="image-outline" size={20} color="#127067" />
                <Text style={styles.uploadText}>Cargar foto del furgón</Text>
              </>
            )}
          </Pressable>
          {errores.fotoFurgon ? <Text style={styles.errorText}>{errores.fotoFurgon}</Text> : null}

          <Pressable
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={manejarGuardarVehiculo}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>Siguiente</Text>}
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 22,
    zIndex: 10,
    padding: 6,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
    paddingBottom: 40,
    backgroundColor: '#FFFFFF',
  },
  avatarContainer: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#E6EFEF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    color: '#127067',
    marginBottom: 32,
  },
  form: {
    width: '100%',
    maxWidth: 360,
    gap: 14,
  },
  input: {
    borderWidth: 1.6,
    borderColor: '#127067',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#0F3532',
    backgroundColor: '#F8FBFB',
  },
  uploadBox: {
    borderWidth: 1.6,
    borderColor: '#127067',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: '#F8FBFB',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  uploadBoxFilled: {
    padding: 0,
    borderStyle: 'solid',
  },
  uploadPreview: {
    width: '100%',
    height: 160,
    borderRadius: 12,
  },
  removeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 14,
    padding: 6,
  },
  uploadText: {
    color: '#127067',
    fontSize: 16,
    fontWeight: '500',
  },
  submitButton: {
    marginTop: 10,
    backgroundColor: '#127067',
    paddingVertical: 15,
    borderRadius: 25,
    alignItems: 'center',
    ...makeShadow(
      '0 6px 12px rgba(0,0,0,0.12)',
      {
        shadowColor: '#000000',
        shadowOpacity: 0.12,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
      },
    ),
  },
  submitButtonDisabled: {
    backgroundColor: '#8CB6B3',
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  errorText: {
    color: '#C0392B',
    fontSize: 13,
    marginLeft: 6,
  },
});
