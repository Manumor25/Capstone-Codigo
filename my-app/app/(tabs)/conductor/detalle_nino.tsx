import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';

interface DatosNino {
  nombres: string;
  apellidos: string;
  fichaMedica?: any;
  rutApoderado?: string;
}

export default function DetalleNinoScreen() {
  const router = useRouter();
  useSyncRutActivo();
  const params = useLocalSearchParams();

  const [datosNino, setDatosNino] = useState<DatosNino | null>(null);
  const [loading, setLoading] = useState(true);
  const [expulsando, setExpulsando] = useState(false);
  const [nombreApoderado, setNombreApoderado] = useState<string>('');
  const [telefonoApoderado, setTelefonoApoderado] = useState<string>('');

  const rutNino = params.rut?.toString() || '';
  const rutApoderadoParam = params.rutApoderado?.toString() || '';
  const rutConductor = params.rutConductor?.toString() || '';
  const listaPasajeroId = params.listaPasajeroId?.toString() || '';
  const nombreFurgonParam = params.nombreFurgon?.toString() || '';
  const patenteFurgonParam = params.patenteFurgon?.toString() || '';

  const [nombreFurgon, setNombreFurgon] = useState(nombreFurgonParam);
  const [patenteFurgonAsignada, setPatenteFurgonAsignada] = useState(patenteFurgonParam);
  const normalizarRut = (rut: string) => rut.replace(/[^0-9kK]/g, '').toUpperCase();

  useEffect(() => {
    const cargarDatos = async () => {
      if (!rutNino) {
        Alert.alert('Error', 'No se recibió el identificador del niño.');
        if (router.canGoBack?.()) {
          router.back();
        } else {
          router.replace('/(tabs)/conductor/pagina-principal-conductor');
        }
        return;
      }

      try {
        const snapshot = await getDoc(doc(db, 'Hijos', rutNino));
        if (!snapshot.exists()) {
          Alert.alert('Error', 'No se encontró la información del niño.');
          if (router.canGoBack?.()) {
            router.back();
          } else {
            router.replace('/(tabs)/conductor/pagina-principal-conductor');
          }
          return;
        }

        const data = snapshot.data() || {};
        const rutApoderadoFinal = data.rutUsuario || data.rutApoderado || rutApoderadoParam;
        setDatosNino({
          nombres: data.nombres || 'Sin nombre',
          apellidos: data.apellidos || '',
          fichaMedica: data.fichaMedica,
          rutApoderado: rutApoderadoFinal,
        });

        // Cargar información del apoderado
        if (rutApoderadoFinal) {
          try {
            const usuariosRef = collection(db, 'usuarios');
            const apoderadoQuery = query(
              usuariosRef,
              where('rut', '==', rutApoderadoFinal.trim()),
              limit(1),
            );
            const apoderadoSnap = await getDocs(apoderadoQuery);
            
            if (!apoderadoSnap.empty) {
              const apoderadoData = apoderadoSnap.docs[0].data();
              const nombres = apoderadoData.nombres || '';
              const apellidos = apoderadoData.apellidos || '';
              const nombreCompleto = `${nombres} ${apellidos}`.trim() || nombres || 'No disponible';
              setNombreApoderado(nombreCompleto);
              setTelefonoApoderado(apoderadoData.telefono || apoderadoData.telefonoContacto || 'No disponible');
            } else {
              setNombreApoderado('No disponible');
              setTelefonoApoderado('No disponible');
            }
          } catch (errorApoderado) {
            console.error('Error al cargar información del apoderado:', errorApoderado);
            setNombreApoderado('No disponible');
            setTelefonoApoderado('No disponible');
          }
        }

        if (!nombreFurgonParam || !patenteFurgonParam || !listaPasajeroId) {
          try {
            let patenteDetectada = patenteFurgonParam;
            if (listaPasajeroId) {
              const listaDoc = await getDoc(doc(db, 'lista_pasajeros', listaPasajeroId));
              if (listaDoc.exists()) {
                const listaData = listaDoc.data() || {};
                const nombreRegistro = (listaData.nombreFurgon || listaData.nombreFurgonAsignado || '').toString();
                if (!nombreFurgonParam && nombreRegistro) {
                  setNombreFurgon(nombreRegistro);
                }
                if (!patenteDetectada) {
                  patenteDetectada = (listaData.patenteFurgon || '').toString();
                }
                if (!patenteFurgonParam && patenteDetectada) {
                  setPatenteFurgonAsignada(patenteDetectada);
                }
              }
            }
            if (!nombreFurgonParam && patenteDetectada) {
              const furgonQuery = query(
                collection(db, 'Furgones'),
                where('patente', '==', patenteDetectada),
                limit(1),
              );
              const furgonSnap = await getDocs(furgonQuery);
              if (!furgonSnap.empty) {
                const dataFurgon = furgonSnap.docs[0].data() || {};
                const nombreDoc = (dataFurgon.nombre || dataFurgon.alias || '').toString();
                if (nombreDoc) {
                  setNombreFurgon(nombreDoc);
                }
              }
            }
          } catch (errorFurgon) {
            console.error('No se pudo obtener la información del furgón asignado:', errorFurgon);
          }
        }
      } catch (error) {
        console.error('Error al cargar la información del niño:', error);
        Alert.alert('Error', 'No se pudo cargar la información del niño.');
        if (router.canGoBack?.()) {
          router.back();
        } else {
          router.replace('/(tabs)/conductor/pagina-principal-conductor');
        }
      } finally {
        setLoading(false);
      }
    };

    cargarDatos();
  }, [rutNino, router, rutApoderadoParam, nombreFurgonParam, patenteFurgonParam, listaPasajeroId]);

  const manejarVerFichaMedica = () => {
    if (!rutNino) {
      Alert.alert('Error', 'No se pudo identificar al niño.');
      return;
    }

    // Navegar a la página de visualización de ficha médica
    router.push({
      pathname: '/(tabs)/apoderado/Ver-ficha-medica',
      params: { id: rutNino },
    });
  };

  const expulsarNino = async () => {
    if (!rutNino) {
      Alert.alert('Error', 'No se pudo identificar el RUT del niño.');
      return;
    }
    setExpulsando(true);
    try {
      const coleccionesPasajeros = ['lista_pasajeros', 'Lista_pasajeros', 'Lista_Pasajeros', 'ListaPasajeros'];
      let eliminados = 0;
      console.log('Intentando expulsar al niño con RUT:', rutNino, 'colecciones:', coleccionesPasajeros);

      if (listaPasajeroId) {
        try {
          await deleteDoc(doc(db, 'lista_pasajeros', listaPasajeroId));
          eliminados += 1;
        } catch (errorID) {
          console.warn('No se encontró el documento en lista_pasajeros por ID, se continuará con la búsqueda por RUT:', errorID);
        }
        try {
          await deleteDoc(doc(db, 'Lista_pasajeros', listaPasajeroId));
          eliminados += 1;
        } catch (errorIDAlt) {
          console.warn('No se encontró el documento en Lista_pasajeros por ID, se continuará con la búsqueda por RUT:', errorIDAlt);
        }
      }

      const rutOriginal = rutNino.trim();
      const rutNormalizado = normalizarRut(rutOriginal);
      for (const nombreColeccion of coleccionesPasajeros) {
        const pasajerosRef = collection(db, nombreColeccion);
        const referenciasEliminar = new Map<string, any>();
        console.log(`Buscando registros en ${nombreColeccion} para RUT ${rutOriginal} / ${rutNormalizado}`);

        const consultas = [
          query(pasajerosRef, where('rutHijo', '==', rutOriginal)),
        ];
        if (rutNormalizado && rutNormalizado !== rutOriginal) {
          consultas.push(query(pasajerosRef, where('rutHijo', '==', rutNormalizado)));
        }

        for (const consulta of consultas) {
          try {
            const snapshot = await getDocs(consulta);
            snapshot.forEach((docSnap) => {
              referenciasEliminar.set(docSnap.id, docSnap.ref);
            });
          } catch (errorConsulta) {
            console.warn(`No se pudo consultar ${nombreColeccion} para expulsar al niño:`, errorConsulta);
          }
        }

        if (referenciasEliminar.size === 0) {
          try {
            const todosSnap = await getDocs(pasajerosRef);
            todosSnap.forEach((docSnap) => {
              const data = docSnap.data() || {};
              const rutDocumento = normalizarRut((data.rutHijo || '').toString());
              if (rutDocumento && rutDocumento === rutNormalizado) {
                referenciasEliminar.set(docSnap.id, docSnap.ref);
              }
            });
          } catch (errorListado) {
            console.warn(`No se pudo obtener todos los documentos de ${nombreColeccion}:`, errorListado);
          }
        }

        if (referenciasEliminar.size > 0) {
          await Promise.all(Array.from(referenciasEliminar.values()).map((ref) => deleteDoc(ref)));
          eliminados += referenciasEliminar.size;
          console.log(`Expulsión: se eliminaron ${referenciasEliminar.size} registros de ${nombreColeccion} para el RUT ${rutOriginal}`);
        }
      }

      if (eliminados === 0) {
        Alert.alert('Sin registro', 'No se encontraron registros activos para este niño en la lista de pasajeros.');
        return;
      }

      console.log('Expulsión completada. Total de documentos eliminados:', eliminados);
      Alert.alert('Niño expulsado', `El niño fue removido del furgón. Registros eliminados: ${eliminados}.`, [
        {
          text: 'Aceptar',
          onPress: () => {
            if (router.canGoBack?.()) {
              router.back();
            } else {
              router.replace('/(tabs)/conductor/pagina-principal-conductor');
            }
          },
        },
      ]);
    } catch (error) {
      console.error('Error al expulsar al niño:', error);
      Alert.alert('Error', 'No se pudo expulsar al niño. Intenta nuevamente.');
    } finally {
      setExpulsando(false);
    }
  };

  const confirmarExpulsion = () => {
    if (!rutNino) {
      Alert.alert('Error', 'No se pudo identificar al niño a expulsar.');
      return;
    }
    Alert.alert(
      'Expulsar niño',
      '¿Seguro que deseas expulsar a este niño del furgón?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Expulsar',
          style: 'destructive',
          onPress: expulsarNino,
        },
      ],
    );
  };

  const manejarContactarApoderado = async () => {
    if (!rutConductor || !datosNino?.rutApoderado || !rutNino) {
      Alert.alert('Error', 'No se dispone de los datos necesarios para abrir el chat.');
      return;
    }

    try {
      const nombreNino = `${datosNino.nombres || ''} ${datosNino.apellidos || ''}`.trim() || datosNino.nombres || 'el estudiante';
      const chatsUrgenciaRef = collection(db, 'ChatsUrgencia');
      const chatExistenteQuery = query(
        chatsUrgenciaRef,
        where('rutConductor', '==', rutConductor),
        where('rutApoderado', '==', datosNino.rutApoderado),
        where('rutHijo', '==', rutNino),
      );
      const chatSnapshot = await getDocs(chatExistenteQuery);

      let idPostulacion = chatSnapshot.empty ? '' : chatSnapshot.docs[0].id;

      if (!idPostulacion) {
        const nuevaPostulacion = await addDoc(chatsUrgenciaRef, {
          rutConductor,
          rutApoderado: datosNino.rutApoderado,
          rutHijo: rutNino,
          idHijo: rutNino,
          nombreHijo: nombreNino,
          estado: 'abierta',
          creadoEn: serverTimestamp(),
        });
        idPostulacion = nuevaPostulacion.id;
      }

      let patenteFurgon = patenteFurgonAsignada;
      try {
        if (!patenteFurgon) {
          const listaPasajerosRef = collection(db, 'lista_pasajeros');
          const listaQuery = query(
            listaPasajerosRef,
            where('rutConductor', '==', rutConductor),
            where('rutHijo', '==', rutNino),
            limit(1),
          );
          const listaSnap = await getDocs(listaQuery);
          if (!listaSnap.empty) {
            const dataLista = listaSnap.docs[0].data() || {};
            patenteFurgon = (dataLista.patenteFurgon || '').toString();
            if (!patenteFurgonAsignada && patenteFurgon) {
              setPatenteFurgonAsignada(patenteFurgon);
            }
            const nombreRegistro = (dataLista.nombreFurgon || dataLista.nombreFurgonAsignado || '').toString();
            if (!nombreFurgon && nombreRegistro) {
              setNombreFurgon(nombreRegistro);
            }
          }
        }
      } catch (errorPatente) {
        console.error('No se pudo obtener la patente del furgon para la alerta de urgencia:', errorPatente);
      }

      await addDoc(collection(db, 'Alertas'), {
        tipoAlerta: 'Urgencia',
        descripcion: `Problema urgente con su hijo ${nombreNino}`,
        rutDestinatario: datosNino.rutApoderado,
        rutaDestino: '/chat-urgencia',
        parametros: {
          idPostulacion,
          rutPadre: datosNino.rutApoderado,
          rutConductor,
          rutHijo: rutNino,
          patenteFurgon,
        },
        creadoEn: serverTimestamp(),
        leida: false,
        patenteFurgon,
      });
      Alert.alert('Notificación enviada', 'El apoderado recibirá una alerta de urgencia.');

      router.push({
        pathname: '/chat-urgencia',
        params: {
          idPostulacion,
          rutPadre: datosNino.rutApoderado,
          rutConductor,
          rutHijo: rutNino,
        },
      });
    } catch (error) {
      console.error('Error al registrar la alerta de contacto:', error);
      Alert.alert('Error', 'No se pudo registrar la alerta de urgencia.');
      return;
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#127067" />
        <Text style={styles.loadingText}>Cargando información del niño...</Text>
      </View>
    );
  }

  if (!datosNino) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="alert-circle-outline" size={48} color="#999" />
        <Text style={styles.loadingText}>No se pudo mostrar la información del niño.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.backButton}
        onPress={() => {
          if (router.canGoBack?.()) {
            router.back();
          } else {
            router.replace('/(tabs)/conductor/pagina-principal-conductor');
          }
        }}
      >
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      <View style={styles.infoCard}>
        <Text style={styles.name}>{`${datosNino.nombres} ${datosNino.apellidos}`}</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>RUT apoderado:</Text>
          <Text style={styles.infoValue}>{datosNino.rutApoderado || 'No disponible'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Nombre apoderado:</Text>
          <Text style={styles.infoValue}>{nombreApoderado || 'Cargando...'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Teléfono apoderado:</Text>
          <Text style={styles.infoValue}>{telefonoApoderado || 'Cargando...'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Furgon Asignado:</Text>
          <Text style={styles.infoValue}>{nombreFurgon || 'Sin nombre asignado'}</Text>
        </View>
      </View>

      <Pressable style={styles.actionButton} onPress={manejarVerFichaMedica}>
        <Text style={styles.actionText}>Ver Ficha médica</Text>
      </Pressable>

      <Pressable style={styles.actionButton} onPress={manejarContactarApoderado}>
        <Text style={styles.actionText}>Contactar Apoderado</Text>
      </Pressable>

      <Pressable
        style={[styles.actionButton, styles.dangerButton, expulsando && styles.buttonDisabled]}
        onPress={confirmarExpulsion}
        disabled={expulsando}
      >
        <Text style={styles.dangerText}>{expulsando ? 'Expulsando...' : 'Expulsar niño'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingTop: 80,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    padding: 5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
    fontSize: 16,
    textAlign: 'center',
  },
  infoCard: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#D5E6E4',
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 24,
    alignItems: 'flex-start',
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#127067',
    marginBottom: 4,
  },
  infoRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  infoLabel: {
    fontSize: 15,
    color: '#4F5B5A',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 15,
    color: '#333',
    flexShrink: 1,
    textAlign: 'right',
  },
  actionButton: {
    backgroundColor: '#127067',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 24,
    alignItems: 'center',
    width: '100%',
    marginBottom: 16,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: '#a94442',
    marginTop: 8,
  },
  dangerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
