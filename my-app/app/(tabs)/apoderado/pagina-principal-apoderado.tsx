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
  useSyncRutActivo();

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const [rutGuardado, rutHijoPrevio] = await Promise.all([
          AsyncStorage.getItem('rutUsuario'),
          AsyncStorage.getItem('rutHijoSeleccionado'),
        ]);
        if (!rutGuardado) {
          Alert.alert('Error', 'No se encontró el RUT del usuario activo.');
          setLoadingHijos(false);
          return;
        }
        setRutUsuario(rutGuardado);

        const hijosRef = collection(db, 'Hijos');
        const q = query(hijosRef, where('rutUsuario', '==', rutGuardado));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          const listaHijos: Hijo[] = querySnapshot.docs.map((doc) => {
            const data = doc.data() || {};
            return {
              id: doc.id,
              nombres: data.nombres || 'Sin nombre',
              apellidos: data.apellidos || 'Sin apellido',
              rut: data.rut || 'Sin RUT',
              edad: data.edad !== undefined ? data.edad : '-',
              fechaNacimiento: data.fechaNacimiento || 'No disponible',
              horarioAsistencia: Array.isArray(data.horarioAsistencia) ? data.horarioAsistencia : [],
            };
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
            const patente = (data.patenteFurgon || '').toString().trim();
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

  // Listener en tiempo real para alertas
  useEffect(() => {
    if (!rutUsuario) {
      console.log('Listener de alertas: Esperando rutUsuario');
      return;
    }

    console.log('Iniciando listener de alertas para RUT:', rutUsuario);
    console.log('Patentes asignadas:', patentesAsignadas);

    const alertasRef = collection(db, 'Alertas');
    let alertasQuery;
    
    // Intentar crear query con orderBy, si falla usar query simple
    try {
      alertasQuery = query(
        alertasRef,
        where('rutDestinatario', '==', rutUsuario),
        orderBy('creadoEn', 'desc'),
        limit(50),
      );
    } catch (errorConsulta) {
      console.warn('Error al crear query con orderBy, usando query simple:', errorConsulta);
      // Si falla orderBy, puede ser porque no hay índice, usar query sin orderBy
      alertasQuery = query(
        alertasRef,
        where('rutDestinatario', '==', rutUsuario),
        limit(50),
      );
    }

    const patentesSet = new Set(patentesAsignadas);

    // Usar onSnapshot para actualización en tiempo real
    const unsubscribeAlertas = onSnapshot(
      alertasQuery,
      (snapshot) => {
        console.log('✓ Snapshot recibido con', snapshot.docs.length, 'alertas');
        
        if (snapshot.empty) {
          console.log('No hay alertas en la base de datos para este RUT');
          setAlertas([]);
          return;
        }
        
        const todasLasAlertas: Alerta[] = snapshot.docs
          .map((docSnap) => {
            const data = docSnap.data() || {};
            const fecha =
              data.creadoEn && typeof data.creadoEn.toDate === 'function'
                ? data.creadoEn.toDate()
                : data.fecha
                ? new Date(data.fecha)
                : null;
            return {
              id: docSnap.id,
              tipo: data.tipoAlerta || 'Alerta',
              descripcion: data.descripcion || 'Sin descripcion',
              rutaDestino: data.rutaDestino,
              parametros: data.parametros,
              patenteFurgon: (data.patenteFurgon || '').toString().trim(),
              fecha,
            };
          });

        console.log('✓ Todas las alertas recibidas:', todasLasAlertas.length);
        console.log('✓ Patentes en las alertas:', todasLasAlertas.map(a => a.patenteFurgon).filter(Boolean));
        console.log('✓ Patentes asignadas al usuario:', Array.from(patentesSet));

        // Filtrar alertas por patentes asignadas (si hay patentes)
        // Si no hay patentes asignadas aún, mostrar todas las alertas temporalmente
        let listaAlertas: Alerta[] = [];
        
        if (patentesAsignadas.length === 0) {
          console.log('⚠ No hay patentes asignadas aún, mostrando todas las alertas temporalmente');
          listaAlertas = todasLasAlertas;
        } else {
          listaAlertas = todasLasAlertas.filter((alerta) => {
            // Si la alerta no tiene patente, no la filtramos (puede ser una alerta general)
            if (!alerta.patenteFurgon) {
              console.log('⚠ Alerta sin patenteFurgon (puede ser general):', alerta.id);
              // Permitir alertas sin patente (pueden ser alertas generales)
              return true;
            }
            const tienePatente = patentesSet.has(alerta.patenteFurgon);
            if (!tienePatente) {
              console.log('✗ Alerta filtrada por patente:', alerta.patenteFurgon, 'no está en', Array.from(patentesSet));
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
        
        console.log('✓ Alertas finales después de filtrado:', alertasOrdenadas.length);
        if (alertasOrdenadas.length > 0) {
          console.log('✓ Alertas mostradas:', alertasOrdenadas.map(a => ({ tipo: a.tipo, descripcion: a.descripcion.substring(0, 30) })));
        }
        setAlertas(alertasOrdenadas);
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

    // Limpiar listener al desmontar o cambiar dependencias
    return () => {
      console.log('Limpiando listener de alertas');
      unsubscribeAlertas();
    };
  }, [rutUsuario, patentesAsignadas]);

  // Recargar datos cuando la pantalla obtiene el foco (al volver desde otra pantalla)
  useFocusEffect(
    useCallback(() => {
      const recargarDatos = async () => {
        try {
          const rutGuardado = await AsyncStorage.getItem('rutUsuario');
          if (!rutGuardado) return;

          // Verificar si hay inscripción activa
          const listaPasajerosRef = collection(db, 'lista_pasajeros');
          const listaPasajerosSnap = await getDocs(
            query(listaPasajerosRef, where('rutApoderado', '==', rutGuardado)),
          );
          
          const tieneInscripcionActiva = !listaPasajerosSnap.empty;
          setTieneInscripcion(tieneInscripcionActiva);
          setCargandoInscripcion(false);
          
          console.log('Estado de inscripción actualizado:', tieneInscripcionActiva);
        } catch (error) {
          console.error('Error al recargar datos:', error);
          setCargandoInscripcion(false);
        }
      };

      recargarDatos();
    }, [])
  );

  const alertasMostradas = alertas.slice(0, 10);
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
            <Text style={styles.alertasTitle}>Alertas</Text>
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
  alertasTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#127067',
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
