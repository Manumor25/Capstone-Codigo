import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { makeShadow } from '@/utils/shadow';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, useRouter } from 'expo-router';
import { collection, getDocs, limit, orderBy, query, where, onSnapshot, Unsubscribe, deleteDoc, doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableHighlight,
  View,
  Animated,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import Checkbox from 'expo-checkbox';
// Import using a relative path so Metro resolver finds the file immediately
import MapboxDriver from '../../../components/MapboxDriver';
import NotificacionesGlobales from '../../../components/NotificacionesGlobales';

interface Hijo {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string;
  edad: number | string;
  fechaNacimiento: string;
  horarioAsistencia?: HorarioDia[];
}

interface HorarioDia {
  id: string;
  etiqueta: string;
  asiste: boolean;
  horaEntrada: string;
  horaSalida: string;
}

interface Alerta {
  id: string;
  tipo: string;
  descripcion: string;
  rutaDestino?: string;
  parametros?: Record<string, any>;
  patenteFurgon?: string;
  fecha?: Date | null;
  leida?: boolean;
  rutHijo?: string;
  nombreHijo?: string;
}

export default function PaginaPrincipal() {
  const router = useRouter();
  const [menuVisible, setMenuVisible] = useState(false);
  const [alertasVisible, setAlertasVisible] = useState(false);
  const [rutUsuario, setRutUsuario] = useState<string>('');
  const [hijos, setHijos] = useState<Hijo[]>([]);
  const [hijoSeleccionado, setHijoSeleccionado] = useState<Hijo | null>(null);
  const [loadingHijos, setLoadingHijos] = useState(true);
  const [listaHijosVisible, setListaHijosVisible] = useState(false);
  const [alertas, setAlertas] = useState<Alerta[]>([]);
  const [patentesAsignadas, setPatentesAsignadas] = useState<string[]>([]);
  const [ultimaRevisionAlertas, setUltimaRevisionAlertas] = useState<number | null>(null);
  const [tieneInscripcion, setTieneInscripcion] = useState<boolean>(false);
  const [cargandoInscripcion, setCargandoInscripcion] = useState<boolean>(true);
  const [alertasBorradas, setAlertasBorradas] = useState<string[]>([]);
  const [notificacionesPopUp, setNotificacionesPopUp] = useState<Array<{ id: string; alerta: Alerta; animacion: Animated.Value }>>([]);
  const alertasMostradasEnPopUpRef = useRef<Set<string>>(new Set());
  const tiempoCargaInicialRef = useRef<number | null>(null);
  const alertasInicialesRef = useRef<Set<string>>(new Set());
  const [ubicacionConductor, setUbicacionConductor] = useState<{ latitude: number; longitude: number } | null>(null);
  const [rutConductor, setRutConductor] = useState<string>('');
  const [cargandoUbicacion, setCargandoUbicacion] = useState(true);
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState(0);
  const [estadoViajeHijo, setEstadoViajeHijo] = useState<string>(''); // 'recogido', 'entregado', o ''
  const [hayRutaActiva, setHayRutaActiva] = useState<boolean>(false); // Para saber si hay una ruta generada
  const estadoEntregadoConfirmadoRef = useRef<boolean>(false); // Ref para rastrear si el estado "entregado" ya fue confirmado con OK
  const [rutaActiva, setRutaActiva] = useState<{
    waypoints: Array<{ coordinates: { latitude: number; longitude: number }; name: string; rutHijo?: string }>;
    routeGeometry?: any;
    distancia?: string;
    tiempoEstimado?: number;
  } | null>(null);
  const rutaActivaRef = useRef(rutaActiva);
  useSyncRutActivo();
  
  // Mantener el ref actualizado
  useEffect(() => {
    rutaActivaRef.current = rutaActiva;
  }, [rutaActiva]);

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const [rutGuardado, rutHijoPrevio, alertasBorradasGuardadas] = await Promise.all([
          AsyncStorage.getItem('rutUsuario'),
          AsyncStorage.getItem('rutHijoSeleccionado'),
          AsyncStorage.getItem('alertasBorradas'),
        ]);
        
        // Cargar alertas borradas desde AsyncStorage
        if (alertasBorradasGuardadas) {
          try {
            const idsBorrados = JSON.parse(alertasBorradasGuardadas);
            if (Array.isArray(idsBorrados)) {
              setAlertasBorradas(idsBorrados);
            }
          } catch (error) {
            console.error('Error al cargar alertas borradas:', error);
          }
        }
        
        if (!rutGuardado) {
          Alert.alert('Error', 'No se encontró el RUT del usuario activo.');
          setLoadingHijos(false);
          return;
        }
        setRutUsuario(rutGuardado);

        // Normalizar el RUT del usuario para comparación
        const rutUsuarioNormalizado = normalizarRut(rutGuardado);
        const rutUsuarioTrim = rutGuardado.trim();

        const hijosRef = collection(db, 'Hijos');
        const q = query(hijosRef, where('rutUsuario', '==', rutUsuarioTrim));
        
        // Cargar patentes e inscripciones
        const patentesSet = new Set<string>();
        let tieneInscripcionActiva = false;
        try {
          const listaPasajerosRef = collection(db, 'lista_pasajeros');
          const listaPasajerosSnap = await getDocs(
            query(listaPasajerosRef, where('rutApoderado', '==', rutGuardado)),
          );
          
          if (!listaPasajerosSnap.empty) {
            tieneInscripcionActiva = true;
          }
          
          listaPasajerosSnap.forEach((docSnap) => {
            const data = docSnap.data() || {};
            const patente = (data.patenteFurgon || '').toString().trim().toUpperCase();
            if (patente) {
              patentesSet.add(patente);
            }
          });
        } catch (errorPatentes) {
          console.error('No se pudieron obtener los furgones asignados al apoderado:', errorPatentes);
        }
        const patentesLista = Array.from(patentesSet);
        setPatentesAsignadas(patentesLista);
        setTieneInscripcion(tieneInscripcionActiva);
        setCargandoInscripcion(false);
        
        // Obtener hijos inscritos en furgones
        const obtenerHijosInscritos = async () => {
          try {
            const listaPasajerosRef = collection(db, 'lista_pasajeros');
            const inscripcionQuery = query(
              listaPasajerosRef,
              where('rutApoderado', '==', rutGuardado)
            );
            const inscripcionSnapshot = await getDocs(inscripcionQuery);
            
            // Obtener RUTs de hijos inscritos activos
            const rutsHijosInscritos = new Set<string>();
            inscripcionSnapshot.docs.forEach((docSnap) => {
              const data = docSnap.data();
              const estado = (data.estado || 'aceptada').toString().toLowerCase();
              const tieneFechaBaja = !!data.fechaBaja;
              const estadoDeBaja = estado === 'baja' || estado === 'cancelada';
              
              // Solo incluir inscripciones activas
              if ((estado === 'aceptada' || estado === 'activa') && !tieneFechaBaja && !estadoDeBaja) {
                const rutHijo = (data.rutHijo || '').toString().trim();
                if (rutHijo) {
                  rutsHijosInscritos.add(rutHijo);
                  // También agregar versión normalizada
                  rutsHijosInscritos.add(normalizarRut(rutHijo));
                }
              }
            });
            
            return rutsHijosInscritos;
          } catch (error) {
            console.error('Error al obtener hijos inscritos:', error);
            return new Set<string>();
          }
        };
        
        // Listener para actualizar cuando cambien las inscripciones
        const listaPasajerosRef = collection(db, 'lista_pasajeros');
        const inscripcionQuery = query(
          listaPasajerosRef,
          where('rutApoderado', '==', rutGuardado)
        );
        
        let rutsHijosInscritosCache = new Set<string>();
        let hijosSnapshotCache: any = null;
        
        // Función para procesar y filtrar hijos
        const procesarHijos = (querySnapshot: any, rutsInscritos: Set<string>) => {
          if (!querySnapshot || querySnapshot.empty) {
            setHijos([]);
            setHijoSeleccionado(null);
            setLoadingHijos(false);
            return;
          }
          
          // Filtrar hijos que realmente pertenecen al usuario actual Y están inscritos
          const listaHijos: Hijo[] = querySnapshot.docs
            .map((doc: any) => {
              const data = doc.data() || {};
              return {
                id: doc.id,
                nombres: data.nombres || 'Sin nombre',
                apellidos: data.apellidos || 'Sin apellido',
                rut: data.rut || 'Sin RUT',
                edad: data.edad !== undefined ? data.edad : '-',
                fechaNacimiento: data.fechaNacimiento || 'No disponible',
                horarioAsistencia: Array.isArray(data.horarioAsistencia) 
                  ? data.horarioAsistencia.map((h: any) => ({
                      id: h.id || h.dia || '',
                      etiqueta: h.etiqueta || h.dia || '',
                      asiste: h.asiste === true,
                      horaEntrada: h.horaEntrada || '',
                      horaSalida: h.horaSalida || '',
                    }))
                  : [],
                rutUsuario: data.rutUsuario || '',
              };
            })
            .filter((hijo: any) => {
              // Verificar que el hijo pertenece al usuario actual
              const rutUsuarioHijo = (hijo.rutUsuario || '').toString().trim();
              const rutUsuarioHijoNormalizado = normalizarRut(rutUsuarioHijo);
              
              const perteneceAlUsuario = (
                rutUsuarioHijo === rutUsuarioTrim ||
                rutUsuarioHijoNormalizado === rutUsuarioNormalizado
              );
              
              if (!perteneceAlUsuario) {
                return false;
              }
              
              // Verificar que el hijo está inscrito en un furgón
              const rutHijo = (hijo.rut || '').toString().trim();
              const rutHijoNormalizado = normalizarRut(rutHijo);
              
              const estaInscrito = rutsInscritos.has(rutHijo) || rutsInscritos.has(rutHijoNormalizado);
              
              return estaInscrito;
            });
          
          console.log('Hijos cargados/actualizados para usuario (página principal):', {
            rutUsuario: rutUsuarioTrim,
            rutUsuarioNormalizado,
            totalHijosEnDB: querySnapshot.docs.length,
            hijosInscritos: rutsInscritos.size,
            hijosFiltrados: listaHijos.length,
          });
          
          // Log para debug de horarios
          listaHijos.forEach((hijo) => {
            if (hijo.horarioAsistencia && hijo.horarioAsistencia.length > 0) {
              console.log(`📅 Horarios de ${hijo.nombres} ${hijo.apellidos}:`, hijo.horarioAsistencia);
            } else {
              console.log(`⚠️ ${hijo.nombres} ${hijo.apellidos} NO tiene horarios configurados`);
            }
          });
          
          setHijos(listaHijos);
          
          // Actualizar el hijo seleccionado si existe en la nueva lista
          setHijoSeleccionado((hijoActual) => {
            if (hijoActual) {
              // Buscar el hijo actualizado en la nueva lista
              const hijoActualizado = listaHijos.find((h) => h.rut === hijoActual.rut);
              if (hijoActualizado) {
                console.log('🔄 Actualizando hijo seleccionado con datos actualizados:', {
                  nombre: `${hijoActualizado.nombres} ${hijoActualizado.apellidos}`,
                  horarios: hijoActualizado.horarioAsistencia?.length || 0,
                });
                return hijoActualizado;
              }
            }
            
            // Si no hay hijo seleccionado o no se encuentra, seleccionar el primero o el guardado
            if (listaHijos.length > 0) {
              const hijoInicial = rutHijoPrevio
                ? listaHijos.find((hijo) => hijo.rut === rutHijoPrevio) ?? listaHijos[0]
                : listaHijos[0];
              if (hijoInicial) {
                AsyncStorage.setItem('rutHijoSeleccionado', hijoInicial.rut).catch((error) => {
                  console.error('No se pudo guardar el RUT del hijo seleccionado:', error);
                });
              }
              return hijoInicial;
            }
            return null;
          });
          
          setLoadingHijos(false);
        };
        
        const unsubscribeInscripciones = onSnapshot(
          inscripcionQuery,
          (snapshot) => {
            // Actualizar cache de RUTs de hijos inscritos
            rutsHijosInscritosCache.clear();
            snapshot.docs.forEach((docSnap) => {
              const data = docSnap.data();
              const estado = (data.estado || 'aceptada').toString().toLowerCase();
              const tieneFechaBaja = !!data.fechaBaja;
              const estadoDeBaja = estado === 'baja' || estado === 'cancelada';
              
              // Solo incluir inscripciones activas
              if ((estado === 'aceptada' || estado === 'activa') && !tieneFechaBaja && !estadoDeBaja) {
                const rutHijo = (data.rutHijo || '').toString().trim();
                if (rutHijo) {
                  rutsHijosInscritosCache.add(rutHijo);
                  rutsHijosInscritosCache.add(normalizarRut(rutHijo));
                }
              }
            });
            
            // Si ya tenemos el snapshot de hijos, reprocesar con los nuevos RUTs
            if (hijosSnapshotCache) {
              procesarHijos(hijosSnapshotCache, rutsHijosInscritosCache);
            }
          },
          (error) => {
            console.error('Error en listener de inscripciones:', error);
          }
        );
        
        // Usar onSnapshot para actualización en tiempo real de los hijos
        const unsubscribeHijos = onSnapshot(
          q,
          async (querySnapshot) => {
            // Guardar snapshot para poder reprocesar cuando cambien las inscripciones
            hijosSnapshotCache = querySnapshot;
            
            // Obtener RUTs de hijos inscritos (usar cache si está disponible)
            const rutsHijosInscritos = rutsHijosInscritosCache.size > 0 
              ? rutsHijosInscritosCache 
              : await obtenerHijosInscritos();
            
            // Actualizar cache si estaba vacío
            if (rutsHijosInscritosCache.size === 0 && rutsHijosInscritos.size > 0) {
              rutsHijosInscritos.forEach(rut => rutsHijosInscritosCache.add(rut));
            }
            
            // Procesar hijos con los RUTs de inscritos
            procesarHijos(querySnapshot, rutsHijosInscritos);
          },
          (error) => {
            console.error('Error en listener de hijos:', error);
            setLoadingHijos(false);
          }
        );
        
        return () => {
          unsubscribeHijos();
          unsubscribeInscripciones();
        };
      } catch (error) {
        console.error('Error al cargar datos:', error);
        Alert.alert('Error', 'No se pudieron cargar los datos.');
        setLoadingHijos(false);
      }
    };

    cargarDatos();
  }, []);

  // Obtener ubicación del conductor en tiempo real
  useEffect(() => {
    let unsubscribeUbicacion: (() => void) | null = null;

    const obtenerUbicacionConductor = async () => {
      try {
        const rutApoderado = await AsyncStorage.getItem('rutUsuario');
        if (!rutApoderado) {
          setCargandoUbicacion(false);
          return;
        }

        // 1. Obtener el RUT del conductor desde lista_pasajeros
        const listaPasajerosRef = collection(db, 'lista_pasajeros');
        const listaPasajerosQuery = query(
          listaPasajerosRef,
          where('rutApoderado', '==', rutApoderado.trim()),
          limit(1)
        );

        const listaPasajerosSnap = await getDocs(listaPasajerosQuery);

        if (listaPasajerosSnap.empty) {
          console.log('No se encontró conductor asignado');
          setCargandoUbicacion(false);
          setUbicacionConductor(null);
          return;
        }

        const pasajeroData = listaPasajerosSnap.docs[0].data();
        const rutConductorEncontrado = (pasajeroData.rutConductor || '').toString().trim();

        if (!rutConductorEncontrado) {
          console.log('⚠️ No se encontró RUT del conductor en lista_pasajeros');
          setCargandoUbicacion(false);
          setUbicacionConductor(null);
          return;
        }

        console.log('✅ RUT del conductor obtenido desde lista_pasajeros:', rutConductorEncontrado);
        setRutConductor(rutConductorEncontrado);

        // 2. Escuchar cambios en tiempo real de la ubicación del conductor
        const ubicacionRef = doc(db, 'ubicaciones_conductor', rutConductorEncontrado);
        
        unsubscribeUbicacion = onSnapshot(
          ubicacionRef,
          (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              if (data.latitude && data.longitude) {
                setUbicacionConductor({
                  latitude: data.latitude,
                  longitude: data.longitude,
                });
                console.log('Ubicación del conductor actualizada:', {
                  latitude: data.latitude,
                  longitude: data.longitude,
                });
              } else {
                console.log('Ubicación del conductor sin coordenadas válidas');
                setUbicacionConductor(null);
              }
            } else {
              console.log('No hay ubicación del conductor disponible');
              setUbicacionConductor(null);
            }
            setCargandoUbicacion(false);
          },
          (error) => {
            console.error('Error al obtener ubicación del conductor:', error);
            setCargandoUbicacion(false);
            setUbicacionConductor(null);
          }
        );
      } catch (error) {
        console.error('Error al obtener ubicación del conductor:', error);
        setCargandoUbicacion(false);
        setUbicacionConductor(null);
      }
    };

    obtenerUbicacionConductor();

    return () => {
      if (unsubscribeUbicacion) {
        unsubscribeUbicacion();
      }
    };
  }, []);

  // Listener para obtener la ruta activa del conductor
  useEffect(() => {
    let unsubscribeRuta: (() => void) | null = null;

    const obtenerRutaActiva = async () => {
      try {
        // Si no hay rutConductor, intentar obtenerlo desde lista_pasajeros
        let rutConductorParaRuta = rutConductor;
        
        if (!rutConductorParaRuta && hijoSeleccionado && rutUsuario) {
          try {
            const listaPasajerosRef = collection(db, 'lista_pasajeros');
            const listaPasajerosQuery = query(
              listaPasajerosRef,
              where('rutHijo', '==', hijoSeleccionado.rut),
              where('rutApoderado', '==', rutUsuario.trim()),
              limit(1)
            );
            const listaPasajerosSnap = await getDocs(listaPasajerosQuery);
            if (!listaPasajerosSnap.empty) {
              const pasajeroData = listaPasajerosSnap.docs[0].data();
              rutConductorParaRuta = (pasajeroData.rutConductor || '').toString().trim();
              if (rutConductorParaRuta && !rutConductor) {
                setRutConductor(rutConductorParaRuta);
              }
            }
          } catch (error) {
            console.error('Error al obtener rutConductor para ruta:', error);
          }
        }
        
        // Si aún no hay rutConductor, intentar obtenerlo de cualquier pasajero del apoderado
        if (!rutConductorParaRuta && rutUsuario) {
          try {
            const listaPasajerosRef = collection(db, 'lista_pasajeros');
            const listaPasajerosQuery = query(
              listaPasajerosRef,
              where('rutApoderado', '==', rutUsuario.trim()),
              limit(1)
            );
            const listaPasajerosSnap = await getDocs(listaPasajerosQuery);
            if (!listaPasajerosSnap.empty) {
              const pasajeroData = listaPasajerosSnap.docs[0].data();
              rutConductorParaRuta = (pasajeroData.rutConductor || '').toString().trim();
              if (rutConductorParaRuta && !rutConductor) {
                setRutConductor(rutConductorParaRuta);
              }
            }
          } catch (error) {
            console.error('Error al obtener rutConductor desde lista_pasajeros:', error);
          }
        }
        
        if (!rutConductorParaRuta) {
          setRutaActiva(null);
          return;
        }

        // Normalizar RUT del conductor para buscar la ruta activa
        const rutConductorNormalizado = normalizarRut(rutConductorParaRuta);
        
        const rutasActivasRef = collection(db, 'rutas_activas');
        // Intentar primero con RUT normalizado (como se guarda ahora)
        const rutaDocRef = doc(rutasActivasRef, rutConductorNormalizado);
        
        unsubscribeRuta = onSnapshot(
          rutaDocRef,
          (snapshot) => {
            if (snapshot.exists()) {
              const data = snapshot.data();
              
              if (data.activa === true && data.waypoints && data.waypoints.length > 0) {
                // SIEMPRE mostrar la ruta si está activa, independientemente de si el hijo está en la ruta
                // Esto permite que el apoderado vea la ruta completa del conductor
                
                // Asegurarse de que routeGeometry esté en el formato correcto para Mapbox
                let routeGeometryFinal = data.routeGeometry;
                if (routeGeometryFinal && typeof routeGeometryFinal === 'object') {
                  // Si routeGeometry es un Feature con geometry, extraer solo la geometry
                  if (routeGeometryFinal.type === 'Feature' && routeGeometryFinal.geometry) {
                    routeGeometryFinal = routeGeometryFinal.geometry;
                  }
                }
                
                const nuevaRutaActiva = {
                  waypoints: data.waypoints,
                  routeGeometry: routeGeometryFinal,
                  distancia: data.distancia,
                  tiempoEstimado: data.tiempoEstimado,
                };
                
                setRutaActiva(nuevaRutaActiva);
                // Actualizar hayRutaActiva inmediatamente cuando se establece la ruta
                setHayRutaActiva(true);
                return;
              }
            } else {
              // Si no existe con RUT normalizado, intentar con RUT original (compatibilidad)
              if (rutConductorParaRuta !== rutConductorNormalizado) {
                const rutaDocRefOriginal = doc(rutasActivasRef, rutConductorParaRuta);
                getDoc(rutaDocRefOriginal).then((snapshotOriginal) => {
                  if (snapshotOriginal.exists()) {
                    const dataOriginal = snapshotOriginal.data();
                    if (dataOriginal.activa === true && dataOriginal.waypoints && dataOriginal.waypoints.length > 0) {
                      const nuevaRutaActiva = {
                        waypoints: dataOriginal.waypoints,
                        routeGeometry: dataOriginal.routeGeometry,
                        distancia: dataOriginal.distancia,
                        tiempoEstimado: dataOriginal.tiempoEstimado,
                      };
                      setRutaActiva(nuevaRutaActiva);
                      setHayRutaActiva(true);
                      return;
                    }
                  }
                  setRutaActiva(null);
                }).catch((error) => {
                  console.error('Error al buscar ruta con RUT original:', error);
                  setRutaActiva(null);
                });
              } else {
                setRutaActiva(null);
              }
            }
            // No cambiar hayRutaActiva a false aquí, ya que puede haber pasajeros con estado 'recogido'
            // El listener de ruta activa se encargará de actualizar esto
          },
          (error) => {
            console.error('❌ Error al obtener ruta activa:', error);
            setRutaActiva(null);
          }
        );
      } catch (error) {
        console.error('❌ Error al configurar listener de ruta activa:', error);
        setRutaActiva(null);
      }
    };

    obtenerRutaActiva();
    
    return () => {
      if (unsubscribeRuta) {
        unsubscribeRuta();
      }
    };
  }, [rutConductor, hijoSeleccionado, rutUsuario]);
  
  // Efecto adicional para forzar la obtención de ruta activa cuando cambia rutUsuario
  useEffect(() => {
    if (rutUsuario && !rutConductor) {
      console.log('🔄 rutUsuario disponible pero no hay rutConductor, intentando obtener...');
      // El listener de ruta activa se encargará de obtenerlo
    }
  }, [rutUsuario, rutConductor]);
  
  // Log cuando cambia rutaActiva para depuración
  useEffect(() => {
    if (rutaActiva) {
      console.log('🔄 rutaActiva actualizada:', {
        waypointsCount: rutaActiva.waypoints?.length || 0,
        tieneRouteGeometry: !!rutaActiva.routeGeometry,
        distancia: rutaActiva.distancia,
        tiempoEstimado: rutaActiva.tiempoEstimado,
      });
    } else {
      console.log('🔄 rutaActiva es null');
    }
  }, [rutaActiva]);

  // Listener para contar mensajes no leídos
  useEffect(() => {
    let unsubscribeMensajes: (() => void) | null = null;

    const contarMensajesNoLeidos = async () => {
      try {
        const rut = await AsyncStorage.getItem('rutUsuario');
        if (!rut) return;

        // Obtener todos los chats del apoderado desde lista_pasajeros
        const listaPasajerosRef = collection(db, 'lista_pasajeros');
        const q = query(listaPasajerosRef, where('rutApoderado', '==', rut));
        const snapshot = await getDocs(q);

        let totalNoLeidos = 0;
        const chatsIds = new Set<string>();

        // Recopilar todos los idPostulacion y chatIds
        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          if (data.idPostulacion) {
            chatsIds.add(`post_${data.idPostulacion}`);
          }
          if (data.rutHijo && data.rutConductor) {
            const chatId = `agregar_hijo_${data.rutHijo}_${rut}_${data.rutConductor}`;
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
            // Contar mensajes no leídos donde el receptor es el apoderado
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

        // Escuchar todos los mensajes donde el receptor es el apoderado
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

  // Listener para obtener el estado del viaje del hijo y verificar si hay ruta activa
  useEffect(() => {
    // Resetear el flag de confirmación cuando cambia el hijo seleccionado
    estadoEntregadoConfirmadoRef.current = false;
    
    if (!hijoSeleccionado || !rutUsuario) {
      setEstadoViajeHijo('');
      setHayRutaActiva(false);
      return;
    }

    let unsubscribeEstadoViaje: (() => void) | null = null;
    let unsubscribeRutaActiva: (() => void) | null = null;

    const obtenerEstadoViaje = async () => {
      try {
        const listaPasajerosRef = collection(db, 'lista_pasajeros');
        const estadoQuery = query(
          listaPasajerosRef,
          where('rutHijo', '==', hijoSeleccionado.rut),
          where('rutApoderado', '==', rutUsuario.trim()),
          limit(1)
        );

        unsubscribeEstadoViaje = onSnapshot(
          estadoQuery,
          (snapshot) => {
            if (!snapshot.empty) {
              const data = snapshot.docs[0].data();
              const estado = data.estadoViaje || '';
              
              // Verificar si hay una alerta leída correspondiente
              // Si hay una alerta leída de tipo "Recogido" para este hijo,
              // no mostrar el estado (pero NO resetear si es "Entregado" - solo se resetea con OK)
              const alertaRecogidoLeida = alertas.find(
                (a) =>
                  a.tipo === 'Recogido' &&
                  a.rutHijo === hijoSeleccionado.rut &&
                  a.leida === true
              );
              
              // Si el estado actual es "entregado" y NO ha sido confirmado con OK,
              // NO permitir que se resetee automáticamente desde la base de datos
              const estadoActual = estadoViajeHijo;
              if (estadoActual === 'entregado' && !estadoEntregadoConfirmadoRef.current) {
                // Mantener el estado "entregado" hasta que se presione OK
                console.log('🔒 Manteniendo estado "entregado" hasta que se presione OK');
                return; // No actualizar el estado
              }
              
              // Si el estado en la base de datos cambió a "entregado", establecerlo
              if (estado === 'entregado' && estadoActual !== 'entregado') {
                estadoEntregadoConfirmadoRef.current = false; // Resetear el flag cuando llega un nuevo "entregado"
                setEstadoViajeHijo('entregado');
                return;
              }
              
              // NO resetear el estado "recogido" automáticamente cuando hay alerta leída
              // El estado debe mantenerse hasta que cambie a "entregado"
              // Solo actualizar el estado desde la base de datos
              if (estado !== 'entregado' || estadoEntregadoConfirmadoRef.current) {
                // Si NO es "entregado" o ya fue confirmado con OK, actualizar normalmente
                setEstadoViajeHijo(estado);
                console.log('📊 Estado actualizado desde BD:', estado);
              }
            } else {
              // Solo resetear si el estado "entregado" ya fue confirmado
              if (estadoEntregadoConfirmadoRef.current || estadoViajeHijo !== 'entregado') {
                setEstadoViajeHijo('');
              }
            }
          },
          (error) => {
            console.error('Error al obtener estado del viaje:', error);
            // Solo resetear en error si no estamos en estado "entregado" sin confirmar
            if (estadoViajeHijo !== 'entregado' || estadoEntregadoConfirmadoRef.current) {
              setEstadoViajeHijo('');
            }
          }
        );

        // Verificar si hay una ruta activa (si hay algún pasajero del mismo conductor con estado no entregado)
        const rutaActivaQuery = query(
          listaPasajerosRef,
          where('rutApoderado', '==', rutUsuario.trim())
        );

        unsubscribeRutaActiva = onSnapshot(
          rutaActivaQuery,
          (snapshot) => {
            // Verificar si hay algún pasajero con estado que indique ruta activa
            // Una ruta está activa si:
            // 1. Hay una ruta activa guardada en la base de datos (rutaActiva !== null)
            // 2. O hay al menos un pasajero con estado 'recogido' (ruta en progreso)
            // Si todos tienen estado vacío y no hay ruta activa, no hay ruta
            // NO está activa si todos están 'entregado' o no hay pasajeros
            let tieneRutaActiva = false;
            
            // Verificar si hay una ruta activa guardada usando el ref para acceder al valor actual
            const rutaActivaActual = rutaActivaRef.current;
            const tieneRutaGuardada = rutaActivaActual !== null && rutaActivaActual.waypoints && rutaActivaActual.waypoints.length > 0;
            
            if (snapshot.empty) {
              // Si no hay pasajeros, verificar si hay ruta activa guardada
              console.log('📋 No hay pasajeros, verificando ruta guardada:', tieneRutaGuardada);
              setHayRutaActiva(tieneRutaGuardada);
              return;
            }
            
            snapshot.docs.forEach((docSnap) => {
              const data = docSnap.data();
              const estado = (data.estadoViaje || '').toString().trim().toLowerCase();
              
              // Si hay al menos un pasajero con estado 'recogido', hay ruta activa
              // Esto indica que la ruta está en progreso
              if (estado === 'recogido') {
                tieneRutaActiva = true;
              }
            });
            
            // También considerar si hay una ruta activa guardada
            const resultado = tieneRutaActiva || tieneRutaGuardada;
            console.log('📋 Verificación de ruta activa:', {
              tieneRutaActiva,
              tieneRutaGuardada,
              resultado,
            });
            setHayRutaActiva(resultado);
          },
          (error) => {
            console.error('Error al verificar ruta activa:', error);
            setHayRutaActiva(false);
          }
        );
      } catch (error) {
        console.error('Error al configurar listener de estado de viaje:', error);
      }
    };

    obtenerEstadoViaje();

    return () => {
      if (unsubscribeEstadoViaje) {
        unsubscribeEstadoViaje();
      }
      if (unsubscribeRutaActiva) {
        unsubscribeRutaActiva();
      }
    };
  }, [hijoSeleccionado, rutUsuario, alertas]);

  // Actualizar hayRutaActiva cuando cambie rutaActiva
  useEffect(() => {
    console.log('🔄 Verificando rutaActiva para actualizar hayRutaActiva:', {
      tieneRutaActiva: !!rutaActiva,
      waypointsCount: rutaActiva?.waypoints?.length || 0,
      rutHijoSeleccionado: hijoSeleccionado?.rut,
    });
    
    if (rutaActiva && rutaActiva.waypoints && rutaActiva.waypoints.length > 0) {
      // Si hay una ruta activa y el hijo está en la ruta, marcar como ruta activa
      if (hijoSeleccionado) {
        const hijoEnRuta = rutaActiva.waypoints.some((w: any) => w.rutHijo === hijoSeleccionado.rut);
        console.log('👶 Verificando si hijo está en ruta:', {
          hijoEnRuta,
          rutHijo: hijoSeleccionado.rut,
          waypoints: rutaActiva.waypoints.map((w: any) => w.rutHijo),
        });
        if (hijoEnRuta) {
          console.log('✅ Actualizando hayRutaActiva a true (ruta activa detectada para hijo seleccionado)');
          setHayRutaActiva(true);
          return;
        }
      } else {
        // Si no hay hijo seleccionado pero hay ruta activa, también marcar como activa
        console.log('✅ Actualizando hayRutaActiva a true (ruta activa sin hijo seleccionado)');
        setHayRutaActiva(true);
        return;
      }
    }
    // No cambiar a false automáticamente, ya que puede haber pasajeros con estado 'recogido'
    // El listener de ruta activa se encargará de actualizar esto
  }, [rutaActiva, hijoSeleccionado]);

  // Función para normalizar RUT (eliminar puntos y guiones)
  const normalizarRut = (rut: string): string => {
    return rut.replace(/[^0-9kK]/g, '').toUpperCase();
  };

  // Función para mostrar notificación pop-up (llamada cuando se detecta una nueva alerta)
  const mostrarNotificacionPopUp = useCallback((alerta: Alerta) => {
    if (!tieneInscripcion) {
      console.log('⚠ No se muestra pop-up: usuario no tiene inscripción activa');
      return;
    }
    
    // Verificar que no se haya mostrado ya
    if (alertasMostradasEnPopUpRef.current.has(alerta.id)) {
      console.log('⚠ Alerta ya mostrada como pop-up:', alerta.id);
      return;
    }

    console.log('🔔 Mostrando notificación pop-up para alerta:', alerta.id, alerta.tipo);

    // Marcar como mostrada
    alertasMostradasEnPopUpRef.current.add(alerta.id);

    setNotificacionesPopUp((prev) => {
      // Verificar que no excedamos el límite de 3
      if (prev.length >= 3) {
        console.log('⚠ Límite de pop-ups alcanzado (3)');
        return prev;
      }

      const animacion = new Animated.Value(0);
      const nuevaNotificacion = {
        id: alerta.id,
        alerta,
        animacion,
      };

      // Animar la entrada
      Animated.spring(animacion, {
        toValue: 1,
        useNativeDriver: true,
        tension: 50,
        friction: 7,
      }).start();

      // Auto-cerrar después de 5 segundos
      setTimeout(() => {
        cerrarNotificacionPopUp(alerta.id);
      }, 5000);

      return [...prev, nuevaNotificacion];
    });
  }, [tieneInscripcion]);

  const cerrarNotificacionPopUp = useCallback((id: string) => {
    setNotificacionesPopUp((prev) => {
      const notificacion = prev.find((n) => n.id === id);
      if (!notificacion) return prev;

      // Animar la salida
      Animated.timing(notificacion.animacion, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        // Eliminar después de la animación
        setNotificacionesPopUp((prevState) => prevState.filter((n) => n.id !== id));
      });

      return prev.filter((n) => n.id !== id);
    });
  }, []);

  // Listener en tiempo real para alertas
  useEffect(() => {
    if (!rutUsuario) {
      console.log('Listener de alertas: Esperando rutUsuario');
      return;
    }

    // Normalizar RUT para búsqueda consistente
    const rutNormalizado = rutUsuario.trim();
    const rutSinFormato = normalizarRut(rutUsuario);
    
    console.log('=== INICIANDO LISTENER DE ALERTAS ===');
    console.log('RUT usuario (original):', rutUsuario);
    console.log('RUT usuario (normalizado/trim):', rutNormalizado);
    console.log('RUT usuario (sin formato):', rutSinFormato);
    console.log('Patentes asignadas:', patentesAsignadas);
    
    // Resetear alertas iniciales cuando cambia el usuario o se recarga la página
    // Esto asegura que solo se muestren pop-ups para alertas realmente nuevas
    alertasInicialesRef.current.clear();
    alertasMostradasEnPopUpRef.current.clear();
    console.log('🔄 Alertas iniciales reseteadas - solo se mostrarán pop-ups para alertas nuevas');

    const alertasRef = collection(db, 'Alertas');
    let alertasQuery;
    
    // Intentar crear query con orderBy, si falla usar query simple
    // Buscar con el RUT tal como está guardado (con formato)
    try {
      alertasQuery = query(
        alertasRef,
        where('rutDestinatario', '==', rutNormalizado),
        orderBy('creadoEn', 'desc'),
        limit(50),
      );
    } catch (errorConsulta) {
      console.warn('Error al crear query con orderBy, usando query simple:', errorConsulta);
      // Si falla orderBy, puede ser porque no hay índice, usar query sin orderBy
      alertasQuery = query(
        alertasRef,
        where('rutDestinatario', '==', rutNormalizado),
        limit(50),
      );
    }
    
    // También crear un listener alternativo sin orderBy para capturar más alertas
    let alertasQueryAlternativo;
    try {
      alertasQueryAlternativo = query(
        alertasRef,
        where('rutDestinatario', '==', rutNormalizado),
        limit(50),
      );
    } catch (errorAlt) {
      console.warn('No se pudo crear query alternativo:', errorAlt);
    }

    // Función para procesar alertas
    const procesarAlertas = (snapshot: any, fuente: string) => {
      console.log(`=== SNAPSHOT RECIBIDO (${fuente}) ===`);
      console.log('Total alertas en snapshot:', snapshot.docs.length);
      
      // Obtener patentes actualizadas dentro del callback para evitar problemas de closure
      const patentesActuales = [...patentesAsignadas];
      const patentesSet = new Set(patentesActuales);
      const rutUsuarioNormalizado = normalizarRut(rutUsuario);
      
      if (snapshot.empty) {
        console.log(`⚠ No hay alertas en la base de datos para este RUT (${fuente})`);
        console.log('RUT buscado:', rutNormalizado);
        console.log('RUT normalizado (sin formato):', rutUsuarioNormalizado);
        return [];
      }
        
      const alertasMap = new Map<string, Alerta>();
      
      snapshot.docs.forEach((docSnap: any) => {
        const data = docSnap.data() || {};
        const fecha =
          data.creadoEn && typeof data.creadoEn.toDate === 'function'
            ? data.creadoEn.toDate()
            : data.fecha
            ? new Date(data.fecha)
            : null;
        
        const rutDestinatarioAlerta = (data.rutDestinatario || '').toString().trim();
        const rutDestinatarioNormalizado = normalizarRut(rutDestinatarioAlerta);
        
        // Verificar si el RUT coincide (con formato o sin formato)
        const rutCoincide = 
          rutDestinatarioAlerta === rutNormalizado || 
          rutDestinatarioNormalizado === rutUsuarioNormalizado ||
          rutDestinatarioAlerta === rutUsuario ||
          rutDestinatarioAlerta.trim() === rutUsuario.trim();
        
        console.log('🔍 Alerta encontrada:', {
          id: docSnap.id,
          rutDestinatarioEnAlerta: rutDestinatarioAlerta,
          rutDestinatarioNormalizado,
          rutUsuarioBuscado: rutNormalizado,
          rutUsuarioNormalizado,
          coincide: rutCoincide,
          patenteFurgon: data.patenteFurgon,
          tipoAlerta: data.tipoAlerta,
          descripcion: data.descripcion?.substring(0, 30),
        });
        
        // Solo incluir si el RUT coincide
        if (rutCoincide) {
          const alerta: Alerta = {
            id: docSnap.id,
            tipo: data.tipoAlerta || data.tipo || 'Alerta',
            descripcion: data.descripcion || 'Sin descripcion',
            rutaDestino: data.rutaDestino,
            parametros: data.parametros,
            patenteFurgon: (data.patenteFurgon || '').toString().trim().toUpperCase(),
            fecha,
            leida: data.leida || false,
            rutHijo: data.rutHijo || '',
            nombreHijo: data.nombreHijo || '',
          };
          
          // Usar Map para evitar duplicados
          if (!alertasMap.has(docSnap.id)) {
            alertasMap.set(docSnap.id, alerta);
          }
        }
      });
      
      const todasLasAlertas = Array.from(alertasMap.values());

      console.log('✓ Todas las alertas recibidas (después de filtro por RUT):', todasLasAlertas.length);
      console.log('✓ Patentes en las alertas:', todasLasAlertas.map(a => a.patenteFurgon).filter(Boolean));
      console.log('✓ Patentes asignadas al usuario:', Array.from(patentesSet));

      // Filtrar alertas por patentes asignadas
      let listaAlertas: Alerta[] = [];
        
      // Filtrar por patentes asignadas (si hay patentes)
      if (patentesActuales.length === 0) {
        console.log('⚠ No hay patentes asignadas aún, mostrando todas las alertas temporalmente');
        listaAlertas = todasLasAlertas;
      } else {
        // Normalizar patentes para comparación (mayúsculas y sin espacios)
        const patentesNormalizadas = patentesActuales.map(p => p.trim().toUpperCase());
        const patentesSetNormalizado = new Set(patentesNormalizadas);
        
        console.log('Filtrando por patentes:', {
          patentesAsignadas: patentesNormalizadas,
          totalAlertasAntes: todasLasAlertas.length,
        });
        
        listaAlertas = todasLasAlertas.filter((alerta) => {
          // Si la alerta no tiene patente, no la filtramos (puede ser una alerta general)
          if (!alerta.patenteFurgon) {
            console.log('⚠ Alerta sin patenteFurgon (puede ser general):', alerta.id);
            // Permitir alertas sin patente (pueden ser alertas generales)
            return true;
          }
          // Normalizar patente de la alerta para comparación
          const patenteAlertaNormalizada = alerta.patenteFurgon.trim().toUpperCase();
          const tienePatente = patentesSetNormalizado.has(patenteAlertaNormalizada);
          if (!tienePatente) {
            console.log('✗ Alerta filtrada por patente:', patenteAlertaNormalizada, 'no está en', Array.from(patentesSetNormalizado));
          } else {
            console.log('✓ Alerta incluida - patente coincide:', patenteAlertaNormalizada);
          }
          return tienePatente;
        });
      }

      const alertasOrdenadas = listaAlertas
        .sort((a, b) => {
          const fechaA = a.fecha ? a.fecha.getTime() : 0;
          const fechaB = b.fecha ? b.fecha.getTime() : 0;
          return fechaB - fechaA;
        })
        .slice(0, 10);
      
      console.log('=== RESULTADO FINAL ===');
      console.log('✓ Alertas finales después de filtrado:', alertasOrdenadas.length);
      if (alertasOrdenadas.length > 0) {
        console.log('✓ Alertas mostradas:', alertasOrdenadas.map(a => ({ 
          tipo: a.tipo, 
          descripcion: a.descripcion.substring(0, 30), 
          patente: a.patenteFurgon,
          fecha: a.fecha?.toISOString(),
        })));
      } else {
        console.log('⚠ No hay alertas para mostrar');
      }
      
      return alertasOrdenadas;
    };

    // Marcar el tiempo de carga inicial (solo la primera vez)
    if (tiempoCargaInicialRef.current === null) {
      tiempoCargaInicialRef.current = Date.now();
      console.log('⏰ Tiempo de carga inicial marcado:', new Date(tiempoCargaInicialRef.current).toISOString());
    }

    // Usar onSnapshot para actualización en tiempo real
    const unsubscribeAlertas = onSnapshot(
      alertasQuery,
      (snapshot) => {
        const alertasFinales = procesarAlertas(snapshot, 'query principal');
        
        // Si es la primera carga, guardar los IDs de las alertas existentes
        // Estas alertas NO se mostrarán como pop-up
        if (alertasInicialesRef.current.size === 0 && alertasFinales.length > 0) {
          alertasFinales.forEach((alerta) => {
            alertasInicialesRef.current.add(alerta.id);
            // También marcar como mostradas para evitar pop-ups
            alertasMostradasEnPopUpRef.current.add(alerta.id);
          });
          console.log('📋 Alertas iniciales guardadas:', alertasInicialesRef.current.size, 'alertas (no se mostrarán como pop-up)');
        }
        
        // Detectar alertas nuevas (que no estaban en la carga inicial)
        // SOLO estas se mostrarán como pop-up
        if (alertasInicialesRef.current.size > 0) {
          const nuevasAlertas = alertasFinales.filter(
            (alerta) => !alertasInicialesRef.current.has(alerta.id)
          );
          
          if (nuevasAlertas.length > 0) {
            console.log('🆕 Alertas nuevas detectadas (se mostrarán como pop-up):', nuevasAlertas.length);
            nuevasAlertas.forEach((alerta) => {
              // Agregar a las alertas iniciales para no mostrarla de nuevo
              alertasInicialesRef.current.add(alerta.id);
              // Mostrar como pop-up
              mostrarNotificacionPopUp(alerta);
            });
          }
        }
        
        setAlertas(alertasFinales);
      },
      (error) => {
        console.error('✗ Error en listener de alertas:', error);
        console.error('Detalles del error:', error.message, error.code);
        // Intentar recargar el listener después de un error
        if (error.code === 'permission-denied') {
          console.error('Error de permisos: Verificar reglas de seguridad de Firestore');
        }
      }
    );

    // También crear un listener alternativo que busque todas las alertas y las filtre en el cliente
    // Esto ayuda si hay problemas con el formato del RUT en la query
    let unsubscribeAlternativo: (() => void) | null = null;
    try {
      const queryAlternativo = query(alertasRef, limit(100));
      unsubscribeAlternativo = onSnapshot(
        queryAlternativo,
        (snapshot) => {
          console.log('📡 Listener alternativo recibido:', snapshot.docs.length, 'alertas totales');
          const alertasFinales = procesarAlertas(snapshot, 'query alternativo (todas las alertas)');
          
          // Si es la primera carga, guardar los IDs de las alertas existentes
          if (alertasInicialesRef.current.size === 0 && alertasFinales.length > 0) {
            alertasFinales.forEach((alerta) => {
              alertasInicialesRef.current.add(alerta.id);
              // También marcar como mostradas para evitar pop-ups
              alertasMostradasEnPopUpRef.current.add(alerta.id);
            });
            console.log('📋 Alertas iniciales guardadas (alternativo):', alertasInicialesRef.current.size, 'alertas (no se mostrarán como pop-up)');
          }
          
          // Detectar alertas nuevas (que no estaban en la carga inicial)
          if (alertasInicialesRef.current.size > 0) {
            const nuevasAlertas = alertasFinales.filter(
              (alerta) => !alertasInicialesRef.current.has(alerta.id)
            );
            
            if (nuevasAlertas.length > 0) {
              console.log('🆕 Alertas nuevas detectadas (alternativo, se mostrarán como pop-up):', nuevasAlertas.length);
              nuevasAlertas.forEach((alerta) => {
                // Agregar a las alertas iniciales para no mostrarla de nuevo
                alertasInicialesRef.current.add(alerta.id);
                // Mostrar como pop-up
                mostrarNotificacionPopUp(alerta);
              });
            }
          }
          
          // Solo actualizar si encontramos alertas que no estaban antes
          if (alertasFinales.length > 0) {
            setAlertas((prev) => {
              const idsPrevios = new Set(prev.map(a => a.id));
              const nuevas = alertasFinales.filter(a => !idsPrevios.has(a.id));
              if (nuevas.length > 0) {
                console.log('✅ Listener alternativo encontró', nuevas.length, 'alertas nuevas');
                return [...prev, ...nuevas].sort((a, b) => {
                  const fechaA = a.fecha ? a.fecha.getTime() : 0;
                  const fechaB = b.fecha ? b.fecha.getTime() : 0;
                  return fechaB - fechaA;
                }).slice(0, 10);
              }
              return prev;
            });
          }
        },
        (error) => {
          console.warn('⚠ Error en listener alternativo:', error);
        }
      );
    } catch (errorAlt) {
      console.warn('No se pudo crear listener alternativo:', errorAlt);
    }

    // Limpiar listeners al desmontar o cambiar dependencias
    return () => {
      console.log('Limpiando listener de alertas');
      unsubscribeAlertas();
      if (unsubscribeAlternativo) {
        unsubscribeAlternativo();
      }
    };
  }, [rutUsuario, patentesAsignadas, mostrarNotificacionPopUp]);

  // Recargar datos cuando la pantalla obtiene el foco (al volver desde otra pantalla)
  useFocusEffect(
    useCallback(() => {
      const recargarDatos = async () => {
        try {
          const rutGuardado = await AsyncStorage.getItem('rutUsuario');
          if (!rutGuardado) return;

          // Verificar si hay inscripción activa y actualizar patentes
          const listaPasajerosRef = collection(db, 'lista_pasajeros');
          const listaPasajerosSnap = await getDocs(
            query(listaPasajerosRef, where('rutApoderado', '==', rutGuardado)),
          );
          
          const tieneInscripcionActiva = !listaPasajerosSnap.empty;
          setTieneInscripcion(tieneInscripcionActiva);
          
          // Actualizar patentes asignadas
          const patentesSet = new Set<string>();
          listaPasajerosSnap.forEach((docSnap) => {
            const data = docSnap.data() || {};
            const patente = (data.patenteFurgon || '').toString().trim().toUpperCase();
            if (patente) {
              patentesSet.add(patente);
            }
          });
          const patentesLista = Array.from(patentesSet);
          setPatentesAsignadas(patentesLista);
          setCargandoInscripcion(false);
          
          console.log('Estado de inscripción actualizado:', tieneInscripcionActiva);
          console.log('Patentes asignadas actualizadas:', patentesLista);
        } catch (error) {
          console.error('Error al recargar datos:', error);
          setCargandoInscripcion(false);
        }
      };

      recargarDatos();
    }, [])
  );

  // Filtrar alertas que no han sido borradas usando useMemo
  const alertasFiltradas = useMemo(() => {
    const alertasBorradasSet = new Set(alertasBorradas);
    const filtradas = alertas.filter(alerta => {
      const estaBorrada = alertasBorradasSet.has(alerta.id);
      if (estaBorrada) {
        console.log('🚫 Alerta filtrada (borrada):', alerta.id);
      }
      return !estaBorrada;
    });
    
    // Log de depuración
    if (alertas.length > 0 && alertasBorradas.length > 0) {
      console.log('📊 Filtrado de alertas:', {
        total: alertas.length,
        borradas: alertasBorradas.length,
        filtradas: filtradas.length,
      });
    }
    
    return filtradas;
  }, [alertas, alertasBorradas]);
  
  const alertasMostradas = useMemo(() => {
    return alertasFiltradas.slice(0, 10);
  }, [alertasFiltradas]);
  const hayAlertasSinRevisar = useMemo(() => {
    if (alertasMostradas.length === 0) return false;
    if (!ultimaRevisionAlertas) return true;
    const masReciente = alertasMostradas[0]?.fecha;
    return masReciente ? masReciente.getTime() > ultimaRevisionAlertas : false;
  }, [alertasMostradas, ultimaRevisionAlertas]);

  const numeroAlertasSinRevisar = useMemo(() => {
    if (!ultimaRevisionAlertas) {
      return alertasMostradas.length;
    }
    return alertasMostradas.filter((alerta) => {
      if (!alerta.fecha) return false;
      return alerta.fecha.getTime() > ultimaRevisionAlertas;
    }).length;
  }, [alertasMostradas, ultimaRevisionAlertas]);


  const handleNotificacionPress = (alerta: Alerta) => {
    cerrarNotificacionPopUp(alerta.id);
    handleAlertaPress(alerta);
  };

  const toggleAlertas = () => {
    setAlertasVisible((prev) => {
      const next = !prev;
      if (next) {
        setListaHijosVisible(false);
      } else {
        setUltimaRevisionAlertas(Date.now());
      }
      return next;
    });
  };

  const toggleListaHijos = () => {
    setListaHijosVisible((prev) => {
      const next = !prev;
      if (next) {
        setAlertasVisible(false);
      }
      return next;
    });
  };

  const handleAlertaPress = (alerta: Alerta) => {
    setAlertasVisible(false);
    const params =
      alerta.parametros && typeof alerta.parametros === 'object'
        ? Object.fromEntries(
            Object.entries(alerta.parametros).map(([key, value]) => [key, value != null ? String(value) : '']),
          )
        : {};

    if (alerta.tipo.toLowerCase() === 'urgencia') {
      router.push({ pathname: '/chat-urgencia', params });
      return;
    }

    if (alerta.rutaDestino && typeof alerta.rutaDestino === 'string') {
      router.push({ pathname: alerta.rutaDestino as any, params });
    }
  };

  const handleMarcarAlertaLeida = async (alerta: Alerta) => {
    try {
      // Marcar la alerta como leída en Firestore
      await setDoc(
        doc(db, 'Alertas', alerta.id),
        {
          leida: true,
          fechaLectura: serverTimestamp(),
        },
        { merge: true }
      );

      // Si la alerta es de tipo "Recogido" o "Entregado" y corresponde al hijo seleccionado,
      // ocultar el estado en verde
      if (
        (alerta.tipo === 'Recogido' || alerta.tipo === 'Entregado') &&
        hijoSeleccionado &&
        alerta.rutHijo === hijoSeleccionado.rut
      ) {
        // El estado se ocultará automáticamente cuando se actualice el listener
        console.log('✅ Alerta marcada como leída, estado en verde se ocultará');
      }

      // Actualizar la alerta localmente
      setAlertas((prev) =>
        prev.map((a) => (a.id === alerta.id ? { ...a, leida: true } : a))
      );
    } catch (error) {
      console.error('Error al marcar alerta como leída:', error);
      Alert.alert('Error', 'No se pudo marcar la alerta como leída.');
    }
  };

  const seleccionarHijo = useCallback((hijo: Hijo) => {
    console.log('✅ Hijo seleccionado:', {
      nombre: `${hijo.nombres} ${hijo.apellidos}`,
      rut: hijo.rut,
      tieneHorario: !!hijo.horarioAsistencia,
      cantidadHorarios: hijo.horarioAsistencia?.length || 0,
      horarios: hijo.horarioAsistencia,
    });
    
    setHijoSeleccionado(hijo);
    setListaHijosVisible(false);
    AsyncStorage.setItem('rutHijoSeleccionado', hijo.rut).catch((error) => {
      console.error('No se pudo guardar el RUT del hijo seleccionado:', error);
    });
  }, []);

  const handleCerrarSesion = async () => {
    try {
      await AsyncStorage.clear();
      router.replace('/login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };


  // Si está cargando o no hay inscripción activa, mostrar vista inicial
  if (cargandoInscripcion || !tieneInscripcion) {
    return (
      <View style={styles.initialContainer}>
        {/* Barra verde superior */}
        <View style={styles.greenHeader}>
          <Pressable onPress={() => setMenuVisible(!menuVisible)} style={styles.iconButton}>
            <View style={styles.iconWrapper}>
              <Ionicons name="menu" size={28} color="#fff" />
              {mensajesNoLeidos > 0 && (
                <View style={styles.notificationDot} />
              )}
            </View>
          </Pressable>
          <View style={styles.headerCenter} />
          <Pressable onPress={toggleAlertas} style={styles.iconButton}>
            <View style={styles.notificationWrapper}>
              <Ionicons name="notifications-outline" size={28} color="#fff" />
            </View>
          </Pressable>
        </View>

        {/* Menú lateral */}
        {menuVisible && (
          <View style={styles.menu}>
            <Link href="/apoderado/perfil-apoderado" asChild>
              <TouchableHighlight underlayColor="#127067" style={styles.menuButton}>
                <Text style={styles.menuButtonText}>Perfil</Text>
              </TouchableHighlight>
            </Link>
            <Link href="/historial-viajes" asChild>
              <TouchableHighlight underlayColor="#127067" style={styles.menuButton}>
                <Text style={styles.menuButtonText}>Historial de viajes</Text>
              </TouchableHighlight>
            </Link>
            <Link href="/apoderado/Listar_furgones" asChild>
              <TouchableHighlight underlayColor="#127067" style={styles.menuButton}>
                <Text style={styles.menuButtonText}>Inscribir Furgon</Text>
              </TouchableHighlight>
            </Link>
            <Link href="/chat-furgon" asChild>
              <TouchableHighlight underlayColor="#127067" style={styles.menuButton}>
                <View style={styles.menuButtonContent}>
                  <Text style={styles.menuButtonText}>Chat de furgon</Text>
                  {mensajesNoLeidos > 0 && (
                    <View style={styles.chatNotificationDot} />
                  )}
                </View>
              </TouchableHighlight>
            </Link>
          </View>
        )}

        {/* Vista inicial */}
        <View style={styles.initialContent}>
          {cargandoInscripcion ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#127067" />
              <Text style={styles.loadingText}>Cargando...</Text>
            </View>
          ) : (
            <>
              <Image
                source={require('@/assets/images/Furgo_Truck.png')}
                style={styles.logo}
                contentFit="contain"
              />
              
              <TouchableHighlight
                style={styles.primaryButton}
                underlayColor="#0e5b52"
                onPress={() => router.push('/(tabs)/apoderado/Listar_furgones')}
              >
                <Text style={styles.primaryButtonText}>Buscar Servicios</Text>
              </TouchableHighlight>

              <TouchableHighlight
                style={styles.secondaryButton}
                underlayColor="#c71c1c"
                onPress={handleCerrarSesion}
              >
                <Text style={styles.secondaryButtonText}>Cerrar Sesión</Text>
              </TouchableHighlight>
            </>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Notificaciones Pop-up Globales */}
      <NotificacionesGlobales
        rutUsuario={rutUsuario}
        patentesAsignadas={patentesAsignadas}
        tieneInscripcion={tieneInscripcion}
      />
      
      {/* Notificaciones Pop-up (mantener para compatibilidad) */}
      <View style={styles.notificacionesContainer} pointerEvents="box-none">
        {notificacionesPopUp.map((notificacion, index) => {
          const tipoAlerta = notificacion.alerta.tipo.toLowerCase();
          const esUrgente = tipoAlerta === 'urgencia';
          const esRecogido = tipoAlerta === 'recogido';
          const esEntregado = tipoAlerta === 'entregado';
          
          // Determinar color y estilo según el tipo de alerta
          let backgroundColor = '#fff';
          let borderColor = '#127067';
          let iconColor = '#127067';
          let textColor = '#333';
          let tipoTextColor = '#127067';
          let iconName = 'information-circle';
          
          if (esUrgente) {
            backgroundColor = '#d32f2f';
            borderColor = '#a94442';
            iconColor = '#fff';
            textColor = '#fff';
            tipoTextColor = '#fff';
            iconName = 'alert-circle';
          } else if (esRecogido) {
            backgroundColor = '#e8f5e9';
            borderColor = '#4caf50';
            iconColor = '#4caf50';
            textColor = '#2e7d32';
            tipoTextColor = '#4caf50';
            iconName = 'checkmark-circle';
          } else if (esEntregado) {
            backgroundColor = '#e3f2fd';
            borderColor = '#2196f3';
            iconColor = '#2196f3';
            textColor = '#1565c0';
            tipoTextColor = '#2196f3';
            iconName = 'home';
          }
          
          const translateY = notificacion.animacion.interpolate({
            inputRange: [0, 1],
            outputRange: [-100, 0],
          });
          const opacity = notificacion.animacion;
          const scale = notificacion.animacion.interpolate({
            inputRange: [0, 1],
            outputRange: [0.8, 1],
          });

          return (
            <Animated.View
              key={notificacion.id}
              style={[
                styles.notificacionPopUp,
                {
                  backgroundColor,
                  borderLeftColor: borderColor,
                  transform: [{ translateY }, { scale }],
                  opacity,
                  top: 100 + index * 100, // Apilar notificaciones con más espacio
                  zIndex: 1000 - index,
                },
              ]}
            >
              <Pressable
                onPress={() => handleNotificacionPress(notificacion.alerta)}
                style={styles.notificacionContent}
              >
                <View style={styles.notificacionHeader}>
                  <View style={styles.notificacionIconContainer}>
                    <Ionicons
                      name={iconName as any}
                      size={28}
                      color={iconColor}
                    />
                    <Text style={[styles.notificacionTipo, { color: tipoTextColor }]}>
                      {notificacion.alerta.tipo}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => cerrarNotificacionPopUp(notificacion.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons
                      name="close"
                      size={22}
                      color={textColor}
                    />
                  </Pressable>
                </View>
                {notificacion.alerta.nombreHijo && (
                  <Text
                    style={[styles.notificacionNombreHijo, { color: textColor }]}
                    numberOfLines={1}
                  >
                    {notificacion.alerta.nombreHijo}
                  </Text>
                )}
                <Text
                  style={[styles.notificacionTexto, { color: textColor }]}
                  numberOfLines={3}
                >
                  {notificacion.alerta.descripcion}
                </Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>

      {/* Barra verde superior */}
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
          onPress={() => router.replace('/(tabs)/apoderado/pagina-principal-apoderado')}
          style={styles.inicioButton}
        >
          <Text style={styles.inicioText}>Inicio</Text>
        </Pressable>
        <Pressable onPress={toggleAlertas} style={styles.iconButton}>
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

      {/* Selector de hijo + alertas */}
      <View style={styles.selectorWrapper}>
        <View style={styles.hijoSelectorContainer}>
          <Pressable style={styles.hijoSelector} onPress={toggleListaHijos}>
            <Text style={styles.hijoSelectorText}>
              {loadingHijos
                ? 'Cargando...'
                : hijoSeleccionado
                ? `${hijoSeleccionado.nombres} ${hijoSeleccionado.apellidos}`
                : 'Seleccionar hijo'}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#127067" />
          </Pressable>

          {listaHijosVisible && hijos.length > 0 && (
            <View style={styles.listaHijos}>
              {hijos.map((hijo) => (
                <Pressable key={hijo.id} style={styles.hijoOption} onPress={() => seleccionarHijo(hijo)}>
                  <Text style={styles.hijoOptionText}>
                    {hijo.nombres} {hijo.apellidos}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {alertasVisible && (
          <View style={styles.alertas}>
            <View style={styles.alertasHeader}>
              <Text style={styles.alertasTitle}>Alertas</Text>
            </View>
            {alertasMostradas.length === 0 ? (
              <Text style={styles.noAlertasText}>No hay alertas nuevas</Text>
            ) : (
              <ScrollView
                style={styles.alertasScroll}
                contentContainerStyle={styles.alertasScrollContent}
                showsVerticalScrollIndicator
              >
                {alertasMostradas.map((alerta) => {
                  const esUrgente = alerta.tipo.toLowerCase() === 'urgencia';
                  const esRecogidoOEntregado = alerta.tipo === 'Recogido' || alerta.tipo === 'Entregado';
                  const iconColor = esUrgente ? '#a94442' : '#f39c12';
                  const iconName = esUrgente ? 'alert' : 'alert-circle';
                  return (
                    <View key={alerta.id} style={styles.alertaItemContainer}>
                      <Pressable style={styles.alertaItem} onPress={() => handleAlertaPress(alerta)}>
                        <Ionicons name={iconName} size={20} color={iconColor} />
                        <View style={styles.alertaTexts}>
                          <Text style={[styles.alertaTipo, esUrgente && styles.alertaTipoUrgente]}>{alerta.tipo}</Text>
                          <Text style={styles.alertaDescripcion}>{alerta.descripcion}</Text>
                        </View>
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        )}
      </View>

      {/* Menú lateral */}
      {menuVisible && (
        <View style={styles.menu}>
          <Link href="/apoderado/perfil-apoderado" asChild>
            <TouchableHighlight underlayColor="#127067" style={styles.menuButton}>
              <Text style={styles.menuButtonText}>Perfil</Text>
            </TouchableHighlight>
          </Link>
          <Link href="/historial-viajes" asChild>
            <TouchableHighlight underlayColor="#127067" style={styles.menuButton}>
              <Text style={styles.menuButtonText}>Historial de viajes</Text>
            </TouchableHighlight>
          </Link>
          <Link href="/apoderado/Listar_furgones" asChild>
            <TouchableHighlight underlayColor="#127067" style={styles.menuButton}>
              <Text style={styles.menuButtonText}>Inscribir Furgon</Text>
            </TouchableHighlight>
          </Link>
          <Link href="/chat-furgon" asChild>
            <TouchableHighlight underlayColor="#127067" style={styles.menuButton}>
              <Text style={styles.menuButtonText}>Chat de furgon</Text>
            </TouchableHighlight>
          </Link>
        </View>
      )}

      {/* Mapa del conductor (DriverMap) */}
      <View style={styles.mapaContainer} pointerEvents={listaHijosVisible ? 'none' : 'auto'}>
        {/* MapboxDriver: muestra la ubicación real del conductor en tiempo real */}
        {cargandoUbicacion ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#127067" />
            <Text style={styles.loadingText}>Cargando ubicación del conductor...</Text>
          </View>
        ) : ubicacionConductor ? (
          <>
            <MapboxDriver
              accessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN || ''}
              driverLocation={ubicacionConductor}
              route={rutaActiva || undefined}
            />
          </>
        ) : (
          <View style={styles.noUbicacionContainer}>
            <Text style={styles.noUbicacionText}>
              No hay conductor asignado o ubicación no disponible
            </Text>
          </View>
        )}
      </View>

      {/* Panel de horarios de clases */}
      {hijoSeleccionado && (
        <View key={`horarios-${hijoSeleccionado.rut}`} style={styles.horariosPanel}>
          <View style={styles.horariosHeader}>
            <View style={styles.horariosTitleContainer}>
              <Text style={styles.horariosTitle}>Horario de Clases</Text>
              <View style={styles.estadoContainer}>
                {estadoViajeHijo === 'entregado' && (
                  <View style={styles.estadoEntregadoContainer}>
                    <View style={styles.estadoBadgeEntregado}>
                      <Ionicons name="checkmark-circle" size={16} color="#fff" />
                      <Text style={styles.estadoViajeEntregado}>Entregado</Text>
                    </View>
                    <Pressable
                      style={styles.botonOk}
                      onPress={async () => {
                        // Marcar que el estado "entregado" fue confirmado con OK
                        estadoEntregadoConfirmadoRef.current = true;
                        
                        try {
                          const listaPasajerosRef = collection(db, 'lista_pasajeros');
                          
                          // PRIMERO: Verificar si hay ruta activa ANTES de resetear
                          let tieneRutaActiva = false;
                          
                          // Verificar si hay ruta activa guardada
                          if (rutaActivaRef.current && rutaActivaRef.current.waypoints && rutaActivaRef.current.waypoints.length > 0) {
                            tieneRutaActiva = true;
                            console.log('✅ Ruta activa detectada (ruta guardada)');
                          }
                          
                          // También verificar si hay otros pasajeros con estado 'recogido' o 'conductor en camino'
                          const rutaActivaQuery = query(
                            listaPasajerosRef,
                            where('rutApoderado', '==', rutUsuario.trim())
                          );
                          const rutaActivaSnap = await getDocs(rutaActivaQuery);
                          
                          rutaActivaSnap.docs.forEach((docSnap) => {
                            const data = docSnap.data();
                            const estado = (data.estadoViaje || '').toString().trim().toLowerCase();
                            if (estado === 'recogido' || estado === 'conductor en camino') {
                              tieneRutaActiva = true;
                              console.log('✅ Ruta activa detectada (pasajero con estado:', estado, ')');
                            }
                          });
                          
                          // Obtener el documento del hijo
                          const estadoQuery = query(
                            listaPasajerosRef,
                            where('rutHijo', '==', hijoSeleccionado.rut),
                            where('rutApoderado', '==', rutUsuario.trim()),
                            limit(1)
                          );
                          const snapshot = await getDocs(estadoQuery);
                          
                          if (!snapshot.empty) {
                            const docRef = doc(db, 'lista_pasajeros', snapshot.docs[0].id);
                            
                            if (tieneRutaActiva) {
                              // Si hay ruta activa, mantener el estado como "entregado" para que NO vuelva a aparecer
                              // El conductor no debe verlo en la lista hasta que termine la ruta
                              await setDoc(docRef, { estadoViaje: 'entregado' }, { merge: true });
                              setEstadoViajeHijo('entregado');
                              console.log('✅ Estado mantenido como "entregado" porque hay ruta activa - el niño NO volverá a aparecer');
                            } else {
                              // Si NO hay ruta activa, resetear a vacío para que pueda aparecer en la próxima ruta
                              await setDoc(docRef, { estadoViaje: '' }, { merge: true });
                              setEstadoViajeHijo('');
                              console.log('✅ Estado reseteado a vacío - no hay ruta activa');
                            }
                            
                            setHayRutaActiva(tieneRutaActiva);
                          }
                        } catch (error) {
                          console.error('Error al procesar OK:', error);
                          Alert.alert('Error', 'No se pudo procesar la confirmación.');
                        }
                      }}
                    >
                      <Text style={styles.botonOkText}>OK</Text>
                    </Pressable>
                  </View>
                )}
                {estadoViajeHijo !== 'entregado' && !hayRutaActiva && (
                  <View style={styles.estadoBadgeSinRuta}>
                    <Ionicons name="time-outline" size={14} color="#999" />
                    <Text style={styles.estadoViajeSinRuta}>Sin Ruta</Text>
                  </View>
                )}
                {estadoViajeHijo !== 'entregado' && hayRutaActiva && !estadoViajeHijo && (
                  <View style={styles.estadoBadgeEnCamino}>
                    <Ionicons name="car-outline" size={14} color="#127067" />
                    <Text style={styles.estadoViajeEnCamino}>Conductor en camino</Text>
                  </View>
                )}
                {estadoViajeHijo !== 'entregado' && hayRutaActiva && estadoViajeHijo === 'recogido' && (
                  <View style={styles.estadoBadgeAbordo}>
                    <Ionicons name="bus-outline" size={14} color="#28a745" />
                    <Text style={styles.estadoViajeAbordo}>Abordo</Text>
                  </View>
                )}
              </View>
            </View>
            <Text style={styles.horariosSubtitle}>{hijoSeleccionado.nombres} {hijoSeleccionado.apellidos}</Text>
          </View>
          <View style={styles.horariosTable}>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.colDia]}>Día</Text>
              <Text style={[styles.tableHeaderText, styles.colHora]}>Hora Ingr.</Text>
              <Text style={[styles.tableHeaderText, styles.colHora]}>Hora Sal.</Text>
            </View>
            <ScrollView style={styles.tableBody} showsVerticalScrollIndicator={false}>
              {(() => {
                // Función para formatear hora (mantener formato 24H)
                const formatearHora = (hora24: string): string => {
                  if (!hora24 || hora24 === '-' || hora24.trim() === '') return '-';
                  // Retornar la hora tal cual en formato 24H (HH:MM)
                  return hora24;
                };

                const diasSemana = [
                  { id: 'lunes', etiqueta: 'Lunes', alternativas: ['lunes', 'Lunes', 'LUNES'] },
                  { id: 'martes', etiqueta: 'Martes', alternativas: ['martes', 'Martes', 'MARTES'] },
                  { id: 'miercoles', etiqueta: 'Miércoles', alternativas: ['miercoles', 'Miércoles', 'Miércoles', 'MIERCOLES', 'MIÉRCOLES'] },
                  { id: 'jueves', etiqueta: 'Jueves', alternativas: ['jueves', 'Jueves', 'JUEVES'] },
                  { id: 'viernes', etiqueta: 'Viernes', alternativas: ['viernes', 'Viernes', 'VIERNES'] },
                ];
                
                const horariosDisponibles = hijoSeleccionado.horarioAsistencia || [];
                
                console.log(`📅 Mostrando horarios para ${hijoSeleccionado.nombres} ${hijoSeleccionado.apellidos}:`, {
                  rut: hijoSeleccionado.rut,
                  cantidadHorarios: horariosDisponibles.length,
                  horarios: horariosDisponibles,
                });
                
                // Función para actualizar la asistencia de un día
                const actualizarAsistenciaDia = async (hijoId: string, diaId: string, nuevoValor: boolean) => {
                  try {
                    const hijoRef = doc(db, 'Hijos', hijoId);
                    const hijoSnap = await getDoc(hijoRef);
                    
                    if (!hijoSnap.exists()) {
                      Alert.alert('Error', 'No se encontró el registro del niño.');
                      return;
                    }
                    
                    const hijoData = hijoSnap.data();
                    const horarioActual: HorarioDia[] = Array.isArray(hijoData.horarioAsistencia)
                      ? hijoData.horarioAsistencia
                      : [];
                    
                    // Buscar el día en el horario actual
                    const diaIndex = horarioActual.findIndex((dia) => {
                      const idDia = (dia.id || '').toString().toLowerCase();
                      const etiquetaDia = (dia.etiqueta || '').toString().toLowerCase();
                      const diaIdLower = diaId.toLowerCase();
                      const normalizarDia = (d: string) => d.replace(/[íi]/g, 'i').toLowerCase();
                      
                      return normalizarDia(idDia) === normalizarDia(diaIdLower) ||
                             normalizarDia(etiquetaDia) === normalizarDia(diaIdLower);
                    });
                    
                    let horarioActualizado: HorarioDia[];
                    
                    if (diaIndex >= 0) {
                      // Actualizar el día existente
                      horarioActualizado = [...horarioActual];
                      horarioActualizado[diaIndex] = {
                        ...horarioActualizado[diaIndex],
                        asiste: nuevoValor,
                      };
                    } else {
                      // Agregar un nuevo día al horario
                      const diasNombres: Record<string, string> = {
                        lunes: 'Lunes',
                        martes: 'Martes',
                        miercoles: 'Miércoles',
                        jueves: 'Jueves',
                        viernes: 'Viernes',
                      };
                      
                      horarioActualizado = [
                        ...horarioActual,
                        {
                          id: diaId,
                          etiqueta: diasNombres[diaId] || diaId,
                          asiste: nuevoValor,
                          horaEntrada: '',
                          horaSalida: '',
                        },
                      ];
                    }
                    
                    // Actualizar en Firestore
                    await updateDoc(hijoRef, {
                      horarioAsistencia: horarioActualizado,
                      actualizadoEn: serverTimestamp(),
                    });
                    
                    // Actualizar el estado local
                    setHijoSeleccionado((prev) => {
                      if (!prev) return prev;
                      return {
                        ...prev,
                        horarioAsistencia: horarioActualizado,
                      };
                    });
                    
                    // Actualizar también en la lista de hijos
                    setHijos((prev) =>
                      prev.map((hijo) =>
                        hijo.id === hijoId
                          ? { ...hijo, horarioAsistencia: horarioActualizado }
                          : hijo
                      )
                    );
                    
                    console.log(`✅ Horario actualizado para ${diaId}: ${nuevoValor ? 'asiste' : 'no asiste'}`);
                  } catch (error) {
                    console.error('Error al actualizar asistencia:', error);
                    Alert.alert('Error', 'No se pudo actualizar el horario.');
                  }
                };
                
                return diasSemana.map((diaSemana) => {
                  // Buscar el horario que coincida con este día
                  const horario = horariosDisponibles.find((h) => {
                    if (!h) return false;
                    const idH = (h.id || '').toString().toLowerCase().trim();
                    const etiquetaH = (h.etiqueta || '').toString().toLowerCase().trim();
                    const diaId = diaSemana.id.toLowerCase();
                    
                    // Comparar también sin acentos y con diferentes variaciones
                    const idHSinAcentos = idH.replace('é', 'e').replace('á', 'a').replace('í', 'i').replace('ó', 'o').replace('ú', 'u');
                    const etiquetaHSinAcentos = etiquetaH.replace('é', 'e').replace('á', 'a').replace('í', 'i').replace('ó', 'o').replace('ú', 'u');
                    const diaIdSinAcentos = diaId.replace('é', 'e');
                    
                    const coincide = idH === diaId || 
                           etiquetaH === diaId || 
                           idHSinAcentos === diaIdSinAcentos ||
                           etiquetaHSinAcentos === diaIdSinAcentos ||
                           diaSemana.alternativas.some(alt => {
                             const altLower = alt.toLowerCase();
                             const altSinAcentos = altLower.replace('é', 'e');
                             return idH === altLower || 
                                    etiquetaH === altLower ||
                                    idHSinAcentos === altSinAcentos ||
                                    etiquetaHSinAcentos === altSinAcentos;
                           });
                    
                    if (coincide && h.asiste) {
                      console.log(`✅ Horario encontrado para ${diaSemana.etiqueta}:`, {
                        id: h.id,
                        etiqueta: h.etiqueta,
                        asiste: h.asiste,
                        horaEntrada: h.horaEntrada,
                        horaSalida: h.horaSalida,
                      });
                    }
                    
                    return coincide;
                  });
                  
                  const asiste = horario?.asiste === true;
                  const horaEntrada = asiste && horario?.horaEntrada ? horario.horaEntrada.trim() : '';
                  const horaSalida = asiste && horario?.horaSalida ? horario.horaSalida.trim() : '';
                  
                  return (
                    <View key={diaSemana.id} style={styles.tableRow}>
                      <View style={styles.colDia}>
                        <View style={styles.dayCell}>
                          <Checkbox
                            value={asiste}
                            onValueChange={(nuevoValor) => {
                              if (hijoSeleccionado) {
                                actualizarAsistenciaDia(hijoSeleccionado.id, diaSemana.id, nuevoValor);
                              }
                            }}
                            color="#127067"
                            style={styles.checkbox}
                          />
                          <Text style={styles.dayText}>{diaSemana.etiqueta}</Text>
                        </View>
                      </View>
                      <Text style={[styles.tableCellText, styles.colHora]}>
                        {horaEntrada ? formatearHora(horaEntrada) : '-'}
                      </Text>
                      <Text style={[styles.tableCellText, styles.colHora]}>
                        {horaSalida ? formatearHora(horaSalida) : '-'}
                      </Text>
                    </View>
                  );
                });
              })()}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const surfaceShadow = makeShadow(
  '0 12px 24px rgba(0,0,0,0.15)',
  {
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7F8',
  },
  initialContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  initialContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
    paddingBottom: 40,
  },
  logo: {
    width: 150,
    height: 150,
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 60,
    textAlign: 'center',
  },
  primaryButton: {
    backgroundColor: '#127067',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
    marginBottom: 20,
    ...makeShadow(
      '0 4px 8px rgba(0,0,0,0.1)',
      {
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      },
    ),
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: '#d32f2f',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
    ...makeShadow(
      '0 4px 8px rgba(0,0,0,0.1)',
      {
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      },
    ),
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
    fontSize: 16,
  },
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
  iconButton: {
    padding: 8,
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
  headerCenter: {
    flex: 1,
  },
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
  hijoSelectorContainer: {
    zIndex: 100,
    position: 'relative',
    elevation: 12,
  },
  hijoSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#127067',
  },
  hijoSelectorText: {
    fontSize: 16,
    color: '#127067',
    fontWeight: '600',
  },
  listaHijos: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#127067',
    elevation: 16,
    zIndex: 200,
    ...surfaceShadow,
  },
  hijoOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  hijoOptionText: {
    fontSize: 16,
    color: '#333',
  },
  selectorWrapper: {
    position: 'relative',
    marginHorizontal: 20,
    marginTop: 20,
    zIndex: 200,
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
    width: 180,
    zIndex: 300,
    ...surfaceShadow,
  },
  menuButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginVertical: 6,
    backgroundColor: '#127067',
    borderRadius: 20,
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
  menuButtonText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  alertas: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 16,
    zIndex: 400,
    overflow: 'hidden',
    ...surfaceShadow,
  },
  alertasHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  alertasTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#127067',
    flex: 1,
  },
  noAlertasText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  alertaItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    gap: 10,
  },
  alertaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 10,
  },
  alertasScroll: {
    maxHeight: 240,
  },
  alertasScrollContent: {
    paddingBottom: 4,
  },
  alertaTexts: {
    flex: 1,
  },
  alertaTipo: {
    fontSize: 14,
    fontWeight: '600',
    color: '#127067',
  },
  alertaTipoUrgente: {
    color: '#a94442',
  },
  alertaDescripcion: {
    fontSize: 13,
    color: '#555',
    marginTop: 2,
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
  noUbicacionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    minHeight: 300,
    paddingHorizontal: 20,
  },
  noUbicacionText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
  horariosPanel: {
    backgroundColor: '#fff',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    padding: 16,
    ...surfaceShadow,
  },
  horariosHeader: {
    marginBottom: 12,
  },
  horariosTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  horariosTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#127067',
  },
  estadoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  estadoBadgeSinRuta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  estadoBadgeEnCamino: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e6f7f5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#127067',
  },
  estadoBadgeAbordo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#28a745',
  },
  estadoBadgeEntregado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#28a745',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    ...makeShadow(
      '0 2px 8px rgba(40, 167, 69, 0.3)',
      {
        shadowColor: '#28a745',
        shadowOpacity: 0.3,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      }
    ),
  },
  estadoViajeSinRuta: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
  },
  estadoViajeEnCamino: {
    fontSize: 13,
    fontWeight: '600',
    color: '#127067',
  },
  estadoViajeAbordo: {
    fontSize: 13,
    fontWeight: '600',
    color: '#28a745',
  },
  estadoViajeEntregado: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  estadoEntregadoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  botonOk: {
    backgroundColor: '#127067',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    ...makeShadow(
      '0 2px 8px rgba(18, 112, 103, 0.3)',
      {
        shadowColor: '#127067',
        shadowOpacity: 0.3,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      }
    ),
  },
  botonOkText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  horariosSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  horariosTable: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#127067',
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  tableHeaderText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  tableBody: {
    maxHeight: 200,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  colDia: {
    flex: 1.5,
  },
  colHora: {
    flex: 1,
    textAlign: 'center',
  },
  dayCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    marginRight: 4,
  },
  dayText: {
    fontSize: 14,
    color: '#333',
  },
  tableCellText: {
    fontSize: 14,
    color: '#333',
    textAlign: 'center',
  },
  emptyHorarios: {
    padding: 20,
    alignItems: 'center',
  },
  emptyHorariosText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  notificacionesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  notificacionPopUp: {
    position: 'absolute',
    width: Dimensions.get('window').width - 32,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    borderLeftWidth: 5,
    borderLeftColor: '#127067',
    minHeight: 80,
  },
  notificacionUrgente: {
    backgroundColor: '#d32f2f',
    borderLeftColor: '#a94442',
  },
  notificacionContent: {
    flex: 1,
  },
  notificacionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  notificacionIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notificacionTipo: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#127067',
    marginLeft: 8,
  },
  notificacionTipoUrgente: {
    color: '#fff',
  },
  notificacionNombreHijo: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
    marginBottom: 6,
  },
  notificacionTexto: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
    marginTop: 4,
  },
  notificacionTextoUrgente: {
    color: '#fff',
  },
});
