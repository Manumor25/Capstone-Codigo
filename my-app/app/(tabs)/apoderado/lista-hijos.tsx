import React, { useEffect, useState, useCallback, useRef } from 'react';
import { makeShadow } from '@/utils/shadow';
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Pressable,
  Platform,
  TouchableHighlight,
  Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { db } from '@/firebaseConfig';
import { collection, getDocs, query, where, doc, deleteDoc } from 'firebase/firestore';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import NotificacionesGlobales from '../../../components/NotificacionesGlobales';

interface Hijo {
  id: string;
  nombres: string;
  apellidos: string;
  rut: string;
  edad: number | string;
  fechaNacimiento: string;
}

export default function ListaHijosScreen() {
  const router = useRouter();
  useSyncRutActivo();
  const [rutUsuario, setRutUsuario] = useState<string>('');
  const [hijos, setHijos] = useState<Hijo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [borrandoId, setBorrandoId] = useState<string | null>(null);
  const [patentesAsignadas, setPatentesAsignadas] = useState<string[]>([]);
  const [tieneInscripcion, setTieneInscripcion] = useState<boolean>(false);
  
  // Estados para modales personalizados
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTipo, setModalTipo] = useState<'confirmacion' | 'advertencia' | 'exito' | 'error'>('confirmacion');
  const [modalTitulo, setModalTitulo] = useState('');
  const [modalMensaje, setModalMensaje] = useState('');
  const [modalOnConfirm, setModalOnConfirm] = useState<(() => void) | null>(null);
  const [hijoAEliminar, setHijoAEliminar] = useState<Hijo | null>(null);
  const [numeroFurgones, setNumeroFurgones] = useState(0);
  
  // Usar useRef para evitar que el callback se ejecute automáticamente
  const modalCallbackRef = useRef<(() => void) | null>(null);
  const isConfirmingRef = useRef(false);

  const normalizarRut = (rut: string): string => {
    return rut.replace(/[^0-9kK]/g, '').toUpperCase();
  };

  const cargarHijos = useCallback(async () => {
    try {
      const rutGuardado = await AsyncStorage.getItem('rutUsuario');

      if (!rutGuardado) {
        Alert.alert('Error', 'No se encontró el RUT del usuario activo.');
        setLoading(false);
        return;
      }

      setRutUsuario(rutGuardado);

      // Normalizar el RUT del usuario para comparación
      const rutUsuarioNormalizado = normalizarRut(rutGuardado);
      const rutUsuarioTrim = rutGuardado.trim();

      const hijosRef = collection(db, 'Hijos');
      const q = query(hijosRef, where('rutUsuario', '==', rutUsuarioTrim));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setHijos([]);
      } else {
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
          }));
        
        console.log('Hijos cargados para usuario:', {
          rutUsuario: rutUsuarioTrim,
          rutUsuarioNormalizado,
          totalHijosEnDB: querySnapshot.docs.length,
          hijosFiltrados: listaHijos.length,
        });
        
        setHijos(listaHijos);
        
        // Cargar patentes asignadas para las notificaciones
        try {
          const listaPasajerosRef = collection(db, 'lista_pasajeros');
          const pasajerosQuery = query(listaPasajerosRef, where('rutApoderado', '==', rutUsuarioTrim));
          const pasajerosSnapshot = await getDocs(pasajerosQuery);
          
          const patentesSet = new Set<string>();
          pasajerosSnapshot.docs.forEach((docSnap) => {
            const data = docSnap.data();
            const patente = (data.patenteFurgon || '').toString().trim().toUpperCase();
            if (patente) {
              patentesSet.add(patente);
            }
          });
          
          setPatentesAsignadas(Array.from(patentesSet));
          setTieneInscripcion(patentesSet.size > 0);
        } catch (error) {
          console.error('Error al cargar patentes:', error);
        }
      }
    } catch (error) {
      console.error('Error al cargar hijos:', error);
      Alert.alert('Error', 'No se pudieron cargar los hijos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarHijos();
  }, [cargarHijos]);

  // Recargar cuando la pantalla obtiene el foco
  useFocusEffect(
    useCallback(() => {
      cargarHijos();
    }, [cargarHijos])
  );

  const handleEditarHijo = (hijo: Hijo) => {
    router.push({
      pathname: '/(tabs)/apoderado/Editar_hijo',
      params: { 
        id: hijo.id,
        nombres: hijo.nombres,
        apellidos: hijo.apellidos,
        rut: hijo.rut,
        fechaNacimiento: hijo.fechaNacimiento,
        edad: hijo.edad.toString()
      }
    });
  };

  const handleVerFichaMedica = (hijo: Hijo) => {
    router.push({
      pathname: '/(tabs)/apoderado/Ver-ficha-medica',
      params: { id: hijo.id },
    });
  };

  const mostrarModal = (
    tipo: 'confirmacion' | 'advertencia' | 'exito' | 'error',
    titulo: string,
    mensaje: string,
    onConfirm?: () => void
  ) => {
    console.log('mostrarModal llamado, tipo:', tipo);
    
    // Guardar el callback en el ref para evitar ejecución automática
    modalCallbackRef.current = onConfirm || null;
    isConfirmingRef.current = false;
    
    // Cerrar el modal anterior si está abierto
    if (modalVisible) {
      console.log('Modal ya está visible, cerrando primero');
      setModalVisible(false);
      setModalOnConfirm(null);
      
      // Esperar un momento antes de mostrar el nuevo modal
      setTimeout(() => {
        console.log('Mostrando nuevo modal después de cerrar el anterior');
        setModalTipo(tipo);
        setModalTitulo(titulo);
        setModalMensaje(mensaje);
        setModalOnConfirm(null); // No establecer el callback en el estado
        setModalVisible(true);
      }, 150);
    } else {
      // Si no hay modal abierto, mostrar directamente
      console.log('Mostrando modal directamente');
      setModalTipo(tipo);
      setModalTitulo(titulo);
      setModalMensaje(mensaje);
      setModalOnConfirm(null); // No establecer el callback en el estado
      setModalVisible(true);
    }
  };

  const cerrarModal = () => {
    console.log('cerrarModal llamado');
    setModalVisible(false);
    setModalOnConfirm(null);
    modalCallbackRef.current = null;
    isConfirmingRef.current = false;
    setHijoAEliminar(null);
    setNumeroFurgones(0);
    console.log('Modal cerrado');
  };

  const confirmarModal = async () => {
    console.log('confirmarModal llamado');
    
    // Prevenir ejecución múltiple
    if (isConfirmingRef.current) {
      console.log('Ya se está confirmando, ignorando');
      return;
    }
    
    isConfirmingRef.current = true;
    
    // Obtener el callback del ref (no del estado)
    const callback = modalCallbackRef.current;
    
    if (!callback) {
      console.log('No hay callback, cerrando modal');
      isConfirmingRef.current = false;
      cerrarModal();
      return;
    }
    
    console.log('Ejecutando callback del modal');
    
    // Cerrar el modal primero
    setModalVisible(false);
    setModalOnConfirm(null);
    modalCallbackRef.current = null;
    
    // Ejecutar el callback después de un pequeño delay para asegurar que el modal se cierre
    // Esto previene que se ejecute automáticamente
    setTimeout(async () => {
      try {
        console.log('Ejecutando callback ahora');
        await callback();
        console.log('Callback ejecutado exitosamente');
      } catch (error) {
        console.error('Error al ejecutar callback del modal:', error);
      } finally {
        isConfirmingRef.current = false;
      }
    }, 200);
  };

  const handleBorrarHijo = (hijo: Hijo) => {
    console.log('handleBorrarHijo llamado para:', hijo.nombres);
    setHijoAEliminar(hijo);
    const mensajeConfirmacion = `¿Estás seguro de que deseas eliminar a ${hijo.nombres} ${hijo.apellidos}?\n\nRUT: ${hijo.rut}\n\nEsta acción eliminará permanentemente el registro del hijo y no se puede deshacer.`;

    // Solo mostrar el modal, NO ejecutar el callback todavía
    mostrarModal(
      'confirmacion',
      'Confirmar eliminación',
      mensajeConfirmacion,
      async () => {
        console.log('Callback de confirmación ejecutado para:', hijo.nombres);
        try {
          setBorrandoId(hijo.id);

          // Verificar si el hijo está inscrito en algún furgón
          const listaPasajerosRef = collection(db, 'lista_pasajeros');
          const pasajerosQuery = query(
            listaPasajerosRef,
            where('rutHijo', '==', hijo.rut),
            where('rutApoderado', '==', rutUsuario)
          );
          const pasajerosSnapshot = await getDocs(pasajerosQuery);

          if (!pasajerosSnapshot.empty) {
            setNumeroFurgones(pasajerosSnapshot.docs.length);
            const mensajeAdvertencia = `Este hijo está inscrito en ${pasajerosSnapshot.docs.length} furgón(es).\n\n¿Deseas eliminar el hijo de todas formas? Esto también eliminará sus inscripciones.`;
            
            mostrarModal(
              'advertencia',
              'Advertencia',
              mensajeAdvertencia,
              async () => {
                try {
                  // Eliminar inscripciones del hijo
                  await Promise.all(
                    pasajerosSnapshot.docs.map((docSnap) => deleteDoc(docSnap.ref))
                  );
                  console.log('Inscripciones eliminadas:', pasajerosSnapshot.docs.length);

                  // Eliminar el hijo de la colección Hijos
                  const hijoRef = doc(db, 'Hijos', hijo.id);
                  await deleteDoc(hijoRef);
                  console.log('Hijo eliminado exitosamente');

                  // Actualizar la lista local
                  setHijos((prevHijos) => prevHijos.filter((h) => h.id !== hijo.id));

                  mostrarModal(
                    'exito',
                    'Éxito',
                    `${hijo.nombres} ${hijo.apellidos} ha sido eliminado correctamente.`
                  );
                } catch (error) {
                  console.error('Error al borrar el hijo:', error);
                  mostrarModal(
                    'error',
                    'Error',
                    'No se pudo eliminar el hijo. Por favor, intenta nuevamente.'
                  );
                } finally {
                  setBorrandoId(null);
                }
              }
            );
          } else {
            // Eliminar el hijo directamente si no está inscrito
            try {
              const hijoRef = doc(db, 'Hijos', hijo.id);
              await deleteDoc(hijoRef);
              console.log('Hijo eliminado exitosamente');

              // Actualizar la lista local
              setHijos((prevHijos) => prevHijos.filter((h) => h.id !== hijo.id));

              mostrarModal(
                'exito',
                'Éxito',
                `${hijo.nombres} ${hijo.apellidos} ha sido eliminado correctamente.`
              );
            } catch (error) {
              console.error('Error al borrar el hijo:', error);
              mostrarModal(
                'error',
                'Error',
                'No se pudo eliminar el hijo. Por favor, intenta nuevamente.'
              );
            } finally {
              setBorrandoId(null);
            }
          }
        } catch (error) {
          console.error('Error al verificar inscripciones:', error);
          mostrarModal(
            'error',
            'Error',
            'No se pudo verificar las inscripciones del hijo. Por favor, intenta nuevamente.'
          );
          setBorrandoId(null);
        }
      }
    );
  };

  const handleVolver = () => {
    // Si hay historial, vuelve atrás; si no, redirige a la pantalla principal
    if (router.canGoBack?.()) {
      router.back();
    } else {
      router.replace('/(tabs)/apoderado/perfil-apoderado');
    }
  };

  const renderItem = ({ item }: { item: Hijo }) => {
    const isBorrando = borrandoId === item.id;
    
    return (
      <View style={styles.card}>
        <View style={styles.headerCard}>
          <Ionicons name="person-circle-outline" size={32} color="#127067" />
          <View style={styles.nameContainer}>
            <Text style={styles.name}>
              {item.nombres} {item.apellidos}
            </Text>
          </View>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.info}>RUT: {item.rut}</Text>
          <Text style={styles.info}>Edad: {item.edad} años</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.info}>Nacimiento: {item.fechaNacimiento}</Text>
        </View>
        <View style={styles.buttonsContainer}>
          <TouchableHighlight
            style={[styles.verFichaButton, isBorrando && styles.buttonDisabled]}
            underlayColor="#0e5b52"
            onPress={() => !isBorrando && handleVerFichaMedica(item)}
            disabled={isBorrando}
          >
            <Text style={styles.verFichaButtonText}>Ver Ficha médica</Text>
          </TouchableHighlight>
          <TouchableHighlight
            style={[styles.editButton, isBorrando && styles.buttonDisabled]}
            underlayColor="#0e5b52"
            onPress={() => !isBorrando && handleEditarHijo(item)}
            disabled={isBorrando}
          >
            <Text style={styles.editButtonText}>Editar</Text>
          </TouchableHighlight>
          <TouchableHighlight
            style={[styles.deleteButton, isBorrando && styles.buttonDisabled]}
            underlayColor="#b71c1c"
            onPress={(e) => {
              e.stopPropagation();
              console.log('Botón Borrar presionado para:', item.nombres);
              if (!isBorrando) {
                handleBorrarHijo(item);
              }
            }}
            disabled={isBorrando}
          >
            {isBorrando ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.deleteButtonText}>Borrar</Text>
            )}
          </TouchableHighlight>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#127067" />
        <Text style={styles.loadingText}>Cargando hijos...</Text>
      </View>
    );
  }

  if (hijos.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        {/* Botón de volver */}
        <Pressable style={styles.backButtonTop} onPress={handleVolver}>
          <Ionicons name="arrow-back" size={28} color="#127067" />
        </Pressable>
        
        <View style={styles.emptyContent}>
          <Ionicons name="sad-outline" size={60} color="#999" />
          <Text style={styles.emptyText}>No hay hijos registrados</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Notificaciones Pop-up Globales */}
      <NotificacionesGlobales
        rutUsuario={rutUsuario}
        patentesAsignadas={patentesAsignadas}
        tieneInscripcion={tieneInscripcion}
      />
      
      {/* Botón de volver */}
      <Pressable style={styles.backButton} onPress={handleVolver}>
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      {/* Encabezado */}
      <View style={styles.header}>
        <Ionicons name="person-circle-outline" size={32} color="#127067" />
        <Text style={styles.title}>Lista hijos</Text>
      </View>

      <FlatList
        data={hijos}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />

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
            console.log('Overlay presionado, cerrando modal');
            cerrarModal();
          }}
        >
          <Pressable 
            style={styles.modalCard}
            onPress={(e) => {
              e.stopPropagation();
              console.log('Modal card presionado, no hacer nada');
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
                      console.log('Botón Cancelar presionado');
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
                      console.log('Botón de confirmar presionado en modal, tipo:', modalTipo);
                      confirmarModal();
                    }}
                  >
                    <Text style={styles.modalButtonConfirmText}>
                      {modalTipo === 'advertencia' ? 'Eliminar de todas formas' : 'Eliminar'}
                    </Text>
                  </TouchableHighlight>
                </>
              )}
              {(modalTipo === 'exito' || modalTipo === 'error') && (
                <TouchableHighlight
                  style={styles.modalButtonOK}
                  underlayColor={modalTipo === 'error' ? '#b71c1c' : '#0e5b52'}
                  onPress={cerrarModal}
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
    backgroundColor: '#F5F7F8', 
    paddingHorizontal: 16,
    paddingTop: 80,
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 16,
    zIndex: 10,
    padding: 5,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 8,
  },
  loadingContainer: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: '#F5F7F8',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
    fontSize: 16,
  },
  emptyContainer: { 
    flex: 1, 
    backgroundColor: '#F5F7F8',
  },
  backButtonTop: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
    padding: 8,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: { 
    marginTop: 8, 
    color: '#777', 
    fontSize: 16 
  },
  listContent: {
    paddingBottom: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    marginVertical: 6,
    elevation: 2,
    ...makeShadow(
      '0 3px 6px rgba(0,0,0,0.1)',
      {
        shadowColor: '#000',
        shadowOpacity: 0.1,
        shadowRadius: 3,
        shadowOffset: { width: 0, height: 1 },
      },
    ),
  },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  nameContainer: {
    flex: 1,
    marginLeft: 10,
  },
  name: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    color: '#127067',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  info: { 
    fontSize: 14, 
    color: '#555',
    flex: 1,
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  verFichaButton: {
    backgroundColor: '#127067',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 15,
    alignItems: 'center',
    flex: 1,
    minWidth: 100,
  },
  verFichaButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
  editButton: {
    backgroundColor: '#127067',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 15,
    minWidth: 70,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  deleteButton: {
    backgroundColor: '#d32f2f',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 15,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },
  buttonDisabled: {
    opacity: 0.6,
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
