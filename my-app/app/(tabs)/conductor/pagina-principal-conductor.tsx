import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { makeShadow } from '@/utils/shadow';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, useRouter } from 'expo-router';
import { collection, doc, getDocs, limit, onSnapshot, query, setDoc, where, serverTimestamp, getDoc, addDoc } from 'firebase/firestore';
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

interface Pasajero {
  id: string;
  nombreHijo: string;
  nombreApoderado: string;
  rutHijo: string;
  rutApoderado: string;
  patenteFurgon: string;
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
  const [mensajesNoLeidos, setMensajesNoLeidos] = useState(0);
  const [modalAgregarHijoVisible, setModalAgregarHijoVisible] = useState(false);
  const [alertaSeleccionada, setAlertaSeleccionada] = useState<any | null>(null);
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
          const pasajerosSnapshot = await getDocs(
            query(listaPasajerosRef, where('rutConductor', '==', rutGuardado))
          );

          const pasajerosLista: Pasajero[] = [];
          pasajerosSnapshot.forEach((docSnap) => {
            const data = docSnap.data() || {};
            pasajerosLista.push({
              id: docSnap.id,
              nombreHijo: data.nombreHijo || 'Sin nombre',
              nombreApoderado: data.nombreApoderado || 'Sin apoderado',
              rutHijo: data.rutHijo || '',
              rutApoderado: data.rutApoderado || '',
              patenteFurgon: data.patenteFurgon || '',
            });
          });

          setPasajeros(pasajerosLista);

          // Obtener el siguiente niño (el primero de la lista)
          if (pasajerosLista.length > 0) {
            setSiguienteNino(pasajerosLista[0]);
          }
        } catch (errorPasajeros) {
          console.error('Error al cargar pasajeros:', errorPasajeros);
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
    };
  }, []);

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

  const handleGenerarRuta = () => {
    Alert.alert('Generar Ruta', 'Función de generar ruta en desarrollo');
  };

  const handleRutaSugerida = () => {
    Alert.alert('Ruta Sugerida', 'Función de ruta sugerida en desarrollo');
  };

  const handlePickUp = () => {
    if (siguienteNino) {
      Alert.alert('Pick Up', `Recogiendo a ${siguienteNino.nombreHijo}`);
      // Aquí puedes agregar la lógica para marcar como recogido
    }
  };

  const handleDropOff = () => {
    if (siguienteNino) {
      Alert.alert('Drop Off', `Dejando a ${siguienteNino.nombreHijo}`);
      // Aquí puedes agregar la lógica para marcar como dejado
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

      {/* Mapa del conductor */}
      <View style={styles.mapaContainer}>
        <MapboxDriver
          accessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN || ''}
          driverLocation={ubicacionActual || undefined}
        />
      </View>

      {/* Panel de control blanco */}
      <View style={styles.controlPanel}>
        {/* Botones de ruta */}
        <View style={styles.routeButtons}>
          <TouchableHighlight
            style={styles.routeButton}
            underlayColor="#0c5c4e"
            onPress={handleGenerarRuta}
          >
            <Text style={styles.routeButtonText}>Generar Ruta</Text>
          </TouchableHighlight>
          <TouchableHighlight
            style={styles.routeButton}
            underlayColor="#0c5c4e"
            onPress={handleRutaSugerida}
          >
            <Text style={styles.routeButtonText}>Ruta Sugerida</Text>
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
                <Text style={styles.actionButtonText}>Pick Up</Text>
              </TouchableHighlight>
              <TouchableHighlight
                style={styles.actionButton}
                underlayColor="#0c5c4e"
                onPress={handleDropOff}
                disabled={!siguienteNino}
              >
                <Text style={styles.actionButtonText}>Drop Off</Text>
              </TouchableHighlight>
            </View>
          </View>
        </View>
      </View>
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
  },
  routeButtonText: {
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
});
