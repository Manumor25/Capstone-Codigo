import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableHighlight,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { Ionicons } from '@expo/vector-icons';

interface PasajeroHistorial {
  rutHijo: string;
  nombreHijo: string;
  rutApoderado: string;
  nombreApoderado: string;
  fechaRecogido?: any;
  fechaEntregado?: any;
  horaRecogidoFormateada?: string | null;
  horaEntregadoFormateada?: string | null;
  direccion?: string;
  coordenadas?: { latitude: number; longitude: number };
}

interface Viaje {
  id: string;
  fechaViaje: any;
  fechaViajeFormateada: string;
  cantidadNinos: number;
  patenteFurgon: string;
  rutaGeometry?: any;
  waypoints?: Array<{ coordinates: { latitude: number; longitude: number }; name: string }>;
  pasajeros: PasajeroHistorial[];
}

export default function HistorialViajesConductor() {
  useSyncRutActivo();
  const router = useRouter();
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [loading, setLoading] = useState(true);
  const [rutConductor, setRutConductor] = useState<string>('');

  const cargarHistorial = useCallback(async () => {
    try {
      const rutGuardado = await AsyncStorage.getItem('rutUsuario');
      if (!rutGuardado) {
        Alert.alert('Error', 'No se encontró el RUT del conductor.');
        setLoading(false);
        return;
      }

      setRutConductor(rutGuardado);
      const historialRef = collection(db, 'historial_viajes');
      const historialQuery = query(
        historialRef,
        where('rutConductor', '==', rutGuardado),
        where('tipoUsuario', '==', 'conductor'),
        orderBy('fechaViaje', 'desc'),
        limit(50)
      );

      const snapshot = await getDocs(historialQuery);
      const viajesLista: Viaje[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        viajesLista.push({
          id: doc.id,
          fechaViaje: data.fechaViaje,
          fechaViajeFormateada: data.fechaViajeFormateada || 'Fecha no disponible',
          cantidadNinos: data.cantidadNinos || 0,
          patenteFurgon: data.patenteFurgon || 'Sin patente',
          rutaGeometry: data.rutaGeometry,
          waypoints: data.waypoints || [],
          pasajeros: data.pasajeros || [],
        });
      });

      setViajes(viajesLista);
    } catch (error) {
      console.error('Error al cargar historial:', error);
      Alert.alert('Error', 'No se pudo cargar el historial de viajes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  const formatearFecha = (fecha: any) => {
    if (!fecha) return 'Fecha no disponible';
    if (typeof fecha === 'string') return fecha;
    
    try {
      const fechaObj = fecha.toDate ? fecha.toDate() : new Date(fecha);
      return fechaObj.toLocaleString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Fecha no disponible';
    }
  };

  const formatearHora = (timestamp: any, horaFormateada?: string | null) => {
    // Si ya hay una hora formateada guardada, usar solo la hora
    if (horaFormateada) {
      // Extraer solo la hora y minutos de la fecha formateada completa
      const match = horaFormateada.match(/(\d{2}:\d{2}):\d{2}/);
      return match ? match[1] : horaFormateada;
    }
    
    // Si no, formatear desde el timestamp
    if (!timestamp) return 'N/A';
    try {
      const fechaObj = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return fechaObj.toLocaleTimeString('es-CL', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'N/A';
    }
  };

  const handleVerDetalle = (viaje: Viaje) => {
    router.push({
      pathname: '/(tabs)/conductor/detalle-viaje',
      params: {
        viajeId: viaje.id,
      },
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#127067" />
        <Text style={styles.loadingText}>Cargando historial...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableHighlight
          onPress={() => router.back()}
          underlayColor="#f0f0f0"
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={24} color="#127067" />
        </TouchableHighlight>
        <Text style={styles.headerTitle}>Historial de Viajes</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {viajes.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="time-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No hay viajes registrados</Text>
            <Text style={styles.emptySubtext}>Los viajes aparecerán aquí después de completar rutas</Text>
          </View>
        ) : (
          viajes.map((viaje) => (
            <TouchableHighlight
              key={viaje.id}
              onPress={() => handleVerDetalle(viaje)}
              underlayColor="#f0f0f0"
              style={styles.viajeCard}
            >
              <View>
                <View style={styles.viajeHeader}>
                  <View style={styles.viajeHeaderLeft}>
                    <Ionicons name="bus" size={24} color="#127067" />
                    <View style={styles.viajeInfo}>
                      <Text style={styles.patenteText}>{viaje.patenteFurgon}</Text>
                      <Text style={styles.fechaText}>{formatearFecha(viaje.fechaViaje)}</Text>
                    </View>
                  </View>
                  <View style={styles.viajeHeaderRight}>
                    <Ionicons name="people" size={20} color="#666" />
                    <Text style={styles.cantidadText}>{viaje.cantidadNinos}</Text>
                  </View>
                </View>

                <View style={styles.viajeBody}>
                  <View style={styles.ninosList}>
                    {viaje.pasajeros.slice(0, 3).map((pasajero, index) => (
                      <View key={index} style={styles.ninoItem}>
                        <Ionicons name="person-circle" size={16} color="#127067" />
                        <Text style={styles.ninoNombre} numberOfLines={1}>
                          {pasajero.nombreHijo}
                        </Text>
                        <View style={styles.horarios}>
                          {pasajero.fechaRecogido && (
                            <View style={styles.horarioItem}>
                              <Ionicons name="arrow-down-circle" size={12} color="#4CAF50" />
                              <Text style={styles.horarioText}>
                                {formatearHora(pasajero.fechaRecogido, pasajero.horaRecogidoFormateada)}
                              </Text>
                            </View>
                          )}
                          {pasajero.fechaEntregado && (
                            <View style={styles.horarioItem}>
                              <Ionicons name="arrow-up-circle" size={12} color="#FF9800" />
                              <Text style={styles.horarioText}>
                                {formatearHora(pasajero.fechaEntregado, pasajero.horaEntregadoFormateada)}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    ))}
                    {viaje.pasajeros.length > 3 && (
                      <Text style={styles.masNinosText}>
                        +{viaje.pasajeros.length - 3} más
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.viajeFooter}>
                  <Text style={styles.verDetalleText}>Ver detalles →</Text>
                </View>
              </View>
            </TouchableHighlight>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7F8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F7F8',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#127067',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  viajeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  viajeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  viajeHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  viajeInfo: {
    marginLeft: 12,
    flex: 1,
  },
  patenteText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#127067',
  },
  fechaText: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  viajeHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  cantidadText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 6,
  },
  viajeBody: {
    marginTop: 8,
  },
  ninosList: {
    gap: 8,
  },
  ninoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  ninoNombre: {
    fontSize: 14,
    color: '#333',
    marginLeft: 8,
    flex: 1,
  },
  horarios: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  horarioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  horarioText: {
    fontSize: 12,
    color: '#666',
  },
  masNinosText: {
    fontSize: 12,
    color: '#127067',
    fontStyle: 'italic',
    marginTop: 4,
  },
  viajeFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  verDetalleText: {
    fontSize: 14,
    color: '#127067',
    fontWeight: '600',
    textAlign: 'right',
  },
});

