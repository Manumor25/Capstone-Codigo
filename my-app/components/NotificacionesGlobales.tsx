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
          const pasajerosQuery = query(listaPasajerosRef, where('rutApoderado', '==', rut.trim()));
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

      const rutNormalizado = rut.trim();
      console.log('=== INICIANDO LISTENER DE NOTIFICACIONES GLOBALES ===');
      console.log('RUT usuario:', rutNormalizado);
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
      let alertasQuery;
      
      try {
        alertasQuery = query(
          alertasRef,
          where('rutDestinatario', '==', rutNormalizado),
          orderBy('creadoEn', 'desc'),
          limit(50),
        );
      } catch (errorConsulta) {
        console.warn('Error al crear query con orderBy, usando query simple:', errorConsulta);
        alertasQuery = query(
          alertasRef,
          where('rutDestinatario', '==', rutNormalizado),
          limit(50),
        );
      }

      const unsubscribeAlertas = onSnapshot(
        alertasQuery,
        (snapshot) => {
          const alertasMap = new Map<string, Alerta>();
          
          snapshot.docs.forEach((docSnap: any) => {
            const data = docSnap.data() || {};
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
            
            // Log para debug de alertas de Entregado
            const tipoNormalizado = (tipoAlertaRaw || '').toString().trim().toLowerCase();
            if (tipoNormalizado === 'entregado' || tipoNormalizado === 'recogido') {
              console.log(`📬 Alerta detectada: Tipo="${tipoAlertaRaw}", Normalizado="${tipoNormalizado}", Nombre="${data.nombreHijo || 'Sin nombre'}"`);
            }
            
            if (!alertasMap.has(docSnap.id)) {
              alertasMap.set(docSnap.id, alerta);
            }
          });
          
          const todasLasAlertas = Array.from(alertasMap.values());

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

          // Si es la primera carga, guardar los IDs de las alertas existentes
          if (alertasInicialesRef.current.size === 0 && alertasOrdenadas.length > 0) {
            alertasOrdenadas.forEach((alerta) => {
              alertasInicialesRef.current.add(alerta.id);
              alertasMostradasEnPopUpRef.current.add(alerta.id);
            });
            console.log('📋 Alertas iniciales guardadas:', alertasInicialesRef.current.size, 'alertas (no se mostrarán como pop-up)');
          }
          
          // Detectar alertas nuevas (que no estaban en la carga inicial)
          // SOLO estas se mostrarán como pop-up
          if (alertasInicialesRef.current.size > 0) {
            const nuevasAlertas = alertasOrdenadas.filter(
              (alerta) => !alertasInicialesRef.current.has(alerta.id)
            );
            
            if (nuevasAlertas.length > 0) {
              console.log('🆕 Alertas nuevas detectadas (se mostrarán como pop-up):', nuevasAlertas.length);
              nuevasAlertas.forEach((alerta) => {
                // Solo mostrar alertas de Recogido y Entregado
                const tipoAlerta = (alerta.tipo || '').toString().trim().toLowerCase();
                console.log(`🔔 Verificando alerta nueva: ID=${alerta.id}, Tipo="${alerta.tipo}", Tipo normalizado="${tipoAlerta}"`);
                
                if (tipoAlerta === 'recogido' || tipoAlerta === 'entregado') {
                  console.log(`✅ Mostrando pop-up para alerta: ${alerta.tipo} - ${alerta.nombreHijo || 'Sin nombre'}`);
                  // Agregar a las alertas iniciales para no mostrarla de nuevo
                  alertasInicialesRef.current.add(alerta.id);
                  // Mostrar como pop-up
                  mostrarNotificacionPopUp(alerta);
                } else {
                  console.log(`⚠️ Alerta no mostrada (tipo no es Recogido/Entregado): "${tipoAlerta}"`);
                }
              });
            }
          }
        },
        (error) => {
          console.error('✗ Error en listener de notificaciones globales:', error);
        }
      );

      return unsubscribeAlertas;
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

