import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableHighlight,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';

interface Viaje {
  id: string;
  fechaViaje: any;
  fechaViajeFormateada: string;
  fechaInicio?: any;
  fechaInicioFormateada?: string;
  fechaFin?: any;
  fechaFinFormateada?: string;
  cantidadNinos: number;
  patenteFurgon: string;
  waypoints?: Array<{ coordinates: { latitude: number; longitude: number }; name: string }>;
  pasajeros: Array<{
    nombreHijo: string;
    nombreApoderado: string;
    fechaRecogido?: any;
    fechaEntregado?: any;
  }>;
}

interface AlertaUrgencia {
  id: string;
  fecha: any;
  descripcion: string;
  patenteFurgon?: string;
}

interface Estadisticas {
  totalViajes: number;
  totalNinosTrasladados: number;
  totalKilometros: number;
  promedioNinosPorViaje: number;
  promedioKilometrosPorViaje: number;
  tiempoTotalConduccion: number; // en minutos
  promedioTiempoPorViaje: number;
  totalProblemasRegistrados: number;
  velocidadPromedio: number; // km/h
  eficienciaRuta: number; // km por niño
  tasaOcupacion: number; // porcentaje
  tasaProblemas: number; // problemas por 100 viajes
  diasConsecutivosSinProblemas: number;
  mejorRachaSinProblemas: number;
  viajesPorMes: { [mes: string]: number };
  viajesPorDia: { [dia: string]: { viajes: number; ninos: number; kilometros: number } };
  viajesPorDiaSemana: { [dia: string]: number };
  viajesPorHora: { [hora: string]: number };
  problemasPorMes: { [mes: string]: number };
  problemasPorDia: { [dia: string]: number };
  viajesPorPatente: { [patente: string]: { viajes: number; ninos: number; kilometros: number } };
  topApoderados: Array<{ nombre: string; cantidad: number }>;
  topNinos: Array<{ nombre: string; cantidad: number }>;
  mesMasActivo: { mes: string; viajes: number } | null;
  diaMasActivo: { dia: string; viajes: number } | null;
  mesConMenosProblemas: { mes: string; problemas: number } | null;
}

export default function ReportesConductorScreen() {
  const router = useRouter();
  useSyncRutActivo();
  
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [alertasUrgencia, setAlertasUrgencia] = useState<AlertaUrgencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [rutConductor, setRutConductor] = useState<string>('');

  const normalizarRut = (rut: string) => rut.replace(/[^0-9kK]/g, '').toUpperCase();

  // Función para calcular distancia entre dos puntos (Haversine)
  const calcularDistancia = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Radio de la Tierra en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distancia en km
  };

  // Calcular distancia total de un viaje basado en waypoints
  const calcularDistanciaViaje = (viaje: Viaje): number => {
    if (!viaje.waypoints || viaje.waypoints.length < 2) {
      return 0;
    }

    let distanciaTotal = 0;
    for (let i = 0; i < viaje.waypoints.length - 1; i++) {
      const punto1 = viaje.waypoints[i].coordinates;
      const punto2 = viaje.waypoints[i + 1].coordinates;
      distanciaTotal += calcularDistancia(
        punto1.latitude,
        punto1.longitude,
        punto2.latitude,
        punto2.longitude
      );
    }
    return distanciaTotal;
  };

  // Calcular tiempo de conducción en minutos
  const calcularTiempoConduccion = (viaje: Viaje): number => {
    if (!viaje.fechaInicio || !viaje.fechaFin) {
      return 0;
    }

    try {
      const inicio = viaje.fechaInicio.toDate ? viaje.fechaInicio.toDate() : new Date(viaje.fechaInicio);
      const fin = viaje.fechaFin.toDate ? viaje.fechaFin.toDate() : new Date(viaje.fechaFin);
      const diffMs = fin.getTime() - inicio.getTime();
      return Math.round(diffMs / (1000 * 60)); // Convertir a minutos
    } catch (error) {
      return 0;
    }
  };

  // Calcular todas las estadísticas
  const estadisticas: Estadisticas = useMemo(() => {
    if (viajes.length === 0) {
      return {
        totalViajes: 0,
        totalNinosTrasladados: 0,
        totalKilometros: 0,
        promedioNinosPorViaje: 0,
        promedioKilometrosPorViaje: 0,
        tiempoTotalConduccion: 0,
        promedioTiempoPorViaje: 0,
        viajesPorMes: {},
        viajesPorDia: {},
        problemasPorMes: {},
        problemasPorDia: {},
        totalProblemasRegistrados: alertasUrgencia.length,
        velocidadPromedio: 0,
        eficienciaRuta: 0,
        tasaOcupacion: 0,
        tasaProblemas: 0,
        diasConsecutivosSinProblemas: 0,
        mejorRachaSinProblemas: 0,
        viajesPorDiaSemana: {},
        viajesPorHora: {},
        viajesPorPatente: {},
        topApoderados: [],
        topNinos: [],
        mesMasActivo: null,
        diaMasActivo: null,
        mesConMenosProblemas: null,
      };
    }

    let totalNinos = 0;
    let totalKilometros = 0;
    let tiempoTotal = 0;
    const viajesPorMes: { [mes: string]: number } = {};
    const viajesPorDia: { [dia: string]: { viajes: number; ninos: number; kilometros: number } } = {};
    const viajesPorDiaSemana: { [dia: string]: number } = {};
    const viajesPorHora: { [hora: string]: number } = {};
    const problemasPorMes: { [mes: string]: number } = {};
    const problemasPorDia: { [dia: string]: number } = {};
    const viajesPorPatente: { [patente: string]: { viajes: number; ninos: number; kilometros: number } } = {};
    const apoderadosCount: { [nombre: string]: number } = {};
    const ninosCount: { [nombre: string]: number } = {};

    // Procesar alertas de urgencia
    alertasUrgencia.forEach((alerta) => {
      try {
        const fecha = alerta.fecha?.toDate ? alerta.fecha.toDate() : new Date(alerta.fecha);
        const mesAno = `${fecha.getMonth() + 1}/${fecha.getFullYear()}`;
        const diaStr = fecha.toLocaleDateString('es-CL', { 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric' 
        });
        
        problemasPorMes[mesAno] = (problemasPorMes[mesAno] || 0) + 1;
        problemasPorDia[diaStr] = (problemasPorDia[diaStr] || 0) + 1;
      } catch (error) {
        // Ignorar errores de fecha
      }
    });

    viajes.forEach((viaje) => {
      // Contar niños
      totalNinos += viaje.cantidadNinos || 0;

      // Calcular distancia
      const distancia = calcularDistanciaViaje(viaje);
      totalKilometros += distancia;

      // Calcular tiempo
      const tiempo = calcularTiempoConduccion(viaje);
      tiempoTotal += tiempo;

      // Viajes por mes
      try {
        const fecha = viaje.fechaViaje?.toDate ? viaje.fechaViaje.toDate() : new Date(viaje.fechaViajeFormateada);
        const mesAno = `${fecha.getMonth() + 1}/${fecha.getFullYear()}`;
        viajesPorMes[mesAno] = (viajesPorMes[mesAno] || 0) + 1;
      } catch (error) {
        // Ignorar errores de fecha
      }

      // Viajes por día
      try {
        const fecha = viaje.fechaViaje?.toDate ? viaje.fechaViaje.toDate() : new Date(viaje.fechaViajeFormateada);
        const diaStr = fecha.toLocaleDateString('es-CL', { 
          day: '2-digit', 
          month: '2-digit', 
          year: 'numeric' 
        });
        
        if (!viajesPorDia[diaStr]) {
          viajesPorDia[diaStr] = { viajes: 0, ninos: 0, kilometros: 0 };
        }
        viajesPorDia[diaStr].viajes += 1;
        viajesPorDia[diaStr].ninos += viaje.cantidadNinos || 0;
        viajesPorDia[diaStr].kilometros += distancia;

        // Viajes por día de la semana
        const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const diaSemana = diasSemana[fecha.getDay()];
        viajesPorDiaSemana[diaSemana] = (viajesPorDiaSemana[diaSemana] || 0) + 1;

        // Viajes por hora
        const hora = fecha.getHours();
        const horaStr = `${hora}:00`;
        viajesPorHora[horaStr] = (viajesPorHora[horaStr] || 0) + 1;
      } catch (error) {
        // Ignorar errores de fecha
      }

      // Viajes por patente
      const patente = viaje.patenteFurgon || 'Sin patente';
      if (!viajesPorPatente[patente]) {
        viajesPorPatente[patente] = { viajes: 0, ninos: 0, kilometros: 0 };
      }
      viajesPorPatente[patente].viajes += 1;
      viajesPorPatente[patente].ninos += viaje.cantidadNinos || 0;
      viajesPorPatente[patente].kilometros += distancia;

      // Contar apoderados y niños
      viaje.pasajeros?.forEach((pasajero) => {
        if (pasajero.nombreApoderado) {
          apoderadosCount[pasajero.nombreApoderado] = (apoderadosCount[pasajero.nombreApoderado] || 0) + 1;
        }
        if (pasajero.nombreHijo) {
          ninosCount[pasajero.nombreHijo] = (ninosCount[pasajero.nombreHijo] || 0) + 1;
        }
      });
    });

    // Top apoderados y niños
    const topApoderados = Object.entries(apoderadosCount)
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);

    const topNinos = Object.entries(ninosCount)
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);

    // Calcular métricas de eficiencia
    const velocidadPromedio = tiempoTotal > 0 ? (totalKilometros / (tiempoTotal / 60)) : 0;
    const eficienciaRuta = totalNinos > 0 ? totalKilometros / totalNinos : 0;
    const tasaOcupacion = viajes.length > 0 ? (totalNinos / (viajes.length * 20)) * 100 : 0; // Asumiendo 20 cupos promedio
    const tasaProblemas = viajes.length > 0 ? (alertasUrgencia.length / viajes.length) * 100 : 0;

    // Calcular días consecutivos sin problemas
    const todosLosDias = new Set([
      ...Object.keys(viajesPorDia),
      ...Object.keys(problemasPorDia),
    ]);
    
    let diasConsecutivosSinProblemas = 0;
    let mejorRachaSinProblemas = 0;
    let rachaActual = 0;

    Array.from(todosLosDias)
      .sort((a, b) => {
        const fechaA = new Date(a.split('/').reverse().join('-'));
        const fechaB = new Date(b.split('/').reverse().join('-'));
        return fechaB.getTime() - fechaA.getTime();
      })
      .forEach((dia) => {
        const tieneProblemas = problemasPorDia[dia] > 0;
        if (!tieneProblemas) {
          rachaActual++;
          mejorRachaSinProblemas = Math.max(mejorRachaSinProblemas, rachaActual);
          if (rachaActual === 1) {
            diasConsecutivosSinProblemas = 1;
          } else if (rachaActual > diasConsecutivosSinProblemas) {
            diasConsecutivosSinProblemas = rachaActual;
          }
        } else {
          rachaActual = 0;
        }
      });

    // Mes más activo
    const mesMasActivo = Object.entries(viajesPorMes)
      .map(([mes, cantidad]) => ({ mes, viajes: cantidad }))
      .sort((a, b) => b.viajes - a.viajes)[0] || null;

    // Día más activo
    const diaMasActivo = Object.entries(viajesPorDia)
      .map(([dia, stats]) => ({ dia, viajes: stats.viajes }))
      .sort((a, b) => b.viajes - a.viajes)[0] || null;

    // Mes con menos problemas
    const mesConMenosProblemas = Object.entries(problemasPorMes)
      .filter(([_, problemas]) => problemas > 0)
      .map(([mes, problemas]) => ({ mes, problemas }))
      .sort((a, b) => a.problemas - b.problemas)[0] || null;

    return {
      totalViajes: viajes.length,
      totalNinosTrasladados: totalNinos,
      totalKilometros: Math.round(totalKilometros * 10) / 10,
      promedioNinosPorViaje: totalNinos / viajes.length,
      promedioKilometrosPorViaje: totalKilometros / viajes.length,
      tiempoTotalConduccion: tiempoTotal,
      promedioTiempoPorViaje: tiempoTotal / viajes.length,
      totalProblemasRegistrados: alertasUrgencia.length,
      velocidadPromedio: Math.round(velocidadPromedio * 10) / 10,
      eficienciaRuta: Math.round(eficienciaRuta * 10) / 10,
      tasaOcupacion: Math.round(tasaOcupacion * 10) / 10,
      tasaProblemas: Math.round(tasaProblemas * 10) / 10,
      diasConsecutivosSinProblemas,
      mejorRachaSinProblemas,
      viajesPorMes,
      viajesPorDia,
      viajesPorDiaSemana,
      viajesPorHora,
      problemasPorMes,
      problemasPorDia,
      viajesPorPatente,
      topApoderados,
      topNinos,
      mesMasActivo,
      diaMasActivo,
      mesConMenosProblemas,
    };
  }, [viajes, alertasUrgencia]);

  useEffect(() => {
    const cargarViajes = async () => {
      try {
        const rutGuardado = await AsyncStorage.getItem('rutUsuario');
        if (!rutGuardado) {
          setLoading(false);
          return;
        }

        setRutConductor(rutGuardado);
        const rutNormalizado = normalizarRut(rutGuardado);

        const historialRef = collection(db, 'historial_viajes');
        
        // Obtener todos los viajes del conductor
        const viajesList: Viaje[] = [];
        
        // Intentar consulta con RUT normalizado
        try {
          const historialQuery = query(
            historialRef,
            where('rutConductor', '==', rutNormalizado),
            where('tipoUsuario', '==', 'conductor'),
            orderBy('fechaViaje', 'desc')
          );

          const snapshot = await getDocs(historialQuery);
          
          snapshot.forEach((doc) => {
            const data = doc.data();
            
            // Parsear rutaGeometry si es string
            let rutaGeometry = data.rutaGeometry;
            if (typeof rutaGeometry === 'string') {
              try {
                rutaGeometry = JSON.parse(rutaGeometry);
              } catch (e) {
                // Ignorar errores de parsing
              }
            }

            viajesList.push({
              id: doc.id,
              fechaViaje: data.fechaViaje,
              fechaViajeFormateada: data.fechaViajeFormateada || 'Fecha no disponible',
              fechaInicio: data.fechaInicio,
              fechaInicioFormateada: data.fechaInicioFormateada,
              fechaFin: data.fechaFin,
              fechaFinFormateada: data.fechaFinFormateada,
              cantidadNinos: data.cantidadNinos || 0,
              patenteFurgon: data.patenteFurgon || 'Sin patente',
              waypoints: data.waypoints || [],
              pasajeros: data.pasajeros || [],
            });
          });
        } catch (error) {
          console.error('Error al cargar viajes:', error);
        }

        // Si no se encontraron con RUT normalizado, intentar con RUT original
        if (viajesList.length === 0 && rutGuardado !== rutNormalizado) {
          try {
            const historialQuery2 = query(
              historialRef,
              where('rutConductor', '==', rutGuardado),
              where('tipoUsuario', '==', 'conductor'),
              orderBy('fechaViaje', 'desc')
            );

            const snapshot2 = await getDocs(historialQuery2);
            
            snapshot2.forEach((doc) => {
              const data = doc.data();
              let rutaGeometry = data.rutaGeometry;
              if (typeof rutaGeometry === 'string') {
                try {
                  rutaGeometry = JSON.parse(rutaGeometry);
                } catch (e) {}
              }

              viajesList.push({
                id: doc.id,
                fechaViaje: data.fechaViaje,
                fechaViajeFormateada: data.fechaViajeFormateada || 'Fecha no disponible',
                fechaInicio: data.fechaInicio,
                fechaInicioFormateada: data.fechaInicioFormateada,
                fechaFin: data.fechaFin,
                fechaFinFormateada: data.fechaFinFormateada,
                cantidadNinos: data.cantidadNinos || 0,
                patenteFurgon: data.patenteFurgon || 'Sin patente',
                waypoints: data.waypoints || [],
                pasajeros: data.pasajeros || [],
              });
            });
          } catch (error) {
            console.error('Error al cargar viajes con RUT original:', error);
          }
        }

        setViajes(viajesList);
      } catch (error) {
        console.error('Error al cargar historial:', error);
      } finally {
        setLoading(false);
      }
    };

    cargarViajes();
  }, []);

  const formatearTiempo = (minutos: number): string => {
    const horas = Math.floor(minutos / 60);
    const mins = Math.round(minutos % 60);
    if (horas > 0) {
      return `${horas}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const formatearFecha = (fechaStr: string): string => {
    try {
      const fecha = new Date(fechaStr);
      return fecha.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
    } catch {
      return fechaStr;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#127067" />
        <Text style={styles.loadingText}>Cargando reportes...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerContainer}>
          <Text style={styles.title}>Reportes y Estadísticas</Text>
          <Text style={styles.subtitle}>Análisis completo de tu actividad como conductor</Text>
        </View>

        {/* Tarjetas de estadísticas principales */}
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, styles.statCardPrimary]}>
            <View style={styles.statIconContainer}>
              <Ionicons name="car" size={36} color="#FFFFFF" />
            </View>
            <Text style={styles.statValue}>{estadisticas.totalViajes}</Text>
            <Text style={styles.statLabel}>Viajes Realizados</Text>
          </View>

          <View style={[styles.statCard, styles.statCardSecondary]}>
            <View style={[styles.statIconContainer, styles.statIconContainerSecondary]}>
              <Ionicons name="people" size={36} color="#FFFFFF" />
            </View>
            <Text style={styles.statValue}>{estadisticas.totalNinosTrasladados}</Text>
            <Text style={styles.statLabel}>Niños Trasladados</Text>
          </View>

          <View style={[styles.statCard, styles.statCardTertiary]}>
            <View style={[styles.statIconContainer, styles.statIconContainerTertiary]}>
              <Ionicons name="map" size={36} color="#FFFFFF" />
            </View>
            <Text style={styles.statValue}>{estadisticas.totalKilometros.toFixed(1)}</Text>
            <Text style={styles.statLabel}>Kilómetros Recorridos</Text>
          </View>

          <View style={[styles.statCard, styles.statCardQuaternary]}>
            <View style={[styles.statIconContainer, styles.statIconContainerQuaternary]}>
              <Ionicons name="time" size={36} color="#FFFFFF" />
            </View>
            <Text style={styles.statValue}>{formatearTiempo(estadisticas.tiempoTotalConduccion)}</Text>
            <Text style={styles.statLabel}>Tiempo Total</Text>
          </View>

          <View style={[styles.statCard, styles.statCardWarning]}>
            <View style={[styles.statIconContainer, styles.statIconContainerWarning]}>
              <Ionicons name="warning" size={36} color="#FFFFFF" />
            </View>
            <Text style={[styles.statValue, styles.statValueWarning]}>{estadisticas.totalProblemasRegistrados}</Text>
            <Text style={styles.statLabel}>Problemas Registrados</Text>
          </View>
        </View>

        {/* Promedios */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="stats-chart" size={22} color="#127067" />
            <Text style={styles.sectionTitle}>Promedios</Text>
          </View>
          <View style={styles.averageCard}>
            <View style={styles.averageItem}>
              <View style={styles.averageItemLeft}>
                <Ionicons name="people-outline" size={20} color="#127067" />
                <Text style={styles.averageLabel}>Niños por viaje</Text>
              </View>
              <Text style={styles.averageValue}>
                {estadisticas.promedioNinosPorViaje.toFixed(1)}
              </Text>
            </View>
            <View style={styles.averageItem}>
              <View style={styles.averageItemLeft}>
                <Ionicons name="map-outline" size={20} color="#127067" />
                <Text style={styles.averageLabel}>Kilómetros por viaje</Text>
              </View>
              <Text style={styles.averageValue}>
                {estadisticas.promedioKilometrosPorViaje.toFixed(1)} km
              </Text>
            </View>
            <View style={[styles.averageItem, styles.averageItemLast]}>
              <View style={styles.averageItemLeft}>
                <Ionicons name="time-outline" size={20} color="#127067" />
                <Text style={styles.averageLabel}>Tiempo por viaje</Text>
              </View>
              <Text style={styles.averageValue}>
                {formatearTiempo(estadisticas.promedioTiempoPorViaje)}
              </Text>
            </View>
          </View>
        </View>

        {/* Estadísticas por día - Viajes y Problemas */}
        {(Object.keys(estadisticas.viajesPorDia).length > 0 || Object.keys(estadisticas.problemasPorDia).length > 0) && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="calendar" size={22} color="#127067" />
              <Text style={styles.sectionTitle}>Estadísticas por Día</Text>
            </View>
            <View style={styles.dayCard}>
              {(() => {
                // Combinar todos los días con actividad (viajes o problemas)
                const todosLosDias = new Set([
                  ...Object.keys(estadisticas.viajesPorDia),
                  ...Object.keys(estadisticas.problemasPorDia),
                ]);

                return Array.from(todosLosDias)
                  .sort((a, b) => {
                    // Ordenar por fecha (más reciente primero)
                    const fechaA = new Date(a.split('/').reverse().join('-'));
                    const fechaB = new Date(b.split('/').reverse().join('-'));
                    return fechaB.getTime() - fechaA.getTime();
                  })
                  .slice(0, 30) // Mostrar últimos 30 días
                  .map((dia) => {
                    const statsViajes = estadisticas.viajesPorDia[dia] || { viajes: 0, ninos: 0, kilometros: 0 };
                    const problemas = estadisticas.problemasPorDia[dia] || 0;
                    
                    return (
                      <View key={dia} style={styles.dayItem}>
                        <View style={styles.dayHeader}>
                          <Text style={styles.dayLabel}>{dia}</Text>
                          <View style={styles.dayHeaderRight}>
                            {statsViajes.viajes > 0 && (
                              <View style={styles.dayBadge}>
                                <Ionicons name="car" size={14} color="#127067" />
                                <Text style={styles.dayBadgeText}>{statsViajes.viajes}</Text>
                              </View>
                            )}
                            {problemas > 0 && (
                              <View style={[styles.dayBadge, styles.dayBadgeWarning]}>
                                <Ionicons name="warning" size={14} color="#f39c12" />
                                <Text style={[styles.dayBadgeText, styles.dayBadgeTextWarning]}>{problemas}</Text>
                              </View>
                            )}
                          </View>
                        </View>
                        {statsViajes.viajes > 0 && (
                          <View style={styles.dayStats}>
                            <View style={styles.dayStatItem}>
                              <Ionicons name="people-outline" size={16} color="#127067" />
                              <Text style={styles.dayStatText}>{statsViajes.ninos} niños</Text>
                            </View>
                            <View style={styles.dayStatItem}>
                              <Ionicons name="map-outline" size={16} color="#127067" />
                              <Text style={styles.dayStatText}>{statsViajes.kilometros.toFixed(1)} km</Text>
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  });
              })()}
            </View>
          </View>
        )}

        {/* Estadísticas por mes - Viajes y Problemas */}
        {(Object.keys(estadisticas.viajesPorMes).length > 0 || Object.keys(estadisticas.problemasPorMes).length > 0) && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="calendar-outline" size={22} color="#127067" />
              <Text style={styles.sectionTitle}>Estadísticas por Mes</Text>
            </View>
            <View style={styles.monthCard}>
              {(() => {
                // Combinar todos los meses con actividad
                const todosLosMeses = new Set([
                  ...Object.keys(estadisticas.viajesPorMes),
                  ...Object.keys(estadisticas.problemasPorMes),
                ]);

                return Array.from(todosLosMeses)
                  .sort((a, b) => {
                    const [mesA, anoA] = a.split('/').map(Number);
                    const [mesB, anoB] = b.split('/').map(Number);
                    if (anoA !== anoB) return anoB - anoA;
                    return mesB - mesA;
                  })
                  .map((mes) => {
                    const viajes = estadisticas.viajesPorMes[mes] || 0;
                    const problemas = estadisticas.problemasPorMes[mes] || 0;
                    
                    return (
                      <View key={mes} style={styles.monthItem}>
                        <Text style={styles.monthLabel}>{formatearFecha(mes)}</Text>
                        <View style={styles.monthStats}>
                          {viajes > 0 && (
                            <View style={styles.monthStatBadge}>
                              <Ionicons name="car" size={14} color="#127067" />
                              <Text style={styles.monthStatText}>{viajes} viajes</Text>
                            </View>
                          )}
                          {problemas > 0 && (
                            <View style={[styles.monthStatBadge, styles.monthStatBadgeWarning]}>
                              <Ionicons name="warning" size={14} color="#f39c12" />
                              <Text style={[styles.monthStatText, styles.monthStatTextWarning]}>{problemas} problemas</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    );
                  });
              })()}
            </View>
          </View>
        )}

        {/* Sección de Problemas Registrados */}
        {estadisticas.totalProblemasRegistrados > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="alert-circle" size={22} color="#f39c12" />
              <Text style={styles.sectionTitle}>Problemas Registrados</Text>
            </View>
            <View style={styles.problemasCard}>
              <View style={styles.problemasHeader}>
                <View style={styles.problemasIconContainer}>
                  <Ionicons name="alert-circle" size={32} color="#FFFFFF" />
                </View>
                <View style={styles.problemasHeaderText}>
                  <Text style={styles.problemasTotal}>{estadisticas.totalProblemasRegistrados}</Text>
                  <Text style={styles.problemasLabel}>Alertas de emergencia registradas</Text>
                </View>
              </View>
              {alertasUrgencia.slice(0, 10).map((alerta) => {
                const fechaStr = alerta.fecha?.toDate 
                  ? alerta.fecha.toDate().toLocaleDateString('es-CL', { 
                      day: '2-digit', 
                      month: '2-digit', 
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : 'Fecha no disponible';
                
                return (
                  <View key={alerta.id} style={styles.problemaItem}>
                    <Ionicons name="warning-outline" size={20} color="#f39c12" />
                    <View style={styles.problemaContent}>
                      <Text style={styles.problemaDescripcion}>{alerta.descripcion}</Text>
                      <Text style={styles.problemaFecha}>{fechaStr}</Text>
                      {alerta.patenteFurgon && (
                        <Text style={styles.problemaPatente}>Furgón: {alerta.patenteFurgon}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Estadísticas por patente */}
        {Object.keys(estadisticas.viajesPorPatente).length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="car-sport" size={22} color="#127067" />
              <Text style={styles.sectionTitle}>Estadísticas por Furgón</Text>
            </View>
            {Object.entries(estadisticas.viajesPorPatente).map(([patente, stats]) => (
              <View key={patente} style={styles.patenteCard}>
                <Text style={styles.patenteTitle}>{patente}</Text>
                <View style={styles.patenteStats}>
                  <View style={styles.patenteStatItem}>
                    <Ionicons name="car-outline" size={20} color="#127067" />
                    <Text style={styles.patenteStatText}>{stats.viajes} viajes</Text>
                  </View>
                  <View style={styles.patenteStatItem}>
                    <Ionicons name="people-outline" size={20} color="#127067" />
                    <Text style={styles.patenteStatText}>{stats.ninos} niños</Text>
                  </View>
                  <View style={styles.patenteStatItem}>
                    <Ionicons name="map-outline" size={20} color="#127067" />
                    <Text style={styles.patenteStatText}>{stats.kilometros.toFixed(1)} km</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Top apoderados */}
        {estadisticas.topApoderados.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="people-circle" size={22} color="#127067" />
              <Text style={styles.sectionTitle}>Apoderados Más Frecuentes</Text>
            </View>
            <View style={styles.topCard}>
              {estadisticas.topApoderados.map((apoderado, index) => (
                <View key={index} style={styles.topItem}>
                  <View style={styles.topRank}>
                    <Text style={styles.topRankText}>{index + 1}</Text>
                  </View>
                  <View style={styles.topInfo}>
                    <Text style={styles.topName}>{apoderado.nombre}</Text>
                    <Text style={styles.topCount}>{apoderado.cantidad} viajes</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Top niños */}
        {estadisticas.topNinos.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="happy" size={22} color="#127067" />
              <Text style={styles.sectionTitle}>Niños Más Trasladados</Text>
            </View>
            <View style={styles.topCard}>
              {estadisticas.topNinos.map((nino, index) => (
                <View key={index} style={styles.topItem}>
                  <View style={styles.topRank}>
                    <Text style={styles.topRankText}>{index + 1}</Text>
                  </View>
                  <View style={styles.topInfo}>
                    <Text style={styles.topName}>{nino.nombre}</Text>
                    <Text style={styles.topCount}>{nino.cantidad} viajes</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Análisis Temporal */}
        {(Object.keys(estadisticas.viajesPorDiaSemana).length > 0 || Object.keys(estadisticas.viajesPorHora).length > 0) && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="time" size={22} color="#127067" />
              <Text style={styles.sectionTitle}>Análisis Temporal</Text>
            </View>
            
            {/* Día de la semana más activo */}
            {Object.keys(estadisticas.viajesPorDiaSemana).length > 0 && (
              <View style={styles.temporalCard}>
                <Text style={styles.temporalTitle}>Viajes por Día de la Semana</Text>
                <View style={styles.temporalGrid}>
                  {['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'].map((dia) => {
                    const cantidad = estadisticas.viajesPorDiaSemana[dia] || 0;
                    const maxCantidad = Math.max(...Object.values(estadisticas.viajesPorDiaSemana));
                    const porcentaje = maxCantidad > 0 ? (cantidad / maxCantidad) * 100 : 0;
                    
                    return (
                      <View key={dia} style={styles.temporalItem}>
                        <Text style={styles.temporalLabel}>{dia.substring(0, 3)}</Text>
                        <View style={styles.temporalBarContainer}>
                          <View style={[styles.temporalBar, { width: `${porcentaje}%` }]} />
                        </View>
                        <Text style={styles.temporalValue}>{cantidad}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Hora del día más activa */}
            {Object.keys(estadisticas.viajesPorHora).length > 0 && (
              <View style={styles.temporalCard}>
                <Text style={styles.temporalTitle}>Viajes por Hora del Día</Text>
                <View style={styles.hourGrid}>
                  {Object.entries(estadisticas.viajesPorHora)
                    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                    .map(([hora, cantidad]) => {
                      const maxCantidad = Math.max(...Object.values(estadisticas.viajesPorHora));
                      const porcentaje = maxCantidad > 0 ? (cantidad / maxCantidad) * 100 : 0;
                      
                      return (
                        <View key={hora} style={styles.hourItem}>
                          <Text style={styles.hourLabel}>{hora}</Text>
                          <View style={styles.hourBarContainer}>
                            <View style={[styles.hourBar, { height: `${Math.max(porcentaje, 10)}%` }]} />
                          </View>
                          <Text style={styles.hourValue}>{cantidad}</Text>
                        </View>
                      );
                    })}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Récords y Logros */}
        {(estadisticas.mesMasActivo || estadisticas.diaMasActivo || estadisticas.mesConMenosProblemas) && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="trophy" size={22} color="#f39c12" />
              <Text style={styles.sectionTitle}>Récords y Logros</Text>
            </View>
            <View style={styles.recordsCard}>
              {estadisticas.mesMasActivo && (
                <View style={styles.recordItem}>
                  <View style={styles.recordIconContainer}>
                    <Ionicons name="calendar" size={28} color="#127067" />
                  </View>
                  <View style={styles.recordContent}>
                    <Text style={styles.recordLabel}>Mes más activo</Text>
                    <Text style={styles.recordValue}>{formatearFecha(estadisticas.mesMasActivo.mes)}</Text>
                    <Text style={styles.recordSubtext}>{estadisticas.mesMasActivo.viajes} viajes realizados</Text>
                  </View>
                </View>
              )}
              {estadisticas.diaMasActivo && (
                <View style={styles.recordItem}>
                  <View style={[styles.recordIconContainer, styles.recordIconContainerSecondary]}>
                    <Ionicons name="calendar-outline" size={28} color="#4A90E2" />
                  </View>
                  <View style={styles.recordContent}>
                    <Text style={styles.recordLabel}>Día más activo</Text>
                    <Text style={styles.recordValue}>{estadisticas.diaMasActivo.dia}</Text>
                    <Text style={styles.recordSubtext}>{estadisticas.diaMasActivo.viajes} viajes realizados</Text>
                  </View>
                </View>
              )}
              {estadisticas.mesConMenosProblemas && (
                <View style={[styles.recordItem, styles.recordItemLast]}>
                  <View style={[styles.recordIconContainer, styles.recordIconContainerSuccess]}>
                    <Ionicons name="shield-checkmark" size={28} color="#50C878" />
                  </View>
                  <View style={styles.recordContent}>
                    <Text style={styles.recordLabel}>Mes con menos problemas</Text>
                    <Text style={styles.recordValue}>{formatearFecha(estadisticas.mesConMenosProblemas.mes)}</Text>
                    <Text style={styles.recordSubtext}>Solo {estadisticas.mesConMenosProblemas.problemas} problema(s)</Text>
                  </View>
                </View>
              )}
            </View>
          </View>
        )}

        {viajes.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="bar-chart-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No hay datos disponibles</Text>
            <Text style={styles.emptySubtext}>
              Los reportes aparecerán aquí una vez que completes tus primeros viajes
            </Text>
          </View>
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
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    zIndex: 10,
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F7F8',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#127067',
  },
  scrollContent: {
    padding: 20,
    paddingTop: 80,
    paddingBottom: 40,
  },
  headerContainer: {
    marginBottom: 32,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    marginBottom: 0,
    textAlign: 'center',
    lineHeight: 22,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  statCardPrimary: {
    borderTopWidth: 4,
    borderTopColor: '#127067',
  },
  statCardSecondary: {
    borderTopWidth: 4,
    borderTopColor: '#4A90E2',
  },
  statCardTertiary: {
    borderTopWidth: 4,
    borderTopColor: '#50C878',
  },
  statCardQuaternary: {
    borderTopWidth: 4,
    borderTopColor: '#9B59B6',
  },
  statIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#127067',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#127067',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  statIconContainerSecondary: {
    backgroundColor: '#4A90E2',
    shadowColor: '#4A90E2',
  },
  statIconContainerTertiary: {
    backgroundColor: '#50C878',
    shadowColor: '#50C878',
  },
  statIconContainerQuaternary: {
    backgroundColor: '#9B59B6',
    shadowColor: '#9B59B6',
  },
  statIconContainerWarning: {
    backgroundColor: '#f39c12',
    shadowColor: '#f39c12',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginTop: 4,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 16,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    letterSpacing: -0.3,
  },
  averageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  averageItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  averageItemLast: {
    borderBottomWidth: 0,
  },
  averageItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  averageLabel: {
    fontSize: 15,
    color: '#333',
    fontWeight: '500',
  },
  averageValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#127067',
    letterSpacing: -0.3,
  },
  monthCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  monthItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  monthLabel: {
    fontSize: 15,
    color: '#1A1A1A',
    textTransform: 'capitalize',
    fontWeight: '600',
  },
  monthValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#127067',
  },
  patenteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  patenteTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#127067',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  patenteStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  patenteStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  patenteStatText: {
    fontSize: 14,
    color: '#666',
  },
  topCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  topItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  topRank: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#127067',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    shadowColor: '#127067',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  topRankText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  topInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topName: {
    fontSize: 15,
    color: '#1A1A1A',
    flex: 1,
    fontWeight: '500',
  },
  topCount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#127067',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
  dayCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  dayItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  dayLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  dayViajes: {
    fontSize: 14,
    fontWeight: '600',
    color: '#127067',
  },
  dayStats: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 4,
  },
  dayStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dayStatText: {
    fontSize: 13,
    color: '#666',
  },
  dayHeaderRight: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  dayBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F7F5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  dayBadgeWarning: {
    backgroundColor: '#FFF4E6',
  },
  dayBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#127067',
  },
  dayBadgeTextWarning: {
    color: '#f39c12',
  },
  monthStats: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  monthStatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6F7F5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 5,
  },
  monthStatBadgeWarning: {
    backgroundColor: '#FFF4E6',
  },
  monthStatText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#127067',
  },
  monthStatTextWarning: {
    color: '#f39c12',
  },
  statCardWarning: {
    borderTopWidth: 4,
    borderTopColor: '#f39c12',
  },
  statValueWarning: {
    color: '#f39c12',
  },
  problemasCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#FFF4E6',
  },
  problemasHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 20,
    borderBottomWidth: 2,
    borderBottomColor: '#FFF4E6',
  },
  problemasIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f39c12',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#f39c12',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  problemasHeaderText: {
    marginLeft: 16,
    flex: 1,
  },
  problemasTotal: {
    fontSize: 32,
    fontWeight: '700',
    color: '#f39c12',
    letterSpacing: -0.5,
  },
  problemasLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 6,
    fontWeight: '500',
  },
  problemaItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  problemaContent: {
    flex: 1,
    marginLeft: 16,
  },
  problemaDescripcion: {
    fontSize: 15,
    color: '#1A1A1A',
    fontWeight: '600',
    marginBottom: 6,
    lineHeight: 20,
  },
  problemaFecha: {
    fontSize: 13,
    color: '#999',
    marginBottom: 4,
    fontWeight: '400',
  },
  problemaPatente: {
    fontSize: 13,
    color: '#127067',
    fontWeight: '600',
  },
  qualityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  qualityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  qualityItemLast: {
    borderBottomWidth: 0,
  },
  qualityIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFF4E6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  qualityIconContainerSuccess: {
    backgroundColor: '#E6F7F5',
  },
  qualityIconContainerBest: {
    backgroundColor: '#F3E5F5',
  },
  qualityContent: {
    flex: 1,
  },
  qualityLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    fontWeight: '500',
  },
  qualityValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 2,
    letterSpacing: -0.5,
  },
  qualitySubtext: {
    fontSize: 12,
    color: '#999',
  },
  temporalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  temporalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  temporalGrid: {
    gap: 12,
  },
  temporalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  temporalLabel: {
    fontSize: 13,
    color: '#666',
    width: 50,
    fontWeight: '600',
  },
  temporalBarContainer: {
    flex: 1,
    height: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  temporalBar: {
    height: '100%',
    backgroundColor: '#127067',
    borderRadius: 4,
  },
  temporalValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#127067',
    width: 40,
    textAlign: 'right',
  },
  hourGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 8,
    minHeight: 120,
  },
  hourItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  hourLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  hourBarContainer: {
    width: '100%',
    height: 80,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  hourBar: {
    width: '100%',
    backgroundColor: '#127067',
    borderRadius: 4,
    minHeight: 4,
  },
  hourValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#127067',
  },
  recordsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  recordItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  recordItemLast: {
    borderBottomWidth: 0,
  },
  recordIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E6F7F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  recordIconContainerSecondary: {
    backgroundColor: '#E3F2FD',
  },
  recordIconContainerSuccess: {
    backgroundColor: '#E8F5E9',
  },
  recordContent: {
    flex: 1,
  },
  recordLabel: {
    fontSize: 13,
    color: '#666',
    marginBottom: 4,
    fontWeight: '500',
  },
  recordValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 2,
    letterSpacing: -0.3,
  },
  recordSubtext: {
    fontSize: 12,
    color: '#999',
  },
});

