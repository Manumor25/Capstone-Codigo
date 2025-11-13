import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Pressable,
  Platform,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, getDocs, query, where, doc, deleteDoc } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { makeShadow } from '@/utils/shadow';

interface VehiculoInfo {
  id: string;
  patente: string;
  modelo: string;
  ano: string;
  nombre?: string;
  colegio?: string;
  comuna?: string;
  precio: string;
  numNinosInscritos: number;
  furgonId?: string; // ID del furgón asociado si existe
}

export default function BorrarFurgonesScreen() {
  const router = useRouter();
  useSyncRutActivo();
  const [vehiculos, setVehiculos] = useState<VehiculoInfo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [rutUsuario, setRutUsuario] = useState<string>('');
  const [borrandoId, setBorrandoId] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [vehiculoAEliminar, setVehiculoAEliminar] = useState<VehiculoInfo | null>(null);
  const [modalAdvertenciaVisible, setModalAdvertenciaVisible] = useState(false);
  const resolveEliminacionRef = useRef<((value: boolean) => void) | null>(null);

  useEffect(() => {
    const cargarVehiculosCompletos = async () => {
      try {
        const rutGuardado = await AsyncStorage.getItem('rutUsuario');
        if (!rutGuardado) {
          Alert.alert('Error', 'No se encontró el RUT del usuario activo.');
          setLoading(false);
          return;
        }
        setRutUsuario(rutGuardado);

        // Obtener todos los vehículos del usuario
        const vehiculosRef = collection(db, 'Vehiculos');
        const vehiculosQuery = query(vehiculosRef, where('rutUsuario', '==', rutGuardado));
        const vehiculosSnapshot = await getDocs(vehiculosQuery);

        // Obtener todos los furgones para mapear por patente
        const furgonesRef = collection(db, 'Furgones');
        const furgonesSnapshot = await getDocs(furgonesRef);
        
        // Crear un mapa de patente -> furgón
        const furgonesPorPatente = new Map<string, any>();
        furgonesSnapshot.docs.forEach((doc) => {
          const data = doc.data();
          const patente = (data.patente || '').toString().trim().toUpperCase();
          if (patente) {
            furgonesPorPatente.set(patente, {
              id: doc.id,
              nombre: data.nombre || '',
              colegio: data.colegio || '',
              comuna: data.comuna || '',
              precio: data.precio || '0',
            });
          }
        });

        // Obtener todos los pasajeros para contar por patente
        const listaPasajerosRef = collection(db, 'lista_pasajeros');
        const pasajerosSnapshot = await getDocs(listaPasajerosRef);
        
        // Contar pasajeros por patente
        const pasajerosPorPatente = new Map<string, number>();
        pasajerosSnapshot.docs.forEach((doc) => {
          const data = doc.data();
          const patente = (data.patenteFurgon || '').toString().trim().toUpperCase();
          const rutConductor = (data.rutConductor || '').toString().trim();
          
          // Solo contar si el conductor coincide
          if (patente && rutConductor === rutGuardado) {
            pasajerosPorPatente.set(patente, (pasajerosPorPatente.get(patente) || 0) + 1);
          }
        });

        // Construir la lista de vehículos con toda la información
        const listaVehiculos: VehiculoInfo[] = vehiculosSnapshot.docs.map((doc) => {
          const data = doc.data();
          const patente = (data.patente || '').toString().trim().toUpperCase();
          const furgon = furgonesPorPatente.get(patente);
          const numNinos = pasajerosPorPatente.get(patente) || 0;

          return {
            id: doc.id,
            patente: patente || 'Sin patente',
            modelo: data.modelo || 'Sin modelo',
            ano: data.ano || 'No disponible',
            nombre: furgon?.nombre,
            colegio: furgon?.colegio,
            comuna: furgon?.comuna,
            precio: furgon?.precio || '0',
            numNinosInscritos: numNinos,
            furgonId: furgon?.id,
          };
        });

        console.log('Total de vehículos encontrados:', listaVehiculos.length);
        setVehiculos(listaVehiculos);
      } catch (error) {
        console.error('Error al cargar vehículos:', error);
        Alert.alert('Error', 'No se pudieron cargar los vehículos.');
      } finally {
        setLoading(false);
      }
    };

    cargarVehiculosCompletos();
  }, []);

  const handleBorrarVehiculo = (vehiculo: VehiculoInfo) => {
    console.log('handleBorrarVehiculo llamado con vehículo:', vehiculo);
    setVehiculoAEliminar(vehiculo);
    setModalVisible(true);
  };

  const confirmarEliminacion = async () => {
    if (!vehiculoAEliminar) return;
    setModalVisible(false);
    await procesarEliminacion(vehiculoAEliminar);
  };

  const cancelarEliminacion = () => {
    setModalVisible(false);
    setVehiculoAEliminar(null);
  };

  const procesarEliminacion = async (vehiculo: VehiculoInfo) => {
    console.log('Usuario confirmó eliminar, vehículo ID:', vehiculo.id);
    try {
      setBorrandoId(vehiculo.id);
      
      // Verificar si hay pasajeros asociados a este vehículo
      if (vehiculo.numNinosInscritos > 0) {
        // Mostrar modal de advertencia
        const continuar = await new Promise<boolean>((resolve) => {
          resolveEliminacionRef.current = resolve;
          setModalAdvertenciaVisible(true);
        });
        
        setModalAdvertenciaVisible(false);
        resolveEliminacionRef.current = null;
        
        if (!continuar) {
          setBorrandoId(null);
          return;
        }
      }
      
      console.log('No hay niños inscritos o usuario confirmó, eliminando directamente');
      await eliminarVehiculo(vehiculo);
    } catch (error) {
      console.error('Error al verificar pasajeros:', error);
      Alert.alert('Error', 'No se pudo verificar los pasajeros asociados.');
      setBorrandoId(null);
    }
  };

  const eliminarVehiculo = async (vehiculo: VehiculoInfo) => {
    console.log('eliminarVehiculo llamado, ID:', vehiculo.id);
    try {
      // Eliminar el vehículo de la colección Vehiculos
      const vehiculoRef = doc(db, 'Vehiculos', vehiculo.id);
      console.log('Intentando eliminar vehículo:', vehiculoRef.path);
      await deleteDoc(vehiculoRef);
      console.log('Vehículo eliminado exitosamente');

      // Si tiene un furgón asociado, también eliminarlo
      if (vehiculo.furgonId) {
        const furgonRef = doc(db, 'Furgones', vehiculo.furgonId);
        console.log('Intentando eliminar furgón asociado:', furgonRef.path);
        await deleteDoc(furgonRef);
        console.log('Furgón asociado eliminado exitosamente');
      }

      // Actualizar la lista local
      setVehiculos((prevVehiculos) => {
        const nuevaLista = prevVehiculos.filter((v) => v.id !== vehiculo.id);
        console.log('Lista actualizada, quedan:', nuevaLista.length, 'vehículos');
        return nuevaLista;
      });
      
      const nombreVehiculo = vehiculo.nombre || vehiculo.patente;
      Alert.alert('Éxito', `El vehículo "${nombreVehiculo}" ha sido eliminado correctamente de la base de datos.`);
    } catch (error) {
      console.error('Error al borrar el vehículo:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      Alert.alert('Error', `No se pudo eliminar el vehículo de la base de datos. Error: ${errorMessage}`);
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

  const renderItem = ({ item }: { item: VehiculoInfo }) => {
    const isBorrando = borrandoId === item.id;
    const nombreDisplay = item.nombre || item.patente;
    const precioDisplay = item.precio && item.precio !== '0' ? `$${item.precio} CLP` : 'No publicado';
    
    return (
      <View style={styles.card}>
        <View style={styles.headerCard}>
          <Ionicons name="car-outline" size={32} color="#127067" />
          <View style={styles.infoContainer}>
            <Text style={styles.name}>{nombreDisplay}</Text>
            {item.modelo && <Text style={styles.subInfo}>{item.modelo} - {item.ano}</Text>}
            {item.colegio && <Text style={styles.subInfo}>{item.colegio}</Text>}
          </View>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.info}>Patente: {item.patente}</Text>
          {item.comuna && <Text style={styles.info}>Comuna: {item.comuna}</Text>}
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.price}>Precio: {precioDisplay}</Text>
          <Text style={styles.ninosInfo}>
            Niños inscritos: {item.numNinosInscritos}
          </Text>
        </View>
        
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
            console.log('Botón Eliminar presionado para:', nombreDisplay, 'ID:', item.id);
            if (!isBorrando) {
              handleBorrarVehiculo(item);
            }
          }}
          onPressIn={() => {
            console.log('Botón presionado (onPressIn) para:', nombreDisplay);
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
        <Text style={styles.feedbackText}>Cargando vehículos...</Text>
      </View>
    );
  }

  if (vehiculos.length === 0) {
    return (
      <View style={styles.container}>
        <Pressable style={styles.backButton} onPress={handleVolver}>
          <Ionicons name="arrow-back" size={28} color="#127067" />
        </Pressable>
        <View style={styles.feedbackContainer}>
          <Ionicons name="car-outline" size={60} color="#999" />
          <Text style={styles.feedbackText}>No tienes vehículos registrados</Text>
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
        <Text style={styles.title}>Eliminar Vehículos</Text>
      </View>
      <Text style={styles.subtitle}>Selecciona un vehículo para eliminarlo</Text>

      <FlatList
        data={vehiculos}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      {/* Modal de confirmación de eliminación */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={cancelarEliminacion}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Confirmar eliminación</Text>
            {vehiculoAEliminar && (
              <>
                <Text style={styles.modalMessage}>
                  ¿Estás seguro de que deseas eliminar el vehículo?
                </Text>
                <View style={styles.modalDetails}>
                  <Text style={styles.modalDetailText}>Patente: {vehiculoAEliminar.patente}</Text>
                  <Text style={styles.modalDetailText}>Modelo: {vehiculoAEliminar.modelo}</Text>
                  <Text style={styles.modalDetailText}>Niños inscritos: {vehiculoAEliminar.numNinosInscritos}</Text>
                </View>
                <Text style={styles.modalWarning}>
                  Esta acción eliminará permanentemente el vehículo y su furgón asociado (si existe) de la base de datos y no se puede deshacer.
                </Text>
              </>
            )}
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={cancelarEliminacion}
              >
                <Text style={styles.modalButtonTextCancel}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalButtonDelete]}
                onPress={confirmarEliminacion}
              >
                <Text style={styles.modalButtonTextDelete}>Eliminar</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de advertencia por niños inscritos */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalAdvertenciaVisible}
        onRequestClose={() => {
          if (resolveEliminacionRef.current) {
            resolveEliminacionRef.current(false);
          }
          setModalAdvertenciaVisible(false);
          resolveEliminacionRef.current = null;
          setBorrandoId(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Advertencia</Text>
            {vehiculoAEliminar && (
              <>
                <Text style={styles.modalMessage}>
                  Este vehículo tiene {vehiculoAEliminar.numNinosInscritos} niño(s) inscrito(s). ¿Deseas continuar con la eliminación?
                </Text>
              </>
            )}
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, styles.modalButtonCancel]}
                onPress={() => {
                  if (resolveEliminacionRef.current) {
                    resolveEliminacionRef.current(false);
                  }
                  setModalAdvertenciaVisible(false);
                  resolveEliminacionRef.current = null;
                  setBorrandoId(null);
                }}
              >
                <Text style={styles.modalButtonTextCancel}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalButtonDelete]}
                onPress={() => {
                  if (resolveEliminacionRef.current) {
                    resolveEliminacionRef.current(true);
                  }
                  setModalAdvertenciaVisible(false);
                  resolveEliminacionRef.current = null;
                }}
              >
                <Text style={styles.modalButtonTextDelete}>Eliminar de todos modos</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
    fontWeight: '600',
    flex: 1,
  },
  ninosInfo: {
    fontSize: 14,
    color: '#127067',
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    elevation: 5,
    ...makeShadow(
      '0 4px 20px rgba(0,0,0,0.3)',
      {
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
    ),
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: '#555',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalDetails: {
    backgroundColor: '#F5F7F8',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  modalDetailText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  modalWarning: {
    fontSize: 14,
    color: '#d32f2f',
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: '500',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#e0e0e0',
  },
  modalButtonDelete: {
    backgroundColor: '#d32f2f',
  },
  modalButtonTextCancel: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonTextDelete: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

