import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { makeShadow } from '@/utils/shadow';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, useRouter } from 'expo-router';
import { collection, doc, getDocs, limit, onSnapshot, query, setDoc, where, serverTimestamp, getDoc, addDoc, deleteField, Timestamp } from 'firebase/firestore';
import React, { useEffect, useMemo, useState, useRef } from 'react';
import * as Location from 'expo-location';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableHighlight,
  View,
} from 'react-native';
import MapboxDriver from '../../../components/MapboxDriver';
import NotificacionesGlobales from '@/components/NotificacionesGlobales';

interface Pasajero {
  id: string;
  nombreHijo: string;
  nombreApoderado: string;
  rutHijo: string;
  rutApoderado: string;
  patenteFurgon: string;
  estadoViaje?: string;
  direccion?: string;
  coordenadas?: { latitude: number; longitude: number };
  distancia?: number;
}

export default function PaginaPrincipalConductor() {
  const [menuVisible, setMenuVisible] = useState(false);
  const [alertasVisible, setAlertasVisible] = useState(false);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [patentesConductor, setPatentesConductor] = useState<string[]>([]);
  const [ultimaRevisionAlertas, setUltimaRevisionAlertas] = useState<number | null>(null);
  const [pasajeros, setPasajeros] = useState<Pasajero[]>([]);
  const [siguienteNino, setSiguienteNino] = useState<Pasajero | null>(null);
  const [rutConductor, setRutConductor] = useState<string>('');
  const [ubicacionActual, setUbicacionActual] = useState<{ latitude: number; longitude: number } | null>(null);
  const locationWatchRef = useRef<Location.LocationSubscription | null>(null);
  const ubicacionActualRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState(0);
  const [modalAgregarHijoVisible, setModalAgregarHijoVisible] = useState(false);
  const [modalTerminarRutaVisible, setModalTerminarRutaVisible] = useState(false);
  const [alertaSeleccionada, setAlertaSeleccionada] = useState<any | null>(null);
  const [rutaGenerada, setRutaGenerada] = useState<{
    waypoints: Array<{ coordinates: { latitude: number; longitude: number }; name: string; rutHijo?: string }>;
    routeGeometry?: any;
    distancia?: string;
    tiempoEstimado?: number;
    fechaInicio?: Date;
    fechaInicioFormateada?: string;
  } | null>(null);
  const [generandoRuta, setGenerandoRuta] = useState(false);
  useSyncRutActivo();
  const router = useRouter();
  const hayAlertasSinRevisar = useMemo(() => {
    if (alertas.length === 0) return false;
    if (!ultimaRevisionAlertas) return true;
    const masReciente = alertas[0]?.fecha;
    return masReciente ? masReciente.getTime() > ultimaRevisionAlertas : false;
  }, [alertas, ultimaRevisionAlertas]);

  const numeroAlertasSinRevisar = useMemo(() => {
    if (!ultimaRevisionAlertas) {
      return alertas.length;
    }
    return alertas.filter((alerta) => {
      if (!alerta.fecha) return false;
      return alerta.fecha.getTime() > ultimaRevisionAlertas;
    }).length;
  }, [alertas, ultimaRevisionAlertas]);

  // Función para normalizar RUT
  const normalizarRut = (rut: string) => rut.replace(/[^0-9kK]/g, '').toUpperCase();
  
  // Función para normalizar patente (eliminar espacios y convertir a mayúsculas)
  const normalizarPatente = (patente: string) => patente.trim().toUpperCase().replace(/\s+/g, '');

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

  // Función para procesar y ordenar pasajeros
  const procesarYOrdenarPasajeros = async (
    pasajerosSnapshot: any,
    ubicacionConductorActual: { latitude: number; longitude: number }
  ): Promise<Pasajero[]> => {
    const pasajerosLista: Pasajero[] = [];
    const MAPBOX_TOKEN = 'pk.eyJ1IjoiYmFydG94IiwiYSI6ImNtaGpxaGZudzE4NHMycnB0bnMwdjVtbHIifQ.Makrf18R1Z9Wo4V-yMXUYw';

    console.log('🔄 Procesando pasajeros... Total en snapshot:', pasajerosSnapshot.docs.length);

    // Procesar cada pasajero
    for (const docSnap of pasajerosSnapshot.docs) {
      const data = docSnap.data() || {};
      const estadoViajeOriginal = (data.estadoViaje || '').toString().trim();
      const estadoViaje = estadoViajeOriginal.toLowerCase();
      
      // Verificar estado de la inscripción (si existe)
      const estadoInscripcion = (data.estado || 'aceptada').toString().trim().toLowerCase();
      const tieneFechaBaja = !!data.fechaBaja;
      const estadoDeBaja = estadoInscripcion === 'baja' || estadoInscripcion === 'cancelada';
      
      console.log(`  Procesando: ${data.nombreHijo || 'Sin nombre'}, Estado viaje: "${estadoViajeOriginal}", Estado inscripción: "${estadoInscripcion}"`);
      
      // IMPORTANTE: Solo filtrar los que están marcados como "entregado"
      // NO filtrar por estado de inscripción, fecha de baja, o cualquier otro criterio
      // Esto permite que los niños aparezcan automáticamente después de terminar una ruta
      // sin necesidad de darse de baja y volver a inscribirse
      if (estadoViaje === 'entregado') {
        console.log(`    ❌ Filtrado (entregado): ${data.nombreHijo}`);
        continue;
      }
      
      // Todos los demás pasajeros se incluyen, independientemente de:
      // - Estado de inscripción (aceptada, baja, cancelada, etc.)
      // - Fecha de baja
      // - Estado vacío o reseteado
      // Esto asegura que después de terminar una ruta, todos los niños vuelvan a aparecer
      if (!estadoViaje || estadoViaje === '') {
        console.log(`    ✅ Incluyendo (estado vacío/reseteado - listo para nueva ruta): ${data.nombreHijo}`);
      } else if (estadoViaje === 'recogido') {
        console.log(`    ✅ Incluyendo (a bordo - puede ser entregado): ${data.nombreHijo}`);
      } else {
        console.log(`    ✅ Incluyendo (estado: "${estadoViajeOriginal}"): ${data.nombreHijo}`);
      }

      // Obtener dirección del apoderado
      let direccion = '';
      let coordenadas: { latitude: number; longitude: number } | undefined;
      
      try {
        const usuariosRef = collection(db, 'usuarios');
        const apoderadoQuery = query(
          usuariosRef,
          where('rut', '==', data.rutApoderado?.trim() || ''),
          limit(1)
        );
        const apoderadoSnap = await getDocs(apoderadoQuery);
        
        if (!apoderadoSnap.empty) {
          const apoderadoData = apoderadoSnap.docs[0].data();
          direccion = apoderadoData.direccion || '';
          
          // Si hay coordenadas guardadas, usarlas
          if (apoderadoData.latitude && apoderadoData.longitude) {
            coordenadas = {
              latitude: apoderadoData.latitude,
              longitude: apoderadoData.longitude,
            };
          } else if (direccion && MAPBOX_TOKEN) {
            // Geocodificar dirección
            try {
              const direccionConPais = `${direccion}, Chile`;
              const encodedAddress = encodeURIComponent(direccionConPais);
              const geocodeResponse = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=cl&types=address`
              );
              const geocodeData = await geocodeResponse.json();
              
              if (geocodeData.features && geocodeData.features.length > 0) {
                const [lng, lat] = geocodeData.features[0].center;
                coordenadas = { latitude: lat, longitude: lng };
              }
            } catch (error) {
              console.error(`Error al geocodificar dirección de ${data.nombreHijo}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`Error al obtener dirección para ${data.nombreHijo}:`, error);
      }

      // Calcular distancia si hay coordenadas
      let distancia: number | undefined;
      if (coordenadas) {
        distancia = calcularDistancia(
          ubicacionConductorActual.latitude,
          ubicacionConductorActual.longitude,
          coordenadas.latitude,
          coordenadas.longitude
        );
      }

      // Agregar el pasajero a la lista incluso si no tiene coordenadas
      // (esto asegura que siempre aparezcan en la lista)
      pasajerosLista.push({
        id: docSnap.id,
        nombreHijo: data.nombreHijo || 'Sin nombre',
        nombreApoderado: data.nombreApoderado || 'Sin apoderado',
        rutHijo: data.rutHijo || '',
        rutApoderado: data.rutApoderado || '',
        patenteFurgon: data.patenteFurgon || '',
        estadoViaje: estadoViajeOriginal, // Mantener el estado original
        direccion,
        coordenadas,
        distancia,
      });
      
      console.log(`    ✅ Agregado: ${data.nombreHijo || 'Sin nombre'}, Estado: "${estadoViajeOriginal}", Dirección: ${direccion || 'sin dirección'}, Coordenadas: ${coordenadas ? 'sí' : 'no'}`);
    }

    console.log(`📊 Total pasajeros procesados: ${pasajerosLista.length}`);

    // Ordenar por distancia (más cercano primero)
    // Los que no tienen distancia van al final
    pasajerosLista.sort((a, b) => {
      if (a.distancia === undefined && b.distancia === undefined) return 0;
      if (a.distancia === undefined) return 1;
      if (b.distancia === undefined) return -1;
      return a.distancia - b.distancia;
    });

    return pasajerosLista;
  };

  useEffect(() => {
    let unsubscribeAlertas1: (() => void) | null = null;
    let unsubscribeAlertas2: (() => void) | null = null;
    let unsubscribeAlertas3: (() => void) | null = null;
    let unsubscribeAgregarHijo1: (() => void) | null = null;
    let unsubscribeAgregarHijo2: (() => void) | null = null;
    let unsubscribeAgregarHijo3: (() => void) | null = null;
    let unsubscribeBaja1: (() => void) | null = null;
    let unsubscribeBaja2: (() => void) | null = null;
    let unsubscribeBaja3: (() => void) | null = null;
    let unsubscribePasajeros: (() => void) | null = null;

    const cargarDatos = async () => {
      try {
        const rutGuardado = await AsyncStorage.getItem('rutUsuario');
        if (!rutGuardado) {
          setAlertas([]);
          return;
        }
        
        const rutNormalizado = normalizarRut(rutGuardado);
        console.log('RUT guardado:', rutGuardado);
        console.log('RUT normalizado:', rutNormalizado);
        setRutConductor(rutGuardado);

        const patentesSet = new Set<string>();
        try {
          const furgonesRef = collection(db, 'Furgones');
          // Intentar buscar por RUT normalizado y también por RUT original
          const furgonesSnapshot = await getDocs(query(furgonesRef, where('rutUsuario', '==', rutGuardado)));
          furgonesSnapshot.forEach((docSnap) => {
            const data = docSnap.data() || {};
            const patente = (data.patente || '').toString().trim();
            if (patente) {
              const patenteNormalizada = normalizarPatente(patente);
              patentesSet.add(patenteNormalizada);
              patentesSet.add(patente); // También mantener la original
            }
          });
        } catch (errorPatentes) {
          console.error('No se pudieron obtener los furgones del conductor:', errorPatentes);
        }
        console.log('Patentes del conductor (normalizadas y originales):', Array.from(patentesSet));
        setPatentesConductor(Array.from(patentesSet));

        // Cargar pasajeros del conductor
        try {
          const listaPasajerosRef = collection(db, 'lista_pasajeros');
          console.log('🔍 Buscando pasajeros con RUT conductor:', rutGuardado);
          
          // Intentar buscar con el RUT tal como está guardado
          let pasajerosQuery = query(listaPasajerosRef, where('rutConductor', '==', rutGuardado));
          let pasajerosSnapshot = await getDocs(pasajerosQuery);

          console.log('📋 Pasajeros encontrados con RUT original:', pasajerosSnapshot.docs.length);
          
          // Si no encuentra pasajeros, intentar con RUT normalizado
          if (pasajerosSnapshot.docs.length === 0) {
            console.log('⚠️ No se encontraron pasajeros con RUT original. Intentando con RUT normalizado...');
            const rutNormalizado = normalizarRut(rutGuardado);
            console.log('🔍 Buscando con RUT normalizado:', rutNormalizado);
            pasajerosQuery = query(listaPasajerosRef, where('rutConductor', '==', rutNormalizado));
            pasajerosSnapshot = await getDocs(pasajerosQuery);
            console.log('📋 Pasajeros encontrados con RUT normalizado:', pasajerosSnapshot.docs.length);
          }
          
          // Si aún no encuentra, intentar obtener todos para debug
          if (pasajerosSnapshot.docs.length === 0) {
            console.log('⚠️ No se encontraron pasajeros. Verificando si hay pasajeros en la colección...');
            const todosLosPasajeros = await getDocs(listaPasajerosRef);
            console.log('📊 Total de pasajeros en la colección (sin filtro):', todosLosPasajeros.docs.length);
            if (todosLosPasajeros.docs.length > 0) {
              console.log('🔍 Primeros 5 pasajeros encontrados (para debug):');
              todosLosPasajeros.docs.slice(0, 5).forEach((doc) => {
                const data = doc.data();
                console.log(`  - RUT Conductor en DB: "${data.rutConductor}", Nombre: ${data.nombreHijo}, Estado: ${data.estadoViaje || 'sin estado'}`);
              });
            }
          }
          
          // Log de todos los pasajeros encontrados
          console.log('📋 Pasajeros encontrados en total:', pasajerosSnapshot.docs.length);
          pasajerosSnapshot.docs.forEach((doc) => {
            const data = doc.data();
            console.log('  -', data.nombreHijo, 'Estado viaje:', data.estadoViaje || 'sin estado', 'Estado inscripción:', data.estado || 'sin estado');
          });

          // Obtener ubicación actual del conductor
          const ubicacionConductorActual = ubicacionActualRef.current || ubicacionActual || { latitude: -33.45, longitude: -70.6667 };
          
          const pasajerosLista = await procesarYOrdenarPasajeros(pasajerosSnapshot, ubicacionConductorActual);
          console.log('✅ Pasajeros procesados:', pasajerosLista.length);
          pasajerosLista.forEach(p => {
            console.log(`  ✅ Incluido: ${p.nombreHijo}, Estado: "${p.estadoViaje || ''}"`);
          });
          
          setPasajeros(pasajerosLista);

          // Obtener el siguiente niño - SIEMPRE mostrar uno si hay pasajeros
          if (pasajerosLista.length > 0) {
            // Primero intentar encontrar uno no entregado
          const siguienteNinoNoEntregado = pasajerosLista.find(p => {
            const estado = (p.estadoViaje || '').toString().trim().toLowerCase();
            return estado !== 'entregado';
          });
            
          if (siguienteNinoNoEntregado) {
            setSiguienteNino(siguienteNinoNoEntregado);
              console.log('👶 Siguiente niño (no entregado):', siguienteNinoNoEntregado.nombreHijo);
            } else {
              // Si todos están entregados, mostrar el primero de la lista para que siempre aparezca un niño
              setSiguienteNino(pasajerosLista[0]);
              console.log('👶 Siguiente niño (todos entregados, mostrando el primero):', pasajerosLista[0].nombreHijo);
            }
          } else {
            setSiguienteNino(null);
            console.log('⚠️ No hay niños asignados después del procesamiento');
          }
        } catch (errorPasajeros) {
          console.error('❌ Error al cargar pasajeros:', errorPasajeros);
          // Asegurarse de que el estado se resetee en caso de error
          setPasajeros([]);
          setSiguienteNino(null);
        }

        // Listener en tiempo real para pasajeros
        try {
          const listaPasajerosRef = collection(db, 'lista_pasajeros');
          // Intentar con RUT original primero
          let pasajerosQuery = query(listaPasajerosRef, where('rutConductor', '==', rutGuardado));
          
          // Verificar si hay pasajeros con el RUT original, si no, usar normalizado
          const testSnapshot = await getDocs(pasajerosQuery);
          if (testSnapshot.docs.length === 0) {
            const rutNormalizado = normalizarRut(rutGuardado);
            console.log('📡 Listener: No se encontraron pasajeros con RUT original, usando RUT normalizado:', rutNormalizado);
            pasajerosQuery = query(listaPasajerosRef, where('rutConductor', '==', rutNormalizado));
          }
          
          unsubscribePasajeros = onSnapshot(
            pasajerosQuery,
            async (snapshot) => {
              console.log('📡 Listener de pasajeros activado. Total documentos:', snapshot.docs.length);
              
              // Log de todos los pasajeros y sus estados
              snapshot.docs.forEach((docSnap) => {
                const data = docSnap.data();
                console.log(`  📋 Listener - ${data.nombreHijo || 'Sin nombre'}: estadoViaje="${data.estadoViaje || ''}"`);
              });
              
              // Obtener ubicación actualizada del ref (siempre el valor más reciente)
              const ubicacionActualizada = ubicacionActualRef.current || { latitude: -33.45, longitude: -70.6667 };
              const pasajerosLista = await procesarYOrdenarPasajeros(snapshot, ubicacionActualizada);
              
              console.log(`📊 Listener - Pasajeros procesados: ${pasajerosLista.length}`);
              pasajerosLista.forEach(p => {
                console.log(`  ✅ Listener - Incluido: ${p.nombreHijo}, Estado: "${p.estadoViaje || ''}"`);
              });
              
              setPasajeros(pasajerosLista);

              // Obtener el siguiente niño (el más cercano que no ha sido entregado)
              // Si no hay ninguno no entregado, usar el primero de la lista para que siempre aparezca un niño
              const siguienteNinoNoEntregado = pasajerosLista.find(p => {
                const estado = (p.estadoViaje || '').toString().trim().toLowerCase();
                return estado !== 'entregado';
              });
              if (siguienteNinoNoEntregado) {
                setSiguienteNino(siguienteNinoNoEntregado);
                console.log('👶 Siguiente niño (listener):', siguienteNinoNoEntregado.nombreHijo);
              } else if (pasajerosLista.length > 0) {
                // Si todos están entregados, mostrar el primero de la lista para que siempre aparezca un niño
                setSiguienteNino(pasajerosLista[0]);
                console.log('👶 Siguiente niño (listener - todos entregados, mostrando el primero):', pasajerosLista[0].nombreHijo);
              } else {
                setSiguienteNino(null);
                console.log('⚠️ No hay niños asignados (listener)');
              }
            },
            (error) => {
              console.error('❌ Error en listener de pasajeros:', error);
            }
          );
        } catch (errorListener) {
          console.error('Error al configurar listener de pasajeros:', errorListener);
        }

        // Configurar listeners en tiempo real para alertas de postulación
        // Usar múltiples listeners para buscar con diferentes formatos de RUT
        console.log('Iniciando listeners de alertas de postulación para RUT:', rutGuardado);
        console.log('RUT normalizado:', rutNormalizado);
        console.log('Patentes del conductor:', Array.from(patentesSet));
        
        const alertasRef = collection(db, 'Alertas');
        const todasLasAlertasUnicas = new Map<string, any>();
        
        // Función para procesar y combinar alertas
        const procesarYActualizarAlertas = async () => {
          const alertasArray = Array.from(todasLasAlertasUnicas.values());
          
          console.log('✓ Total de alertas únicas encontradas:', alertasArray.length);
          console.log('✓ Patentes en las alertas:', alertasArray.map(a => a.patenteFurgon).filter(Boolean));
          console.log('✓ Patentes del conductor:', Array.from(patentesSet));

          // Filtrar alertas por RUT del conductor (normalizado) y por patentes
          const alertasFiltradasInicial = alertasArray.filter((alerta) => {
            // Verificar RUT del destinatario (normalizado o original)
            const rutDestAlerta = normalizarRut(alerta.rutDestinatario || '');
            const rutDestOriginal = normalizarRut(alerta.rutDestinatarioOriginal || '');
            const coincideRut = rutDestAlerta === rutNormalizado || rutDestOriginal === rutNormalizado;
            
            if (!coincideRut) {
              console.log('✗ Alerta filtrada por RUT:', {
                alertaId: alerta.id,
                rutDestAlerta: alerta.rutDestinatario,
                rutDestOriginal: alerta.rutDestinatarioOriginal,
                rutNormalizado,
              });
              return false;
            }
            
            // Para alertas de tipo "AgregarHijo", no requerir idPostulacion
            if (alerta.tipoAlerta === 'AgregarHijo') {
              // Verificar patente si existe
              if (alerta.patenteFurgon) {
                const patenteAlertaNormalizada = normalizarPatente(alerta.patenteFurgon);
                const tienePatente = patentesSet.has(alerta.patenteFurgon) || patentesSet.has(patenteAlertaNormalizada);
                
                if (!tienePatente && patentesSet.size > 0) {
                  console.log('✗ Alerta AgregarHijo filtrada por patente:', alerta.patenteFurgon);
                  return false;
                }
              }
              console.log('✓ Alerta AgregarHijo aceptada:', {
                id: alerta.id,
                descripcion: alerta.descripcion?.substring(0, 30),
                patente: alerta.patenteFurgon,
              });
              return true;
            }
            
            // Para alertas de tipo "Baja", no requerir idPostulacion
            if (alerta.tipoAlerta === 'Baja') {
              // Verificar patente si existe
              if (alerta.patenteFurgon) {
                const patenteAlertaNormalizada = normalizarPatente(alerta.patenteFurgon);
                const tienePatente = patentesSet.has(alerta.patenteFurgon) || patentesSet.has(patenteAlertaNormalizada);
                
                if (!tienePatente && patentesSet.size > 0) {
                  console.log('✗ Alerta Baja filtrada por patente:', alerta.patenteFurgon);
                  return false;
                }
              }
              console.log('✓ Alerta Baja aceptada:', {
                id: alerta.id,
                descripcion: alerta.descripcion?.substring(0, 30),
                patente: alerta.patenteFurgon,
              });
              return true;
            }
            
            // Para alertas de tipo "Postulacion", verificar que tenga idPostulacion
            if (alerta.tipoAlerta === 'Postulacion') {
              if (!alerta.idPostulacion) {
                console.log('⚠ Alerta Postulacion sin idPostulacion:', alerta.id);
                return false;
              }
            }
            
            // Verificar patente si existe
            if (alerta.patenteFurgon) {
              const patenteAlertaNormalizada = normalizarPatente(alerta.patenteFurgon);
              const tienePatente = patentesSet.has(alerta.patenteFurgon) || patentesSet.has(patenteAlertaNormalizada);
              
              if (!tienePatente && patentesSet.size > 0) {
                console.log('✗ Alerta filtrada por patente:', alerta.patenteFurgon, 'normalizada:', patenteAlertaNormalizada);
                console.log('  Patentes disponibles:', Array.from(patentesSet));
                return false;
              }
            }
            
            console.log('✓ Alerta aceptada:', {
              id: alerta.id,
              tipo: alerta.tipoAlerta,
              descripcion: alerta.descripcion?.substring(0, 30),
              patente: alerta.patenteFurgon,
            });
            return true;
          });

          // Verificar estado de postulaciones para alertas de tipo "Postulacion"
          const alertasConEstado = await Promise.all(
            alertasFiltradasInicial.map(async (alerta) => {
              // Si no es una alerta de postulación, mantenerla sin cambios
              if (alerta.tipoAlerta !== 'Postulacion' || !alerta.idPostulacion) {
                return { ...alerta, estadoPostulacion: null };
              }

              // Verificar el estado de la postulación
              try {
                const postulacionRef = doc(db, 'Postulaciones', alerta.idPostulacion);
                const postulacionSnap = await getDoc(postulacionRef);
                
                if (!postulacionSnap.exists()) {
                  return { ...alerta, estadoPostulacion: null };
                }

                const postulacionData = postulacionSnap.data();
                const estado = (postulacionData?.estado || '').toString().toLowerCase();
                
                return { ...alerta, estadoPostulacion: estado };
              } catch (error) {
                console.warn('⚠ Error al verificar estado de postulación:', alerta.idPostulacion, error);
                return { ...alerta, estadoPostulacion: null };
              }
            })
          );
          
          const alertasOrdenadas = alertasConEstado.sort((a, b) => {
            const fechaA = a.fecha ? a.fecha.getTime() : 0;
            const fechaB = b.fecha ? b.fecha.getTime() : 0;
            return fechaB - fechaA;
          });
          
          console.log('✓ Alertas finales después de filtrado:', alertasOrdenadas.length);
          if (alertasOrdenadas.length > 0) {
            console.log('✓ Alertas mostradas:', alertasOrdenadas.map(a => ({ 
              descripcion: a.descripcion?.substring(0, 30), 
              patente: a.patenteFurgon,
              estado: a.estadoPostulacion
            })));
          }
          
          setAlertas(alertasOrdenadas.slice(0, 10));
        };

        // Listener 1: Buscar con RUT normalizado en rutDestinatario
        try {
          const query1 = query(
            alertasRef,
            where('tipoAlerta', '==', 'Postulacion'),
            where('rutDestinatario', '==', rutNormalizado),
            limit(50)
          );
          
          unsubscribeAlertas1 = onSnapshot(
            query1,
            (snapshot) => {
              console.log('✓ Listener 1 (rutDestinatario normalizado):', snapshot.docs.length, 'alertas');
              snapshot.docs.forEach((docSnap) => {
                const data = docSnap.data() as any;
                const fecha = data.creadoEn && typeof data.creadoEn.toDate === 'function'
                  ? data.creadoEn.toDate()
                  : data.fecha ? new Date(data.fecha) : null;
                todasLasAlertasUnicas.set(docSnap.id, {
                  id: docSnap.id,
                  tipoAlerta: data.tipoAlerta || 'Postulacion',
                  descripcion: data.descripcion || 'Sin descripcion',
                  idPostulacion: data.parametros?.idPostulacion || data.idPostulacion || null,
                  rutaDestino: data.rutaDestino || '/chat-validacion',
                  parametros: data.parametros || {},
                  fecha,
                  patenteFurgon: (data.patenteFurgon || '').toString().trim(),
                  rutDestinatario: data.rutDestinatario,
                  rutDestinatarioOriginal: data.rutDestinatarioOriginal,
                });
              });
              procesarYActualizarAlertas();
            },
            (error) => console.warn('⚠ Error en listener 1:', error)
          );
        } catch (error1) {
          console.warn('⚠ No se pudo crear listener 1 (rutDestinatario normalizado):', error1);
        }

        // Listener 2: Buscar con RUT original en rutDestinatarioOriginal
        try {
          const query2 = query(
            alertasRef,
            where('tipoAlerta', '==', 'Postulacion'),
            where('rutDestinatarioOriginal', '==', rutGuardado),
            limit(50)
          );
          
          unsubscribeAlertas2 = onSnapshot(
            query2,
            (snapshot) => {
              console.log('✓ Listener 2 (rutDestinatarioOriginal):', snapshot.docs.length, 'alertas');
              snapshot.docs.forEach((docSnap) => {
                const data = docSnap.data() as any;
                const fecha = data.creadoEn && typeof data.creadoEn.toDate === 'function'
                  ? data.creadoEn.toDate()
                  : data.fecha ? new Date(data.fecha) : null;
                todasLasAlertasUnicas.set(docSnap.id, {
                  id: docSnap.id,
                  tipoAlerta: data.tipoAlerta || 'Postulacion',
                  descripcion: data.descripcion || 'Sin descripcion',
                  idPostulacion: data.parametros?.idPostulacion || data.idPostulacion || null,
                  rutaDestino: data.rutaDestino || '/chat-validacion',
                  parametros: data.parametros || {},
                  fecha,
                  patenteFurgon: (data.patenteFurgon || '').toString().trim(),
                  rutDestinatario: data.rutDestinatario,
                  rutDestinatarioOriginal: data.rutDestinatarioOriginal,
                });
              });
              procesarYActualizarAlertas();
            },
            (error) => console.warn('⚠ Error en listener 2:', error)
          );
        } catch (error2) {
          console.warn('⚠ No se pudo crear listener 2 (rutDestinatarioOriginal):', error2);
        }

        // Listener 3: Buscar con RUT original en rutDestinatario (compatibilidad con alertas antiguas)
        try {
          const query3 = query(
            alertasRef,
            where('tipoAlerta', '==', 'Postulacion'),
            where('rutDestinatario', '==', rutGuardado),
            limit(50)
          );
          
          unsubscribeAlertas3 = onSnapshot(
            query3,
            (snapshot) => {
              console.log('✓ Listener 3 (rutDestinatario original):', snapshot.docs.length, 'alertas');
              snapshot.docs.forEach((docSnap) => {
                const data = docSnap.data() as any;
                const fecha = data.creadoEn && typeof data.creadoEn.toDate === 'function'
                  ? data.creadoEn.toDate()
                  : data.fecha ? new Date(data.fecha) : null;
                todasLasAlertasUnicas.set(docSnap.id, {
                  id: docSnap.id,
                  tipoAlerta: data.tipoAlerta || 'Postulacion',
                  descripcion: data.descripcion || 'Sin descripcion',
                  idPostulacion: data.parametros?.idPostulacion || data.idPostulacion || null,
                  rutaDestino: data.rutaDestino || '/chat-validacion',
                  parametros: data.parametros || {},
                  fecha,
                  patenteFurgon: (data.patenteFurgon || '').toString().trim(),
                  rutDestinatario: data.rutDestinatario,
                  rutDestinatarioOriginal: data.rutDestinatarioOriginal,
                });
              });
              procesarYActualizarAlertas();
            },
            (error) => console.warn('⚠ Error en listener 3:', error)
          );
        } catch (error3) {
          console.warn('⚠ No se pudo crear listener 3 (rutDestinatario original):', error3);
        }

        // Listeners para alertas de tipo "AgregarHijo"
        // Listener 4: Buscar alertas AgregarHijo con RUT normalizado
        try {
          const query4 = query(
            alertasRef,
            where('tipoAlerta', '==', 'AgregarHijo'),
            where('rutDestinatario', '==', rutNormalizado),
            limit(50)
          );
          
          unsubscribeAgregarHijo1 = onSnapshot(
            query4,
            (snapshot) => {
              console.log('✓ Listener 4 (AgregarHijo rutDestinatario normalizado):', snapshot.docs.length, 'alertas');
              snapshot.docs.forEach((docSnap) => {
                const data = docSnap.data() as any;
                const fecha = data.creadoEn && typeof data.creadoEn.toDate === 'function'
                  ? data.creadoEn.toDate()
                  : data.fecha ? new Date(data.fecha) : null;
                todasLasAlertasUnicas.set(docSnap.id, {
                  id: docSnap.id,
                  tipoAlerta: data.tipoAlerta || 'AgregarHijo',
                  descripcion: data.descripcion || 'Sin descripcion',
                  idPostulacion: data.parametros?.idPostulacion || null,
                  rutaDestino: data.rutaDestino || '/chat-validacion',
                  parametros: data.parametros || {},
                  fecha,
                  patenteFurgon: (data.patenteFurgon || '').toString().trim(),
                  rutDestinatario: data.rutDestinatario,
                  rutDestinatarioOriginal: data.rutDestinatarioOriginal,
                });
              });
              procesarYActualizarAlertas();
            },
            (error) => console.warn('⚠ Error en listener 4 (AgregarHijo):', error)
          );
        } catch (error4) {
          console.warn('⚠ No se pudo crear listener 4 (AgregarHijo rutDestinatario normalizado):', error4);
        }

        // Listener 5: Buscar alertas AgregarHijo con RUT original en rutDestinatarioOriginal
        try {
          const query5 = query(
            alertasRef,
            where('tipoAlerta', '==', 'AgregarHijo'),
            where('rutDestinatarioOriginal', '==', rutGuardado),
            limit(50)
          );
          
          unsubscribeAgregarHijo2 = onSnapshot(
            query5,
            (snapshot) => {
              console.log('✓ Listener 5 (AgregarHijo rutDestinatarioOriginal):', snapshot.docs.length, 'alertas');
              snapshot.docs.forEach((docSnap) => {
                const data = docSnap.data() as any;
                const fecha = data.creadoEn && typeof data.creadoEn.toDate === 'function'
                  ? data.creadoEn.toDate()
                  : data.fecha ? new Date(data.fecha) : null;
                todasLasAlertasUnicas.set(docSnap.id, {
                  id: docSnap.id,
                  tipoAlerta: data.tipoAlerta || 'AgregarHijo',
                  descripcion: data.descripcion || 'Sin descripcion',
                  idPostulacion: data.parametros?.idPostulacion || null,
                  rutaDestino: data.rutaDestino || '/chat-validacion',
                  parametros: data.parametros || {},
                  fecha,
                  patenteFurgon: (data.patenteFurgon || '').toString().trim(),
                  rutDestinatario: data.rutDestinatario,
                  rutDestinatarioOriginal: data.rutDestinatarioOriginal,
                });
              });
              procesarYActualizarAlertas();
            },
            (error) => console.warn('⚠ Error en listener 5 (AgregarHijo):', error)
          );
        } catch (error5) {
          console.warn('⚠ No se pudo crear listener 5 (AgregarHijo rutDestinatarioOriginal):', error5);
        }

        // Listener 6: Buscar alertas AgregarHijo con RUT original en rutDestinatario
        try {
          const query6 = query(
            alertasRef,
            where('tipoAlerta', '==', 'AgregarHijo'),
            where('rutDestinatario', '==', rutGuardado),
            limit(50)
          );
          
          unsubscribeAgregarHijo3 = onSnapshot(
            query6,
            (snapshot) => {
              console.log('✓ Listener 6 (AgregarHijo rutDestinatario original):', snapshot.docs.length, 'alertas');
              snapshot.docs.forEach((docSnap) => {
                const data = docSnap.data() as any;
                const fecha = data.creadoEn && typeof data.creadoEn.toDate === 'function'
                  ? data.creadoEn.toDate()
                  : data.fecha ? new Date(data.fecha) : null;
                todasLasAlertasUnicas.set(docSnap.id, {
                  id: docSnap.id,
                  tipoAlerta: data.tipoAlerta || 'AgregarHijo',
                  descripcion: data.descripcion || 'Sin descripcion',
                  idPostulacion: data.parametros?.idPostulacion || null,
                  rutaDestino: data.rutaDestino || '/chat-validacion',
                  parametros: data.parametros || {},
                  fecha,
                  patenteFurgon: (data.patenteFurgon || '').toString().trim(),
                  rutDestinatario: data.rutDestinatario,
                  rutDestinatarioOriginal: data.rutDestinatarioOriginal,
                });
              });
              procesarYActualizarAlertas();
            },
            (error) => console.warn('⚠ Error en listener 6 (AgregarHijo):', error)
          );
        } catch (error6) {
          console.warn('⚠ No se pudo crear listener 6 (AgregarHijo rutDestinatario original):', error6);
        }

        // Listeners para alertas de tipo "Baja"
        // Listener 7: Buscar alertas Baja con RUT normalizado
        try {
          const query7 = query(
            alertasRef,
            where('tipoAlerta', '==', 'Baja'),
            where('rutDestinatario', '==', rutNormalizado),
            limit(50)
          );
          
          unsubscribeBaja1 = onSnapshot(
            query7,
            (snapshot) => {
              console.log('✓ Listener 7 (Baja rutDestinatario normalizado):', snapshot.docs.length, 'alertas');
              snapshot.docs.forEach((docSnap) => {
                const data = docSnap.data() as any;
                const fecha = data.creadoEn && typeof data.creadoEn.toDate === 'function'
                  ? data.creadoEn.toDate()
                  : data.fecha ? new Date(data.fecha) : null;
                todasLasAlertasUnicas.set(docSnap.id, {
                  id: docSnap.id,
                  tipoAlerta: data.tipoAlerta || 'Baja',
                  descripcion: data.descripcion || 'Sin descripcion',
                  idPostulacion: data.parametros?.idPostulacion || null,
                  rutaDestino: data.rutaDestino || '/conductor/pagina-principal-conductor',
                  parametros: data.parametros || {},
                  fecha,
                  patenteFurgon: (data.patenteFurgon || '').toString().trim(),
                  rutDestinatario: data.rutDestinatario,
                  rutDestinatarioOriginal: data.rutDestinatarioOriginal,
                });
              });
              procesarYActualizarAlertas();
            },
            (error) => console.warn('⚠ Error en listener 7 (Baja):', error)
          );
        } catch (error7) {
          console.warn('⚠ No se pudo crear listener 7 (Baja rutDestinatario normalizado):', error7);
        }

        // Listener 8: Buscar alertas Baja con RUT original en rutDestinatarioOriginal
        try {
          const query8 = query(
            alertasRef,
            where('tipoAlerta', '==', 'Baja'),
            where('rutDestinatarioOriginal', '==', rutGuardado),
            limit(50)
          );
          
          unsubscribeBaja2 = onSnapshot(
            query8,
            (snapshot) => {
              console.log('✓ Listener 8 (Baja rutDestinatarioOriginal):', snapshot.docs.length, 'alertas');
              snapshot.docs.forEach((docSnap) => {
                const data = docSnap.data() as any;
                const fecha = data.creadoEn && typeof data.creadoEn.toDate === 'function'
                  ? data.creadoEn.toDate()
                  : data.fecha ? new Date(data.fecha) : null;
                todasLasAlertasUnicas.set(docSnap.id, {
                  id: docSnap.id,
                  tipoAlerta: data.tipoAlerta || 'Baja',
                  descripcion: data.descripcion || 'Sin descripcion',
                  idPostulacion: data.parametros?.idPostulacion || null,
                  rutaDestino: data.rutaDestino || '/conductor/pagina-principal-conductor',
                  parametros: data.parametros || {},
                  fecha,
                  patenteFurgon: (data.patenteFurgon || '').toString().trim(),
                  rutDestinatario: data.rutDestinatario,
                  rutDestinatarioOriginal: data.rutDestinatarioOriginal,
                });
              });
              procesarYActualizarAlertas();
            },
            (error) => console.warn('⚠ Error en listener 8 (Baja):', error)
          );
        } catch (error8) {
          console.warn('⚠ No se pudo crear listener 8 (Baja rutDestinatarioOriginal):', error8);
        }

        // Listener 9: Buscar alertas Baja con RUT original en rutDestinatario
        try {
          const query9 = query(
            alertasRef,
            where('tipoAlerta', '==', 'Baja'),
            where('rutDestinatario', '==', rutGuardado),
            limit(50)
          );
          
          unsubscribeBaja3 = onSnapshot(
            query9,
            (snapshot) => {
              console.log('✓ Listener 9 (Baja rutDestinatario original):', snapshot.docs.length, 'alertas');
              snapshot.docs.forEach((docSnap) => {
                const data = docSnap.data() as any;
                const fecha = data.creadoEn && typeof data.creadoEn.toDate === 'function'
                  ? data.creadoEn.toDate()
                  : data.fecha ? new Date(data.fecha) : null;
                todasLasAlertasUnicas.set(docSnap.id, {
                  id: docSnap.id,
                  tipoAlerta: data.tipoAlerta || 'Baja',
                  descripcion: data.descripcion || 'Sin descripcion',
                  idPostulacion: data.parametros?.idPostulacion || null,
                  rutaDestino: data.rutaDestino || '/conductor/pagina-principal-conductor',
                  parametros: data.parametros || {},
                  fecha,
                  patenteFurgon: (data.patenteFurgon || '').toString().trim(),
                  rutDestinatario: data.rutDestinatario,
                  rutDestinatarioOriginal: data.rutDestinatarioOriginal,
                });
              });
              procesarYActualizarAlertas();
            },
            (error) => console.warn('⚠ Error en listener 9 (Baja):', error)
          );
        } catch (error9) {
          console.warn('⚠ No se pudo crear listener 9 (Baja rutDestinatario original):', error9);
        }
      } catch (error) {
        console.error('Error al cargar datos:', error);
        Alert.alert('Error', 'No se pudieron cargar los datos.');
      }
    };

    cargarDatos();

    // Limpiar listeners al desmontar
    return () => {
      if (unsubscribeAlertas1) {
        unsubscribeAlertas1();
      }
      if (unsubscribeAlertas2) {
        unsubscribeAlertas2();
      }
      if (unsubscribeAlertas3) {
        unsubscribeAlertas3();
      }
      if (unsubscribeAgregarHijo1) {
        unsubscribeAgregarHijo1();
      }
      if (unsubscribeAgregarHijo2) {
        unsubscribeAgregarHijo2();
      }
      if (unsubscribeAgregarHijo3) {
        unsubscribeAgregarHijo3();
      }
      if (unsubscribeBaja1) {
        unsubscribeBaja1();
      }
      if (unsubscribeBaja2) {
        unsubscribeBaja2();
      }
      if (unsubscribeBaja3) {
        unsubscribeBaja3();
      }
      if (unsubscribePasajeros) {
        unsubscribePasajeros();
      }
    };
  }, [rutConductor, ubicacionActual]);

  // Obtener y actualizar ubicación en tiempo real
  useEffect(() => {
    let isMounted = true;
    let watchSubscription: Location.LocationSubscription | null = null;

    const obtenerUbicacion = async () => {
      try {
        // Pedir permisos de ubicación
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permisos', 'Se requieren permisos de ubicación para mostrar tu ubicación actual.');
          return;
        }

        // Obtener ubicación inicial
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        if (isMounted) {
          const coords = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
          setUbicacionActual(coords);
          ubicacionActualRef.current = coords;

          // Guardar ubicación en Firestore
          if (rutConductor) {
            await guardarUbicacionEnFirestore(coords);
          }
        }

        // Observar cambios de ubicación cada 10 segundos
        watchSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 10000, // Actualizar cada 10 segundos
            distanceInterval: 50, // O actualizar cada 50 metros
          },
          async (location) => {
            if (isMounted) {
              const coords = {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
              };
              setUbicacionActual(coords);
              ubicacionActualRef.current = coords;

              // Guardar ubicación en Firestore
              if (rutConductor) {
                await guardarUbicacionEnFirestore(coords);
              }
            }
          }
        );

        locationWatchRef.current = watchSubscription;
      } catch (error) {
        console.error('Error al obtener ubicación:', error);
        // En web, usar geolocation del navegador como fallback
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              if (isMounted) {
                const coords = {
                  latitude: position.coords.latitude,
                  longitude: position.coords.longitude,
                };
                setUbicacionActual(coords);
                ubicacionActualRef.current = coords;
                if (rutConductor) {
                  guardarUbicacionEnFirestore(coords);
                }
              }
            },
            (error) => {
              console.error('Error en geolocation:', error);
            },
            {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0,
            }
          );
        }
      }
    };

    const guardarUbicacionEnFirestore = async (coords: { latitude: number; longitude: number }) => {
      try {
        if (!rutConductor) return;

        const ubicacionRef = doc(db, 'ubicaciones_conductor', rutConductor);
        await setDoc(
          ubicacionRef,
          {
            rutConductor: rutConductor,
            latitude: coords.latitude,
            longitude: coords.longitude,
            actualizadoEn: serverTimestamp(),
          },
          { merge: true }
        );
        console.log('Ubicación guardada en Firestore:', coords);
      } catch (error) {
        console.error('Error al guardar ubicación en Firestore:', error);
      }
    };

    if (rutConductor) {
      obtenerUbicacion();
    }

    return () => {
      isMounted = false;
      if (watchSubscription) {
        watchSubscription.remove();
      }
      if (locationWatchRef.current) {
        locationWatchRef.current.remove();
      }
    };
  }, [rutConductor]);

  // Recalcular distancias cuando cambie la ubicación del conductor
  useEffect(() => {
    if (!ubicacionActual || pasajeros.length === 0) return;

    const recalcularDistancias = () => {
      setPasajeros((pasajerosActuales) => {
        const pasajerosActualizados = pasajerosActuales.map((pasajero) => {
          if (pasajero.coordenadas) {
            const distancia = calcularDistancia(
              ubicacionActual.latitude,
              ubicacionActual.longitude,
              pasajero.coordenadas.latitude,
              pasajero.coordenadas.longitude
            );
            return { ...pasajero, distancia };
          }
          return pasajero;
        });

        // Ordenar por distancia
        pasajerosActualizados.sort((a, b) => {
          if (a.distancia === undefined && b.distancia === undefined) return 0;
          if (a.distancia === undefined) return 1;
          if (b.distancia === undefined) return -1;
          return a.distancia - b.distancia;
        });

        // Actualizar siguiente niño
        // Si no hay ninguno no entregado, usar el primero de la lista para que siempre aparezca un niño
        const siguienteNinoNoEntregado = pasajerosActualizados.find(p => {
          const estado = (p.estadoViaje || '').toString().trim().toLowerCase();
          return estado !== 'entregado';
        });
        if (siguienteNinoNoEntregado) {
          setSiguienteNino(siguienteNinoNoEntregado);
        } else if (pasajerosActualizados.length > 0) {
          // Si todos están entregados, mostrar el primero de la lista para que siempre aparezca un niño
          setSiguienteNino(pasajerosActualizados[0]);
        } else {
          setSiguienteNino(null);
        }

        return pasajerosActualizados;
      });
    };

    recalcularDistancias();
  }, [ubicacionActual]);

  // Actualizar ruta en tiempo real cuando cambie la ubicación del conductor (si hay una ruta activa)
  useEffect(() => {
    if (!rutaGenerada || !ubicacionActual || !rutaGenerada.waypoints || rutaGenerada.waypoints.length === 0) {
      return;
    }

    // Solo actualizar la ruta si el conductor se ha movido significativamente (más de 100 metros)
    // Esto evita actualizaciones excesivas
    const actualizarRutaEnTiempoReal = async () => {
      try {
        const MAPBOX_TOKEN = 'pk.eyJ1IjoiYmFydG94IiwiYSI6ImNtaGpxaGZudzE4NHMycnB0bnMwdjVtbHIifQ.Makrf18R1Z9Wo4V-yMXUYw';
        
        // Construir coordenadas con la nueva ubicación del conductor
        const coordinates = [
          `${ubicacionActual.longitude},${ubicacionActual.latitude}`,
          ...rutaGenerada.waypoints.map(w => `${w.coordinates.longitude},${w.coordinates.latitude}`),
        ];
        const coordinatesString = coordinates.join(';');
        const radiuses = coordinates.map(() => '500').join(';');
        const approaches = ['unrestricted', ...rutaGenerada.waypoints.map(() => 'curb')].join(';');
        
        const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinatesString}?` +
          `geometries=geojson` +
          `&steps=true` +
          `&overview=full` +
          `&annotations=distance,duration` +
          `&radiuses=${radiuses}` +
          `&approaches=${approaches}` +
          `&access_token=${MAPBOX_TOKEN}`;
        
        const directionsResponse = await fetch(directionsUrl);
        const directionsData = await directionsResponse.json();
        
        if (directionsData.code === 'Ok' && directionsData.routes && directionsData.routes.length > 0) {
          const route = directionsData.routes[0];
          const routeGeometry = {
            type: 'Feature',
            geometry: route.geometry,
          };
          
          // Actualizar la ruta sin mostrar alerta (actualización silenciosa)
          const distanciaTotal = route.distance ? (route.distance / 1000).toFixed(1) : rutaGenerada.distancia;
          const tiempoEstimado = route.duration ? Math.round(route.duration / 60) : rutaGenerada.tiempoEstimado;
          
          setRutaGenerada({
            waypoints: rutaGenerada.waypoints,
            routeGeometry,
            distancia: distanciaTotal,
            tiempoEstimado: typeof tiempoEstimado === 'number' ? tiempoEstimado : rutaGenerada.tiempoEstimado,
          });
          
          console.log('🔄 Ruta actualizada en tiempo real');
        }
      } catch (error) {
        console.error('Error al actualizar ruta en tiempo real:', error);
        // No mostrar error al usuario para actualizaciones en tiempo real
      }
    };

    // Debounce: esperar 3 segundos antes de actualizar para evitar demasiadas llamadas
    const timeoutId = setTimeout(actualizarRutaEnTiempoReal, 3000);
    
    return () => clearTimeout(timeoutId);
  }, [ubicacionActual, rutaGenerada]);

  // Listener para contar mensajes no leídos
  useEffect(() => {
    let unsubscribeMensajes: (() => void) | null = null;

    const contarMensajesNoLeidos = async () => {
      try {
        const rut = await AsyncStorage.getItem('rutUsuario');
        if (!rut) return;

        // Obtener todos los chats del conductor desde lista_pasajeros
        const listaPasajerosRef = collection(db, 'lista_pasajeros');
        const q = query(listaPasajerosRef, where('rutConductor', '==', rut));
        const snapshot = await getDocs(q);

        let totalNoLeidos = 0;
        const chatsIds = new Set<string>();

        // Recopilar todos los idPostulacion y chatIds
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          if (data.idPostulacion) {
            chatsIds.add(`post_${data.idPostulacion}`);
          }
          if (data.rutHijo && data.rutApoderado) {
            const chatId = `agregar_hijo_${data.rutHijo}_${data.rutApoderado}_${rut}`;
            chatsIds.add(`chat_${chatId}`);
          }
        }

        // Contar mensajes no leídos en cada chat
        const mensajesRef = collection(db, 'MensajesChat');
        for (const chatKey of chatsIds) {
          let qMensajes;
          
          if (chatKey.startsWith('post_')) {
            const idPostulacion = chatKey.replace('post_', '');
            qMensajes = query(mensajesRef, where('idPostulacion', '==', idPostulacion));
          } else {
            const chatId = chatKey.replace('chat_', '');
            qMensajes = query(mensajesRef, where('chatId', '==', chatId));
          }

          const mensajesSnap = await getDocs(qMensajes);
          mensajesSnap.docs.forEach((docSnap) => {
            const msgData = docSnap.data();
            // Contar mensajes no leídos donde el receptor es el conductor
            if (msgData.receptor === rut && 
                msgData.emisor !== rut && 
                msgData.emisor !== 'Sistema' &&
                (!msgData.leido || msgData.leido === false)) {
              totalNoLeidos++;
            }
          });
        }

        setMensajesNoLeidos(totalNoLeidos);
      } catch (error) {
        console.error('Error al contar mensajes no leídos:', error);
      }
    };

    contarMensajesNoLeidos();

    // Listener en tiempo real para mensajes
    const setupListener = async () => {
      try {
        const rut = await AsyncStorage.getItem('rutUsuario');
        if (!rut) return;

        // Escuchar todos los mensajes donde el receptor es el conductor
        const mensajesRef = collection(db, 'MensajesChat');
        const q = query(mensajesRef, where('receptor', '==', rut));
        
        unsubscribeMensajes = onSnapshot(q, () => {
          contarMensajesNoLeidos();
        }, (error) => {
          console.error('Error en listener de mensajes:', error);
        });
      } catch (error) {
        console.error('Error al configurar listener de mensajes:', error);
      }
    };

    setupListener();

    return () => {
      if (unsubscribeMensajes) {
        unsubscribeMensajes();
      }
    };
  }, []);

  const handleGenerarRuta = async () => {
    console.log('🚀 Iniciando generación de ruta...');
    console.log('📊 Pasajeros disponibles:', pasajeros.length);
    
    let pasajerosParaRuta = pasajeros;
    
    // SIEMPRE recargar pasajeros antes de generar la ruta para asegurar que tenemos los más actualizados
    console.log('🔄 Recargando pasajeros antes de generar ruta...');
    try {
      const rutGuardado = await AsyncStorage.getItem('rutUsuario');
      if (!rutGuardado) {
        Alert.alert('Error', 'No se encontró el RUT del conductor.');
        return;
      }
      
      console.log('🔍 Buscando pasajeros con RUT:', rutGuardado);
      const listaPasajerosRef = collection(db, 'lista_pasajeros');
      
      // Intentar buscar con el RUT tal como está guardado
      let pasajerosQuery = query(listaPasajerosRef, where('rutConductor', '==', rutGuardado));
      let pasajerosSnapshot = await getDocs(pasajerosQuery);
      
      console.log(`📋 Pasajeros encontrados con RUT original: ${pasajerosSnapshot.docs.length}`);
      
      // Si no encuentra pasajeros, intentar con RUT normalizado
      if (pasajerosSnapshot.docs.length === 0) {
        const rutNormalizado = normalizarRut(rutGuardado);
        console.log('🔍 Intentando con RUT normalizado:', rutNormalizado);
        pasajerosQuery = query(listaPasajerosRef, where('rutConductor', '==', rutNormalizado));
        pasajerosSnapshot = await getDocs(pasajerosQuery);
        console.log(`📋 Pasajeros encontrados con RUT normalizado: ${pasajerosSnapshot.docs.length}`);
      }
      
      // Si aún no encuentra, obtener todos los pasajeros para debug
      if (pasajerosSnapshot.docs.length === 0) {
        console.log('⚠️ No se encontraron pasajeros. Obteniendo todos los pasajeros para debug...');
        const todosLosPasajeros = await getDocs(listaPasajerosRef);
        console.log(`📊 Total de pasajeros en la colección: ${todosLosPasajeros.docs.length}`);
        
        if (todosLosPasajeros.docs.length > 0) {
          console.log('🔍 Primeros 5 pasajeros encontrados (para debug):');
          todosLosPasajeros.docs.slice(0, 5).forEach((doc) => {
            const data = doc.data();
            console.log(`  - RUT Conductor en DB: "${data.rutConductor}", Nombre: ${data.nombreHijo}, Estado: ${data.estadoViaje || 'sin estado'}`);
          });
        }
        
        Alert.alert(
          'Sin pasajeros', 
          `No se encontraron pasajeros asignados para tu RUT (${rutGuardado}).\n\nVerifica que tengas niños inscritos en tus furgones.`
        );
        return;
      }
      
      // Log de todos los pasajeros encontrados
      console.log('📋 Pasajeros encontrados en la recarga:');
      pasajerosSnapshot.docs.forEach((doc) => {
        const data = doc.data();
        console.log(`  - ${data.nombreHijo || 'Sin nombre'}, Estado viaje: "${data.estadoViaje || ''}", Estado inscripción: "${data.estado || ''}"`);
      });
      
      const ubicacionActualizada = ubicacionActualRef.current || { latitude: -33.45, longitude: -70.6667 };
      const pasajerosLista = await procesarYOrdenarPasajeros(pasajerosSnapshot, ubicacionActualizada);
      
      console.log(`✅ Recarga completada: ${pasajerosLista.length} pasajeros procesados y listos para la ruta`);
      
      if (pasajerosLista.length === 0) {
        Alert.alert(
          'Sin pasajeros disponibles', 
          'Se encontraron pasajeros en la base de datos, pero todos están marcados como entregados o no tienen direcciones válidas.'
        );
        return;
      }
      
      // Actualizar el estado con los pasajeros recargados
      setPasajeros(pasajerosLista);
      
      // Actualizar siguiente niño
      const siguienteNinoNoEntregado = pasajerosLista.find(p => {
        const estado = (p.estadoViaje || '').toString().trim().toLowerCase();
        return estado !== 'entregado';
      });
      if (siguienteNinoNoEntregado) {
        setSiguienteNino(siguienteNinoNoEntregado);
        console.log('👶 Siguiente niño actualizado:', siguienteNinoNoEntregado.nombreHijo);
      } else if (pasajerosLista.length > 0) {
        setSiguienteNino(pasajerosLista[0]);
        console.log('👶 Siguiente niño establecido como el primero:', pasajerosLista[0].nombreHijo);
      }
      
      // Usar los pasajeros recargados para generar la ruta
      pasajerosParaRuta = pasajerosLista;
    } catch (error) {
      console.error('❌ Error al recargar pasajeros:', error);
      Alert.alert('Error', 'Ocurrió un error al cargar los pasajeros. Por favor, intenta nuevamente.');
      return;
    }

    setGenerandoRuta(true);
    try {
      const MAPBOX_TOKEN = 'pk.eyJ1IjoiYmFydG94IiwiYSI6ImNtaGpxaGZudzE4NHMycnB0bnMwdjVtbHIifQ.Makrf18R1Z9Wo4V-yMXUYw';
      
      // Usar los pasajeros para generar la ruta (ya sea del estado o recargados)
      const pasajerosActuales = pasajerosParaRuta;
      
      // Obtener direcciones de todos los pasajeros
      const waypoints: Array<{ coordinates: { latitude: number; longitude: number }; name: string; rutHijo: string }> = [];
      
      console.log('📍 Procesando waypoints para', pasajerosActuales.length, 'pasajeros...');
      for (const pasajero of pasajerosActuales) {
        console.log(`  - Procesando: ${pasajero.nombreHijo}`);
        try {
          // Buscar dirección del apoderado
          const usuariosRef = collection(db, 'usuarios');
          const apoderadoQuery = query(usuariosRef, where('rut', '==', pasajero.rutApoderado.trim()), limit(1));
          const apoderadoSnap = await getDocs(apoderadoQuery);
          
          if (!apoderadoSnap.empty) {
            const apoderadoData = apoderadoSnap.docs[0].data();
            const direccion = apoderadoData.direccion || '';
            
            if (direccion) {
              // Geocodificar dirección
              const direccionConPais = `${direccion}, Chile`;
              const encodedAddress = encodeURIComponent(direccionConPais);
              
              const geocodeResponse = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${MAPBOX_TOKEN}&limit=1&country=cl&types=address`
              );
              const geocodeData = await geocodeResponse.json();
              
              if (geocodeData.features && geocodeData.features.length > 0) {
                const [lng, lat] = geocodeData.features[0].center;
                waypoints.push({
                  coordinates: { latitude: lat, longitude: lng },
                  name: `${pasajero.nombreHijo} - ${direccion}`,
                  rutHijo: pasajero.rutHijo,
                });
              }
            }
          }
        } catch (error) {
          console.error(`Error al obtener dirección para ${pasajero.nombreHijo}:`, error);
        }
      }

      if (waypoints.length === 0) {
        Alert.alert('Error', 'No se pudieron obtener direcciones válidas de los pasajeros.');
        setGenerandoRuta(false);
        return;
      }

      // Obtener ubicación actual del conductor (origen)
      const origen = ubicacionActual || { latitude: -33.45, longitude: -70.6667 };
      
      // Construir URL para Mapbox Directions API con múltiples waypoints
      // Formato: origin;waypoint1;waypoint2;...;destination
      const coordinates = [
        `${origen.longitude},${origen.latitude}`,
        ...waypoints.map(w => `${w.coordinates.longitude},${w.coordinates.latitude}`),
      ];
      const coordinatesString = coordinates.join(';');
      
      // Parámetros optimizados para furgones escolares:
      // - profile: driving (para vehículos)
      // - geometries: geojson (formato de geometría)
      // - steps: true (instrucciones paso a paso)
      // - overview: full (vista completa de la ruta)
      // - annotations: distance,duration (información adicional)
      // - radiuses: 500m (radio de búsqueda para waypoints, permite flexibilidad)
      // - approaches: curb (acercarse por el lado de la acera, más seguro para recoger niños)
      //   Debe tener el mismo número de valores que coordenadas
      const radiuses = coordinates.map(() => '500').join(';');
      const approaches = ['unrestricted', ...waypoints.map(() => 'curb')].join(';');
      
      // Llamar a Mapbox Directions API con parámetros optimizados para seguridad y eficiencia
      // Construir URL paso a paso para facilitar debug
      let directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinatesString}?`;
      directionsUrl += `geometries=geojson`;
      directionsUrl += `&steps=true`;
      directionsUrl += `&overview=full`;
      directionsUrl += `&annotations=distance,duration`;
      directionsUrl += `&radiuses=${radiuses}`;
      directionsUrl += `&approaches=${approaches}`;
      directionsUrl += `&access_token=${MAPBOX_TOKEN}`;
      
      console.log('🗺️ Generando ruta optimizada para furgón escolar...');
      console.log('📍 Coordenadas:', coordinates.length, 'puntos');
      console.log('📍 Waypoints:', waypoints.length);
      console.log('📍 Radiuses:', radiuses);
      console.log('📍 Approaches:', approaches);
      
      const directionsResponse = await fetch(directionsUrl);
      
      if (!directionsResponse.ok) {
        console.error('❌ Error HTTP:', directionsResponse.status, directionsResponse.statusText);
        const errorText = await directionsResponse.text();
        console.error('❌ Error response:', errorText);
        throw new Error(`Error HTTP ${directionsResponse.status}: ${directionsResponse.statusText}`);
      }
      
      const directionsData = await directionsResponse.json();
      
      console.log('📡 Respuesta de Mapbox - Code:', directionsData.code);
      if (directionsData.code !== 'Ok') {
        console.error('❌ Error en respuesta:', directionsData.message || directionsData);
      }
      
      if (directionsData.code === 'Ok' && directionsData.routes && directionsData.routes.length > 0) {
        const route = directionsData.routes[0];
        const routeGeometry = {
          type: 'Feature',
          geometry: route.geometry,
        };
        
        // Calcular distancia total y tiempo estimado
        const distanciaTotal = route.distance ? (route.distance / 1000).toFixed(1) : 'N/A';
        const tiempoEstimado = route.duration ? Math.round(route.duration / 60) : 'N/A';
        
        console.log(`✅ Ruta generada: ${distanciaTotal} km, ${tiempoEstimado} minutos`);
        console.log(`📍 Waypoints optimizados: ${waypoints.length} destinos`);
        
        // Guardar fecha/hora de inicio de la ruta
        const fechaInicioRuta = new Date();
        const fechaInicioFormateada = fechaInicioRuta.toLocaleString('es-CL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false, // Formato 24 horas
        });
        
        setRutaGenerada({
          waypoints,
          routeGeometry,
          distancia: distanciaTotal,
          tiempoEstimado: typeof tiempoEstimado === 'number' ? tiempoEstimado : undefined,
          fechaInicio: fechaInicioRuta,
          fechaInicioFormateada: fechaInicioFormateada,
        });
        
        // Guardar la ruta en la base de datos para que los apoderados puedan verla
        try {
          const rutGuardado = await AsyncStorage.getItem('rutUsuario');
          if (rutGuardado) {
            // Normalizar RUT del conductor para consistencia
            const rutConductorNormalizado = normalizarRut(rutGuardado);
            
            // Guardar la ruta en una colección de rutas activas
            // Usar RUT normalizado como ID del documento para consistencia
            const rutasActivasRef = collection(db, 'rutas_activas');
            const rutaDocRef = doc(rutasActivasRef, rutConductorNormalizado);
            
            await setDoc(rutaDocRef, {
              rutConductor: rutConductorNormalizado, // Guardar normalizado
              waypoints: waypoints.map(w => ({
                coordinates: w.coordinates,
                name: w.name,
                rutHijo: w.rutHijo,
              })),
              routeGeometry: routeGeometry,
              distancia: distanciaTotal,
              tiempoEstimado: typeof tiempoEstimado === 'number' ? tiempoEstimado : undefined,
              fechaGeneracion: serverTimestamp(),
              activa: true,
            }, { merge: true });
            
            console.log('✅ Ruta guardada en rutas_activas con RUT normalizado:', rutConductorNormalizado);
            console.log('  - Documento ID:', rutConductorNormalizado);
            console.log('  - Waypoints:', waypoints.length);
            console.log('  - Tiene routeGeometry:', !!routeGeometry);
            console.log('  - activa: true');
            
            console.log('✅ Ruta guardada en base de datos:', {
              rutConductor: rutGuardado,
              rutConductorNormalizado: rutConductorNormalizado,
              waypointsCount: waypoints.length,
              distancia: distanciaTotal,
              tiempoEstimado: typeof tiempoEstimado === 'number' ? tiempoEstimado : undefined,
            });
            
            // Actualizar estado de todos los niños en la ruta a "conductor en camino"
            // y enviar notificaciones a todos los apoderados
            const rutApoderados = new Set<string>();
            const nombresHijos = new Map<string, string>(); // rutApoderado -> nombreHijo
            const listaPasajerosRef = collection(db, 'lista_pasajeros');
            
            // Primero, actualizar el estado de todos los niños en la ruta
            console.log('🔄 Actualizando estado de los niños a "conductor en camino"...');
            for (const waypoint of waypoints) {
              if (waypoint.rutHijo) {
                try {
                  const pasajeroQuery = query(
                    listaPasajerosRef,
                    where('rutHijo', '==', waypoint.rutHijo),
                    where('rutConductor', '==', rutGuardado),
                    limit(1)
                  );
                  const pasajeroSnap = await getDocs(pasajeroQuery);
                  
                  if (!pasajeroSnap.empty) {
                    const pasajeroDoc = pasajeroSnap.docs[0];
                    const pasajeroData = pasajeroDoc.data();
                    const nombreHijo = pasajeroData.nombreHijo || waypoint.name.split(' - ')[0];
                    const rutApoderado = (pasajeroData.rutApoderado || '').toString().trim();
                    
                    // Actualizar estado a "conductor en camino"
                    await setDoc(
                      doc(db, 'lista_pasajeros', pasajeroDoc.id),
                      {
                        estadoViaje: 'conductor en camino',
                      },
                      { merge: true }
                    );
                    
                    console.log(`✅ Estado actualizado para ${nombreHijo}: "conductor en camino"`);
                    
                    // Agregar a la lista de apoderados para notificaciones
                    if (rutApoderado) {
                      rutApoderados.add(rutApoderado);
                      nombresHijos.set(rutApoderado, nombreHijo);
                    }
                  }
                } catch (error) {
                  console.error(`Error al actualizar estado para ${waypoint.rutHijo}:`, error);
                }
              }
            }
            
            // Crear notificaciones para cada apoderado (en un try-catch separado para no fallar silenciosamente)
            try {
              const alertasRef = collection(db, 'Alertas');
              console.log(`📤 Iniciando creación de notificaciones para ${rutApoderados.size} apoderado(s)...`);
              
              for (const rutApoderado of rutApoderados) {
                try {
                  const nombreHijo = nombresHijos.get(rutApoderado) || 'tu hijo';
                  
                  // Buscar el rutHijo correspondiente a este apoderado
                  let rutHijoParaAlerta = '';
                  for (const waypoint of waypoints) {
                    if (waypoint.rutHijo) {
                      const pasajeroQuery = query(
                        listaPasajerosRef,
                        where('rutHijo', '==', waypoint.rutHijo),
                        where('rutApoderado', '==', rutApoderado),
                        where('rutConductor', '==', rutGuardado),
                        limit(1)
                      );
                      const pasajeroSnap = await getDocs(pasajeroQuery);
                      if (!pasajeroSnap.empty) {
                        rutHijoParaAlerta = waypoint.rutHijo;
                        break;
                      }
                    }
                  }
                  
                  // Normalizar el RUT del apoderado para asegurar coincidencia en la búsqueda
                  const rutApoderadoNormalizado = normalizarRut(rutApoderado);
                  
                  console.log(`📝 Creando notificación para apoderado: RUT original="${rutApoderado}", RUT normalizado="${rutApoderadoNormalizado}", Hijo="${nombreHijo}"`);
                  
                  const docRef = await addDoc(alertasRef, {
                    tipo: 'Conductor en camino',
                    tipoAlerta: 'Conductor en camino',
                    descripcion: `El conductor va en camino por ${nombreHijo}. Puedes ver la ruta en el mapa.`,
                    rutDestinatario: rutApoderadoNormalizado,
                    rutDestinatarioOriginal: rutApoderado, // Guardar también el original para referencia
                    rutHijo: rutHijoParaAlerta,
                    nombreHijo: nombreHijo,
                    patenteFurgon: pasajerosActuales[0]?.patenteFurgon || '',
                    creadoEn: serverTimestamp(),
                    leida: false,
                    rutaDestino: '/(tabs)/apoderado/pagina-principal-apoderado',
                  });
                  
                  console.log(`✅ Notificación "Conductor en camino" creada con ID: ${docRef.id} para ${rutApoderado} (normalizado: ${rutApoderadoNormalizado}) - ${nombreHijo}`);
                } catch (errorNotificacion) {
                  console.error(`❌ Error al crear notificación para apoderado ${rutApoderado}:`, errorNotificacion);
                  // Continuar con el siguiente apoderado aunque falle uno
                }
              }
              
              console.log(`✅ Proceso de notificaciones completado. Total apoderados procesados: ${rutApoderados.size}`);
            } catch (errorNotificaciones) {
              console.error('❌ Error general al crear notificaciones:', errorNotificaciones);
              // No bloquear el flujo principal si fallan las notificaciones
            }
          }
        } catch (error) {
          console.error('Error al guardar ruta o enviar notificaciones:', error);
          // No mostrar error al usuario, solo loguear
        }
        
        Alert.alert(
          'Ruta generada', 
          `Se generó una ruta optimizada con ${waypoints.length} destino(s).\n\nDistancia: ${distanciaTotal} km\nTiempo estimado: ${tiempoEstimado} minutos`
        );
      } else {
        console.error('❌ Error en respuesta de Mapbox:', directionsData);
        const errorMessage = directionsData.message || 'No se pudo generar la ruta. Verifica las direcciones.';
        Alert.alert('Error', errorMessage);
      }
    } catch (error) {
      console.error('Error al generar ruta:', error);
      Alert.alert('Error', 'Ocurrió un error al generar la ruta.');
      // Asegurarse de que el estado se resetee incluso si hay un error
      setGenerandoRuta(false);
    } finally {
      // Siempre resetear el estado de generación
      setGenerandoRuta(false);
      console.log('✅ Estado generandoRuta reseteado a false');
    }
  };

  const handleRutaSugerida = () => {
    // Verificar si hay niños con estado "recogido" (aún no entregados)
    const ninosAbordo = pasajeros.filter(p => {
      const estado = (p.estadoViaje || '').toString().trim().toLowerCase();
      return estado === 'recogido';
    });
    // Verificar si hay niños sin recoger (sin estado o estado vacío)
    const ninosPorRecoger = pasajeros.filter(p => {
      const estado = (p.estadoViaje || '').toString().trim().toLowerCase();
      return !estado || estado === '';
    });
    
    if (ninosAbordo.length > 0 || ninosPorRecoger.length > 0) {
      // Si hay niños abordo o por recoger, mostrar modal de advertencia
      setModalTerminarRutaVisible(true);
    } else {
      // Si no hay niños abordo ni por recoger, terminar la ruta y resetear estados
      // Esto permite iniciar un nuevo viaje inmediatamente
      terminarRutaCompleta();
    }
  };
  
  // Función para terminar la ruta completamente y resetear estados
  const terminarRutaCompleta = async (historialYaGuardado: boolean = false) => {
    console.log('🛑 Terminando ruta completamente...');
    console.log('  - historialYaGuardado:', historialYaGuardado);
    
    // IMPORTANTE: Guardar una copia de la ruta ANTES de resetear estados
    const rutaParaHistorial = rutaGenerada;
    
    console.log('📋 Ruta para historial:', rutaParaHistorial ? 'existe' : 'null');
    if (rutaParaHistorial) {
      console.log('  - Waypoints:', rutaParaHistorial.waypoints?.length || 0);
      console.log('  - Tiene routeGeometry:', !!rutaParaHistorial.routeGeometry);
    }
    
    // Guardar historial de viaje ANTES de resetear estados (solo si no se guardó antes)
    if (!historialYaGuardado && rutaParaHistorial) {
      console.log('📝 Guardando historial en terminarRutaCompleta...');
      try {
        await guardarHistorialViajeConRuta(rutaParaHistorial);
        console.log('✅ Historial guardado exitosamente en terminarRutaCompleta');
      } catch (error) {
        console.error('❌ Error al guardar historial en terminarRutaCompleta:', error);
        Alert.alert('Error', 'No se pudo guardar el historial. Por favor, intenta nuevamente.');
      }
    } else if (!historialYaGuardado) {
      console.warn('⚠️ No se puede guardar historial: rutaParaHistorial es null');
    }
    
    // Primero resetear los estados de la ruta
    setRutaGenerada(null);
    setGenerandoRuta(false);
    console.log('✅ Estados de ruta reseteados: rutaGenerada=null, generandoRuta=false');
    
    // Resetear todos los estados de los pasajeros
    await resetearEstadosPasajeros();
    
    // Asegurarse de que los estados estén completamente reseteados
    setTimeout(() => {
      setRutaGenerada(null);
      setGenerandoRuta(false);
      console.log('✅ Verificación final: Estados de ruta confirmados como reseteados');
    }, 100);
    
    if (!historialYaGuardado) {
      Alert.alert(
        'Ruta terminada', 
        'La ruta ha sido terminada. Todos los estados han sido reseteados. Puedes generar una nueva ruta cuando estés listo.'
      );
    }
  };

  // Función para generar URL de imagen estática de Mapbox con la ruta
  const generarImagenRuta = (waypoints: Array<{ coordinates: { latitude: number; longitude: number }; name: string }>, routeGeometry?: any): string | null => {
    try {
      const MAPBOX_TOKEN = 'pk.eyJ1IjoiYmFydG94IiwiYSI6ImNtaGpxaGZudzE4NHMycnB0bnMwdjVtbHIifQ.Makrf18R1Z9Wo4V-yMXUYw';
      
      if (!waypoints || waypoints.length === 0) {
        return null;
      }

      // Calcular el bounding box de todos los waypoints
      const lats = waypoints.map(w => w.coordinates.latitude);
      const lngs = waypoints.map(w => w.coordinates.longitude);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);

      // Calcular el centro y el padding
      const centerLat = (minLat + maxLat) / 2;
      const centerLng = (minLng + maxLng) / 2;
      const padding = 0.01; // Padding adicional para el bounding box

      // Construir la URL de la imagen estática
      // Formato: path-{strokeWidth}+{strokeColor}({encodedPolyline})|pin-s+{color}({lon},{lat})
      let pathOverlay = '';
      
      // Si hay routeGeometry, usar las coordenadas de la ruta
      if (routeGeometry && routeGeometry.geometry && routeGeometry.geometry.coordinates) {
        const coordinates = routeGeometry.geometry.coordinates;
        // Limitar el número de coordenadas para evitar URLs muy largas (máximo 100 puntos)
        // Tomar puntos distribuidos uniformemente
        const maxPoints = 100;
        let sampledCoordinates = coordinates;
        if (coordinates.length > maxPoints) {
          const step = Math.ceil(coordinates.length / maxPoints);
          sampledCoordinates = coordinates.filter((_: any, index: number) => index % step === 0 || index === coordinates.length - 1);
        }
        // Convertir coordenadas [lng, lat] a string para el path
        // Usar color verde brillante (00ff00) para la línea de la ruta, ancho 6 para mejor visibilidad
        const pathCoords = sampledCoordinates.map((coord: number[]) => `${coord[0]},${coord[1]}`).join(';');
        pathOverlay = `path-6+00ff00(${pathCoords})`;
      } else {
        // Si no hay routeGeometry, dibujar línea recta entre waypoints
        // Usar color verde brillante (00ff00) para la línea de la ruta, ancho 6
        const pathCoords = waypoints.map(w => `${w.coordinates.longitude},${w.coordinates.latitude}`).join(';');
        pathOverlay = `path-6+00ff00(${pathCoords})`;
      }

      // Agregar marcadores: círculo verde oscuro con "1" para inicio, ícono de bus para fin
      const markers: string[] = [];
      if (waypoints.length > 0) {
        // Marcador de inicio: círculo verde oscuro con número "1" en blanco
        const inicio = waypoints[0];
        // Usar pin-l (large) con color verde oscuro (#006400 o 006400) y etiqueta "1" en blanco
        markers.push(`pin-l-1+006400+ffffff(${inicio.coordinates.longitude},${inicio.coordinates.latitude})`);
        
        // Marcador de fin: ícono de bus (usar marcador con etiqueta "B" o similar, o color amarillo)
        if (waypoints.length > 1) {
          const fin = waypoints[waypoints.length - 1];
          // Usar marcador amarillo (#ffd700 o ffd700) con etiqueta "B" para bus
          markers.push(`pin-l-b+ffd700+000000(${fin.coordinates.longitude},${fin.coordinates.latitude})`);
        }
      }
      const markersString = markers.join('|');

      // Construir la URL completa
      // Usar estilo light-v10 para un mapa más limpio y claro
      const bbox = `${minLng - padding},${minLat - padding},${maxLng + padding},${maxLat + padding}`;
      const overlayParts = [pathOverlay];
      if (markersString) {
        overlayParts.push(markersString);
      }
      const overlay = overlayParts.join('|');
      const imageUrl = `https://api.mapbox.com/styles/v1/mapbox/light-v10/static/${overlay}/${centerLng},${centerLat},12,0/600x400@2x?access_token=${MAPBOX_TOKEN}`;
      
      console.log('🗺️ URL de imagen de ruta generada:', imageUrl.substring(0, 100) + '...');
      return imageUrl;
    } catch (error) {
      console.error('Error al generar imagen de ruta:', error);
      return null;
    }
  };

  // Función para guardar historial de viaje (usa el estado actual de rutaGenerada)
  const guardarHistorialViaje = async () => {
    return guardarHistorialViajeConRuta(rutaGenerada);
  };

  // Función para guardar historial de viaje con una ruta específica
  const guardarHistorialViajeConRuta = async (rutaParaGuardar: typeof rutaGenerada) => {
    try {
      console.log('📝 INICIANDO guardarHistorialViajeConRuta...');
      console.log('  - rutaParaGuardar:', rutaParaGuardar ? 'existe' : 'null');
      
      // Obtener RUT del conductor desde AsyncStorage si no está disponible en el estado
      let rutConductorParaGuardar = rutConductor;
      if (!rutConductorParaGuardar) {
        const rutGuardado = await AsyncStorage.getItem('rutUsuario');
        if (rutGuardado) {
          rutConductorParaGuardar = rutGuardado;
          console.log('  - rutConductor obtenido desde AsyncStorage:', rutConductorParaGuardar);
        }
      } else {
        console.log('  - rutConductor desde estado:', rutConductorParaGuardar);
      }
      
      if (!rutaParaGuardar) {
        console.error('❌ No se puede guardar historial: falta ruta');
        console.error('  rutaParaGuardar:', rutaParaGuardar);
        Alert.alert('Error', 'No se pudo guardar el historial. Falta información de la ruta.');
        return;
      }
      
      if (!rutConductorParaGuardar) {
        console.error('❌ No se puede guardar historial: falta RUT del conductor');
        console.error('  rutConductor:', rutConductorParaGuardar);
        Alert.alert('Error', 'No se pudo guardar el historial. Falta información del conductor.');
        return;
      }
      
      console.log('✅ Validaciones pasadas - ruta y RUT disponibles');

      console.log('📝 Guardando historial de viaje...');
      console.log('  - Waypoints en ruta:', rutaParaGuardar.waypoints?.length || 0);
      
      // Fecha/hora de fin de la ruta (cuando se termina)
      const fechaFinRuta = new Date();
      const fechaFinFormateada = fechaFinRuta.toLocaleString('es-CL', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false, // Formato 24 horas
      });
      
      // Fecha/hora de inicio de la ruta (cuando se generó)
      let fechaInicioRuta: Date | null = null;
      let fechaInicioFormateada = fechaFinFormateada;
      
      if ((rutaParaGuardar as any).fechaInicio) {
        fechaInicioRuta = (rutaParaGuardar as any).fechaInicio instanceof Date 
          ? (rutaParaGuardar as any).fechaInicio 
          : new Date((rutaParaGuardar as any).fechaInicio);
        if (fechaInicioRuta) {
          fechaInicioFormateada = (rutaParaGuardar as any).fechaInicioFormateada || fechaInicioRuta.toLocaleString('es-CL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false, // Formato 24 horas
          });
        }
      } else {
        // Si no hay fecha de inicio guardada, usar la fecha de fin como fallback
        fechaInicioRuta = fechaFinRuta;
      }
      
      // Fecha/hora general del viaje (usar la de fin para ordenamiento)
      const fechaHora = fechaFinFormateada;

      // Obtener información detallada de todos los pasajeros que estaban en la ruta
      // Usar los pasajeros del estado actual (que fueron incluidos en la ruta generada)
      // y también obtener sus datos actualizados de Firestore para tener los horarios
      const listaPasajerosRef = collection(db, 'lista_pasajeros');
      
      // Normalizar RUT del conductor para la búsqueda
      const rutConductorNormalizadoParaBusqueda = normalizarRut(rutConductorParaGuardar);
      
      // Intentar buscar con RUT normalizado primero
      let pasajerosQuery = query(listaPasajerosRef, where('rutConductor', '==', rutConductorNormalizadoParaBusqueda));
      let pasajerosSnapshot = await getDocs(pasajerosQuery);
      
      // Si no encuentra pasajeros con RUT normalizado, intentar con RUT original
      if (pasajerosSnapshot.empty && rutConductorParaGuardar !== rutConductorNormalizadoParaBusqueda) {
        console.log('⚠️ No se encontraron pasajeros con RUT normalizado, intentando con RUT original...');
        pasajerosQuery = query(listaPasajerosRef, where('rutConductor', '==', rutConductorParaGuardar));
        pasajerosSnapshot = await getDocs(pasajerosQuery);
      }
      
      console.log(`📋 Pasajeros encontrados para historial: ${pasajerosSnapshot.docs.length}`);

      const detallesPasajeros: Array<{
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
        patenteFurgon?: string;
        estadoViaje?: string;
      }> = [];

      // Agrupar pasajeros por apoderado para crear historiales individuales
      const pasajerosPorApoderado: { [key: string]: typeof detallesPasajeros } = {};

      // Obtener los RUTs de los hijos que estaban en la ruta generada
      const rutHijosEnRuta = new Set(
        (rutaParaGuardar.waypoints || [])
          .map(w => w.rutHijo)
          .filter(Boolean) as string[]
      );

      // Si no hay waypoints con rutHijo, usar todos los pasajeros del conductor
      const incluirTodos = rutHijosEnRuta.size === 0;

      for (const docSnap of pasajerosSnapshot.docs) {
        const data = docSnap.data();
        const rutHijo = (data.rutHijo || '').toString().trim();
        const estadoViaje = (data.estadoViaje || '').toString().trim().toLowerCase();
        
        // Incluir TODOS los pasajeros que estaban en la ruta generada
        // Si la ruta tiene waypoints con rutHijo, solo incluir esos
        // Si no, incluir todos los pasajeros del conductor
        const estabaEnRuta = incluirTodos || rutHijosEnRuta.has(rutHijo);
        
        if (estabaEnRuta) {
          // Usar las horas formateadas guardadas, o formatear si no existen
          let horaRecogidoFormateada = data.horaRecogidoFormateada || null;
          let horaEntregadoFormateada = data.horaEntregadoFormateada || null;
          
          // Si no hay hora formateada guardada, formatear desde el timestamp
          if (!horaRecogidoFormateada && data.fechaRecogido) {
            try {
              const fechaRecogido = data.fechaRecogido.toDate ? data.fechaRecogido.toDate() : new Date(data.fechaRecogido);
              horaRecogidoFormateada = fechaRecogido.toLocaleString('es-CL', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false, // Formato 24 horas
              });
            } catch (error) {
              console.error('Error al formatear fechaRecogido:', error);
            }
          }
          
          if (!horaEntregadoFormateada && data.fechaEntregado) {
            try {
              const fechaEntregado = data.fechaEntregado.toDate ? data.fechaEntregado.toDate() : new Date(data.fechaEntregado);
              horaEntregadoFormateada = fechaEntregado.toLocaleString('es-CL', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false, // Formato 24 horas
              });
            } catch (error) {
              console.error('Error al formatear fechaEntregado:', error);
            }
          }
          
          // Normalizar RUT del apoderado para consistencia
          const rutApoderadoOriginal = (data.rutApoderado || '').toString().trim();
          const rutApoderadoNormalizado = normalizarRut(rutApoderadoOriginal);
          
          const detallePasajero = {
            rutHijo: data.rutHijo || '',
            nombreHijo: data.nombreHijo || 'Sin nombre',
            rutApoderado: rutApoderadoNormalizado, // Guardar normalizado
            nombreApoderado: data.nombreApoderado || 'Sin apoderado',
            fechaRecogido: data.fechaRecogido || null,
            fechaEntregado: data.fechaEntregado || null,
            horaRecogidoFormateada: horaRecogidoFormateada || null,
            horaEntregadoFormateada: horaEntregadoFormateada || null,
            direccion: data.direccion || '',
            coordenadas: data.coordenadas || null, // Cambiar undefined a null
            patenteFurgon: data.patenteFurgon || '',
            estadoViaje: estadoViaje || '',
          };
          
          console.log(`📋 Pasajero en historial: ${detallePasajero.nombreHijo} - Recogido: ${horaRecogidoFormateada || 'N/A'}, Entregado: ${horaEntregadoFormateada || 'N/A'}`);
          console.log(`  RUT Apoderado: ${rutApoderadoOriginal} -> ${rutApoderadoNormalizado}`);

          detallesPasajeros.push(detallePasajero);

          // Agrupar por apoderado (usar RUT normalizado)
          if (rutApoderadoNormalizado) {
            if (!pasajerosPorApoderado[rutApoderadoNormalizado]) {
              pasajerosPorApoderado[rutApoderadoNormalizado] = [];
            }
            pasajerosPorApoderado[rutApoderadoNormalizado].push(detallePasajero);
          }
        }
      }

      if (detallesPasajeros.length === 0) {
        console.log('⚠️ No hay pasajeros para guardar en el historial');
        return;
      }

      // Obtener patente del furgón (usar la primera patente disponible de los pasajeros o del conductor)
      const patenteFurgon = detallesPasajeros[0]?.patenteFurgon || patentesConductor[0] || '';

      // Generar imagen estática del mapa con la ruta
      const imagenRuta = generarImagenRuta(rutaParaGuardar.waypoints || [], rutaParaGuardar.routeGeometry);
      console.log('🗺️ Imagen de ruta generada:', imagenRuta ? 'Sí' : 'No');

      // Normalizar RUT del conductor para consistencia
      const rutConductorNormalizado = normalizarRut(rutConductorParaGuardar);
      console.log(`📝 Guardando historial - RUT conductor: ${rutConductorParaGuardar} -> ${rutConductorNormalizado}`);

      // Convertir routeGeometry a formato compatible con Firestore (sin arrays anidados)
      // Siempre convertir a JSON string para evitar problemas con arrays anidados
      let rutaGeometryParaGuardar: string | null = null;
      if (rutaParaGuardar.routeGeometry) {
        try {
          // Siempre convertir a JSON string para evitar arrays anidados
          rutaGeometryParaGuardar = JSON.stringify(rutaParaGuardar.routeGeometry);
          console.log('✅ routeGeometry convertido a JSON string para evitar arrays anidados');
        } catch (error) {
          console.warn('⚠️ Error al convertir routeGeometry a JSON string:', error);
          rutaGeometryParaGuardar = null;
        }
      }

      // Convertir waypoints a formato compatible (asegurar que coordinates sea un objeto plano)
      const waypointsParaGuardar = (rutaParaGuardar.waypoints || []).map(w => ({
        coordinates: {
          latitude: w.coordinates?.latitude || 0,
          longitude: w.coordinates?.longitude || 0,
        },
        name: w.name || '',
        rutHijo: w.rutHijo || '',
      }));

      // Guardar historial para el conductor (con todos los pasajeros)
      // Asegurar que todos los campos sean null en lugar de undefined
      const historialConductor = {
        rutConductor: rutConductorNormalizado || '', // Guardar normalizado
        patenteFurgon: patenteFurgon || '',
        fechaViaje: serverTimestamp(),
        fechaViajeFormateada: fechaHora || '',
        fechaInicio: fechaInicioRuta ? Timestamp.fromDate(fechaInicioRuta) : serverTimestamp(),
        fechaInicioFormateada: fechaInicioFormateada || '',
        fechaFin: Timestamp.fromDate(fechaFinRuta),
        fechaFinFormateada: fechaFinFormateada || '',
        cantidadNinos: detallesPasajeros.length || 0,
        rutaGeometry: rutaGeometryParaGuardar || null,
        waypoints: waypointsParaGuardar || [],
        imagenRuta: imagenRuta || null, // URL de la imagen estática del mapa
        pasajeros: detallesPasajeros || [],
        tipoUsuario: 'conductor',
        creadoEn: serverTimestamp(),
      };

      console.log('📤 Intentando guardar historial del conductor...');
      console.log('  - Datos a guardar:', {
        rutConductor: rutConductorNormalizado,
        cantidadNinos: detallesPasajeros.length,
        tieneRutaGeometry: !!rutaGeometryParaGuardar,
        tieneWaypoints: waypointsParaGuardar.length > 0,
        tieneImagenRuta: !!imagenRuta,
        tienePasajeros: detallesPasajeros.length > 0,
      });
      
      try {
        const docRefConductor = await addDoc(collection(db, 'historial_viajes'), historialConductor);
        console.log('✅ Historial guardado para conductor con', detallesPasajeros.length, 'pasajeros');
        console.log('  📄 ID del documento:', docRefConductor.id);
        console.log('  📄 RUT conductor guardado:', rutConductorNormalizado);
        detallesPasajeros.forEach(p => {
          console.log(`  - ${p.nombreHijo}: Recogido ${p.horaRecogidoFormateada || 'N/A'}, Entregado ${p.horaEntregadoFormateada || 'N/A'}`);
        });
      } catch (errorGuardarConductor) {
        console.error('❌ ERROR al guardar historial del conductor:', errorGuardarConductor);
        console.error('  - Error completo:', JSON.stringify(errorGuardarConductor, null, 2));
        throw errorGuardarConductor; // Re-lanzar para que se capture arriba
      }

      // Guardar historial para cada apoderado (solo con sus hijos)
      for (const [rutApoderado, pasajerosApoderado] of Object.entries(pasajerosPorApoderado)) {
        if (rutApoderado && pasajerosApoderado.length > 0) {
          // Asegurar que todos los campos sean null en lugar de undefined
          const historialApoderado = {
            rutConductor: rutConductorNormalizado || '', // Usar RUT normalizado
            rutApoderado: rutApoderado || '', // Ya está normalizado desde antes
            patenteFurgon: patenteFurgon || '',
            fechaViaje: serverTimestamp(),
            fechaViajeFormateada: fechaHora || '',
            fechaInicio: fechaInicioRuta ? Timestamp.fromDate(fechaInicioRuta) : serverTimestamp(),
            fechaInicioFormateada: fechaInicioFormateada || '',
            fechaFin: Timestamp.fromDate(fechaFinRuta),
            fechaFinFormateada: fechaFinFormateada || '',
            cantidadNinos: pasajerosApoderado.length || 0,
            rutaGeometry: rutaGeometryParaGuardar || null, // Usar la versión procesada
            waypoints: waypointsParaGuardar || [], // Usar la versión procesada
            imagenRuta: imagenRuta || null, // URL de la imagen estática del mapa
            pasajeros: pasajerosApoderado || [], // Solo los hijos de este apoderado
            tipoUsuario: 'apoderado',
            creadoEn: serverTimestamp(),
          };

          console.log(`📤 Intentando guardar historial del apoderado: ${rutApoderado}...`);
          try {
            const docRefApoderado = await addDoc(collection(db, 'historial_viajes'), historialApoderado);
            console.log(`✅ Historial guardado para apoderado: ${rutApoderado} con ${pasajerosApoderado.length} hijo(s)`);
            console.log('  📄 ID del documento:', docRefApoderado.id);
            console.log('  📄 RUT apoderado guardado:', rutApoderado);
            pasajerosApoderado.forEach(p => {
              console.log(`  - ${p.nombreHijo}: Recogido ${p.horaRecogidoFormateada || 'N/A'}, Entregado ${p.horaEntregadoFormateada || 'N/A'}`);
            });
          } catch (errorGuardarApoderado) {
            console.error(`❌ ERROR al guardar historial del apoderado ${rutApoderado}:`, errorGuardarApoderado);
            console.error('  - Error completo:', JSON.stringify(errorGuardarApoderado, null, 2));
            // Continuar con los demás apoderados aunque uno falle
          }
        }
      }

      console.log('✅ Historial de viaje guardado exitosamente');
      console.log('  - Documentos guardados:');
      console.log('    * Conductor: 1 documento');
      console.log('    * Apoderados:', Object.keys(pasajerosPorApoderado).length, 'documentos');
      console.log('  - Total pasajeros:', detallesPasajeros.length);
      
      // Mostrar alerta de éxito (se puede comentar si es molesto)
      // Alert.alert('Éxito', `Historial de viaje guardado correctamente para ${detallesPasajeros.length} pasajero(s).`);
    } catch (error) {
      console.error('❌ Error al guardar historial de viaje:', error);
      console.error('  - Stack:', error instanceof Error ? error.stack : 'N/A');
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      Alert.alert('Error', `No se pudo guardar el historial de viaje: ${errorMessage}`);
      throw error; // Re-lanzar el error para que el llamador sepa que falló
    }
  };

  // Función para resetear estados de todos los pasajeros
  const resetearEstadosPasajeros = async () => {
    try {
      // Obtener el RUT del conductor desde AsyncStorage para asegurarnos de que esté disponible
      const rutGuardado = await AsyncStorage.getItem('rutUsuario');
      if (!rutGuardado) {
        console.error('❌ No se pudo obtener el RUT del conductor para resetear estados');
        return;
      }

      const listaPasajerosRef = collection(db, 'lista_pasajeros');
      const todosLosPasajerosQuery = query(
        listaPasajerosRef,
        where('rutConductor', '==', rutGuardado)
      );
      const todosLosPasajerosSnap = await getDocs(todosLosPasajerosQuery);

      console.log(`🔄 Reseteando estados de ${todosLosPasajerosSnap.docs.length} pasajeros para RUT: ${rutGuardado}`);

      let contadorReseteados = 0;
      for (const docSnap of todosLosPasajerosSnap.docs) {
        const pasajeroData = docSnap.data();
        const estadoViaje = (pasajeroData.estadoViaje || '').toString().trim().toLowerCase();
        
        console.log(`  📋 Pasajero: ${pasajeroData.nombreHijo || 'Sin nombre'}, Estado actual: "${estadoViaje}"`);
        
        // Resetear TODOS los pasajeros, independientemente de su estado actual
        // Esto asegura que todos aparezcan en la próxima ruta sin necesidad de darse de baja
        // IMPORTANTE: No importa si tienen estado "entregado", "recogido", o cualquier otro
        // Todos se resetean para que puedan aparecer en la nueva ruta
        try {
          await setDoc(
            doc(db, 'lista_pasajeros', docSnap.id),
            {
              estadoViaje: '', // Estado vacío = listo para nueva ruta
              fechaRecogido: deleteField(), // Eliminar fecha de recogido
              fechaEntregado: deleteField(), // Eliminar fecha de entregado
            },
            { merge: true }
          );
          contadorReseteados++;
          console.log(`  ✅ Estado reseteado para: ${pasajeroData.nombreHijo || 'Sin nombre'} (estado anterior: "${estadoViaje}")`);
        } catch (errorDoc) {
          console.error(`  ❌ Error al resetear ${pasajeroData.nombreHijo}:`, errorDoc);
        }
      }

      console.log(`✅ Reseteo completado: ${contadorReseteados} de ${todosLosPasajerosSnap.docs.length} pasajeros reseteados`);
      
      // Esperar un momento para que Firestore procese los cambios
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log('⏳ Espera completada, recargando pasajeros manualmente...');
      
      // Forzar una recarga manual de los pasajeros para asegurar que se actualicen
      try {
        const rutGuardadoRecarga = await AsyncStorage.getItem('rutUsuario');
        if (rutGuardadoRecarga) {
          const listaPasajerosRef = collection(db, 'lista_pasajeros');
          const pasajerosQuery = query(listaPasajerosRef, where('rutConductor', '==', rutGuardadoRecarga));
          const pasajerosSnapshot = await getDocs(pasajerosQuery);
          
          console.log(`📋 Recarga manual: ${pasajerosSnapshot.docs.length} documentos encontrados`);
          
          // Log de estados después del reset
          pasajerosSnapshot.docs.forEach((docSnap) => {
            const data = docSnap.data();
            const estado = (data.estadoViaje || '').toString().trim();
            console.log(`  📋 Recarga - ${data.nombreHijo || 'Sin nombre'}: estadoViaje="${estado}"`);
          });
          
          const ubicacionActualizada = ubicacionActualRef.current || { latitude: -33.45, longitude: -70.6667 };
          const pasajerosLista = await procesarYOrdenarPasajeros(pasajerosSnapshot, ubicacionActualizada);
          
          console.log(`✅ Recarga manual completada: ${pasajerosLista.length} pasajeros procesados`);
          pasajerosLista.forEach(p => {
            console.log(`  ✅ Incluido en lista: ${p.nombreHijo}, Estado: "${p.estadoViaje || ''}"`);
          });
          
          // Actualizar el estado de pasajeros
          setPasajeros(pasajerosLista);
          
          // Actualizar siguiente niño - tomar el primero de la lista (el más cercano)
          if (pasajerosLista.length > 0) {
            const siguienteNinoNoEntregado = pasajerosLista.find(p => {
              const estado = (p.estadoViaje || '').toString().trim().toLowerCase();
              return estado !== 'entregado';
            });
            
            if (siguienteNinoNoEntregado) {
              setSiguienteNino(siguienteNinoNoEntregado);
              console.log('👶 Siguiente niño actualizado después del reset:', siguienteNinoNoEntregado.nombreHijo);
            } else {
              // Si no hay ninguno no entregado, tomar el primero de la lista
              setSiguienteNino(pasajerosLista[0]);
              console.log('👶 Siguiente niño establecido como el primero de la lista:', pasajerosLista[0].nombreHijo);
            }
          } else {
            setSiguienteNino(null);
            console.log('⚠️ No hay pasajeros después del reset');
          }
        } else {
          console.error('❌ No se pudo obtener el RUT para recargar pasajeros');
        }
      } catch (errorRecarga) {
        console.error('❌ Error al recargar pasajeros después del reset:', errorRecarga);
      }
    } catch (error) {
      console.error('❌ Error al resetear estados de pasajeros:', error);
      // No mostrar error al usuario, solo loguear
    }
  };

  const confirmarTerminarRuta = async () => {
    console.log('🛑 Confirmando terminar ruta...');
    // IMPORTANTE: Guardar una copia de la ruta ANTES de resetear estados
    const rutaParaHistorial = rutaGenerada;
    
    console.log('📋 Ruta para historial:', rutaParaHistorial ? 'existe' : 'null');
    if (rutaParaHistorial) {
      console.log('  - Waypoints:', rutaParaHistorial.waypoints?.length || 0);
      console.log('  - Tiene routeGeometry:', !!rutaParaHistorial.routeGeometry);
    }
    
    // Cerrar el modal primero
    setModalTerminarRutaVisible(false);
    
    // Obtener todos los niños que no han sido entregados
    const ninosNoEntregados = pasajeros.filter(p => {
      const estado = (p.estadoViaje || '').toString().trim().toLowerCase();
      return estado !== 'entregado';
    });
    
    console.log('👶 Niños no entregados:', ninosNoEntregados.length);
    
    // Enviar alertas a los padres y resetear estados (pasar la ruta guardada)
    try {
      await terminarRutaConAlerta(ninosNoEntregados, rutaParaHistorial);
      console.log('✅ terminarRutaConAlerta completado');
    } catch (error) {
      console.error('❌ Error en terminarRutaConAlerta:', error);
      Alert.alert('Error', 'Hubo un problema al terminar la ruta. Por favor, intenta nuevamente.');
    }
    
    // Resetear estados DESPUÉS de guardar el historial
    setRutaGenerada(null);
    setGenerandoRuta(false);
  };

  const terminarRutaConAlerta = async (ninosAbordo: Pasajero[], rutaParaHistorial?: typeof rutaGenerada) => {
    try {
      console.log('📝 terminarRutaConAlerta - Iniciando guardado de historial...');
      console.log('  - rutaParaHistorial:', rutaParaHistorial ? 'existe' : 'null');
      console.log('  - rutaGenerada (estado):', rutaGenerada ? 'existe' : 'null');
      
      // Guardar historial de viaje ANTES de resetear estados
      // Usar la ruta pasada como parámetro si está disponible, sino usar el estado actual
      if (rutaParaHistorial) {
        console.log('📝 Guardando historial con ruta pasada como parámetro...');
        await guardarHistorialViajeConRuta(rutaParaHistorial);
        console.log('✅ Historial guardado con ruta pasada como parámetro');
      } else if (rutaGenerada) {
        console.log('📝 Guardando historial con ruta del estado...');
        await guardarHistorialViaje();
        console.log('✅ Historial guardado con ruta del estado');
      } else {
        console.error('❌ No hay ruta disponible para guardar historial');
        Alert.alert('Advertencia', 'No se pudo guardar el historial porque no hay información de ruta disponible.');
      }

      // Eliminar la ruta activa de la base de datos
      try {
        const rutGuardado = await AsyncStorage.getItem('rutUsuario');
        if (rutGuardado) {
          const rutConductorNormalizado = normalizarRut(rutGuardado);
          const rutasActivasRef = collection(db, 'rutas_activas');
          // Usar RUT normalizado para marcar como inactiva
          const rutaDocRef = doc(rutasActivasRef, rutConductorNormalizado);
          await setDoc(rutaDocRef, { activa: false }, { merge: true });
          console.log('✅ Ruta activa marcada como inactiva en base de datos (RUT normalizado:', rutConductorNormalizado, ')');
          
          // También intentar con RUT original por compatibilidad
          if (rutGuardado !== rutConductorNormalizado) {
            try {
              const rutaDocRefOriginal = doc(rutasActivasRef, rutGuardado);
              await setDoc(rutaDocRefOriginal, { activa: false }, { merge: true });
              console.log('✅ Ruta activa también marcada como inactiva con RUT original');
            } catch (errorOriginal) {
              console.warn('⚠️ No se pudo marcar ruta inactiva con RUT original (puede que no exista):', errorOriginal);
            }
          }
        }
      } catch (error) {
        console.error('Error al eliminar ruta activa:', error);
      }

      // Crear alertas para cada padre cuyo hijo esté a bordo
      for (const pasajero of ninosAbordo) {
        try {
          // Obtener datos del pasajero desde Firestore para asegurar que tenemos toda la información
          const listaPasajerosRef = collection(db, 'lista_pasajeros');
          const pasajeroQuery = query(
            listaPasajerosRef,
            where('rutHijo', '==', pasajero.rutHijo),
            where('rutConductor', '==', rutConductor),
            limit(1)
          );
          const pasajeroSnap = await getDocs(pasajeroQuery);

          if (!pasajeroSnap.empty) {
            const pasajeroData = pasajeroSnap.docs[0].data();
            const rutApoderado = (pasajeroData.rutApoderado || '').toString().trim();

            if (rutApoderado) {
              // Obtener fecha y hora actual
              const ahora = new Date();
              const fechaHora = ahora.toLocaleString('es-CL', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false, // Formato 24 horas
              });

              // Crear alerta para el apoderado
              await addDoc(collection(db, 'Alertas'), {
                tipo: 'Problema Conexión',
                tipoAlerta: 'Problema Conexión',
                descripcion: `${pasajero.nombreHijo} aún está con el conductor del furgón. Hubo un problema con la conexión y la ruta fue terminada. Por favor, contacte al conductor.`,
                rutDestinatario: rutApoderado,
                rutHijo: pasajero.rutHijo,
                nombreHijo: pasajero.nombreHijo,
                patenteFurgon: pasajeroData.patenteFurgon || '',
                fechaHoraProblema: fechaHora,
                creadoEn: serverTimestamp(),
                leida: false,
              });

              console.log(`✅ Alerta de problema de conexión creada para ${pasajero.nombreHijo}`);
            }
          }
        } catch (error) {
          console.error(`Error al crear alerta para ${pasajero.nombreHijo}:`, error);
        }
      }

      // Resetear el estado de todos los pasajeros para que aparezcan en la próxima ruta
      await resetearEstadosPasajeros();

      console.log('✅ Historial guardado y estados de pasajeros reseteados');

      Alert.alert(
        'Ruta terminada',
        `La ruta ha sido terminada. Se han enviado alertas a los padres de ${ninosAbordo.length} ${ninosAbordo.length === 1 ? 'niño' : 'niños'} que aún estaban a bordo.\n\nTodos los estados han sido reseteados. Puedes generar una nueva ruta cuando estés listo.`
      );
    } catch (error) {
      console.error('Error al terminar ruta:', error);
      Alert.alert('Error', 'Ocurrió un error al terminar la ruta.');
    }
  };

  const handlePickUp = async () => {
    if (!siguienteNino) return;
    
    try {
      // Buscar el registro en lista_pasajeros
      const listaPasajerosRef = collection(db, 'lista_pasajeros');
      const pasajeroQuery = query(
        listaPasajerosRef,
        where('rutHijo', '==', siguienteNino.rutHijo),
        where('rutConductor', '==', rutConductor),
        limit(1)
      );
      const pasajeroSnap = await getDocs(pasajeroQuery);
      
      if (!pasajeroSnap.empty) {
        const pasajeroDoc = pasajeroSnap.docs[0];
        const pasajeroData = pasajeroDoc.data();
        
        // Obtener fecha y hora actual
        const ahora = new Date();
        const fechaHora = ahora.toLocaleString('es-CL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false, // Formato 24 horas
        });
        
        // Formatear hora completa para guardar en historial
        const horaRecogidoFormateada = ahora.toLocaleString('es-CL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false, // Formato 24 horas
        });
        
        // Actualizar estado en lista_pasajeros con hora formateada
        await setDoc(
          doc(db, 'lista_pasajeros', pasajeroDoc.id),
          {
            estadoViaje: 'recogido',
            fechaRecogido: serverTimestamp(),
            horaRecogidoFormateada: horaRecogidoFormateada,
          },
          { merge: true }
        );
        
        // Crear alerta para el apoderado con nombre del hijo y fecha/hora
        const rutApoderado = (pasajeroData.rutApoderado || '').toString().trim();
        if (rutApoderado) {
          console.log('📤 Creando alerta de Recogido:', {
            rutApoderado,
            nombreHijo: siguienteNino.nombreHijo,
            patenteFurgon: pasajeroData.patenteFurgon,
          });
          // Crear alerta SOLO para el apoderado (el conductor no necesita notificación de su propia acción)
          await addDoc(collection(db, 'Alertas'), {
            tipo: 'Recogido',
            tipoAlerta: 'Recogido',
            descripcion: `${siguienteNino.nombreHijo} ha sido recogido el ${fechaHora}`,
            rutDestinatario: rutApoderado,
            rutHijo: siguienteNino.rutHijo,
            nombreHijo: siguienteNino.nombreHijo,
            patenteFurgon: pasajeroData.patenteFurgon || '',
            fechaHoraRecogido: fechaHora,
            creadoEn: serverTimestamp(),
            leida: false,
          });
          console.log('✅ Alerta de Recogido creada para apoderado');
        } else {
          console.error('❌ No se pudo crear alerta: rutApoderado vacío');
        }
        
        Alert.alert('Recogido', `${siguienteNino.nombreHijo} ha sido marcado como recogido.`);
      } else {
        Alert.alert('Error', 'No se encontró el registro del pasajero.');
      }
    } catch (error) {
      console.error('Error al marcar como recogido:', error);
      Alert.alert('Error', 'No se pudo actualizar el estado.');
    }
  };

  const handleDropOff = async () => {
    if (!siguienteNino) return;
    
    try {
      // Buscar el registro en lista_pasajeros
      const listaPasajerosRef = collection(db, 'lista_pasajeros');
      const pasajeroQuery = query(
        listaPasajerosRef,
        where('rutHijo', '==', siguienteNino.rutHijo),
        where('rutConductor', '==', rutConductor),
        limit(1)
      );
      const pasajeroSnap = await getDocs(pasajeroQuery);
      
      if (!pasajeroSnap.empty) {
        const pasajeroDoc = pasajeroSnap.docs[0];
        const pasajeroData = pasajeroDoc.data();
        
        // Obtener fecha y hora actual
        const ahora = new Date();
        const fechaHora = ahora.toLocaleString('es-CL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false, // Formato 24 horas
        });
        
        // Formatear hora completa para guardar en historial
        const horaEntregadoFormateada = ahora.toLocaleString('es-CL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false, // Formato 24 horas
        });
        
        // Actualizar estado en lista_pasajeros con hora formateada
        await setDoc(
          doc(db, 'lista_pasajeros', pasajeroDoc.id),
          {
            estadoViaje: 'entregado',
            fechaEntregado: serverTimestamp(),
            horaEntregadoFormateada: horaEntregadoFormateada,
          },
          { merge: true }
        );
        
        // Crear alerta para el apoderado con nombre del hijo, fecha y hora
        const rutApoderado = (pasajeroData.rutApoderado || '').toString().trim();
        if (rutApoderado) {
          console.log('📤 Creando alerta de Entregado:', {
            rutApoderado,
            nombreHijo: siguienteNino.nombreHijo,
            patenteFurgon: pasajeroData.patenteFurgon,
          });
          // Crear alerta SOLO para el apoderado (el conductor no necesita notificación de su propia acción)
          await addDoc(collection(db, 'Alertas'), {
            tipo: 'Entregado',
            tipoAlerta: 'Entregado',
            descripcion: `${siguienteNino.nombreHijo} ha sido entregado el ${fechaHora}`,
            rutDestinatario: rutApoderado,
            rutHijo: siguienteNino.rutHijo,
            nombreHijo: siguienteNino.nombreHijo,
            patenteFurgon: pasajeroData.patenteFurgon || '',
            fechaHoraEntrega: fechaHora,
            creadoEn: serverTimestamp(),
            leida: false,
          });
          console.log('✅ Alerta de Entregado creada para apoderado');
        } else {
          console.error('❌ No se pudo crear alerta: rutApoderado vacío');
        }
        
        // Mostrar mensaje de confirmación de entrega
        Alert.alert('Entregado', `${siguienteNino.nombreHijo} ha sido marcado como entregado.`);
        
        // Nota: La ruta NO se termina automáticamente cuando se entrega al último niño.
        // El conductor debe presionar el botón "Terminar Ruta" manualmente cuando desee finalizar la ruta.
      } else {
        Alert.alert('Error', 'No se encontró el registro del pasajero.');
      }
    } catch (error) {
      console.error('Error al marcar como entregado:', error);
      Alert.alert('Error', 'No se pudo actualizar el estado.');
    }
  };

  const handleAceptarAgregarHijo = async () => {
    if (!alertaSeleccionada) return;
    
    try {
      const rut = await AsyncStorage.getItem('rutUsuario');
      if (!rut) {
        Alert.alert('Error', 'No se pudo obtener el RUT del usuario.');
        return;
      }

      const fechaISO = new Date().toISOString();
      const params = alertaSeleccionada.parametros || {};
      const rutApoderado = params.rutPadre as string;
      const rutHijo = params.rutHijo as string;
      const patenteFurgon = params.patenteFurgon as string;
      const idFurgon = params.idFurgon as string || '';
      const nombreHijo = params.nombreHijo as string || '';
      const nombreApoderado = params.nombreApoderado as string || '';

      if (!rutApoderado || !rutHijo || !patenteFurgon) {
        Alert.alert('Error', 'Faltan datos necesarios para completar la aceptación.');
        return;
      }

      // Cargar datos del hijo si no están disponibles
      let nombreHijoFinal = nombreHijo;
      let colegio = '';
      if (!nombreHijoFinal && rutHijo) {
        try {
          const hijoRef = doc(db, 'Hijos', rutHijo);
          const hijoSnap = await getDoc(hijoRef);
          if (hijoSnap.exists()) {
            const hijoData = hijoSnap.data();
            nombreHijoFinal = `${hijoData.nombres || ''} ${hijoData.apellidos || ''}`.trim();
            colegio = hijoData.colegio || '';
          }
        } catch (error) {
          console.error('Error al cargar datos del hijo:', error);
        }
      }

      // Cargar datos del apoderado si no están disponibles
      let nombreApoderadoFinal = nombreApoderado;
      if (!nombreApoderadoFinal && rutApoderado) {
        try {
          const apoderadoRef = query(collection(db, 'usuarios'), where('rut', '==', rutApoderado));
          const apoderadoSnap = await getDocs(apoderadoRef);
          if (!apoderadoSnap.empty) {
            const apoderadoData = apoderadoSnap.docs[0].data();
            nombreApoderadoFinal = `${apoderadoData.nombres || ''} ${apoderadoData.apellidos || ''}`.trim();
          }
        } catch (error) {
          console.error('Error al cargar datos del apoderado:', error);
        }
      }

      // Agregar el hijo a lista_pasajeros
      const listaPasajerosRef = collection(db, 'lista_pasajeros');
      const payloadListaPasajeros = {
        rutConductor: rut,
        rutApoderado,
        nombreApoderado: nombreApoderadoFinal,
        rutHijo,
        nombreHijo: nombreHijoFinal,
        patenteFurgon,
        idFurgon,
        colegio,
        nombreFurgon: params.nombreFurgon as string || '',
        fechaAceptacion: fechaISO,
        estado: 'aceptada',
        origen: 'agregar_hijo',
      };

      await addDoc(listaPasajerosRef, payloadListaPasajeros);

      // Enviar mensaje de confirmación (uno para cada participante)
      const chatId = `agregar_hijo_${rutHijo}_${rutApoderado}_${rut}`;
      const participantesChat = [rut, rutApoderado].filter(Boolean).sort();
      
      // Mensaje para el apoderado
      await addDoc(collection(db, 'MensajesChat'), {
        chatId,
        texto: 'El hijo ha sido agregado exitosamente al furgón.',
        emisor: 'Sistema',
        receptor: rutApoderado,
        participantes: participantesChat,
        fecha: fechaISO,
        entregado: true,
        leido: false,
      });
      
      // Mensaje para el conductor (para que también lo vea)
      await addDoc(collection(db, 'MensajesChat'), {
        chatId,
        texto: 'El hijo ha sido agregado exitosamente al furgón.',
        emisor: 'Sistema',
        receptor: rut,
        participantes: participantesChat,
        fecha: fechaISO,
        entregado: true,
        leido: false,
      });

      // Eliminar la alerta
      if (alertaSeleccionada.id) {
        try {
          await setDoc(doc(db, 'Alertas', alertaSeleccionada.id), {
            revisado: true,
            fechaRevision: fechaISO,
          }, { merge: true });
        } catch (error) {
          console.error('Error al marcar alerta como revisada:', error);
        }
      }

      Alert.alert('Éxito', 'El hijo ha sido agregado exitosamente al furgón.');
      setModalAgregarHijoVisible(false);
      setAlertaSeleccionada(null);
    } catch (error) {
      console.error('Error al aceptar agregar hijo:', error);
      Alert.alert('Error', 'No se pudo agregar el hijo al furgón.');
    }
  };

  const handleRechazarAgregarHijo = async () => {
    if (!alertaSeleccionada) return;
    
    try {
      const fechaISO = new Date().toISOString();
      const params = alertaSeleccionada.parametros || {};
      const rutApoderado = params.rutPadre as string;
      const rutHijo = params.rutHijo as string;
      const rut = await AsyncStorage.getItem('rutUsuario');
      if (!rut) return;

      // Enviar mensaje de rechazo (uno para cada participante)
      const chatId = `agregar_hijo_${rutHijo}_${rutApoderado}_${rut}`;
      const participantesChat = [rut, rutApoderado].filter(Boolean).sort();
      
      // Mensaje para el apoderado
      await addDoc(collection(db, 'MensajesChat'), {
        chatId,
        texto: 'La solicitud para agregar al hijo ha sido rechazada.',
        emisor: 'Sistema',
        receptor: rutApoderado,
        participantes: participantesChat,
        fecha: fechaISO,
        entregado: true,
        leido: false,
      });
      
      // Mensaje para el conductor (para que también lo vea)
      await addDoc(collection(db, 'MensajesChat'), {
        chatId,
        texto: 'La solicitud para agregar al hijo ha sido rechazada.',
        emisor: 'Sistema',
        receptor: rut,
        participantes: participantesChat,
        fecha: fechaISO,
        entregado: true,
        leido: false,
      });

      // Eliminar la alerta
      if (alertaSeleccionada.id) {
        try {
          await setDoc(doc(db, 'Alertas', alertaSeleccionada.id), {
            revisado: true,
            fechaRevision: fechaISO,
          }, { merge: true });
        } catch (error) {
          console.error('Error al marcar alerta como revisada:', error);
        }
      }

      Alert.alert('Solicitud rechazada', 'La solicitud ha sido rechazada.');
      setModalAgregarHijoVisible(false);
      setAlertaSeleccionada(null);
    } catch (error) {
      console.error('Error al rechazar agregar hijo:', error);
      Alert.alert('Error', 'No se pudo rechazar la solicitud.');
    }
  };

  return (
    <View style={styles.container}>
      {/* Barra superior */}
      <View style={styles.greenHeader}>
        <Pressable onPress={() => setMenuVisible(!menuVisible)} style={styles.iconButton}>
          <View style={styles.iconWrapper}>
            <Ionicons name="menu" size={28} color="#fff" />
            {mensajesNoLeidos > 0 && (
              <View style={styles.notificationDot} />
            )}
          </View>
        </Pressable>
        <Pressable
          onPress={() => router.replace('/(tabs)/conductor/pagina-principal-conductor')}
          style={styles.inicioButton}
        >
          <Text style={styles.inicioText}>Inicio</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setAlertasVisible((prev) => {
              const next = !prev;
              if (!next) {
                setUltimaRevisionAlertas(Date.now());
              }
              return next;
            });
          }}
          style={[
            styles.iconButton,
            alertasVisible ? styles.iconButtonActive : null,
          ]}
        >
          <View style={styles.notificationWrapper}>
            <Ionicons
              name="notifications-outline"
              size={28}
              color={alertasVisible ? '#1dbb7f' : '#fff'}
            />
            {numeroAlertasSinRevisar > 0 && !alertasVisible && (
              <View style={styles.notificationBadge}>
                <Text style={styles.notificationBadgeText}>
                  {numeroAlertasSinRevisar > 9 ? '9+' : numeroAlertasSinRevisar}
                </Text>
              </View>
            )}
          </View>
        </Pressable>
      </View>

      {/* Menú lateral */}
      {menuVisible && (
        <View style={styles.menu}>
          <Link href="/conductor/perfil-conductor" asChild>
            <TouchableHighlight style={styles.menuButton}>
              <Text style={styles.menuButtonText}>Editar perfil</Text>
            </TouchableHighlight>
          </Link>
          <Link href="/historial-viajes" asChild>
            <TouchableHighlight style={styles.menuButton}>
              <Text style={styles.menuButtonText}>Historial de viajes</Text>
            </TouchableHighlight>
          </Link>
          <Link href="/conductor/Lista_vehiculos_2" asChild>
            <TouchableHighlight style={styles.menuButton}>
              <Text style={styles.menuButtonText}>Lista de niños</Text>
            </TouchableHighlight>
          </Link>
          <Link href="/conductor/promocionar-furgon" asChild>
            <TouchableHighlight style={styles.menuButton}>
              <Text style={styles.menuButtonText}>Promocionar Furgón</Text>
            </TouchableHighlight>
          </Link>
          <Link href="/chat-furgon" asChild>
            <TouchableHighlight style={styles.menuButton}>
              <View style={styles.menuButtonContent}>
                <Text style={styles.menuButtonText}>Chat Apoderados</Text>
                {mensajesNoLeidos > 0 && (
                  <View style={styles.chatNotificationDot} />
                )}
              </View>
            </TouchableHighlight>
          </Link>
        </View>
      )}

      {/* Panel de alertas */}
      {alertasVisible && (
        <View style={styles.alertasWrapper}>
          <View style={styles.alertasCard}>
            {alertas.length === 0 ? (
              <Text style={styles.noAlertasText}>No hay alertas nuevas</Text>
            ) : (
              <ScrollView
                style={styles.alertasScroll}
                contentContainerStyle={styles.alertasScrollContent}
                showsVerticalScrollIndicator
              >
                {alertas.map((alerta, idx) => (
                  <View key={idx} style={styles.alertaItem}>
                    <Text style={styles.alertaBullet}>*</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.alertaDescripcion}>{alerta.descripcion}</Text>
                      <TouchableHighlight
                        style={styles.alertaBoton}
                        underlayColor="#0c5c4e"
                        onPress={() => {
                          // Si es una alerta de tipo AgregarHijo, mostrar modal
                          if (alerta.tipoAlerta === 'AgregarHijo') {
                            setAlertaSeleccionada(alerta);
                            setModalAgregarHijoVisible(true);
                            return;
                          }
                          // Si es una alerta de tipo Baja, no hacer nada (solo informativa)
                          if (alerta.tipoAlerta === 'Baja') {
                            return;
                          }
                          // Si es una postulación aceptada, rechazada o dada de baja, no hacer nada (solo informativa)
                          if (alerta.tipoAlerta === 'Postulacion' && alerta.estadoPostulacion && 
                              (alerta.estadoPostulacion === 'aceptada' || 
                               alerta.estadoPostulacion === 'rechazada' ||
                               alerta.estadoPostulacion === 'baja' ||
                               alerta.estadoPostulacion === 'cancelada')) {
                            return;
                          }
                          // Para otras alertas (postulaciones pendientes), navegar normalmente
                          if (!alerta.idPostulacion) return;
                          const params = {
                            ...alerta.parametros,
                            idPostulacion: alerta.idPostulacion,
                          };
                          router.push({
                            pathname: alerta.rutaDestino || '/chat-validacion',
                            params,
                          });
                        }}
                      >
                        <Text style={styles.alertaBotonTexto}>
                          {alerta.tipoAlerta === 'Baja' 
                            ? 'Entendido' 
                            : alerta.tipoAlerta === 'Postulacion' && alerta.estadoPostulacion && 
                              (alerta.estadoPostulacion === 'aceptada' || 
                               alerta.estadoPostulacion === 'rechazada' || 
                               alerta.estadoPostulacion === 'baja' ||
                               alerta.estadoPostulacion === 'cancelada')
                            ? 'Entendido'
                            : 'Ver'}
                        </Text>
                      </TouchableHighlight>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
            <Pressable style={styles.crearAlertaButton} onPress={() => router.push('/(tabs)/conductor/generar_alertas')}>
              <Ionicons name="add-circle-outline" size={18} color="#127067" />
              <Text style={styles.crearAlertaTexto}>Generar alerta</Text>
            </Pressable>
          </View>
          <View style={styles.alertasPointer} />
        </View>
      )}

      {/* Modal para agregar hijo */}
      <Modal
        visible={modalAgregarHijoVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalAgregarHijoVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={() => setModalAgregarHijoVisible(false)}
        >
          <Pressable 
            style={styles.modalContent}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Agregar Nuevo Niño</Text>
              <Pressable onPress={() => setModalAgregarHijoVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </Pressable>
            </View>
            
            {alertaSeleccionada && (
              <View style={styles.modalBody}>
                <Text style={styles.modalDescription}>
                  {alertaSeleccionada.descripcion}
                </Text>
                {alertaSeleccionada.parametros && (
                  <View style={styles.modalInfo}>
                    {alertaSeleccionada.parametros.nombreHijo && (
                      <Text style={styles.modalInfoText}>
                        <Text style={styles.modalInfoLabel}>Niño: </Text>
                        {alertaSeleccionada.parametros.nombreHijo}
                      </Text>
                    )}
                    {alertaSeleccionada.parametros.nombreApoderado && (
                      <Text style={styles.modalInfoText}>
                        <Text style={styles.modalInfoLabel}>Apoderado: </Text>
                        {alertaSeleccionada.parametros.nombreApoderado}
                      </Text>
                    )}
                    {alertaSeleccionada.parametros.patenteFurgon && (
                      <Text style={styles.modalInfoText}>
                        <Text style={styles.modalInfoLabel}>Patente: </Text>
                        {alertaSeleccionada.parametros.patenteFurgon}
                      </Text>
                    )}
                  </View>
                )}
                
                <Text style={styles.modalQuestion}>
                  ¿Deseas agregar a este niño al furgón?
                </Text>
              </View>
            )}

            <View style={styles.modalButtons}>
              <TouchableHighlight
                style={[styles.modalButton, styles.modalButtonRechazar]}
                underlayColor="#d32f2f"
                onPress={handleRechazarAgregarHijo}
              >
                <Text style={styles.modalButtonTextRechazar}>Rechazar</Text>
              </TouchableHighlight>
              <TouchableHighlight
                style={[styles.modalButton, styles.modalButtonAceptar]}
                underlayColor="#0c5c4e"
                onPress={handleAceptarAgregarHijo}
              >
                <Text style={styles.modalButtonTextAceptar}>Aceptar</Text>
              </TouchableHighlight>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal para confirmar terminar ruta */}
      <Modal
        visible={modalTerminarRutaVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setModalTerminarRutaVisible(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setModalTerminarRutaVisible(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⚠️ Advertencia</Text>
              <Pressable onPress={() => setModalTerminarRutaVisible(false)}>
                <Ionicons name="close" size={24} color="#666" />
              </Pressable>
            </View>
            <View style={styles.modalBody}>
              <Text style={styles.modalDescription}>
                {(() => {
                  const ninosAbordo = pasajeros.filter(p => p.estadoViaje === 'recogido');
                  const ninosPorRecoger = pasajeros.filter(p => !p.estadoViaje || p.estadoViaje === '');
                  const mensajes = [];
                  
                  if (ninosAbordo.length > 0) {
                    mensajes.push(`${ninosAbordo.length} ${ninosAbordo.length === 1 ? 'niño a bordo' : 'niños a bordo'}`);
                  }
                  if (ninosPorRecoger.length > 0) {
                    mensajes.push(`${ninosPorRecoger.length} ${ninosPorRecoger.length === 1 ? 'niño por recoger' : 'niños por recoger'}`);
                  }
                  
                  return `Aún quedan ${mensajes.join(' y ')} que no han sido entregados. ¿Está seguro de que desea terminar el recorrido?`;
                })()}
              </Text>
            </View>
            <View style={styles.modalButtons}>
              <Pressable
                style={[styles.modalButton, styles.modalButtonCancelar]}
                onPress={() => setModalTerminarRutaVisible(false)}
              >
                <Text style={styles.modalButtonTextCancelar}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalButtonTerminar]}
                onPress={confirmarTerminarRuta}
              >
                <Text style={styles.modalButtonTextTerminar}>Terminar Ruta</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Mapa del conductor */}
      <View style={styles.mapaContainer}>
        <MapboxDriver
          accessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN || ''}
          driverLocation={ubicacionActual || undefined}
          route={rutaGenerada || undefined}
        />
      </View>

      {/* Panel de control blanco */}
      <View style={styles.controlPanel}>
        {/* Botones de ruta */}
        <View style={styles.routeButtons}>
          <TouchableHighlight
            style={[
              styles.routeButton,
              generandoRuta && styles.routeButtonDisabled
            ]}
            underlayColor="#0c5c4e"
            onPress={() => {
              console.log('🔘 Botón Generar Ruta presionado');
              console.log('📊 Estado actual: generandoRuta=', generandoRuta, ', rutaGenerada=', rutaGenerada ? 'existe' : 'null', ', pasajeros=', pasajeros.length);
              handleGenerarRuta();
            }}
            disabled={generandoRuta}
          >
            <Text style={styles.routeButtonText}>
              {generandoRuta ? 'Generando...' : 'Generar Ruta'}
            </Text>
          </TouchableHighlight>
          <TouchableHighlight
            style={[
              styles.terminarRutaButton,
              !rutaGenerada && styles.terminarRutaButtonDisabled,
            ]}
            underlayColor="#d97706"
            onPress={handleRutaSugerida}
            disabled={!rutaGenerada}
          >
            <Text style={styles.terminarRutaButtonText}>Terminar Ruta</Text>
          </TouchableHighlight>
        </View>

        {/* Sección Siguiente niño */}
        <View style={styles.nextChildSection}>
          <Text style={styles.nextChildLabel}>Siguiente niño</Text>
          <View style={styles.nextChildContent}>
            <View style={styles.childNameContainer}>
              <TextInput
                style={styles.childNameInput}
                value={siguienteNino ? siguienteNino.nombreHijo : 'No hay niños asignados'}
                editable={false}
                placeholder="Nombre del niño"
              />
            </View>
            <View style={styles.actionButtons}>
              <TouchableHighlight
                style={styles.actionButton}
                underlayColor="#0c5c4e"
                onPress={handlePickUp}
                disabled={!siguienteNino}
              >
                <Text style={styles.actionButtonText}>Recoger</Text>
              </TouchableHighlight>
              <TouchableHighlight
                style={styles.actionButton}
                underlayColor="#0c5c4e"
                onPress={handleDropOff}
                disabled={!siguienteNino}
              >
                <Text style={styles.actionButtonText}>Entregar</Text>
              </TouchableHighlight>
            </View>
          </View>
        </View>

      </View>
      
      {/* Notificaciones globales para el conductor */}
      <NotificacionesGlobales 
        rutUsuario={rutConductor}
        patentesAsignadas={patentesConductor}
        tieneInscripcion={true}
      />
    </View>
  );
}

const surfaceShadow = makeShadow(
  '0 10px 20px rgba(0,0,0,0.15)',
  {
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F7F8' },
  greenHeader: {
    backgroundColor: '#127067',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 15,
    height: 80,
  },
  iconButton: { padding: 8 },
  iconButtonActive: {
    borderRadius: 20,
    backgroundColor: '#ffffff22',
  },
  iconWrapper: {
    position: 'relative',
  },
  notificationWrapper: {
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF6B35',
    borderWidth: 2,
    borderColor: '#127067',
  },
  menuButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  chatNotificationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF6B35',
    marginLeft: 8,
  },
  notificationBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ff5a5f',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    borderWidth: 2,
    borderColor: '#127067',
  },
  notificationBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  headerCenter: { flex: 1 },
  inicioButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  inicioText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  menu: {
    position: 'absolute',
    top: 90,
    left: 16,
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 5,
    borderRadius: 8,
    elevation: 5,
    width: 200,
    zIndex: 10,
    ...surfaceShadow,
  },
  menuButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginVertical: 6,
    backgroundColor: '#127067',
    borderRadius: 20,
  },
  menuButtonText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  alertasWrapper: {
    position: 'absolute',
    top: 100,
    right: 20,
    alignItems: 'flex-end',
    zIndex: 400,
  },
  alertasCard: {
    width: 240,
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#127067',
    elevation: 8,
    ...surfaceShadow,
  },
  alertasPointer: {
    width: 0,
    height: 0,
    marginTop: -2,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#127067',
  },
  crearAlertaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#127067',
    backgroundColor: '#e6f3f2',
  },
  crearAlertaTexto: {
    fontSize: 13,
    color: '#127067',
    fontWeight: '600',
  },
  noAlertasText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  alertaItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 10,
  },
  alertaBullet: {
    fontSize: 22,
    color: '#127067',
    marginTop: -2,
  },
  alertaDescripcion: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
  },
  alertaBoton: {
    alignSelf: 'flex-start',
    backgroundColor: '#127067',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  alertaBotonTexto: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  alertasScroll: {
    maxHeight: 240,
  },
  alertasScrollContent: {
    paddingBottom: 4,
  },
  mapaContainer: {
    flex: 1,
    margin: 20,
    marginTop: 20,
    borderRadius: 15,
    overflow: 'hidden',
    minHeight: 300,
  },
  mapaImage: {
    width: '100%',
    height: '100%',
    borderRadius: 15,
  },
  controlPanel: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    ...surfaceShadow,
  },
  routeButtons: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  routeButton: {
    flex: 1,
    backgroundColor: '#127067',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    opacity: 1,
  },
  routeButtonDisabled: {
    opacity: 0.5,
  },
  routeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  terminarRutaButton: {
    flex: 1,
    backgroundColor: '#f97316',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    opacity: 1,
  },
  terminarRutaButtonDisabled: {
    opacity: 0.5,
  },
  terminarRutaButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  nextChildSection: {
    marginTop: 10,
  },
  nextChildLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  nextChildContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  childNameContainer: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#127067',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F5F7F8',
  },
  childNameInput: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'column',
    gap: 8,
  },
  actionButton: {
    backgroundColor: '#127067',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  listaNinosSection: {
    marginTop: 15,
    maxHeight: 250,
  },
  listaNinosLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  listaNinosScroll: {
    maxHeight: 280,
  },
  listaNinosContent: {
    paddingBottom: 8,
  },
  emptyListContainer: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F7F8',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  emptyListText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  ninoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F5F7F8',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  ninoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  ninoTextContainer: {
    flex: 1,
  },
  ninoNombre: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  ninoApoderado: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  ninoDireccion: {
    fontSize: 12,
    color: '#999',
  },
  ninoEstadoContainer: {
    marginLeft: 8,
  },
  estadoBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 80,
    alignItems: 'center',
  },
  estadoPendiente: {
    backgroundColor: '#e3f2fd',
  },
  estadoRecogido: {
    backgroundColor: '#fff3e0',
  },
  estadoEntregado: {
    backgroundColor: '#e8f5e9',
  },
  estadoBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#127067',
  },
  modalBody: {
    marginBottom: 20,
  },
  modalDescription: {
    fontSize: 16,
    color: '#333',
    marginBottom: 15,
    lineHeight: 22,
  },
  modalInfo: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  modalInfoText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 8,
  },
  modalInfoLabel: {
    fontWeight: 'bold',
    color: '#127067',
  },
  modalQuestion: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginTop: 10,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonAceptar: {
    backgroundColor: '#127067',
  },
  modalButtonRechazar: {
    backgroundColor: '#f44336',
  },
  modalButtonTextAceptar: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonTextRechazar: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonCancelar: {
    backgroundColor: '#6c757d',
  },
  modalButtonTerminar: {
    backgroundColor: '#f97316',
  },
  modalButtonTextCancelar: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonTextTerminar: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
