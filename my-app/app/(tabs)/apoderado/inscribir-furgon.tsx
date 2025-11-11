import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { makeShadow } from '@/utils/shadow';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CryptoJS from 'crypto-js';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, getDocs, limit, query, serverTimestamp, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableHighlight,
  View,
} from 'react-native';

interface Hijo {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string;
}

const ENCRYPTION_SALT = 'VEHICULO_IMG_V1';

export default function PostularFurgon() {
  const router = useRouter();
  const params = useLocalSearchParams();
  useSyncRutActivo();

  const normalizarRut = (rut: string) => rut.replace(/[^0-9kK]/g, '').toUpperCase();
  const mostrarBloqueo = (mensaje: string) => {
    setBloqueoMensaje(mensaje);
    setBloqueoVisible(true);
  };
  const cerrarBloqueo = () => setBloqueoVisible(false);
  const [hijos, setHijos] = useState<Hijo[]>([]);
  const [hijosSeleccionados, setHijosSeleccionados] = useState<Set<string>>(new Set());
  const [rutHijosSeleccionados, setRutHijosSeleccionados] = useState<Set<string>>(new Set());
  const [rutUsuario, setRutUsuario] = useState('');
  const [fotoFurgon, setFotoFurgon] = useState<string | null>(null);
  const [cargandoFoto, setCargandoFoto] = useState(false);
  const [bloqueoVisible, setBloqueoVisible] = useState(false);
  const [bloqueoMensaje, setBloqueoMensaje] = useState('');
  const [nombreConductor, setNombreConductor] = useState<string>('');
  const [telefonoConductor, setTelefonoConductor] = useState<string>('');
  const [cargandoConductor, setCargandoConductor] = useState(false);
  const rutConductorParam = (params.rutConductor as string) || '';
  const patenteParam = (params.patente as string) || '';
  const furgonIdParam = (params.id as string) || '';

  useEffect(() => {
    const cargarDatos = async () => {
      try {
        const [rutGuardado, rutHijoPrevio] = await Promise.all([
          AsyncStorage.getItem('rutUsuario'),
          AsyncStorage.getItem('rutHijoSeleccionado'),
        ]);
        if (!rutGuardado) {
          Alert.alert('Error', 'No se encontro el RUT del usuario activo.');
          return;
        }
        setRutUsuario(rutGuardado);

        // Normalizar el RUT del usuario para comparación
        const rutUsuarioNormalizado = normalizarRut(rutGuardado);
        const rutUsuarioTrim = rutGuardado.trim();

        const hijosRef = collection(db, 'Hijos');
        // Buscar hijos con el RUT exacto (con formato) o normalizado
        const q = query(hijosRef, where('rutUsuario', '==', rutUsuarioTrim));
        const snapshot = await getDocs(q);

        // Filtrar hijos que realmente pertenecen al usuario actual
        // Comparar tanto el RUT original como el normalizado
        const lista = snapshot.docs
          .map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              nombres: data.nombres || '',
              apellidos: data.apellidos || '',
              rut: data.rut || '',
              rutUsuario: data.rutUsuario || '',
            };
          })
          .filter((hijo) => {
            // Verificar que el hijo pertenece al usuario actual
            const rutUsuarioHijo = (hijo.rutUsuario || '').toString().trim();
            const rutUsuarioHijoNormalizado = normalizarRut(rutUsuarioHijo);
            
            // Comparar tanto el RUT original como el normalizado
            return (
              rutUsuarioHijo === rutUsuarioTrim ||
              rutUsuarioHijoNormalizado === rutUsuarioNormalizado
            );
          })
          .map((hijo) => ({
            id: hijo.id,
            nombres: hijo.nombres,
            apellidos: hijo.apellidos,
            rut: hijo.rut,
          }));

        console.log('Hijos cargados para usuario:', {
          rutUsuario: rutUsuarioTrim,
          rutUsuarioNormalizado,
          totalHijosEnDB: snapshot.docs.length,
          hijosFiltrados: lista.length,
        });

        setHijos(lista);
        
        // Si hay un hijo previo, seleccionarlo automáticamente
        if (rutHijoPrevio) {
          const hijoPorRut = lista.find((hijo) => hijo.rut === rutHijoPrevio);
          if (hijoPorRut) {
            setHijosSeleccionados(new Set([hijoPorRut.id]));
            setRutHijosSeleccionados(new Set([hijoPorRut.rut]));
          }
        }
      } catch (error) {
        console.error('Error al cargar hijos:', error);
        Alert.alert('Error', 'No se pudieron cargar los hijos.');
      }
    };

    cargarDatos();
  }, []);

  useEffect(() => {
    const cargarNombreConductor = async () => {
      if (!rutConductorParam) {
        // Si no hay rutConductor en params, intentar obtenerlo del furgón
        try {
          if (furgonIdParam) {
            const furgonRef = doc(db, 'Furgones', furgonIdParam);
            const snapshot = await getDoc(furgonRef);
            if (snapshot.exists()) {
              const data = snapshot.data();
              const rutConductor = data?.rutUsuario || '';
              if (rutConductor) {
                await obtenerNombreConductor(rutConductor);
              }
            }
          }
        } catch (error) {
          console.error('Error al obtener RUT del conductor:', error);
        }
        return;
      }

      await obtenerNombreConductor(rutConductorParam);
    };

    cargarNombreConductor();
  }, [rutConductorParam, furgonIdParam]);

  const obtenerNombreConductor = async (rutConductor: string): Promise<void> => {
    if (!rutConductor) {
      return;
    }

    setCargandoConductor(true);
    try {
      const usuariosRef = collection(db, 'usuarios');
      const q = query(usuariosRef, where('rut', '==', rutConductor));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const data = snapshot.docs[0].data() as any;
        const nombres = data?.nombres?.toString() || '';
        const apellidos = data?.apellidos?.toString() || '';
        const nombreCompleto = `${nombres} ${apellidos}`.trim();
        const telefono = data?.telefono?.toString() || '';
        setNombreConductor(nombreCompleto || 'Conductor no identificado');
        setTelefonoConductor(telefono || 'No disponible');
      } else {
        setNombreConductor('Conductor no identificado');
        setTelefonoConductor('No disponible');
      }
    } catch (error) {
      console.error('No se pudo obtener el nombre del conductor:', error);
      setNombreConductor('Conductor no identificado');
    } finally {
      setCargandoConductor(false);
    }
  };

  useEffect(() => {
    const cargarFotoFurgon = async () => {
      if (!furgonIdParam && !patenteParam) {
        setFotoFurgon(null);
        return;
      }

      setCargandoFoto(true);
      try {
        let base64: string | null = null;
        let mimeType = 'image/jpeg';
        let rutReferencia = rutConductorParam;

        if (furgonIdParam) {
          const furgonRef = doc(db, 'Furgones', furgonIdParam);
          const snapshot = await getDoc(furgonRef);
          if (snapshot.exists()) {
            const data = snapshot.data() || {};
            rutReferencia = data.rutUsuario || rutConductorParam;
            if (data.fotoMimeType) mimeType = data.fotoMimeType;

            if (data.fotoCifrada && rutReferencia) {
              try {
                const clave = `${rutReferencia}-${ENCRYPTION_SALT}`;
                const bytes = CryptoJS.AES.decrypt(data.fotoCifrada, clave);
                const decoded = bytes.toString(CryptoJS.enc.Utf8);
                if (decoded) {
                  base64 = decoded;
                }
              } catch (error) {
                console.warn('No se pudo descifrar la foto del furgón desde Furgones:', error);
              }
            }
          }
        }

        if (!base64 && patenteParam) {
          const vehiculosRef = collection(db, 'Vehiculos');
          const vehiculoQuery = query(vehiculosRef, where('patente', '==', patenteParam), limit(1));
          const vehiculosSnapshot = await getDocs(vehiculoQuery);

          if (!vehiculosSnapshot.empty) {
            const data = vehiculosSnapshot.docs[0].data() || {};
            const rutVehiculo = data.rutUsuario || rutReferencia;
            if (data.fotoMimeType) mimeType = data.fotoMimeType;

            if (data.fotoCifrada && rutVehiculo) {
              try {
                const clave = `${rutVehiculo}-${ENCRYPTION_SALT}`;
                const bytes = CryptoJS.AES.decrypt(data.fotoCifrada, clave);
                const decoded = bytes.toString(CryptoJS.enc.Utf8);
                if (decoded) {
                  base64 = decoded;
                }
              } catch (error) {
                console.warn('No se pudo descifrar la foto del furgón desde Vehículos:', error);
              }
            }
          }
        }

        if (base64) {
          setFotoFurgon(`data:${mimeType};base64,${base64}`);
        } else {
          setFotoFurgon(null);
        }
      } catch (error) {
        console.error('Error al cargar la foto del furgón:', error);
        setFotoFurgon(null);
      } finally {
        setCargandoFoto(false);
      }
    };

    cargarFotoFurgon();
  }, [furgonIdParam, patenteParam, rutConductorParam]);

  const handleToggleHijo = (hijoId: string, rutHijo: string) => {
    setHijosSeleccionados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(hijoId)) {
        nuevo.delete(hijoId);
      } else {
        nuevo.add(hijoId);
      }
      return nuevo;
    });
    
    setRutHijosSeleccionados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(rutHijo)) {
        nuevo.delete(rutHijo);
      } else {
        nuevo.add(rutHijo);
      }
      return nuevo;
    });
  };
  
  const seleccionarTodos = () => {
    const todosIds = new Set(hijos.map(h => h.id));
    const todosRuts = new Set(hijos.map(h => h.rut));
    setHijosSeleccionados(todosIds);
    setRutHijosSeleccionados(todosRuts);
  };
  
  const deseleccionarTodos = () => {
    setHijosSeleccionados(new Set());
    setRutHijosSeleccionados(new Set());
  };

  const postular = async () => {
    if (hijosSeleccionados.size === 0) {
      Alert.alert('Error', 'Selecciona al menos un hijo para postular.');
      return;
    }

    if (!rutUsuario) {
      Alert.alert('Error', 'No se pudo identificar al usuario.');
      return;
    }

    try {
      const { rutConductor, patenteFurgon } = await obtenerDatosFurgon();

      if (!rutConductor || !patenteFurgon) {
        Alert.alert('Error', 'No se pudo obtener la informacion del furgon.');
        return;
      }

      const nombreApoderado = await obtenerNombreApoderado();
      const rutConductorNormalizado = normalizarRut(rutConductor);
      const listaPasajerosRef = collection(db, 'lista_pasajeros');
      const postulacionesRef = collection(db, 'Postulaciones');
      const timestamp = serverTimestamp();
      
      // Obtener todos los hijos seleccionados
      const hijosParaPostular = hijos.filter(h => hijosSeleccionados.has(h.id));
      const hijosConError: string[] = [];
      const postulacionesCreadas: string[] = [];
      
      // Procesar cada hijo seleccionado
      for (const hijo of hijosParaPostular) {
        const rutHijo = hijo.rut;
        const objetivoRut = normalizarRut(rutHijo);
        
        // Verificar si ya está inscrito en lista_pasajeros
        try {
          const porApoderadoSnap = await getDocs(query(listaPasajerosRef, where('rutApoderado', '==', rutUsuario)));
          const registrosActivos = porApoderadoSnap.docs.filter((docSnap) => {
            const data = docSnap.data() || {};
            const rutDoc = normalizarRut((data.rutHijo || '').toString());
            if (rutDoc !== objetivoRut) return false;
            const estado = (data.estado || 'aceptada').toString().toLowerCase();
            const tieneFechaBaja = !!data.fechaBaja;
            const estadoDeBaja = estado === 'baja' || estado === 'cancelada';
            return (estado === 'aceptada' || estado === 'activa') && !tieneFechaBaja && !estadoDeBaja;
          });
          
          if (registrosActivos.length > 0) {
            hijosConError.push(`${hijo.nombres} ${hijo.apellidos}`);
            continue;
          }
        } catch (error) {
          console.warn('Error al verificar lista_pasajeros para', hijo.nombres, error);
        }
        
        // Verificar si ya tiene postulación aceptada
        try {
          const postulacionesSnap = await getDocs(query(postulacionesRef, where('rutHijo', '==', rutHijo)));
          const postulacionesAceptadas = postulacionesSnap.docs.filter((docSnap) => {
            const data = docSnap.data() || {};
            const estado = (data.estado || '').toString().toLowerCase();
            const rutDoc = normalizarRut((data.rutHijo || '').toString());
            const rutUsuarioDoc = normalizarRut((data.rutUsuario || '').toString());
            const rutUsuarioNormalizado = normalizarRut(rutUsuario);
            return estado === 'aceptada' && 
                   estado !== 'baja' && 
                   estado !== 'cancelada' && 
                   rutDoc === objetivoRut && 
                   rutUsuarioDoc === rutUsuarioNormalizado && 
                   !data.fechaBaja;
          });
          
          if (postulacionesAceptadas.length > 0) {
            hijosConError.push(`${hijo.nombres} ${hijo.apellidos}`);
            continue;
          }
        } catch (error) {
          console.warn('Error al verificar postulaciones para', hijo.nombres, error);
        }
        
        // Crear postulación para este hijo
        try {
          const postulacionDoc = await addDoc(postulacionesRef, {
            rutUsuario,
            rutConductor,
            rutHijo,
            idHijo: hijo.id,
            idFurgon: furgonIdParam || '',
            patenteFurgon,
            colegio: (params.colegio as string) || '',
            nombreFurgon: (params.nombre as string) || '',
            comuna: (params.comuna as string) || '',
            estado: 'pendiente',
            creadoEn: timestamp,
          });
          
          postulacionesCreadas.push(postulacionDoc.id);
          
          // Crear mensaje inicial en el chat solo para el primer hijo
          if (postulacionesCreadas.length === 1) {
            const mensajeInicial = hijosParaPostular.length === 1
              ? `Hola, me gustaría inscribir a mi hijo ${hijo.nombres} en tu furgón.`
              : `Hola, me gustaría inscribir a ${hijosParaPostular.length} hijos en tu furgón.`;
            
            const participantesChat = [rutUsuario, rutConductor].filter(Boolean);
            
            try {
              await addDoc(collection(db, 'MensajesChat'), {
                idPostulacion: postulacionDoc.id,
                texto: mensajeInicial,
                emisor: rutUsuario,
                receptor: rutConductor,
                participantes: participantesChat,
                fecha: new Date().toISOString(),
                creadoEn: serverTimestamp(),
              });
            } catch (errorMensaje) {
              console.error('Error al crear mensaje inicial:', errorMensaje);
            }
          }
          
          // Crear alerta solo para el primer hijo
          if (postulacionesCreadas.length === 1) {
            const descripcion = hijosParaPostular.length === 1
              ? (nombreApoderado || 'Un apoderado') + ' esta postulando a tu furgon'
              : (nombreApoderado || 'Un apoderado') + ` esta postulando ${hijosParaPostular.length} hijos a tu furgon`;
            
            const alertaData = {
              tipoAlerta: 'Postulacion',
              descripcion,
              rutDestinatario: rutConductorNormalizado,
              rutDestinatarioOriginal: rutConductor,
              rutaDestino: '/chat-validacion',
              parametros: {
                idPostulacion: postulacionDoc.id,
                rutPadre: rutUsuario,
                rutConductor: rutConductorNormalizado,
                rutConductorOriginal: rutConductor,
                rutHijo,
                patenteFurgon,
              },
              creadoEn: serverTimestamp(),
              leida: false,
              patenteFurgon,
            };
            
            await addDoc(collection(db, 'Alertas'), alertaData);
          }
        } catch (error) {
          console.error('Error al crear postulación para', hijo.nombres, error);
          hijosConError.push(`${hijo.nombres} ${hijo.apellidos}`);
        }
      }
      
      // Mostrar resultado
      if (hijosConError.length > 0 && postulacionesCreadas.length === 0) {
        Alert.alert(
          'Error',
          `No se pudieron crear postulaciones para: ${hijosConError.join(', ')}. Ya están inscritos en un furgón.`
        );
        return;
      }
      
      if (postulacionesCreadas.length > 0) {
        if (hijosConError.length > 0) {
          Alert.alert(
            'Postulaciones creadas parcialmente',
            `Se crearon postulaciones para ${postulacionesCreadas.length} hijo(s), pero ${hijosConError.join(', ')} ya están inscritos.`
          );
        } else {
          Alert.alert(
            'Éxito',
            `Se crearon ${postulacionesCreadas.length} postulación(es) exitosamente.`
          );
        }
        
        // Navegar al chat del primer hijo postulado
        if (postulacionesCreadas.length > 0) {
          router.push({
            pathname: '/chat-validacion',
            params: { idPostulacion: postulacionesCreadas[0] },
          });
        }
      }
    } catch (error) {
      console.error('Error al postular:', error);
      Alert.alert('Error', 'No se pudo enviar la solicitud.');
    }
  };

  const obtenerDatosFurgon = async (): Promise<{ rutConductor: string; patenteFurgon: string }> => {
    let rutConductor = rutConductorParam;
    let patenteFurgon = patenteParam;

    if (rutConductor && patenteFurgon) {
      return { rutConductor, patenteFurgon };
    }

    if (rutConductorParam && patenteParam) {
      return { rutConductor: rutConductorParam, patenteFurgon: patenteParam };
    }

    try {
      const postulacionesRef = collection(db, 'Furgones');
      const snapshot = await getDocs(postulacionesRef);

      let rut = rutConductorParam;
      let patente = patenteParam;

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!rut && data?.rutUsuario) {
          rut = data.rutUsuario;
        }
        if (!patente && data?.patente) {
          patente = data.patente;
        }
      });

      if (!rut || !patente) {
        throw new Error('No se encontraron datos suficientes del furgón');
      }

      return { rutConductor: rut, patenteFurgon: patente };
    } catch (error) {
      console.error('Error al obtener datos del furgón:', error);
      throw error;
    }
  };

  const obtenerNombreApoderado = async (): Promise<string> => {
    if (!rutUsuario) {
      return '';
    }

    try {
      const usuariosRef = collection(db, 'usuarios');
      const q = query(usuariosRef, where('rut', '==', rutUsuario));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const data = snapshot.docs[0].data() as any;
        const nombres = data?.nombres?.toString() || '';
        const apellidos = data?.apellidos?.toString() || '';
        return `${nombres} ${apellidos}`.trim();
      }
    } catch (error) {
      console.error('No se pudo obtener el nombre del apoderado:', error);
    }

    return '';
  };

  const handleVolver = () => {
    if (router.canGoBack?.()) {
      router.back();
    } else {
      router.replace('/(tabs)/apoderado/pagina-principal-apoderado');
    }
  };

  return (
    <>
      <Modal
        visible={bloqueoVisible}
        animationType="fade"
        transparent
        onRequestClose={cerrarBloqueo}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Ionicons name="alert-circle" size={36} color="#a94442" style={styles.modalIcon} />
            <Text style={styles.modalTitle}>Postulacion no permitida</Text>
            <Text style={styles.modalMessage}>{bloqueoMensaje}</Text>
            <TouchableHighlight
              style={styles.modalButton}
              underlayColor="#0c5c4e"
              onPress={cerrarBloqueo}
            >
              <Text style={styles.modalButtonText}>Entendido</Text>
            </TouchableHighlight>
          </View>
        </View>
      </Modal>
      <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={handleVolver}>
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      <View style={styles.profileContainer}>
        <View style={styles.imageWrapper}>
          {cargandoFoto ? (
            <ActivityIndicator color="#127067" />
          ) : fotoFurgon ? (
            <Image source={{ uri: fotoFurgon }} style={styles.furgonImage} contentFit="cover" />
          ) : (
            <Ionicons name="image-outline" size={56} color="#127067" />
          )}
        </View>
        {cargandoConductor ? (
          <Text style={styles.name}>Cargando información...</Text>
        ) : (
          <Text style={styles.name}>{nombreConductor || 'Conductor no identificado'}</Text>
        )}
        <Text style={styles.school}>{(params.nombre as string) || 'Furgón disponible'}</Text>
        <Text style={styles.schoolSubtitle}>{(params.colegio as string) || 'Colegio no informado'}</Text>
        <View style={styles.detailsCard}>
          <Text style={styles.detailItem}>Comuna: {(params.comuna as string) || 'No registrada'}</Text>
          <Text style={styles.detailItem}>Patente: {patenteParam || 'Sin patente'}</Text>
          <Text style={styles.detailItem}>Precio: ${(params.precio as string) || 'N/D'} CLP</Text>
          {cargandoConductor ? (
            <Text style={styles.detailItem}>Teléfono: Cargando...</Text>
          ) : (
            <Text style={styles.detailItem}>Teléfono: {telefonoConductor || 'No disponible'}</Text>
          )}
        </View>
        <Text style={styles.verified}>Verificado: Si</Text>
      </View>

      <Text style={styles.label}>Selecciona hijo(s)</Text>
      {hijos.length > 0 && (
        <View style={styles.seleccionarTodosContainer}>
          <Pressable onPress={seleccionarTodos} style={styles.seleccionarTodosButton}>
            <Text style={styles.seleccionarTodosText}>Seleccionar todos</Text>
          </Pressable>
          {hijosSeleccionados.size > 0 && (
            <Pressable onPress={deseleccionarTodos} style={styles.seleccionarTodosButton}>
              <Text style={styles.seleccionarTodosText}>Deseleccionar todos</Text>
            </Pressable>
          )}
        </View>
      )}
      <View style={styles.hijosListContainer}>
        {hijos.length === 0 ? (
          <Text style={styles.noHijosText}>No hay hijos disponibles</Text>
        ) : (
          hijos.map((hijo) => {
            const estaSeleccionado = hijosSeleccionados.has(hijo.id);
            return (
              <Pressable
                key={hijo.id}
                style={[
                  styles.hijoItem,
                  estaSeleccionado && styles.hijoItemSeleccionado,
                ]}
                onPress={() => handleToggleHijo(hijo.id, hijo.rut)}
              >
                <View style={styles.hijoItemContent}>
                  <Ionicons
                    name={estaSeleccionado ? 'checkbox' : 'checkbox-outline'}
                    size={24}
                    color={estaSeleccionado ? '#127067' : '#999'}
                  />
                  <Text
                    style={[
                      styles.hijoItemText,
                      estaSeleccionado && styles.hijoItemTextSeleccionado,
                    ]}
                  >
                    {hijo.nombres} {hijo.apellidos}
                  </Text>
                </View>
              </Pressable>
            );
          })
        )}
      </View>
      {hijosSeleccionados.size > 0 && (
        <Text style={styles.contadorText}>
          {hijosSeleccionados.size} hijo(s) seleccionado(s)
        </Text>
      )}

      <TouchableHighlight style={styles.button} onPress={postular} underlayColor="#0c5c4e">
        <Text style={styles.buttonText}>Postular</Text>
      </TouchableHighlight>
    </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7F8',
    padding: 20,
    paddingTop: 80,
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    zIndex: 10,
    padding: 6,
  },
  profileContainer: {
    alignItems: 'center',
    marginBottom: 30,
    width: '100%',
  },
  imageWrapper: {
    width: 140,
    height: 100,
    borderRadius: 16,
    backgroundColor: '#E6EFEF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    overflow: 'hidden',
  },
  furgonImage: {
    width: '100%',
    height: '100%',
  },
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#127067',
    marginTop: 4,
  },
  school: {
    fontSize: 16,
    color: '#555',
    marginTop: 4,
  },
  schoolSubtitle: {
    fontSize: 14,
    color: '#777',
    marginTop: 2,
  },
  detailsCard: {
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dce7e5',
    width: '100%',
  },
  detailItem: {
    fontSize: 15,
    color: '#444',
    marginBottom: 4,
  },
  verified: {
    fontSize: 16,
    color: '#127067',
    marginTop: 8,
  },
  label: {
    fontSize: 16,
    color: '#333',
    alignSelf: 'flex-start',
    marginBottom: 5,
  },
  pickerContainer: {
    backgroundColor: '#fff',
    borderColor: '#127067',
    borderWidth: 1,
    borderRadius: 10,
    width: '100%',
    marginBottom: 20,
  },
  picker: {
    height: 50,
    width: '100%',
    color: '#333',
  },
  seleccionarTodosContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
  },
  seleccionarTodosButton: {
    flex: 1,
    backgroundColor: '#E6EFEF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  seleccionarTodosText: {
    color: '#127067',
    fontSize: 14,
    fontWeight: '600',
  },
  hijosListContainer: {
    width: '100%',
    marginBottom: 15,
    maxHeight: 200,
  },
  hijoItem: {
    backgroundColor: '#fff',
    borderColor: '#dce7e5',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  hijoItemSeleccionado: {
    backgroundColor: '#E6EFEF',
    borderColor: '#127067',
    borderWidth: 2,
  },
  hijoItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  hijoItemText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  hijoItemTextSeleccionado: {
    color: '#127067',
    fontWeight: '600',
  },
  noHijosText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    padding: 20,
  },
  contadorText: {
    fontSize: 14,
    color: '#127067',
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#127067',
    paddingVertical: 14,
    borderRadius: 20,
    width: '100%',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: '#00000066',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    elevation: 12,
    ...makeShadow(
      '0 12px 24px rgba(0,0,0,0.2)',
      {
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 4 },
      },
    ),
  },
  modalIcon: {
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#a94442',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 15,
    color: '#333',
    textAlign: 'center',
    marginBottom: 24,
  },
  modalButton: {
    backgroundColor: '#127067',
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 10,
    minWidth: 140,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '600',
  },
});
