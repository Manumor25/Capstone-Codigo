import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { makeShadow } from '@/utils/shadow';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, useRouter } from 'expo-router';
import { collection, getDocs, limit, orderBy, query, where, onSnapshot, Unsubscribe } from 'firebase/firestore';
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableHighlight,
  View
} from 'react-native';
import { Image } from 'expo-image';
import Checkbox from 'expo-checkbox';
// Import using a relative path so Metro resolver finds the file immediately
import MapboxDriver from '../../../components/MapboxDriver';

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
  useSyncRutActivo();

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
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          // Filtrar hijos que realmente pertenecen al usuario actual
          // Comparar tanto el RUT original como el normalizado
          const listaHijos: Hijo[] = querySnapshot.docs
            .map((doc) => {
              const data = doc.data() || {};
              return {
                id: doc.id,
                nombres: data.nombres || 'Sin nombre',
                apellidos: data.apellidos || 'Sin apellido',
                rut: data.rut || 'Sin RUT',
                edad: data.edad !== undefined ? data.edad : '-',
                fechaNacimiento: data.fechaNacimiento || 'No disponible',
                horarioAsistencia: Array.isArray(data.horarioAsistencia) ? data.horarioAsistencia : [],
                rutUsuario: data.rutUsuario || '',
              };
            })
            .filter((hijo: any) => {
              // Verificar que el hijo pertenece al usuario actual
              const rutUsuarioHijo = (hijo.rutUsuario || '').toString().trim();
              const rutUsuarioHijoNormalizado = normalizarRut(rutUsuarioHijo);
              
              // Comparar tanto el RUT original como el normalizado
              return (
                rutUsuarioHijo === rutUsuarioTrim ||
                rutUsuarioHijoNormalizado === rutUsuarioNormalizado
              );
            })
            .map((hijo: any) => ({
              id: hijo.id,
              nombres: hijo.nombres,
              apellidos: hijo.apellidos,
              rut: hijo.rut,
              edad: hijo.edad,
              fechaNacimiento: hijo.fechaNacimiento,
              horarioAsistencia: hijo.horarioAsistencia,
            }));
          
          console.log('Hijos cargados para usuario (página principal):', {
            rutUsuario: rutUsuarioTrim,
            rutUsuarioNormalizado,
            totalHijosEnDB: querySnapshot.docs.length,
            hijosFiltrados: listaHijos.length,
          });
          
          setHijos(listaHijos);
          if (listaHijos.length > 0) {
            const hijoInicial = rutHijoPrevio
              ? listaHijos.find((hijo) => hijo.rut === rutHijoPrevio) ?? listaHijos[0]
              : listaHijos[0];
            setHijoSeleccionado(hijoInicial);
            AsyncStorage.setItem('rutHijoSeleccionado', hijoInicial.rut).catch((error) => {
              console.error('No se pudo guardar el RUT del hijo seleccionado:', error);
            });
          } else {
            AsyncStorage.removeItem('rutHijoSeleccionado').catch((error) => {
              console.error('No se pudo eliminar el RUT del hijo seleccionado:', error);
            });
          }
        }

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
      } catch (error) {
        console.error('Error al cargar datos:', error);
        Alert.alert('Error', 'No se pudieron cargar los datos.');
      } finally {
        setLoadingHijos(false);
      }
    };

    cargarDatos();
  }, []);

  // Función para normalizar RUT (eliminar puntos y guiones)
  const normalizarRut = (rut: string): string => {
    return rut.replace(/[^0-9kK]/g, '').toUpperCase();
  };

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
            tipo: data.tipoAlerta || 'Alerta',
            descripcion: data.descripcion || 'Sin descripcion',
            rutaDestino: data.rutaDestino,
            parametros: data.parametros,
            patenteFurgon: (data.patenteFurgon || '').toString().trim().toUpperCase(),
            fecha,
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

    // Usar onSnapshot para actualización en tiempo real
    const unsubscribeAlertas = onSnapshot(
      alertasQuery,
      (snapshot) => {
        const alertasFinales = procesarAlertas(snapshot, 'query principal');
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
          // Solo procesar si el listener principal no encontró nada
          // Esto se maneja automáticamente porque ambos actualizan el mismo estado
          const alertasFinales = procesarAlertas(snapshot, 'query alternativo (todas las alertas)');
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
  }, [rutUsuario, patentesAsignadas]);

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

  const seleccionarHijo = (hijo: Hijo) => {
    setHijoSeleccionado(hijo);
    setListaHijosVisible(false);
    AsyncStorage.setItem('rutHijoSeleccionado', hijo.rut).catch((error) => {
      console.error('No se pudo guardar el RUT del hijo seleccionado:', error);
    });
  };

  const handleCerrarSesion = async () => {
    try {
      await AsyncStorage.clear();
      router.replace('/login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  const borrarHistorialAlertas = () => {
    console.log('🔴 Botón de borrar presionado');
    console.log('Alertas mostradas:', alertasMostradas.length);
    console.log('Alertas totales:', alertas.length);
    console.log('Alertas borradas actuales:', alertasBorradas.length);
    
    if (alertasMostradas.length === 0) {
      console.log('⚠ No hay alertas para borrar');
      return;
    }

    Alert.alert(
      'Borrar historial',
      '¿Estás seguro de que deseas borrar todas las notificaciones?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
          onPress: () => {
            console.log('❌ Usuario canceló el borrado');
          },
        },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('✅ Usuario confirmó el borrado');
              
              // Obtener todas las alertas actuales (no solo las mostradas)
              const idsBorrados = alertas.map(a => a.id);
              console.log('📝 IDs a marcar como borrados:', idsBorrados);
              
              // Actualizar el estado de alertas borradas usando función de actualización
              setAlertasBorradas(prev => {
                // Combinar los IDs previos con los nuevos, eliminando duplicados
                const nuevoArray = [...new Set([...prev, ...idsBorrados])];
                console.log('🔄 Actualizando estado de alertas borradas:', {
                  previas: prev.length,
                  nuevas: idsBorrados.length,
                  total: nuevoArray.length,
                });
                
                // Guardar en AsyncStorage para persistencia
                AsyncStorage.setItem('alertasBorradas', JSON.stringify(nuevoArray)).then(() => {
                  console.log('💾 Alertas borradas guardadas en AsyncStorage:', nuevoArray.length);
                }).catch(err => {
                  console.error('Error al guardar en AsyncStorage:', err);
                });
                
                return nuevoArray;
              });
              
              // Marcar todas las alertas como leídas
              setUltimaRevisionAlertas(Date.now());
              console.log('✓ Historial de alertas borrado:', idsBorrados.length, 'alertas');
            } catch (error) {
              console.error('✗ Error al borrar historial de alertas:', error);
              Alert.alert('Error', 'No se pudo borrar el historial de alertas.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // Si está cargando o no hay inscripción activa, mostrar vista inicial
  if (cargandoInscripcion || !tieneInscripcion) {
    return (
      <View style={styles.initialContainer}>
        {/* Barra verde superior */}
        <View style={styles.greenHeader}>
          <Pressable onPress={() => setMenuVisible(!menuVisible)} style={styles.iconButton}>
            <Ionicons name="menu" size={28} color="#fff" />
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
                <Text style={styles.menuButtonText}>Chat de furgon</Text>
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
      {/* Barra verde superior */}
      <View style={styles.greenHeader}>
        <Pressable onPress={() => setMenuVisible(!menuVisible)} style={styles.iconButton}>
          <Ionicons name="menu" size={28} color="#fff" />
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
              {alertasMostradas.length > 0 && (
                <Pressable
                  style={styles.borrarButton}
                  onPress={borrarHistorialAlertas}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={18} color="#d32f2f" />
                </Pressable>
              )}
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
                  const iconColor = esUrgente ? '#a94442' : '#f39c12';
                  const iconName = esUrgente ? 'alert' : 'alert-circle';
                  return (
                    <Pressable key={alerta.id} style={styles.alertaItem} onPress={() => handleAlertaPress(alerta)}>
                      <Ionicons name={iconName} size={20} color={iconColor} />
                      <View style={styles.alertaTexts}>
                        <Text style={[styles.alertaTipo, esUrgente && styles.alertaTipoUrgente]}>{alerta.tipo}</Text>
                        <Text style={styles.alertaDescripcion}>{alerta.descripcion}</Text>
                      </View>
                    </Pressable>
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
        {/* MapboxDriver: usa Mapbox en web/native. Pasa accessToken o configura via env. */}
        <MapboxDriver
          accessToken={process.env.EXPO_PUBLIC_MAPBOX_TOKEN || ''}
          simulatedPath={[
            { latitude: -33.4495, longitude: -70.667 },
            { latitude: -33.4498, longitude: -70.6665 },
            { latitude: -33.4502, longitude: -70.6660 },
            { latitude: -33.4506, longitude: -70.6655 },
          ]}
        />
      </View>

      {/* Panel de horarios de clases */}
      {hijoSeleccionado && (
        <View style={styles.horariosPanel}>
          <View style={styles.horariosHeader}>
            <Text style={styles.horariosTitle}>Horario de Clases</Text>
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
                const diasSemana = [
                  { id: 'lunes', etiqueta: 'Lunes' },
                  { id: 'martes', etiqueta: 'Martes' },
                  { id: 'miercoles', etiqueta: 'Miércoles' },
                  { id: 'jueves', etiqueta: 'Jueves' },
                  { id: 'viernes', etiqueta: 'Viernes' },
                ];
                
                return diasSemana.map((diaSemana) => {
                  const horario = hijoSeleccionado.horarioAsistencia?.find(
                    (h) => h.id?.toLowerCase() === diaSemana.id || h.etiqueta?.toLowerCase() === diaSemana.etiqueta.toLowerCase()
                  );
                  const asiste = horario?.asiste || false;
                  
                  return (
                    <View key={diaSemana.id} style={styles.tableRow}>
                      <View style={styles.colDia}>
                        <View style={styles.dayCell}>
                          <Checkbox
                            value={asiste}
                            disabled={true}
                            color="#127067"
                            style={styles.checkbox}
                          />
                          <Text style={styles.dayText}>{diaSemana.etiqueta}</Text>
                        </View>
                      </View>
                      <Text style={[styles.tableCellText, styles.colHora]}>
                        {asiste && horario?.horaEntrada ? horario.horaEntrada : '-'}
                      </Text>
                      <Text style={[styles.tableCellText, styles.colHora]}>
                        {asiste && horario?.horaSalida ? horario.horaSalida : '-'}
                      </Text>
                    </View>
                  );
                });
              })()}
              {(!hijoSeleccionado.horarioAsistencia || hijoSeleccionado.horarioAsistencia.length === 0) && (
                <View style={styles.emptyHorarios}>
                  <Text style={styles.emptyHorariosText}>No hay días de clases configurados</Text>
                </View>
              )}
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
  notificationWrapper: {
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ff5a5f',
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
  borrarButton: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ffebee',
  },
  noAlertasText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
  alertaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
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
  horariosTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#127067',
    marginBottom: 4,
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
});
