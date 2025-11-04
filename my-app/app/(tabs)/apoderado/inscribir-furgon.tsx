import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableHighlight,
  StyleSheet,
  Alert,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { addDoc, collection, getDocs, doc, getDoc, query, where, limit, serverTimestamp } from 'firebase/firestore';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import CryptoJS from 'crypto-js';
import { makeShadow } from '@/utils/shadow';

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
  const [hijoSeleccionado, setHijoSeleccionado] = useState('');
  const [rutHijoSeleccionado, setRutHijoSeleccionado] = useState('');
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

        const hijosRef = collection(db, 'Hijos');
        const q = query(hijosRef, where('rutUsuario', '==', rutGuardado));
        const snapshot = await getDocs(q);

        const lista = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            nombres: data.nombres || '',
            apellidos: data.apellidos || '',
            rut: data.rut || '',
          };
        });

        setHijos(lista);
        const hijoPorRut = rutHijoPrevio
          ? lista.find((hijo) => hijo.rut === rutHijoPrevio)
          : undefined;
        const hijoPorDefecto =
          !hijoPorRut && !hijoSeleccionado && lista.length === 1 ? lista[0] : undefined;
        const hijoInicial = hijoPorRut || hijoPorDefecto;

        if (hijoInicial) {
          setHijoSeleccionado(hijoInicial.id);
          setRutHijoSeleccionado(hijoInicial.rut);
          AsyncStorage.setItem('rutHijoSeleccionado', hijoInicial.rut).catch((error) => {
            console.error('No se pudo guardar el RUT del hijo seleccionado:', error);
          });
        } else if (!rutHijoPrevio) {
          setRutHijoSeleccionado('');
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

  const handleSeleccionHijo = (itemValue: string | number) => {
    const valorSeleccionado = String(itemValue);
    setHijoSeleccionado(valorSeleccionado);
    const hijo = hijos.find((item) => item.id === valorSeleccionado);
    const rut = hijo?.rut ?? '';
    setRutHijoSeleccionado(rut);
    if (rut) {
      AsyncStorage.setItem('rutHijoSeleccionado', rut).catch((error) => {
        console.error('No se pudo guardar el RUT del hijo seleccionado:', error);
      });
    } else {
      AsyncStorage.removeItem('rutHijoSeleccionado').catch((error) => {
        console.error('No se pudo eliminar el RUT del hijo seleccionado:', error);
      });
    }
  };

  const postular = async () => {
    if (!hijoSeleccionado) {
      Alert.alert('Error', 'Selecciona un hijo para postular.');
      return;
    }

    if (!rutHijoSeleccionado) {
      Alert.alert('Error', 'No se pudo obtener el RUT del hijo seleccionado.');
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

      const listaPasajerosRef = collection(db, 'lista_pasajeros');
      const objetivoRut = normalizarRut(rutHijoSeleccionado);
      const patentesRegistradas = new Set<string>();

      const recolectarCoincidencias = (docs: any[]) => {
        const coincidencias: any[] = [];
        docs.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const rutDoc = normalizarRut((data.rutHijo || '').toString());
          if (rutDoc === objetivoRut) {
            coincidencias.push(docSnap);
            const patenteAsociada = (data.patenteFurgon || '').toString().trim();
            if (patenteAsociada) {
              patentesRegistradas.add(patenteAsociada);
            }
          }
        });
        return coincidencias;
      };

      const obtenerCoincidenciasListaPasajeros = async () => {
        let coincidencias: any[] = [];
        
        // Primero intentar consulta combinada (más eficiente)
        try {
          const combinadaSnap = await getDocs(
            query(
              listaPasajerosRef,
              where('rutApoderado', '==', rutUsuario),
              where('rutHijo', '==', rutHijoSeleccionado),
            ),
          );
          
          console.log('Consulta combinada encontrada:', combinadaSnap.docs.length, 'registros');
          
          // Filtrar solo registros activos (estado 'aceptada' o sin estado de baja)
          const registrosActivos = combinadaSnap.docs.filter((docSnap) => {
            const data = docSnap.data() || {};
            const estado = (data.estado || 'aceptada').toString().toLowerCase();
            // Solo considerar activos si el estado es 'aceptada' o no tiene estado de baja
            return estado === 'aceptada' || estado === 'activa' || !data.fechaBaja;
          });
          
          console.log('Registros activos encontrados:', registrosActivos.length);
          
          coincidencias = recolectarCoincidencias(registrosActivos);
          if (coincidencias.length > 0) {
            console.log('Coincidencias activas encontradas:', coincidencias.length);
            return coincidencias;
          }
        } catch (consultaError) {
          console.warn('Consulta combinada lista_pasajeros falló, se intentará con filtros simples:', consultaError);
        }

        // Si no hay coincidencias con la consulta combinada, intentar por rutApoderado
        try {
          const porApoderadoSnap = await getDocs(query(listaPasajerosRef, where('rutApoderado', '==', rutUsuario)));
          
          // Filtrar solo registros activos para este hijo
          const registrosActivos = porApoderadoSnap.docs.filter((docSnap) => {
            const data = docSnap.data() || {};
            const rutDoc = normalizarRut((data.rutHijo || '').toString());
            if (rutDoc !== objetivoRut) return false;
            
            const estado = (data.estado || 'aceptada').toString().toLowerCase();
            return estado === 'aceptada' || estado === 'activa' || !data.fechaBaja;
          });
          
          coincidencias = recolectarCoincidencias(registrosActivos);
          if (coincidencias.length > 0) {
            console.log('Coincidencias activas encontradas por rutApoderado:', coincidencias.length);
            return coincidencias;
          }
        } catch (errorApoderado) {
          console.warn('Consulta por rutApoderado falló, se intentará con rutHijo:', errorApoderado);
        }

        // Último intento: por rutHijo
        try {
          const porRutSnap = await getDocs(query(listaPasajerosRef, where('rutHijo', '==', rutHijoSeleccionado)));
          
          // Filtrar solo registros activos para este apoderado
          const registrosActivos = porRutSnap.docs.filter((docSnap) => {
            const data = docSnap.data() || {};
            const rutDocApoderado = normalizarRut((data.rutApoderado || '').toString());
            const rutDocUsuario = normalizarRut(rutUsuario);
            if (rutDocApoderado !== rutDocUsuario) return false;
            
            const estado = (data.estado || 'aceptada').toString().toLowerCase();
            return estado === 'aceptada' || estado === 'activa' || !data.fechaBaja;
          });
          
          coincidencias = recolectarCoincidencias(registrosActivos);
          if (coincidencias.length > 0) {
            console.log('Coincidencias activas encontradas por rutHijo:', coincidencias.length);
            return coincidencias;
          }
        } catch (errorRut) {
          console.warn('Consulta por rutHijo falló:', errorRut);
        }

        console.log('No se encontraron inscripciones activas para este hijo');
        return [];
      };

      const coincidenciasLista = await obtenerCoincidenciasListaPasajeros();
      if (coincidenciasLista.length > 0) {
        const detallePatentes = Array.from(patentesRegistradas).join(', ');
        const mensajeExtra = detallePatentes.length > 0 ? ` Actualmente figura en: ${detallePatentes}.` : '';
        console.log('Bloqueando postulación: Hijo ya inscrito activamente');
        mostrarBloqueo(
          `Este hijo ya esta inscrito en un furgon.${mensajeExtra} Comunicate con el tio del furgon para salirse antes de intentar una nueva postulacion.`,
        );
        return;
      }
      
      console.log('No hay inscripciones activas, permitiendo postulación');

      const postulacionesRef = collection(db, 'Postulaciones');
      let postulacionesAceptadasSnap;
      try {
        postulacionesAceptadasSnap = await getDocs(
          query(
            postulacionesRef,
            where('rutHijo', '==', rutHijoSeleccionado),
            where('estado', '==', 'aceptada'),
          ),
        );
      } catch (errorConsultaPostulaciones) {
        console.warn('Consulta combinada Postulaciones falló, se usará búsqueda por rutHijo:', errorConsultaPostulaciones);
        postulacionesAceptadasSnap = await getDocs(query(postulacionesRef, where('rutHijo', '==', rutHijoSeleccionado)));
      }

      const postulacionesAceptadas = postulacionesAceptadasSnap.docs.filter((docSnap) => {
        const data = docSnap.data() || {};
        const estado = (data.estado || '').toString().toLowerCase();
        return estado === 'aceptada' && normalizarRut((data.rutHijo || '').toString()) === objetivoRut;
      });

      if (postulacionesAceptadas.length > 0) {
        mostrarBloqueo(
          'Este hijo ya esta inscrito en un furgon. Comunicate con el tio del furgon para salirse antes de intentar una nueva postulacion.',
        );
        return;
      }

      const timestamp = serverTimestamp();
      const postulacionDoc = await addDoc(collection(db, 'Postulaciones'), {
        rutUsuario,
        rutConductor,
        rutHijo: rutHijoSeleccionado,
        idHijo: hijoSeleccionado,
        idFurgon: furgonIdParam || '',
        patenteFurgon,
        colegio: (params.colegio as string) || '',
        nombreFurgon: (params.nombre as string) || '',
        comuna: (params.comuna as string) || '',
        estado: 'pendiente',
        creadoEn: timestamp,
      });

      const nombreApoderado = await obtenerNombreApoderado();
      
      console.log('Creando alerta de postulación:');
      console.log('- RUT Conductor (destinatario):', rutConductor);
      console.log('- Patente Furgón:', patenteFurgon);
      console.log('- ID Postulación:', postulacionDoc.id);
      console.log('- Nombre Apoderado:', nombreApoderado);
      
      const alertaData = {
        tipoAlerta: 'Postulacion',
        descripcion: (nombreApoderado || 'Un apoderado') + ' esta postulando a tu furgon',
        rutDestinatario: rutConductor,
        rutaDestino: '/chat-validacion',
        parametros: {
          idPostulacion: postulacionDoc.id,
          rutPadre: rutUsuario,
          rutConductor,
          rutHijo: rutHijoSeleccionado,
          patenteFurgon,
        },
        creadoEn: serverTimestamp(),
        leida: false,
        patenteFurgon,
      };
      
      console.log('Datos de la alerta:', JSON.stringify(alertaData, null, 2));
      
      const alertaDoc = await addDoc(collection(db, 'Alertas'), alertaData);
      console.log('✓ Alerta de postulación creada exitosamente con ID:', alertaDoc.id);

      router.push({
        pathname: '/chat-validacion',
        params: { idPostulacion: postulacionDoc.id },
      });
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

      <Text style={styles.label}>Selecciona hijo</Text>
      <View style={styles.pickerContainer}>
        <Picker
          selectedValue={hijoSeleccionado}
          onValueChange={handleSeleccionHijo}
          style={styles.picker}
          enabled={hijos.length > 0}
        >
          <Picker.Item label="Selecciona un hijo..." value="" />
          {hijos.map((hijo) => (
            <Picker.Item
              key={hijo.id}
              label={`${hijo.nombres} ${hijo.apellidos}`}
              value={hijo.id}
            />
          ))}
        </Picker>
      </View>

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
