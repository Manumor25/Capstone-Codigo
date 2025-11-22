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

interface Tutor {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string;
  edad: number | string;
  fechaNacimiento: string;
  direccion: string;
}

export default function ListaTutoresScreen() {
  const router = useRouter();
  useSyncRutActivo();
  const [rutUsuario, setRutUsuario] = useState<string>('');
  const [tutores, setTutores] = useState<Tutor[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const cargarTutores = async () => {
      try {
        const rutGuardado = await AsyncStorage.getItem('rutUsuario');

        if (!rutGuardado) {
          Alert.alert('Error', 'No se encontró el RUT del usuario activo.');
          setLoading(false);
          return;
        }

        setRutUsuario(rutGuardado);

        const tutoresRef = collection(db, 'Tutores');
        const q = query(tutoresRef, where('rutUsuario', '==', rutGuardado));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          setTutores([]);
        } else {
          const listaTutores: Tutor[] = querySnapshot.docs.map((doc) => {
            const data = doc.data() || {};
            return {
              id: doc.id,
              nombres: data.nombres || 'Sin nombre',
              apellidos: data.apellidos || 'Sin apellido',
              rut: data.rut || 'Sin RUT',
              edad: data.edad !== undefined ? data.edad : '-',
              fechaNacimiento: data.fechaNacimiento || 'No disponible',
              direccion: data.direccion || 'No disponible',
            };
          });
          setTutores(listaTutores);
        }
      } catch (error) {
        console.error('Error al cargar tutores:', error);
        Alert.alert('Error', 'No se pudieron cargar los tutores.');
      } finally {
        setLoading(false);
      }
    };

    cargarTutores();
  }, []);

  const handleEditarTutor = (tutor: Tutor) => {
    router.push({
      pathname: '/(tabs)/apoderado/Editar-tutor',
      params: { 
        id: tutor.id,
        nombres: tutor.nombres,
        apellidos: tutor.apellidos,
        rut: tutor.rut,
        fechaNacimiento: tutor.fechaNacimiento,
        edad: tutor.edad.toString(),
        direccion: tutor.direccion
      }
    });
  };

  const handleVolver = () => {
    if (router.canGoBack?.()) {
      router.back();
    } else {
      router.replace('/(tabs)/apoderado/perfil-apoderado');
    }
  };

  const renderItem = ({ item }: { item: Tutor }) => (
    <View style={styles.card}>
      <View style={styles.headerCard}>
        <Ionicons name="person-circle-outline" size={32} color="#127067" />
        <View style={styles.nameContainer}>
          <Text style={styles.name}>
            {item.nombres} {item.apellidos}
          </Text>
        </View>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.info}>RUT: {item.rut}</Text>
        <Text style={styles.info}>Edad: {item.edad} años</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.info}>Nacimiento: {item.fechaNacimiento}</Text>
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.info}>Dirección: {item.direccion}</Text>
      </View>
      <Pressable 
        style={styles.editButton}
        onPress={() => handleEditarTutor(item)}
      >
        <Text style={styles.editButtonText}>Editar</Text>
      </Pressable>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Pressable style={styles.backButton} onPress={handleVolver}>
          <Ionicons name="arrow-back" size={28} color="#127067" />
        </Pressable>
        <ActivityIndicator size="large" color="#127067" />
        <Text style={styles.loadingText}>Cargando tutores...</Text>
      </View>
    );
  }

  if (tutores.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Pressable style={styles.backButton} onPress={handleVolver}>
          <Ionicons name="arrow-back" size={28} color="#127067" />
        </Pressable>
        <Ionicons name="sad-outline" size={60} color="#999" />
        <Text style={styles.emptyText}>No hay tutores registrados</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Botón de volver */}
      <Pressable style={styles.backButton} onPress={handleVolver}>
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      {/* Encabezado */}
      <View style={styles.header}>
        <Ionicons name="person-circle-outline" size={32} color="#127067" />
        <Text style={styles.title}>Lista tutores</Text>
      </View>

      <FlatList
        data={tutores}
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
    paddingTop: 80,
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 16,
    zIndex: 10,
    padding: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    width: '100%',
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
    paddingTop: 60,
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
    paddingTop: 60,
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
