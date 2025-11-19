import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, Animated, Dimensions, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '@/firebaseConfig';
import { collection, query, where, onSnapshot, limit, orderBy, getDocs } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Alerta {
  id: string;
  tipo: string;
  descripcion: string;
  fecha?: Date;
  rutHijo?: string;
  nombreHijo?: string;
  patenteFurgon?: string;
}

interface NotificacionPopUp {
  id: string;
  alerta: Alerta;
  animacion: Animated.Value;
}

interface Props {
  rutUsuario?: string;
  patentesAsignadas?: string[];
  tieneInscripcion?: boolean;
}

export default function NotificacionesGlobales({ 
  rutUsuario, 
  patentesAsignadas = [], 
  tieneInscripcion = true 
}: Props) {
  const [notificacionesPopUp, setNotificacionesPopUp] = useState<NotificacionPopUp[]>([]);
  const alertasMostradasEnPopUpRef = useRef<Set<string>>(new Set());
  const alertasInicialesRef = useRef<Set<string>>(new Set());
  const tiempoCargaInicialRef = useRef<number | null>(null);

  // Función para normalizar RUT
  const normalizarRut = (rut: string): string => {
    return rut.replace(/[^0-9kK]/g, '').toUpperCase();
  };

  // Función para mostrar notificación pop-up
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

      // Auto-cerrar después de 6 segundos (más tiempo para que se lea)
      setTimeout(() => {
        cerrarNotificacionPopUp(alerta.id);
      }, 6000);

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
    const cargarRutYConfigurarListener = async () => {
      // Obtener RUT del prop o de AsyncStorage
      let rut = rutUsuario;
      if (!rut) {
        rut = await AsyncStorage.getItem('rutUsuario') || '';
      }
      
      if (!rut) {
        console.log('Listener de notificaciones: Esperando rutUsuario');
        return;
      }
      
      // Obtener patentes si no se pasaron como prop
      let patentes = patentesAsignadas;
      if (patentes.length === 0) {
        try {
          const listaPasajerosRef = collection(db, 'lista_pasajeros');
          // Intentar buscar con RUT normalizado y también con RUT original (por si acaso)
          const rutParaBuscar = normalizarRut(rut);
          const pasajerosQuery = query(listaPasajerosRef, where('rutApoderado', '==', rutParaBuscar));
          const pasajerosSnapshot = await getDocs(pasajerosQuery);
          
          const patentesSet = new Set<string>();
          pasajerosSnapshot.docs.forEach((docSnap: any) => {
            const data = docSnap.data();
            const patente = (data.patenteFurgon || '').toString().trim().toUpperCase();
            if (patente) {
              patentesSet.add(patente);
            }
          });
          
          patentes = Array.from(patentesSet);
        } catch (error) {
          console.error('Error al cargar patentes en NotificacionesGlobales:', error);
        }
      }

      // Normalizar el RUT para la búsqueda (debe coincidir con cómo se guarda en las alertas)
      const rutNormalizado = normalizarRut(rut);
      console.log('=== INICIANDO LISTENER DE NOTIFICACIONES GLOBALES ===');
      console.log('RUT usuario (normalizado):', rutNormalizado);
      console.log('RUT usuario (original):', rut);
      console.log('Patentes asignadas:', patentes);
      
      // Resetear alertas iniciales cuando cambia el usuario
      alertasInicialesRef.current.clear();
      alertasMostradasEnPopUpRef.current.clear();
      console.log('🔄 Alertas iniciales reseteadas - solo se mostrarán pop-ups para alertas nuevas');

      // Marcar el tiempo de carga inicial
      if (tiempoCargaInicialRef.current === null) {
        tiempoCargaInicialRef.current = Date.now();
        console.log('⏰ Tiempo de carga inicial marcado:', new Date(tiempoCargaInicialRef.current).toISOString());
      }

      const alertasRef = collection(db, 'Alertas');
      
      // Crear dos queries: una con RUT normalizado y otra con RUT original (por si hay alertas antiguas)
      const rutOriginal = rut.trim();
      let alertasQueryNormalizado;
      let alertasQueryOriginal;
      
      try {
        alertasQueryNormalizado = query(
          alertasRef,
          where('rutDestinatario', '==', rutNormalizado),
          orderBy('creadoEn', 'desc'),
          limit(50),
        );
        // Solo crear query original si es diferente al normalizado
        if (rutOriginal !== rutNormalizado) {
          try {
            alertasQueryOriginal = query(
              alertasRef,
              where('rutDestinatario', '==', rutOriginal),
              orderBy('creadoEn', 'desc'),
              limit(50),
            );
          } catch (errorOriginal) {
            console.warn('Error al crear query original con orderBy:', errorOriginal);
            alertasQueryOriginal = query(
              alertasRef,
              where('rutDestinatario', '==', rutOriginal),
              limit(50),
            );
          }
        }
      } catch (errorConsulta) {
        console.warn('Error al crear query normalizado con orderBy, usando query simple:', errorConsulta);
        alertasQueryNormalizado = query(
          alertasRef,
          where('rutDestinatario', '==', rutNormalizado),
          limit(50),
        );
        if (rutOriginal !== rutNormalizado) {
          alertasQueryOriginal = query(
            alertasRef,
            where('rutDestinatario', '==', rutOriginal),
            limit(50),
          );
        }
      }

      // Map para combinar alertas de ambas queries
      const alertasCombinadasMap = new Map<string, Alerta>();
      
      // Función para procesar snapshot y actualizar el mapa combinado
      const procesarSnapshot = (snapshot: any, fuente: string) => {
          console.log(`📡 Snapshot recibido (${fuente}) - Total documentos:`, snapshot.docs.length);
          console.log(`📡 Buscando alertas para RUT: ${rutNormalizado} (${fuente})`);
          
          snapshot.docs.forEach((docSnap: any) => {
            const data = docSnap.data() || {};
            const rutDestinatarioEnAlerta = (data.rutDestinatario || '').toString().trim();
            
            console.log(`📋 Alerta encontrada (${fuente}): ID=${docSnap.id}, Tipo="${data.tipo || data.tipoAlerta || 'N/A'}", RUT Destinatario="${rutDestinatarioEnAlerta}"`);
            
            const fecha =
              data.creadoEn && typeof data.creadoEn.toDate === 'function'
                ? data.creadoEn.toDate()
                : data.fecha
                ? new Date(data.fecha)
                : null;

            const tipoAlertaRaw = data.tipoAlerta || data.tipo || 'Alerta';
            const alerta: Alerta = {
              id: docSnap.id,
              tipo: tipoAlertaRaw,
              descripcion: data.descripcion || 'Sin descripcion',
              fecha,
              rutHijo: data.rutHijo || '',
              nombreHijo: data.nombreHijo || '',
              patenteFurgon: (data.patenteFurgon || '').toString().trim().toUpperCase(),
            };
            
            // Log para debug de alertas importantes
            const tipoNormalizado = (tipoAlertaRaw || '').toString().trim().toLowerCase();
            if (tipoNormalizado === 'conductor en camino' || tipoNormalizado === 'entregado' || tipoNormalizado === 'recogido' || tipoNormalizado === 'ruta generada') {
              console.log(`📬 Alerta importante detectada (${fuente}): Tipo="${tipoAlertaRaw}", Normalizado="${tipoNormalizado}", Nombre="${data.nombreHijo || 'Sin nombre'}", RUT Dest="${rutDestinatarioEnAlerta}"`);
            }
            
            // Agregar al mapa combinado (evita duplicados por ID)
            if (!alertasCombinadasMap.has(docSnap.id)) {
              alertasCombinadasMap.set(docSnap.id, alerta);
            }
          });
          
          // Procesar alertas combinadas
          const todasLasAlertas = Array.from(alertasCombinadasMap.values());

          // Filtrar por patentes asignadas (si hay patentes)
          let listaAlertas: Alerta[] = [];
          
          if (patentes.length === 0) {
            listaAlertas = todasLasAlertas;
            console.log('📋 No hay patentes asignadas, mostrando todas las alertas:', listaAlertas.length);
          } else {
            const patentesNormalizadas = patentes.map(p => p.trim().toUpperCase());
            const patentesSetNormalizado = new Set(patentesNormalizadas);
            
            console.log('📋 Filtrando alertas por patentes:', patentesNormalizadas);
            listaAlertas = todasLasAlertas.filter((alerta) => {
              if (!alerta.patenteFurgon) {
                console.log(`  ✅ Alerta sin patente incluida: ${alerta.tipo} - ${alerta.nombreHijo}`);
                return true; // Permitir alertas sin patente
              }
              const patenteAlertaNormalizada = alerta.patenteFurgon.trim().toUpperCase();
              const coincide = patentesSetNormalizado.has(patenteAlertaNormalizada);
              if (!coincide) {
                console.log(`  ❌ Alerta filtrada por patente: ${alerta.tipo} - ${alerta.nombreHijo} (Patente: ${patenteAlertaNormalizada})`);
              } else {
                console.log(`  ✅ Alerta incluida por patente: ${alerta.tipo} - ${alerta.nombreHijo} (Patente: ${patenteAlertaNormalizada})`);
              }
              return coincide;
            });
            console.log(`📋 Alertas después del filtro de patentes: ${listaAlertas.length} de ${todasLasAlertas.length}`);
          }

          const alertasOrdenadas = listaAlertas
            .sort((a, b) => {
              const fechaA = a.fecha ? a.fecha.getTime() : 0;
              const fechaB = b.fecha ? b.fecha.getTime() : 0;
              return fechaB - fechaA;
            })
            .slice(0, 10);

          // Detectar alertas que deben mostrarse como pop-up
          // Incluir tanto alertas nuevas como alertas importantes que aún no se han mostrado
          const alertasParaMostrar = alertasOrdenadas.filter(
            (alerta) => {
              // Si ya se mostró, no mostrar de nuevo
              if (alertasMostradasEnPopUpRef.current.has(alerta.id)) {
                return false;
              }
              
              // Verificar si es una alerta importante que debe mostrarse
              const tipoAlerta = (alerta.tipo || '').toString().trim().toLowerCase();
              const esAlertaImportante = tipoAlerta === 'conductor en camino' ||
                                        tipoAlerta === 'ruta generada' || 
                                        tipoAlerta === 'recogido' || 
                                        tipoAlerta === 'entregado';
              
              // Mostrar si es importante, incluso si es de la carga inicial
              return esAlertaImportante;
            }
          );
          
          if (alertasParaMostrar.length > 0) {
            console.log('🆕 Alertas importantes detectadas (se mostrarán como pop-up):', alertasParaMostrar.length);
            alertasParaMostrar.forEach((alerta) => {
              const tipoAlerta = (alerta.tipo || '').toString().trim().toLowerCase();
              console.log(`🔔 Mostrando pop-up para alerta: ID=${alerta.id}, Tipo="${alerta.tipo}", Tipo normalizado="${tipoAlerta}"`);
              
              // Marcar como mostrada para no mostrarla de nuevo
              alertasMostradasEnPopUpRef.current.add(alerta.id);
              alertasInicialesRef.current.add(alerta.id);
              
              // Mostrar como pop-up
              mostrarNotificacionPopUp(alerta);
            });
          } else {
            console.log('ℹ️ No hay alertas importantes para mostrar en este snapshot');
          }
          
          // Si es la primera carga, marcar las alertas no importantes como iniciales
          // (las importantes ya se marcaron arriba)
          const esPrimeraCarga = alertasInicialesRef.current.size === 0 || 
                                 (alertasInicialesRef.current.size > 0 && alertasParaMostrar.length === 0);
          
          if (esPrimeraCarga && alertasOrdenadas.length > 0) {
            // Usar setTimeout para dar tiempo a que las alertas importantes se muestren primero
            setTimeout(() => {
              alertasOrdenadas.forEach((alerta) => {
                // Solo marcar como inicial si no se ha mostrado como pop-up
                if (!alertasMostradasEnPopUpRef.current.has(alerta.id)) {
                  alertasInicialesRef.current.add(alerta.id);
                }
              });
              console.log('📋 Alertas iniciales guardadas:', alertasInicialesRef.current.size, 'alertas (no se mostrarán como pop-up)');
            }, 3000); // Esperar 3 segundos para dar tiempo a que las importantes se muestren
          }
      };

      // Crear listeners para ambas queries
      const unsubscribeNormalizado = onSnapshot(
        alertasQueryNormalizado,
        (snapshot) => procesarSnapshot(snapshot, 'normalizado'),
        (error) => {
          console.error('✗ Error en listener de notificaciones (normalizado):', error);
        }
      );

      let unsubscribeOriginal: (() => void) | null = null;
      if (alertasQueryOriginal) {
        unsubscribeOriginal = onSnapshot(
          alertasQueryOriginal,
          (snapshot) => procesarSnapshot(snapshot, 'original'),
          (error) => {
            console.error('✗ Error en listener de notificaciones (original):', error);
          }
        );
      }

      // Retornar función para desuscribirse de ambos listeners
      return () => {
        unsubscribeNormalizado();
        if (unsubscribeOriginal) {
          unsubscribeOriginal();
        }
      };
    };

    let unsubscribe: (() => void) | null = null;
    
    cargarRutYConfigurarListener().then((unsub) => {
      unsubscribe = unsub || null;
    });
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [rutUsuario, patentesAsignadas, tieneInscripcion, mostrarNotificacionPopUp]);

  const handleNotificacionPress = useCallback((alerta: Alerta) => {
    // Cerrar la notificación al hacer clic
    cerrarNotificacionPopUp(alerta.id);
  }, [cerrarNotificacionPopUp]);

  return (
    <View style={styles.notificacionesContainer} pointerEvents="box-none">
      {notificacionesPopUp.map((notificacion, index) => {
        const tipoAlerta = notificacion.alerta.tipo.toLowerCase();
        const esUrgente = tipoAlerta === 'urgencia';
        const esConductorEnCamino = tipoAlerta === 'conductor en camino';
        const esRutaGenerada = tipoAlerta === 'ruta generada';
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
        } else if (esConductorEnCamino || esRutaGenerada) {
          backgroundColor = '#e6f7f5';
          borderColor = '#127067';
          iconColor = '#127067';
          textColor = '#0d5c52';
          tipoTextColor = '#127067';
          iconName = 'car';
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
                top: 100 + index * 100,
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
  );
}

const styles = StyleSheet.create({
  notificacionesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10000,
    alignItems: 'center',
    paddingHorizontal: 16,
    pointerEvents: 'box-none',
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
});

