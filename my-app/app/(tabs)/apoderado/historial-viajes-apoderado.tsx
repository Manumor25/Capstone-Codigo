import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableHighlight,
  ActivityIndicator,
  Alert,
  Image,
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
  fechaInicio?: any;
  fechaInicioFormateada?: string;
  fechaFin?: any;
  fechaFinFormateada?: string;
  cantidadNinos: number;
  patenteFurgon: string;
  rutaGeometry?: any;
  waypoints?: Array<{ coordinates: { latitude: number; longitude: number }; name: string }>;
  imagenRuta?: string | null; // URL de la imagen estática del mapa
  pasajeros: PasajeroHistorial[];
}

export default function HistorialViajesApoderado() {
  useSyncRutActivo();
  const router = useRouter();
  const [viajes, setViajes] = useState<Viaje[]>([]);
  const [loading, setLoading] = useState(true);
  const [rutApoderado, setRutApoderado] = useState<string>('');

  const normalizarRut = (rut: string): string => {
    return rut.replace(/[^0-9kK]/g, '').toUpperCase();
  };

  const cargarHistorial = useCallback(async () => {
    try {
      const rutGuardado = await AsyncStorage.getItem('rutUsuario');
      if (!rutGuardado) {
        Alert.alert('Error', 'No se encontró el RUT del apoderado.');
        setLoading(false);
        return;
      }

      setRutApoderado(rutGuardado);
      const rutNormalizado = normalizarRut(rutGuardado);
      
      console.log(`🔍 Buscando historial - RUT guardado: "${rutGuardado}", RUT normalizado: "${rutNormalizado}"`);
      
      const historialRef = collection(db, 'historial_viajes');
      
      // PRIMERO: Hacer una consulta simple para ver TODOS los documentos y depurar
      try {
        const allDocsQuery = query(historialRef, limit(50));
        const allDocsSnapshot = await getDocs(allDocsQuery);
        console.log(`🔍 DEBUG: Total documentos en historial_viajes: ${allDocsSnapshot.docs.length}`);
        console.log(`🔍 Buscando con RUT guardado: "${rutGuardado}" y RUT normalizado: "${rutNormalizado}"`);
        
        // Buscar documentos que coincidan con nuestro RUT (sin filtros estrictos)
        const documentosCoincidentes: any[] = [];
        allDocsSnapshot.docs.forEach((doc, idx) => {
          const data = doc.data();
          const rutApoderadoDoc = (data.rutApoderado || '').toString().trim();
          const rutApoderadoDocNormalizado = normalizarRut(rutApoderadoDoc);
          const tipoUsuarioDoc = (data.tipoUsuario || '').toString().trim();
          
          // Verificar si coincide con nuestro RUT (normalizado o original)
          const coincideRUT = rutApoderadoDocNormalizado === rutNormalizado || 
                            rutApoderadoDoc === rutGuardado ||
                            rutApoderadoDocNormalizado === normalizarRut(rutGuardado);
          
          if (coincideRUT && tipoUsuarioDoc === 'apoderado') {
            documentosCoincidentes.push({ doc, data });
          }
          
          // Log de los primeros 10 documentos para depuración
          if (idx < 10) {
            console.log(`  📄 Doc ${idx + 1}: ID=${doc.id}`);
            console.log(`     - rutConductor: "${data.rutConductor || 'N/A'}"`);
            console.log(`     - rutApoderado: "${rutApoderadoDoc}" (normalizado: "${rutApoderadoDocNormalizado}")`);
            console.log(`     - tipoUsuario: "${tipoUsuarioDoc}"`);
            console.log(`     - fechaViajeFormateada: "${data.fechaViajeFormateada || 'N/A'}"`);
            console.log(`     - Coincide con nuestro RUT: ${coincideRUT && tipoUsuarioDoc === 'apoderado' ? '✅ SÍ' : '❌ NO'}`);
          }
        });
        
        console.log(`🔍 Documentos que coinciden con nuestro RUT y tipoUsuario='apoderado': ${documentosCoincidentes.length}`);
        if (documentosCoincidentes.length > 0) {
          console.log('✅ Encontrados documentos que deberían aparecer:');
          documentosCoincidentes.forEach((item, idx) => {
            console.log(`  📄 Doc ${idx + 1}: ID=${item.doc.id}, fechaViajeFormateada="${item.data.fechaViajeFormateada || 'N/A'}"`);
          });
        }
      } catch (debugError) {
        console.warn('⚠️ Error en consulta de depuración:', debugError);
      }
      
      // ESTRATEGIA: Primero intentar consultas optimizadas, si fallan, usar consulta general y filtrar en memoria
      const viajesMap = new Map<string, Viaje>();
      let consultaExitosa = false;
      
      // Consulta 1: Con RUT normalizado (intentar con orderBy primero)
      try {
        const historialQuery1 = query(
          historialRef,
          where('rutApoderado', '==', rutNormalizado),
          where('tipoUsuario', '==', 'apoderado'),
          orderBy('fechaViaje', 'desc'),
          limit(50)
        );

        const snapshot1 = await getDocs(historialQuery1);
        console.log(`📋 Historial encontrado (RUT normalizado "${rutNormalizado}"): ${snapshot1.docs.length} viajes`);

        snapshot1.forEach((doc) => {
          const data = doc.data();
          // Si rutaGeometry es un string JSON, parsearlo
          let rutaGeometry = data.rutaGeometry;
          if (typeof rutaGeometry === 'string') {
            try {
              rutaGeometry = JSON.parse(rutaGeometry);
            } catch (e) {
              console.warn('⚠️ Error al parsear rutaGeometry:', e);
            }
          }
          
          viajesMap.set(doc.id, {
            id: doc.id,
            fechaViaje: data.fechaViaje,
            fechaViajeFormateada: data.fechaViajeFormateada || 'Fecha no disponible',
            fechaInicio: data.fechaInicio,
            fechaInicioFormateada: data.fechaInicioFormateada,
            fechaFin: data.fechaFin,
            fechaFinFormateada: data.fechaFinFormateada,
            cantidadNinos: data.cantidadNinos || 0,
            patenteFurgon: data.patenteFurgon || 'Sin patente',
            rutaGeometry: rutaGeometry,
            waypoints: data.waypoints || [],
            imagenRuta: data.imagenRuta || null,
            pasajeros: data.pasajeros || [],
          });
        });
        consultaExitosa = true;
      } catch (error1: any) {
        console.warn('⚠️ Error en consulta con orderBy:', error1);
        // Si el error es por índice faltante, intentar sin orderBy
        if (error1?.code === 'failed-precondition' || error1?.message?.includes('index')) {
          console.log('⚠️ Intentando consulta sin orderBy...');
          try {
            const historialQuery1SinOrder = query(
              historialRef,
              where('rutApoderado', '==', rutNormalizado),
              where('tipoUsuario', '==', 'apoderado'),
              limit(50)
            );
            const snapshot1SinOrder = await getDocs(historialQuery1SinOrder);
            console.log(`📋 Historial encontrado (sin orderBy): ${snapshot1SinOrder.docs.length} viajes`);
            
            snapshot1SinOrder.forEach((doc) => {
              const data = doc.data();
              // Si rutaGeometry es un string JSON, parsearlo
              let rutaGeometry = data.rutaGeometry;
              if (typeof rutaGeometry === 'string') {
                try {
                  rutaGeometry = JSON.parse(rutaGeometry);
                } catch (e) {
                  console.warn('⚠️ Error al parsear rutaGeometry:', e);
                }
              }
              
              viajesMap.set(doc.id, {
                id: doc.id,
                fechaViaje: data.fechaViaje,
                fechaViajeFormateada: data.fechaViajeFormateada || 'Fecha no disponible',
                fechaInicio: data.fechaInicio,
                fechaInicioFormateada: data.fechaInicioFormateada,
                fechaFin: data.fechaFin,
                fechaFinFormateada: data.fechaFinFormateada,
                cantidadNinos: data.cantidadNinos || 0,
                patenteFurgon: data.patenteFurgon || 'Sin patente',
                rutaGeometry: rutaGeometry,
                waypoints: data.waypoints || [],
                imagenRuta: data.imagenRuta || null,
                pasajeros: data.pasajeros || [],
              });
            });
            consultaExitosa = true;
          } catch (error1b) {
            console.warn('⚠️ Error en consulta sin orderBy:', error1b);
          }
        }
      }
      
      // Si las consultas optimizadas fallaron, usar consulta general y filtrar en memoria
      if (!consultaExitosa) {
        console.log('⚠️ Usando método de respaldo: consulta general y filtrado en memoria...');
        try {
          // Consultar TODOS los documentos de tipo 'apoderado' y filtrar por RUT en memoria
          const queryGeneral = query(
            historialRef,
            where('tipoUsuario', '==', 'apoderado'),
            limit(100) // Aumentar límite para asegurar que capturemos todos los viajes
          );
          const snapshotGeneral = await getDocs(queryGeneral);
          console.log(`📋 Documentos encontrados (tipoUsuario='apoderado'): ${snapshotGeneral.docs.length}`);
          
          snapshotGeneral.forEach((doc) => {
            const data = doc.data();
            const rutApoderadoDoc = (data.rutApoderado || '').toString().trim();
            const rutApoderadoDocNormalizado = normalizarRut(rutApoderadoDoc);
            
            // Verificar si coincide con nuestro RUT (normalizado o original)
            const coincideRUT = rutApoderadoDocNormalizado === rutNormalizado || 
                              rutApoderadoDoc === rutGuardado ||
                              rutApoderadoDocNormalizado === normalizarRut(rutGuardado);
            
            if (coincideRUT && !viajesMap.has(doc.id)) {
              // Si rutaGeometry es un string JSON, parsearlo
              let rutaGeometry = data.rutaGeometry;
              if (typeof rutaGeometry === 'string') {
                try {
                  rutaGeometry = JSON.parse(rutaGeometry);
                } catch (e) {
                  console.warn('⚠️ Error al parsear rutaGeometry:', e);
                }
              }
              
              viajesMap.set(doc.id, {
                id: doc.id,
                fechaViaje: data.fechaViaje,
                fechaViajeFormateada: data.fechaViajeFormateada || 'Fecha no disponible',
                fechaInicio: data.fechaInicio,
                fechaInicioFormateada: data.fechaInicioFormateada,
                fechaFin: data.fechaFin,
                fechaFinFormateada: data.fechaFinFormateada,
                cantidadNinos: data.cantidadNinos || 0,
                patenteFurgon: data.patenteFurgon || 'Sin patente',
                rutaGeometry: rutaGeometry,
                waypoints: data.waypoints || [],
                imagenRuta: data.imagenRuta || null,
                pasajeros: data.pasajeros || [],
              });
            }
          });
          console.log(`✅ Método de respaldo: ${viajesMap.size} viajes encontrados`);
        } catch (errorGeneral) {
          console.error('❌ Error en consulta general:', errorGeneral);
        }
      }

      // Consulta 2: Con RUT original (si es diferente al normalizado y la primera consulta fue exitosa)
      if (rutGuardado !== rutNormalizado && consultaExitosa) {
        try {
          const historialQuery2 = query(
            historialRef,
            where('rutApoderado', '==', rutGuardado),
            where('tipoUsuario', '==', 'apoderado'),
            orderBy('fechaViaje', 'desc'),
            limit(50)
          );

          const snapshot2 = await getDocs(historialQuery2);
          console.log(`📋 Historial encontrado (RUT original "${rutGuardado}"): ${snapshot2.docs.length} viajes`);

          snapshot2.forEach((doc) => {
            if (!viajesMap.has(doc.id)) {
              const data = doc.data();
              // Si rutaGeometry es un string JSON, parsearlo
              let rutaGeometry = data.rutaGeometry;
              if (typeof rutaGeometry === 'string') {
                try {
                  rutaGeometry = JSON.parse(rutaGeometry);
                } catch (e) {
                  console.warn('⚠️ Error al parsear rutaGeometry:', e);
                }
              }
              
              viajesMap.set(doc.id, {
                id: doc.id,
                fechaViaje: data.fechaViaje,
                fechaViajeFormateada: data.fechaViajeFormateada || 'Fecha no disponible',
                fechaInicio: data.fechaInicio,
                fechaInicioFormateada: data.fechaInicioFormateada,
                fechaFin: data.fechaFin,
                fechaFinFormateada: data.fechaFinFormateada,
                cantidadNinos: data.cantidadNinos || 0,
                patenteFurgon: data.patenteFurgon || 'Sin patente',
                rutaGeometry: rutaGeometry,
                waypoints: data.waypoints || [],
                imagenRuta: data.imagenRuta || null,
                pasajeros: data.pasajeros || [],
              });
            }
          });
        } catch (error2) {
          console.warn('⚠️ Error en consulta con RUT original:', error2);
          // Si falla, intentar sin orderBy
          try {
            const historialQuery2SinOrder = query(
              historialRef,
              where('rutApoderado', '==', rutGuardado),
              where('tipoUsuario', '==', 'apoderado'),
              limit(50)
            );
            const snapshot2SinOrder = await getDocs(historialQuery2SinOrder);
            snapshot2SinOrder.forEach((doc) => {
              if (!viajesMap.has(doc.id)) {
                const data = doc.data();
                // Si rutaGeometry es un string JSON, parsearlo
                let rutaGeometry = data.rutaGeometry;
                if (typeof rutaGeometry === 'string') {
                  try {
                    rutaGeometry = JSON.parse(rutaGeometry);
                  } catch (e) {
                    console.warn('⚠️ Error al parsear rutaGeometry:', e);
                  }
                }
                
                viajesMap.set(doc.id, {
                  id: doc.id,
                  fechaViaje: data.fechaViaje,
                  fechaViajeFormateada: data.fechaViajeFormateada || 'Fecha no disponible',
                  fechaInicio: data.fechaInicio,
                  fechaInicioFormateada: data.fechaInicioFormateada,
                  fechaFin: data.fechaFin,
                  fechaFinFormateada: data.fechaFinFormateada,
                  cantidadNinos: data.cantidadNinos || 0,
                  patenteFurgon: data.patenteFurgon || 'Sin patente',
                  rutaGeometry: rutaGeometry,
                  waypoints: data.waypoints || [],
                  imagenRuta: data.imagenRuta || null,
                  pasajeros: data.pasajeros || [],
                });
              }
            });
          } catch (error2b) {
            console.warn('⚠️ Error en consulta con RUT original sin orderBy:', error2b);
          }
        }
      }

      const viajesLista = Array.from(viajesMap.values());
      // Ordenar por fecha (más reciente primero)
      viajesLista.sort((a, b) => {
        const fechaA = a.fechaViaje?.toDate ? a.fechaViaje.toDate().getTime() : 0;
        const fechaB = b.fechaViaje?.toDate ? b.fechaViaje.toDate().getTime() : 0;
        return fechaB - fechaA;
      });

      console.log(`✅ Total de viajes cargados: ${viajesLista.length}`);
      if (viajesLista.length > 0) {
        console.log('✅ Viajes encontrados:');
        viajesLista.forEach((viaje, idx) => {
          console.log(`  📋 Viaje ${idx + 1}:`);
          console.log(`     - ID: ${viaje.id}`);
          console.log(`     - Fecha: ${viaje.fechaViajeFormateada}`);
          console.log(`     - Pasajeros: ${viaje.cantidadNinos}`);
          console.log(`     - Tiene imagen: ${viaje.imagenRuta ? 'Sí' : 'No'}`);
        });
      } else {
        console.warn('⚠️ No se encontraron viajes. Verifica:');
        console.warn('  1. ¿Se guardó el historial cuando terminaste la ruta?');
        console.warn('  2. ¿El RUT del apoderado coincide?');
        console.warn('  3. ¿Revisa la consola para ver los logs de guardado?');
      }
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

  // Función para convertir fecha formateada de 12H a 24H
  const convertirFecha12Ha24H = (fechaFormateada: string): string => {
    if (!fechaFormateada) return fechaFormateada;
    
    // Buscar patrones de fecha con hora 12H (ej: "18-11-2025, 11:02 p. m.")
    const match = fechaFormateada.match(/(\d{2}-\d{2}-\d{4}),\s*(\d{1,2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?)/i);
    if (match) {
      const fecha = match[1];
      let horas = parseInt(match[2], 10);
      const minutos = match[3];
      const esPM = /p\.?\s*m\.?/i.test(match[4]);
      
      if (esPM && horas !== 12) {
        horas += 12;
      } else if (!esPM && horas === 12) {
        horas = 0;
      }
      
      return `${fecha}, ${horas.toString().padStart(2, '0')}:${minutos}`;
    }
    
    // Si ya está en formato 24H o no tiene AM/PM, retornar tal cual
    return fechaFormateada;
  };

  const formatearFecha = (fecha: any, fechaFormateadaGuardada?: string) => {
    // Si hay una fecha formateada guardada, convertirla a 24H si es necesario
    if (fechaFormateadaGuardada) {
      return convertirFecha12Ha24H(fechaFormateadaGuardada);
    }
    
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
        hour12: false, // Formato 24 horas
      });
    } catch {
      return 'Fecha no disponible';
    }
  };

  // Función para convertir hora de 12H a 24H
  const convertir12Ha24H = (hora12H: string): string => {
    if (!hora12H) return hora12H;
    
    // Buscar patrones de hora 12H (ej: "11:02 p. m." o "10:58 a. m.")
    const match12H = hora12H.match(/(\d{1,2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?)/i);
    if (match12H) {
      let horas = parseInt(match12H[1], 10);
      const minutos = match12H[2];
      const esPM = /p\.?\s*m\.?/i.test(match12H[3]);
      
      if (esPM && horas !== 12) {
        horas += 12;
      } else if (!esPM && horas === 12) {
        horas = 0;
      }
      
      return `${horas.toString().padStart(2, '0')}:${minutos}`;
    }
    
    // Si ya está en formato 24H o no tiene AM/PM, retornar tal cual
    return hora12H;
  };

  const formatearHora = (timestamp: any, horaFormateada?: string | null) => {
    // Si hay una hora formateada guardada, convertirla a 24H si es necesario
    if (horaFormateada) {
      // Extraer solo la hora y minutos (puede estar en formato completo o solo hora)
      const horaConvertida = convertir12Ha24H(horaFormateada);
      // Si tiene formato completo (fecha y hora), extraer solo la hora
      const matchCompleto = horaConvertida.match(/(\d{2}:\d{2}):\d{2}/);
      if (matchCompleto) {
        return matchCompleto[1]; // Retornar solo HH:MM
      }
      // Si tiene formato de fecha completa, extraer la hora
      const matchFecha = horaConvertida.match(/(\d{2}:\d{2})/);
      if (matchFecha) {
        return matchFecha[1];
      }
      return horaConvertida;
    }
    
    // Si no, formatear desde el timestamp
    if (!timestamp) return 'N/A';
    try {
      const fechaObj = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return fechaObj.toLocaleTimeString('es-CL', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false, // Formato 24 horas
      });
    } catch {
      return 'N/A';
    }
  };

  const handleVerDetalle = (viaje: Viaje) => {
    router.push({
      pathname: '/(tabs)/apoderado/detalle-viaje',
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
            <Text style={styles.emptySubtext}>Los viajes de tus hijos aparecerán aquí</Text>
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
                      <Text style={styles.fechaText}>
                        {formatearFecha(viaje.fechaViaje, viaje.fechaInicioFormateada)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.viajeHeaderRight}>
                    <Ionicons name="people" size={20} color="#666" />
                    <Text style={styles.cantidadText}>{viaje.cantidadNinos}</Text>
                  </View>
                </View>

                {/* Fechas de inicio y fin */}
                <View style={styles.fechasContainer}>
                  <View style={styles.fechaItem}>
                    <Ionicons name="play-circle" size={16} color="#4CAF50" />
                    <Text style={styles.fechaLabel}>Inicio:</Text>
                    <Text style={styles.fechaValue}>
                      {formatearFecha(viaje.fechaInicio || viaje.fechaViaje, viaje.fechaInicioFormateada)}
                    </Text>
                  </View>
                  <View style={styles.fechaItem}>
                    <Ionicons name="stop-circle" size={16} color="#FF9800" />
                    <Text style={styles.fechaLabel}>Fin:</Text>
                    <Text style={styles.fechaValue}>
                      {formatearFecha(viaje.fechaFin || viaje.fechaViaje, viaje.fechaFinFormateada)}
                    </Text>
                  </View>
                </View>

                {/* Mini mapa de la ruta */}
                {viaje.imagenRuta && (
                  <View style={styles.miniMapaContainer}>
                    <Image 
                      source={{ uri: viaje.imagenRuta }} 
                      style={styles.miniMapa}
                      resizeMode="cover"
                    />
                  </View>
                )}

                <View style={styles.viajeBody}>
                  <Text style={styles.ninosTitle}>
                    {viaje.cantidadNinos} {viaje.cantidadNinos === 1 ? 'niño' : 'niños'} a bordo
                  </Text>
                  <View style={styles.ninosList}>
                    {viaje.pasajeros.map((pasajero, index) => (
                      <View key={index} style={styles.ninoItem}>
                        <Ionicons name="person-circle" size={18} color="#127067" />
                        <Text style={styles.ninoNombre} numberOfLines={1}>
                          {pasajero.nombreHijo}
                        </Text>
                        <View style={styles.horarios}>
                          {pasajero.fechaRecogido && (
                            <View style={styles.horarioItem}>
                              <Ionicons name="arrow-down-circle" size={14} color="#4CAF50" />
                              <Text style={styles.horarioText}>
                                Recogido: {formatearHora(pasajero.fechaRecogido, pasajero.horaRecogidoFormateada)}
                              </Text>
                            </View>
                          )}
                          {pasajero.fechaEntregado && (
                            <View style={styles.horarioItem}>
                              <Ionicons name="arrow-up-circle" size={14} color="#FF9800" />
                              <Text style={styles.horarioText}>
                                Entregado: {formatearHora(pasajero.fechaEntregado, pasajero.horaEntregadoFormateada)}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    ))}
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
  miniMapaContainer: {
    marginBottom: 12,
    borderRadius: 8,
    overflow: 'hidden',
    height: 120,
    backgroundColor: '#f0f0f0',
  },
  miniMapa: {
    width: '100%',
    height: '100%',
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
    marginLeft: 4,
  },
  fechasContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
  },
  fechaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  fechaLabel: {
    fontSize: 13,
    color: '#666',
    marginLeft: 6,
    marginRight: 4,
  },
  fechaValue: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  ninosTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#127067',
    marginBottom: 8,
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

