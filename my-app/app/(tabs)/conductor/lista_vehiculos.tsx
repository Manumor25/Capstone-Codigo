import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Pressable,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { db } from '@/firebaseConfig';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { makeShadow } from '@/utils/shadow';

interface Vehiculo {
  id: string;
  patente: string;
  modelo: string;
  ano: string;
  fotoURL?: string;
}

export default function ListaVehiculosScreen() {
  const router = useRouter();
  useSyncRutActivo();
  const [rutUsuario, setRutUsuario] = useState<string>('');
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const cargarVehiculos = async () => {
      try {
        const rutGuardado = await AsyncStorage.getItem('rutUsuario');

        if (!rutGuardado) {
          Alert.alert('Error', 'No se encontró el RUT del usuario activo.');
          setLoading(false);
          return;
        }

        setRutUsuario(rutGuardado);

        const vehiculosRef = collection(db, 'Vehiculos');
        const q = query(vehiculosRef, where('rutUsuario', '==', rutGuardado));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          setVehiculos([]);
        } else {
          const listaVehiculos: Vehiculo[] = querySnapshot.docs.map((doc) => {
            const data = doc.data() || {};
            return {
              id: doc.id,
              patente: data.patente || 'Sin patente',
              modelo: data.modelo || 'Sin modelo',
              ano: data.ano || 'No disponible',
              fotoURL: data.fotoURL || undefined,
            };
          });
          setVehiculos(listaVehiculos);
        }
      } catch (error) {
        console.error('Error al cargar vehículos:', error);
        Alert.alert('Error', 'No se pudieron cargar los vehículos.');
      } finally {
        setLoading(false);
      }
    };

    cargarVehiculos();
  }, []);

  const handleEditarVehiculo = (vehiculo: Vehiculo) => {
    router.push({
      pathname: '/(tabs)/conductor/editar_vehiculo',
      params: { 
        id: vehiculo.id,
        patente: vehiculo.patente,
        modelo: vehiculo.modelo,
        ano: vehiculo.ano,
        fotoURL: vehiculo.fotoURL || ''
      }
    });
  };

  const renderItem = ({ item }: { item: Vehiculo }) => (
    <View style={styles.card}>
      <View style={styles.headerCard}>
        <Ionicons name="car-outline" size={32} color="#127067" />
        <View style={styles.nameContainer}>
          <Text style={styles.name}>
            {item.patente}
          </Text>
        </View>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.info}>Modelo: {item.modelo}</Text>
        <Text style={styles.info}>Año: {item.ano}</Text>
      </View>
      <Pressable 
        style={styles.editButton}
        onPress={() => handleEditarVehiculo(item)}
      >
        <Text style={styles.editButtonText}>Editar</Text>
      </Pressable>
    </View>
  );

  const handleVolver = () => {
    if (router.canGoBack?.()) {
      router.back();
    } else {
      router.replace('/(tabs)/conductor/pagina-principal-conductor');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Pressable style={styles.backButton} onPress={handleVolver}>
          <Ionicons name="arrow-back" size={28} color="#127067" />
        </Pressable>
        <ActivityIndicator size="large" color="#127067" />
        <Text style={styles.loadingText}>Cargando vehículos...</Text>
      </View>
    );
  }

  if (vehiculos.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Pressable style={styles.backButton} onPress={handleVolver}>
          <Ionicons name="arrow-back" size={28} color="#127067" />
        </Pressable>
        <Ionicons name="car-outline" size={60} color="#999" />
        <Text style={styles.emptyText}>No hay vehículos registrados</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Botón de volver */}
      <Pressable style={styles.backButton} onPress={handleVolver}>
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      <View style={styles.header}>
        <Ionicons name="car-outline" size={32} color="#127067" />
        <Text style={styles.title}>Lista vehículos</Text>
      </View>
      <FlatList
        data={vehiculos}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#F5F7F8', 
    paddingHorizontal: 16,
    paddingTop: 50,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 16,
    zIndex: 10,
    padding: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    width: '100%',
    marginTop: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
  },
  loadingContainer: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: '#F5F7F8',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
    fontSize: 16,
  },
  emptyContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: '#F5F7F8',
  },
  emptyText: { 
    marginTop: 8, 
    color: '#777', 
    fontSize: 16 
  },
  listContent: {
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    marginVertical: 6,
    elevation: 2,
    ...makeShadow(
      '0 3px 6px rgba(0,0,0,0.1)',
      {
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
      },
    ),
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  nameContainer: {
    flex: 1,
    marginLeft: 10,
  },
  name: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    color: '#127067',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  info: { 
    fontSize: 14, 
    color: '#555',
    flex: 1,
  },
  editButton: {
    backgroundColor: '#127067',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 15,
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  editButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
});
