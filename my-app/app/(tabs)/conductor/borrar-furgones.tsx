import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, where, doc, deleteDoc } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { makeShadow } from '@/utils/shadow';

interface Furgon {
  id: string;
  nombre: string;
  colegio: string;
  comuna: string;
  precio: string;
  patente: string;
}

export default function BorrarFurgonesScreen() {
  const router = useRouter();
  useSyncRutActivo();
  const [furgones, setFurgones] = useState<Furgon[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [rutUsuario, setRutUsuario] = useState<string>('');
  const [borrandoId, setBorrandoId] = useState<string | null>(null);

  useEffect(() => {
    const cargarFurgonesPropios = async () => {
      try {
        const rutGuardado = await AsyncStorage.getItem('rutUsuario');
        if (!rutGuardado) {
          Alert.alert('Error', 'No se encontró el RUT del usuario activo.');
          setLoading(false);
          return;
        }
        setRutUsuario(rutGuardado);

        const furgonesRef = collection(db, 'Furgones');
        const q = query(furgonesRef, where('rutUsuario', '==', rutGuardado));
        const snapshot = await getDocs(q);

        const lista: Furgon[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data() || {};
          return {
            id: docSnap.id,
            nombre: data.nombre || 'Sin nombre',
            colegio: data.colegio || 'Sin colegio',
            comuna: data.comuna || 'Sin comuna',
            precio: data.precio || 'No definido',
            patente: data.patente || 'Sin patente',
          };
        });

        setFurgones(lista);
      } catch (error) {
        console.error('Error al cargar furgones del conductor:', error);
        Alert.alert('Error', 'No se pudieron cargar los furgones.');
      } finally {
        setLoading(false);
      }
    };

    cargarFurgonesPropios();
  }, []);

  const handleBorrarFurgon = async (furgon: Furgon) => {
    console.log('handleBorrarFurgon llamado con furgón:', furgon);
    
    // En web, usar window.confirm; en móvil, usar Alert.alert
    if (Platform.OS === 'web') {
      const confirmar = window.confirm(
        `¿Estás seguro de que deseas eliminar el furgón "${furgon.nombre}"?\n\nPatente: ${furgon.patente}\nColegio: ${furgon.colegio}\n\nEsta acción eliminará permanentemente el registro del furgón de la base de datos y no se puede deshacer.`
      );
      
      if (!confirmar) {
        console.log('Eliminación cancelada por el usuario');
        return;
      }
    } else {
      Alert.alert(
        'Confirmar eliminación',
        `¿Estás seguro de que deseas eliminar el furgón "${furgon.nombre}"?\n\nPatente: ${furgon.patente}\nColegio: ${furgon.colegio}\n\nEsta acción eliminará permanentemente el registro del furgón de la base de datos y no se puede deshacer.`,
        [
          {
            text: 'Cancelar',
            style: 'cancel',
            onPress: () => {
              console.log('Eliminación cancelada por el usuario');
            },
          },
          {
            text: 'Eliminar',
            style: 'destructive',
            onPress: async () => {
              await procesarEliminacion(furgon);
            },
          },
        ],
        { cancelable: true }
      );
      return;
    }
    
    // Si estamos en web y confirmó, proceder directamente
    await procesarEliminacion(furgon);
  };

  const procesarEliminacion = async (furgon: Furgon) => {
    console.log('Usuario confirmó eliminar, furgón ID:', furgon.id);
    try {
      setBorrandoId(furgon.id);
      
      // Verificar si hay pasajeros asociados a este furgón
      const listaPasajerosRef = collection(db, 'lista_pasajeros');
      const pasajerosQuery = query(
        listaPasajerosRef,
        where('patenteFurgon', '==', furgon.patente),
        where('rutConductor', '==', rutUsuario)
      );
      const pasajerosSnapshot = await getDocs(pasajerosQuery);
      
      console.log('Pasajeros encontrados:', pasajerosSnapshot.docs.length);
      
      if (!pasajerosSnapshot.empty) {
        const continuar = Platform.OS === 'web' 
          ? window.confirm(
              `Este furgón tiene ${pasajerosSnapshot.docs.length} pasajero(s) asociado(s). ¿Deseas continuar con la eliminación?`
            )
          : await new Promise<boolean>((resolve) => {
              Alert.alert(
                'Advertencia',
                `Este furgón tiene ${pasajerosSnapshot.docs.length} pasajero(s) asociado(s). ¿Deseas continuar con la eliminación?`,
                [
                  {
                    text: 'Cancelar',
                    style: 'cancel',
                    onPress: () => {
                      console.log('Eliminación cancelada por pasajeros asociados');
                      setBorrandoId(null);
                      resolve(false);
                    },
                  },
                  {
                    text: 'Eliminar de todos modos',
                    style: 'destructive',
                    onPress: () => {
                      console.log('Eliminando furgón a pesar de pasajeros asociados');
                      resolve(true);
                    },
                  },
                ]
              );
            });
        
        if (!continuar) {
          setBorrandoId(null);
          return;
        }
      }
      
      console.log('No hay pasajeros asociados o usuario confirmó, eliminando directamente');
      await eliminarFurgon(furgon);
    } catch (error) {
      console.error('Error al verificar pasajeros:', error);
      if (Platform.OS === 'web') {
        window.alert('Error: No se pudo verificar los pasajeros asociados.');
      } else {
        Alert.alert('Error', 'No se pudo verificar los pasajeros asociados.');
      }
      setBorrandoId(null);
    }
  };

  const eliminarFurgon = async (furgon: Furgon) => {
    console.log('eliminarFurgon llamado, ID:', furgon.id);
    try {
      // Eliminar el furgón de la colección Furgones
      const furgonRef = doc(db, 'Furgones', furgon.id);
      console.log('Intentando eliminar documento:', furgonRef.path);
      
      await deleteDoc(furgonRef);
      console.log('Documento eliminado exitosamente');

      // Actualizar la lista local
      setFurgones((prevFurgones) => {
        const nuevaLista = prevFurgones.filter((f) => f.id !== furgon.id);
        console.log('Lista actualizada, quedan:', nuevaLista.length, 'furgones');
        return nuevaLista;
      });
      
      if (Platform.OS === 'web') {
        window.alert(`Éxito: El furgón "${furgon.nombre}" ha sido eliminado correctamente de la base de datos.`);
      } else {
        Alert.alert('Éxito', `El furgón "${furgon.nombre}" ha sido eliminado correctamente de la base de datos.`);
      }
    } catch (error) {
      console.error('Error al borrar el furgón:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      if (Platform.OS === 'web') {
        window.alert(`Error: No se pudo eliminar el furgón de la base de datos. ${errorMessage}`);
      } else {
        Alert.alert('Error', `No se pudo eliminar el furgón de la base de datos. Error: ${errorMessage}`);
      }
    } finally {
      setBorrandoId(null);
    }
  };

  const handleVolver = () => {
    if (router.canGoBack?.()) {
      router.back();
    } else {
      router.replace('/(tabs)/conductor/perfil-conductor');
    }
  };

  const renderItem = ({ item }: { item: Furgon }) => {
    const isBorrando = borrandoId === item.id;
    
    return (
      <View style={styles.card}>
        <View style={styles.headerCard}>
          <Ionicons name="bus-outline" size={32} color="#127067" />
          <View style={styles.infoContainer}>
            <Text style={styles.name}>{item.nombre}</Text>
            <Text style={styles.subInfo}>{item.colegio}</Text>
          </View>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.info}>Patente: {item.patente}</Text>
          <Text style={styles.info}>Comuna: {item.comuna}</Text>
        </View>
        <Text style={styles.price}>Precio mensual: ${item.precio} CLP</Text>
        
        <Pressable
          style={({ pressed }) => [
            styles.deleteButton,
            isBorrando && styles.deleteButtonDisabled,
            pressed && !isBorrando && styles.deleteButtonPressed,
          ]}
          onPress={(e) => {
            if (e) {
              e.stopPropagation();
            }
            console.log('Botón Eliminar presionado para:', item.nombre, 'ID:', item.id);
            if (!isBorrando) {
              handleBorrarFurgon(item);
            }
          }}
          onPressIn={() => {
            console.log('Botón presionado (onPressIn) para:', item.nombre);
          }}
          disabled={isBorrando}
        >
          {isBorrando ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <View style={styles.deleteButtonContent}>
              <Ionicons name="trash-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.deleteButtonText}>Eliminar</Text>
            </View>
          )}
        </Pressable>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.feedbackContainer}>
        <ActivityIndicator size="large" color="#127067" />
        <Text style={styles.feedbackText}>Cargando furgones...</Text>
      </View>
    );
  }

  if (furgones.length === 0) {
    return (
      <View style={styles.container}>
        <Pressable style={styles.backButton} onPress={handleVolver}>
          <Ionicons name="arrow-back" size={28} color="#127067" />
        </Pressable>
        <View style={styles.feedbackContainer}>
          <Ionicons name="bus-outline" size={60} color="#999" />
          <Text style={styles.feedbackText}>No tienes furgones registrados</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={handleVolver}>
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>
      
      <View style={styles.header}>
        <Ionicons name="trash-outline" size={32} color="#d32f2f" />
        <Text style={styles.title}>Eliminar Furgones</Text>
      </View>
      <Text style={styles.subtitle}>Selecciona un furgón para eliminarlo</Text>

      <FlatList
        data={furgones}
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
    paddingTop: 40,
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
    marginTop: 20,
    marginBottom: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  feedbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F7F8',
  },
  feedbackText: {
    marginTop: 10,
    color: '#666',
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  listContent: {
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    marginVertical: 8,
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
    marginBottom: 10,
  },
  infoContainer: {
    marginLeft: 12,
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#127067',
  },
  subInfo: {
    fontSize: 14,
    color: '#555',
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  info: {
    fontSize: 14,
    color: '#555',
  },
  price: {
    fontSize: 14,
    color: '#333',
    marginTop: 6,
    marginBottom: 12,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#d32f2f',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  deleteButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonDisabled: {
    opacity: 0.6,
  },
  deleteButtonPressed: {
    backgroundColor: '#b71c1c',
    opacity: 0.9,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

