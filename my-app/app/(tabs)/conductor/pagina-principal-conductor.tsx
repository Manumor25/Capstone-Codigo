import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { makeShadow } from '@/utils/shadow';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, useRouter } from 'expo-router';
import { collection, getDocs, limit, onSnapshot, query, where } from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
        const procesarYActualizarAlertas = () => {
          const alertasArray = Array.from(todasLasAlertasUnicas.values());
          
          console.log('✓ Total de alertas únicas encontradas:', alertasArray.length);
          console.log('✓ Patentes en las alertas:', alertasArray.map(a => a.patenteFurgon).filter(Boolean));
          console.log('✓ Patentes del conductor:', Array.from(patentesSet));

          // Filtrar alertas por RUT del conductor (normalizado) y por patentes
          const listaFiltrada = alertasArray.filter((alerta) => {
            // Verificar que tenga idPostulacion
            if (!alerta.idPostulacion) {
              console.log('⚠ Alerta sin idPostulacion:', alerta.id);
              return false;
            }
            
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
              descripcion: alerta.descripcion?.substring(0, 30),
              patente: alerta.patenteFurgon,
            });
            return true;
          });
          
          const alertasOrdenadas = listaFiltrada.sort((a, b) => {
            const fechaA = a.fecha ? a.fecha.getTime() : 0;
            const fechaB = b.fecha ? b.fecha.getTime() : 0;
            return fechaB - fechaA;
          });
          
          console.log('✓ Alertas finales después de filtrado:', alertasOrdenadas.length);
          if (alertasOrdenadas.length > 0) {
            console.log('✓ Alertas mostradas:', alertasOrdenadas.map(a => ({ 
              descripcion: a.descripcion?.substring(0, 30), 
              patente: a.patenteFurgon 
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

  return (
    <View style={styles.container}>
      {/* Barra superior */}
      <View style={styles.greenHeader}>
        <Pressable onPress={() => setMenuVisible(!menuVisible)} style={styles.iconButton}>
          <Ionicons name="menu" size={28} color="#fff" />
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
              <Text style={styles.menuButtonText}>Chat Apoderados</Text>
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
                        <Text style={styles.alertaBotonTexto}>Ver información</Text>
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

      {/* Mapa del conductor */}
      <View style={styles.mapaContainer}>
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
});
