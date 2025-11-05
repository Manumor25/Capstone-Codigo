import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CryptoJS from 'crypto-js';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, TouchableHighlight, View } from 'react-native';

import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { makeShadow } from '@/utils/shadow';

interface Furgon {
  id: string;
  nombre: string;
  colegio: string;
  comuna: string;
  precio: string;
  patente: string;
  rutConductor: string;
  fotoBase64?: string;
  fotoMimeType?: string;
}

const ENCRYPTION_SALT = 'VEHICULO_IMG_V1';

interface InscripcionActual {
  id: string;
  patenteFurgon: string;
  nombreFurgon: string;
  nombreHijo: string;
  rutHijo: string;
}

export default function ListaFurgonesScreen() {
  const router = useRouter();
  useSyncRutActivo();

  const [furgones, setFurgones] = useState<Furgon[]>([]);
  const [loading, setLoading] = useState(true);
  const [comunaFiltro, setComunaFiltro] = useState('');
  const [inscripcionActual, setInscripcionActual] = useState<InscripcionActual | null>(null);
  const [cargandoInscripcion, setCargandoInscripcion] = useState(true);
  const [dandoseDeBaja, setDandoseDeBaja] = useState(false);
  
  // Estados para modal personalizado
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTipo, setModalTipo] = useState<'confirmacion' | 'advertencia' | 'exito' | 'error'>('confirmacion');
  const [modalTitulo, setModalTitulo] = useState('');
  const [modalMensaje, setModalMensaje] = useState('');
  const modalCallbackRef = useRef<(() => void) | null>(null);
  const isConfirmingRef = useRef(false);

  useEffect(() => {
    const cargarInscripcionActual = async () => {
      try {
        const rutApoderado = await AsyncStorage.getItem('rutUsuario');
        if (!rutApoderado) {
          setCargandoInscripcion(false);
          return;
        }

        const listaPasajerosRef = collection(db, 'lista_pasajeros');
        const inscripcionQuery = query(
          listaPasajerosRef,
          where('rutApoderado', '==', rutApoderado)
        );
        const inscripcionSnapshot = await getDocs(inscripcionQuery);

        if (!inscripcionSnapshot.empty) {
          const inscripcion = inscripcionSnapshot.docs[0];
          const data = inscripcion.data();
          
          // Obtener información del furgón
          const furgonId = data.idFurgon || '';
          let nombreFurgon = data.nombreFurgon || data.nombreFurgonAsignado || 'Furgón';
          
          if (furgonId) {
            try {
              const furgonDocRef = doc(db, 'Furgones', furgonId);
              const furgonDoc = await getDoc(furgonDocRef);
              if (furgonDoc.exists()) {
                const furgonData = furgonDoc.data();
                nombreFurgon = furgonData.nombre || nombreFurgon;
              }
            } catch (error) {
              console.log('No se pudo obtener el nombre del furgón:', error);
            }
          }

          setInscripcionActual({
            id: inscripcion.id,
            patenteFurgon: data.patenteFurgon || '',
            nombreFurgon: nombreFurgon,
            nombreHijo: data.nombreHijo || '',
            rutHijo: data.rutHijo || '',
          });
        }
      } catch (error) {
        console.error('Error al cargar inscripción actual:', error);
      } finally {
        setCargandoInscripcion(false);
      }
    };

    cargarInscripcionActual();
  }, []);

  useEffect(() => {
    const cargarFurgones = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'Furgones'));
        const lista: Furgon[] = await Promise.all(snapshot.docs.map(async (docSnap) => {
          const data = docSnap.data() || {};

          let fotoBase64: string | undefined;
          let fotoMimeType: string | undefined;

          if (data.fotoCifrada && data.rutUsuario) {
            try {
              const clave = `${data.rutUsuario}-${ENCRYPTION_SALT}`;
              const bytes = CryptoJS.AES.decrypt(data.fotoCifrada, clave);
              const decodificado = bytes.toString(CryptoJS.enc.Utf8);
              if (decodificado) {
                fotoBase64 = decodificado;
                fotoMimeType = data.fotoMimeType || 'image/jpeg';
              }
            } catch (error) {
              console.warn('No se pudo descifrar la imagen del furgón:', error);
            }
          }

          if (!fotoBase64 && data.patente) {
            try {
              const vehiculosSnap = await getDocs(
                query(collection(db, 'Vehiculos'), where('patente', '==', data.patente), limit(1)),
              );
              if (!vehiculosSnap.empty) {
                const vehiculoData = vehiculosSnap.docs[0].data() || {};
                if (vehiculoData.fotoCifrada) {
                  const rutReferencia = vehiculoData.rutUsuario || data.rutUsuario || '';
                  if (rutReferencia) {
                    const claveVehiculo = `${rutReferencia}-${ENCRYPTION_SALT}`;
                    const bytesVehiculo = CryptoJS.AES.decrypt(vehiculoData.fotoCifrada, claveVehiculo);
                    const base64Vehiculo = bytesVehiculo.toString(CryptoJS.enc.Utf8);
                    if (base64Vehiculo) {
                      fotoBase64 = base64Vehiculo;
                      fotoMimeType = vehiculoData.fotoMimeType || 'image/jpeg';
                    }
                  }
                }
              }
            } catch (error) {
              console.warn('No se pudo obtener la imagen desde Vehiculos para la patente:', data.patente, error);
            }
          }

          return {
            id: docSnap.id,
            nombre: data.nombre || 'Sin nombre',
            colegio: data.colegio || 'Sin colegio',
            comuna: data.comuna || 'Sin comuna',
            precio: data.precio || 'No definido',
            patente: data.patente || '',
            rutConductor: data.rutUsuario || '',
            fotoBase64,
            fotoMimeType,
          };
        }));

        setFurgones(lista);
      } catch (error) {
        console.error('Error al cargar furgones:', error);
        Alert.alert('Error', 'No se pudieron cargar los furgones.');
      } finally {
        setLoading(false);
      }
    };

    cargarFurgones();
  }, []);

  const furgonesFiltrados = useMemo(
    () =>
      furgones.filter((f) =>
        comunaFiltro === '' ? true : f.comuna.toLowerCase().includes(comunaFiltro.toLowerCase()),
      ),
    [furgones, comunaFiltro],
  );

  const handleInscribirFurgon = (furgon: Furgon) => {
    router.push({
      pathname: '/(tabs)/apoderado/inscribir-furgon',
      params: {
        id: furgon.id,
        nombre: furgon.nombre,
        colegio: furgon.colegio,
        comuna: furgon.comuna,
        precio: furgon.precio,
        patente: furgon.patente,
        rutConductor: furgon.rutConductor,
      },
    });
  };

  const handleVolver = () => {
    if (router.canGoBack?.()) {
      router.back();
    } else {
      router.replace('/(tabs)/apoderado/pagina-principal-apoderado');
    }
  };

  const mostrarModal = (
    tipo: 'confirmacion' | 'advertencia' | 'exito' | 'error',
    titulo: string,
    mensaje: string,
    onConfirm?: () => void
  ) => {
    modalCallbackRef.current = onConfirm || null;
    isConfirmingRef.current = false;
    
    if (modalVisible) {
      setModalVisible(false);
      setTimeout(() => {
        setModalTipo(tipo);
        setModalTitulo(titulo);
        setModalMensaje(mensaje);
        setModalVisible(true);
      }, 150);
    } else {
      setModalTipo(tipo);
      setModalTitulo(titulo);
      setModalMensaje(mensaje);
      setModalVisible(true);
    }
  };

  const cerrarModal = () => {
    setModalVisible(false);
    modalCallbackRef.current = null;
    isConfirmingRef.current = false;
  };

  const confirmarModal = async () => {
    if (isConfirmingRef.current) {
      return;
    }
    
    isConfirmingRef.current = true;
    const callback = modalCallbackRef.current;
    
    if (!callback) {
      isConfirmingRef.current = false;
      cerrarModal();
      return;
    }
    
    setModalVisible(false);
    modalCallbackRef.current = null;
    
    setTimeout(async () => {
      try {
        await callback();
      } catch (error) {
        console.error('Error al ejecutar callback del modal:', error);
      } finally {
        isConfirmingRef.current = false;
      }
    }, 200);
  };

  const handleDarseDeBaja = async () => {
    if (!inscripcionActual) return;

    const mensajeConfirmacion = `¿Estás seguro de que deseas darte de baja del furgón "${inscripcionActual.nombreFurgon}"?\n\nPatente: ${inscripcionActual.patenteFurgon}\nHijo: ${inscripcionActual.nombreHijo}\n\nEsta acción eliminará tu inscripción y no se puede deshacer.`;

    // Usar modal personalizado en lugar de Alert
    mostrarModal(
      'confirmacion',
      'Confirmar darse de baja',
      mensajeConfirmacion,
      async () => {
        await procesarBaja();
      }
    );
  };

  const procesarBaja = async () => {
    if (!inscripcionActual) return;

    try {
      setDandoseDeBaja(true);
      
      // Guardar el nombre del furgón antes de eliminarlo
      const nombreFurgonEliminado = inscripcionActual.nombreFurgon;
      const inscripcionId = inscripcionActual.id;
      const patenteFurgon = inscripcionActual.patenteFurgon;
      const nombreHijo = inscripcionActual.nombreHijo;
      const rutHijo = inscripcionActual.rutHijo;
      
      console.log('Iniciando proceso de baja:');
      console.log('- ID inscripción:', inscripcionId);
      console.log('- Patente furgón:', patenteFurgon);
      console.log('- Nombre hijo:', nombreHijo);
      console.log('- RUT hijo:', rutHijo);
      
      // Eliminar el registro de lista_pasajeros
      // Esto automáticamente elimina al niño de la lista del conductor,
      // ya que el conductor carga su lista desde esta misma colección
      const inscripcionRef = doc(db, 'lista_pasajeros', inscripcionId);
      
      // Verificar que el documento existe antes de eliminarlo
      const inscripcionDoc = await getDoc(inscripcionRef);
      if (!inscripcionDoc.exists()) {
        console.warn('El documento de inscripción no existe, puede que ya haya sido eliminado');
        mostrarModal(
          'advertencia',
          'Advertencia',
          'La inscripción ya no existe en el sistema.',
          () => {
            setInscripcionActual(null);
          }
        );
        return;
      }
      
      console.log('Eliminando documento de lista_pasajeros...');
      await deleteDoc(inscripcionRef);
      console.log('✓ Documento eliminado exitosamente de lista_pasajeros');
      console.log('✓ El niño será eliminado automáticamente de la lista del conductor');

      // Buscar y eliminar TODOS los registros relacionados con este hijo y apoderado
      // por si hay duplicados o registros antiguos
      try {
        const rutApoderado = await AsyncStorage.getItem('rutUsuario');
        if (rutApoderado) {
          const listaPasajerosRef = collection(db, 'lista_pasajeros');
          const todasLasInscripcionesQuery = query(
            listaPasajerosRef,
            where('rutHijo', '==', rutHijo),
            where('rutApoderado', '==', rutApoderado)
          );
          const todasLasInscripcionesSnap = await getDocs(todasLasInscripcionesQuery);
          
          if (!todasLasInscripcionesSnap.empty) {
            console.log(`Encontrados ${todasLasInscripcionesSnap.docs.length} registro(s) adicional(es) para eliminar`);
            await Promise.all(
              todasLasInscripcionesSnap.docs.map(async (docSnap) => {
                if (docSnap.id !== inscripcionId) {
                  await deleteDoc(docSnap.ref);
                  console.log(`✓ Registro adicional eliminado: ${docSnap.id}`);
                }
              })
            );
          }
        }
      } catch (errorEliminacionAdicional) {
        console.error('Error al eliminar registros adicionales:', errorEliminacionAdicional);
        // No bloquear el proceso si falla la eliminación adicional
      }

      // Actualizar TODAS las postulaciones relacionadas (aceptadas, pendientes, etc.) para permitir nuevas postulaciones
      try {
        const rutApoderado = await AsyncStorage.getItem('rutUsuario');
        if (rutApoderado) {
          const postulacionesRef = collection(db, 'Postulaciones');
          
          // Buscar todas las postulaciones relacionadas con este hijo y apoderado (sin filtrar por estado)
          const todasLasPostulacionesQuery = query(
            postulacionesRef,
            where('rutHijo', '==', rutHijo),
            where('rutUsuario', '==', rutApoderado)
          );
          const todasLasPostulacionesSnap = await getDocs(todasLasPostulacionesQuery);
          
          if (!todasLasPostulacionesSnap.empty) {
            console.log(`Encontradas ${todasLasPostulacionesSnap.docs.length} postulación(es) relacionada(s) para actualizar`);
            
            // Actualizar TODAS las postulaciones a estado 'baja' para permitir nuevas postulaciones
            await Promise.all(
              todasLasPostulacionesSnap.docs.map(async (postulacionDoc) => {
                const data = postulacionDoc.data();
                const estadoActual = (data.estado || '').toString().toLowerCase();
                
                // Solo actualizar si no está ya en estado 'baja' o 'cancelada'
                if (estadoActual !== 'baja' && estadoActual !== 'cancelada') {
                  await updateDoc(postulacionDoc.ref, {
                    estado: 'baja',
                    fechaBaja: new Date().toISOString(),
                  });
                  console.log(`✓ Postulación ${postulacionDoc.id} (estado anterior: ${estadoActual}) actualizada a estado 'baja'`);
                } else {
                  console.log(`✓ Postulación ${postulacionDoc.id} ya estaba en estado '${estadoActual}', no se actualiza`);
                }
              })
            );
            console.log('✓ Todas las postulaciones relacionadas han sido actualizadas');
          } else {
            console.log('No se encontraron postulaciones relacionadas para actualizar');
          }
        }
      } catch (errorPostulaciones) {
        console.error('Error al actualizar postulaciones:', errorPostulaciones);
        // No bloquear el proceso si falla la actualización de postulaciones
        // El usuario ya se dio de baja exitosamente
      }

      // Actualizar el estado local
      setInscripcionActual(null);

      const mensajeExito = `Te has dado de baja exitosamente del furgón "${nombreFurgonEliminado}".`;
      
      // Mostrar modal de éxito
      mostrarModal(
        'exito',
        'Éxito',
        mensajeExito,
        () => {
          // Redirigir a la página principal después de cerrar el modal
          router.replace('/(tabs)/apoderado/pagina-principal-apoderado');
        }
      );
    } catch (error) {
      console.error('Error al darse de baja:', error);
      const mensajeError = 'No se pudo completar la baja. Por favor, intenta nuevamente.';
      
      // Mostrar modal de error
      mostrarModal(
        'error',
        'Error',
        mensajeError
      );
    } finally {
      setDandoseDeBaja(false);
    }
  };

  const renderItem = ({ item }: { item: Furgon }) => (
    <Pressable style={styles.card} onPress={() => handleInscribirFurgon(item)}>
      <View style={styles.cardImageWrapper}>
        {item.fotoBase64 ? (
          <Image
            source={{ uri: `data:${item.fotoMimeType || 'image/jpeg'};base64,${item.fotoBase64}` }}
            style={styles.cardImage}
            contentFit="cover"
          />
        ) : (
          <Ionicons name="image-outline" size={28} color="#7f8c8d" />
        )}
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle}>{item.nombre}</Text>
        <Text style={styles.cardSubtitle}>{item.colegio}</Text>
      </View>
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <Pressable style={styles.backButton} onPress={handleVolver}>
        <Ionicons name="arrow-back" size={26} color="#127067" />
      </Pressable>

      <TextInput
        style={styles.searchInput}
        placeholder="Comuna"
        placeholderTextColor="#127067"
        value={comunaFiltro}
        onChangeText={setComunaFiltro}
      />

      {/* Botón de darse de baja si está inscrito */}
      {!cargandoInscripcion && inscripcionActual && (
        <View style={styles.unsubscribeSection}>
          <View style={styles.unsubscribeCard}>
            <View style={styles.unsubscribeInfo}>
              <Ionicons name="bus-outline" size={24} color="#127067" />
              <View style={styles.unsubscribeTextContainer}>
                <Text style={styles.unsubscribeTitle}>Inscrito actualmente</Text>
                <Text style={styles.unsubscribeSubtitle}>
                  {inscripcionActual.nombreFurgon} - {inscripcionActual.patenteFurgon}
                </Text>
                <Text style={styles.unsubscribeHijo}>Hijo: {inscripcionActual.nombreHijo}</Text>
              </View>
            </View>
            <TouchableHighlight
              style={[styles.unsubscribeButton, dandoseDeBaja && styles.unsubscribeButtonDisabled]}
              underlayColor="#b71c1c"
              onPress={(e) => {
                e?.stopPropagation();
                console.log('Botón Darse de baja presionado');
                if (!dandoseDeBaja && inscripcionActual) {
                  handleDarseDeBaja();
                }
              }}
              disabled={dandoseDeBaja || !inscripcionActual}
            >
              {dandoseDeBaja ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.unsubscribeButtonText}>Darse de baja</Text>
              )}
            </TouchableHighlight>
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#127067" />
          <Text style={styles.loadingText}>Cargando furgones...</Text>
        </View>
      ) : furgonesFiltrados.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="sad-outline" size={60} color="#999999" />
          <Text style={styles.emptyText}>No hay furgones disponibles</Text>
        </View>
      ) : (
        <FlatList
          data={furgonesFiltrados}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Modal personalizado */}
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent
        onRequestClose={cerrarModal}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={(e) => {
            e.stopPropagation();
            cerrarModal();
          }}
        >
          <Pressable 
            style={styles.modalCard}
            onPress={(e) => {
              e.stopPropagation();
            }}
          >
            {modalTipo === 'confirmacion' && (
              <Ionicons name="help-circle" size={48} color="#127067" style={styles.modalIcon} />
            )}
            {modalTipo === 'advertencia' && (
              <Ionicons name="warning" size={48} color="#f39c12" style={styles.modalIcon} />
            )}
            {modalTipo === 'exito' && (
              <Ionicons name="checkmark-circle" size={48} color="#127067" style={styles.modalIcon} />
            )}
            {modalTipo === 'error' && (
              <Ionicons name="close-circle" size={48} color="#d32f2f" style={styles.modalIcon} />
            )}
            
            <Text style={styles.modalTitle}>{modalTitulo}</Text>
            <Text style={styles.modalMessage}>{modalMensaje}</Text>
            
            <View style={styles.modalButtonsContainer}>
              {(modalTipo === 'confirmacion' || modalTipo === 'advertencia') && (
                <>
                  <TouchableHighlight
                    style={styles.modalButtonCancel}
                    underlayColor="#e0e0e0"
                    onPress={(e) => {
                      e.stopPropagation();
                      cerrarModal();
                    }}
                  >
                    <Text style={styles.modalButtonCancelText}>Cancelar</Text>
                  </TouchableHighlight>
                  <TouchableHighlight
                    style={styles.modalButtonConfirm}
                    underlayColor={modalTipo === 'advertencia' ? '#b71c1c' : '#0e5b52'}
                    onPress={(e) => {
                      e.stopPropagation();
                      confirmarModal();
                    }}
                  >
                    <Text style={styles.modalButtonConfirmText}>
                      {modalTipo === 'advertencia' ? 'Darse de baja de todas formas' : 'Darse de baja'}
                    </Text>
                  </TouchableHighlight>
                </>
              )}
              {(modalTipo === 'exito' || modalTipo === 'error') && (
                <TouchableHighlight
                  style={styles.modalButtonOK}
                  underlayColor={modalTipo === 'error' ? '#b71c1c' : '#0e5b52'}
                  onPress={(e) => {
                    e.stopPropagation();
                    if (modalTipo === 'exito' && modalCallbackRef.current) {
                      modalCallbackRef.current();
                    }
                    cerrarModal();
                  }}
                >
                  <Text style={styles.modalButtonOKText}>Entendido</Text>
                </TouchableHighlight>
              )}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 80,
  },
  backButton: {
    position: 'absolute',
    top: 36,
    left: 20,
    padding: 6,
    zIndex: 10,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#127067',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 18,
    color: '#127067',
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#666666',
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 8,
    color: '#777777',
    fontSize: 16,
  },
  listContent: {
    paddingBottom: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 14,
    marginVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: '#E4ECEC',
    elevation: 2,
    ...makeShadow(
      '0 4px 8px rgba(0,0,0,0.08)',
      {
        shadowColor: '#000000',
        shadowOpacity: 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      },
    ),
  },
  cardImageWrapper: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#EFEFEF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardInfo: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#127067',
  },
  cardSubtitle: {
    fontSize: 14,
    color: '#4F5B5A',
    marginTop: 2,
  },
  unsubscribeSection: {
    marginBottom: 16,
  },
  unsubscribeCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#d32f2f',
    ...makeShadow(
      '0 4px 8px rgba(0,0,0,0.08)',
      {
        shadowColor: '#000000',
        shadowOpacity: 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
      },
    ),
  },
  unsubscribeInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  unsubscribeTextContainer: {
    flex: 1,
  },
  unsubscribeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  unsubscribeSubtitle: {
    fontSize: 14,
    color: '#127067',
    fontWeight: '500',
    marginBottom: 2,
  },
  unsubscribeHijo: {
    fontSize: 13,
    color: '#666',
  },
  unsubscribeButton: {
    backgroundColor: '#d32f2f',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unsubscribeButtonDisabled: {
    opacity: 0.6,
  },
  unsubscribeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      },
    ),
  },
  modalIcon: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 16,
    color: '#555',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalButtonCancel: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  modalButtonCancelText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '500',
  },
  modalButtonConfirm: {
    flex: 1,
    backgroundColor: '#127067',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  modalButtonOK: {
    width: '100%',
    backgroundColor: '#127067',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonOKText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
});
