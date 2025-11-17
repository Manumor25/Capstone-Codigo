import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableHighlight,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { Ionicons } from '@expo/vector-icons';
import MapboxDriver from '@/components/MapboxDriver';

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

export default function DetalleViajeApoderadoScreen() {
  useSyncRutActivo();
  const router = useRouter();
  const params = useLocalSearchParams();
  const viajeId = params.viajeId as string;
  const [viaje, setViaje] = useState<Viaje | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cargarViaje = async () => {
      if (!viajeId) {
        Alert.alert('Error', 'No se recibió el ID del viaje.');
        router.back();
        return;
      }

      try {
        const viajeRef = doc(db, 'historial_viajes', viajeId);
        const viajeSnap = await getDoc(viajeRef);

        if (!viajeSnap.exists()) {
          Alert.alert('Error', 'No se encontró el viaje.');
          router.back();
          return;
        }

        const data = viajeSnap.data();
        setViaje({
          id: viajeSnap.id,
          fechaViaje: data.fechaViaje,
          fechaViajeFormateada: data.fechaViajeFormateada || 'Fecha no disponible',
          cantidadNinos: data.cantidadNinos || 0,
          patenteFurgon: data.patenteFurgon || 'Sin patente',
          rutaGeometry: data.rutaGeometry,
          waypoints: data.waypoints || [],
          pasajeros: data.pasajeros || [],
        });
      } catch (error) {
        console.error('Error al cargar viaje:', error);
        Alert.alert('Error', 'No se pudo cargar el detalle del viaje.');
        router.back();
      } finally {
        setLoading(false);
      }
    };

    cargarViaje();
  }, [viajeId, router]);

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
    // Si ya hay una hora formateada guardada, usarla directamente
    if (horaFormateada) {
      return horaFormateada;
    }
    
    // Si no, formatear desde el timestamp
    if (!timestamp) return 'N/A';
    try {
      const fechaObj = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return fechaObj.toLocaleString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return 'N/A';
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#127067" />
        <Text style={styles.loadingText}>Cargando detalle del viaje...</Text>
      </View>
    );
  }

  if (!viaje) {
    return null;
  }

  // Calcular ubicación promedio para centrar el mapa
  const ubicacionPromedio = viaje.waypoints && viaje.waypoints.length > 0
    ? {
        latitude: viaje.waypoints.reduce((sum, w) => sum + w.coordinates.latitude, 0) / viaje.waypoints.length,
        longitude: viaje.waypoints.reduce((sum, w) => sum + w.coordinates.longitude, 0) / viaje.waypoints.length,
      }
    : { latitude: -33.45, longitude: -70.6667 };

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
        <Text style={styles.headerTitle}>Detalle del Viaje</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Información general */}
        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Ionicons name="calendar" size={20} color="#127067" />
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Fecha y Hora</Text>
              <Text style={styles.infoValue}>{formatearFecha(viaje.fechaViaje)}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="bus" size={20} color="#127067" />
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Patente</Text>
              <Text style={styles.infoValue}>{viaje.patenteFurgon}</Text>
            </View>
          </View>
        </View>

        {/* Mapa de la ruta */}
        {viaje.rutaGeometry && (
          <View style={styles.mapCard}>
            <Text style={styles.sectionTitle}>Ruta del Viaje</Text>
            <View style={styles.mapContainer}>
              <MapboxDriver
                accessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN || ''}
                driverLocation={ubicacionPromedio}
                route={{
                  waypoints: viaje.waypoints || [],
                  routeGeometry: viaje.rutaGeometry,
                }}
              />
            </View>
          </View>
        )}

        {/* Lista de pasajeros (solo los hijos del apoderado) */}
        <View style={styles.pasajerosCard}>
          <Text style={styles.sectionTitle}>Detalle de tus Hijos</Text>
          {viaje.pasajeros.map((pasajero, index) => (
            <View key={index} style={styles.pasajeroItem}>
              <View style={styles.pasajeroHeader}>
                <Ionicons name="person-circle" size={32} color="#127067" />
                <View style={styles.pasajeroInfo}>
                  <Text style={styles.pasajeroNombre}>{pasajero.nombreHijo}</Text>
                  {pasajero.direccion && (
                    <Text style={styles.pasajeroDireccion} numberOfLines={2}>
                      📍 {pasajero.direccion}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.horariosContainer}>
                <View style={styles.horarioRow}>
                  <Ionicons name="arrow-down-circle" size={20} color="#4CAF50" />
                  <View style={styles.horarioInfo}>
                    <Text style={styles.horarioLabel}>Recogido</Text>
                    <Text style={styles.horarioValue}>
                      {formatearHora(pasajero.fechaRecogido, pasajero.horaRecogidoFormateada)}
                    </Text>
                  </View>
                </View>
                <View style={styles.horarioRow}>
                  <Ionicons name="arrow-up-circle" size={20} color="#FF9800" />
                  <View style={styles.horarioInfo}>
                    <Text style={styles.horarioLabel}>Entregado</Text>
                    <Text style={styles.horarioValue}>
                      {formatearHora(pasajero.fechaEntregado, pasajero.horaEntregadoFormateada)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </View>
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
  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  mapCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#127067',
    marginBottom: 12,
  },
  mapContainer: {
    height: 200,
    borderRadius: 8,
    overflow: 'hidden',
  },
  pasajerosCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  pasajeroItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  pasajeroHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  pasajeroInfo: {
    marginLeft: 12,
    flex: 1,
  },
  pasajeroNombre: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  pasajeroDireccion: {
    fontSize: 12,
    color: '#999',
  },
  horariosContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  horarioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  horarioInfo: {
    marginLeft: 8,
  },
  horarioLabel: {
    fontSize: 12,
    color: '#666',
  },
  horarioValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
});

