import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import CryptoJS from 'crypto-js';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, updateDoc, where, addDoc, serverTimestamp } from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableHighlight, View } from 'react-native';

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
  cupos?: number;
  cuposDisponibles?: number;
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
  const [inscripcionesActuales, setInscripcionesActuales] = useState<InscripcionActual[]>([]);
  const [cargandoInscripcion, setCargandoInscripcion] = useState(true);
  const [dandoseDeBaja, setDandoseDeBaja] = useState(false);
  
  // Estados para modal personalizado
  const [modalVisible, setModalVisible] = useState(false);
  const [modalTipo, setModalTipo] = useState<'confirmacion' | 'advertencia' | 'exito' | 'error' | 'seleccion'>('confirmacion');
  const [modalTitulo, setModalTitulo] = useState('');
  const [modalMensaje, setModalMensaje] = useState('');
  const modalCallbackRef = useRef<(() => void) | null>(null);
  const isConfirmingRef = useRef(false);
  
  // Estados para modal de selección de hijos
  const [hijosSeleccionados, setHijosSeleccionados] = useState<Set<string>>(new Set());
  const [modalSeleccionVisible, setModalSeleccionVisible] = useState(false);

  useEffect(() => {
    const cargarInscripcionesActuales = async () => {
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
          const inscripciones: InscripcionActual[] = [];
          
          // Procesar todas las inscripciones
          for (const docSnap of inscripcionSnapshot.docs) {
            const data = docSnap.data();
            
            // Verificar que la inscripción esté activa
            const estado = (data.estado || 'aceptada').toString().toLowerCase();
            const tieneFechaBaja = !!data.fechaBaja;
            const estadoDeBaja = estado === 'baja' || estado === 'cancelada';
            
            if ((estado === 'aceptada' || estado === 'activa') && !tieneFechaBaja && !estadoDeBaja) {
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

              inscripciones.push({
                id: docSnap.id,
                patenteFurgon: data.patenteFurgon || '',
                nombreFurgon: nombreFurgon,
                nombreHijo: data.nombreHijo || '',
                rutHijo: data.rutHijo || '',
              });
            }
          }

          setInscripcionesActuales(inscripciones);
        }
      } catch (error) {
        console.error('Error al cargar inscripciones actuales:', error);
      } finally {
        setCargandoInscripcion(false);
      }
    };

    cargarInscripcionesActuales();
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

          // Calcular cupos disponibles
          const cuposTotales = data.cupos ? Number(data.cupos) : 0;
          let cuposDisponibles = cuposTotales;

          if (cuposTotales > 0 && data.patente) {
            try {
              // Contar niños inscritos activos en este furgón
              const listaPasajerosRef = collection(db, 'lista_pasajeros');
              const pasajerosQuery = query(
                listaPasajerosRef,
                where('patenteFurgon', '==', data.patente)
              );
              const pasajerosSnap = await getDocs(pasajerosQuery);
              
              let ninosInscritos = 0;
              pasajerosSnap.docs.forEach((docSnap) => {
                const pasajeroData = docSnap.data();
                const estado = (pasajeroData.estado || 'aceptada').toString().toLowerCase();
                const tieneFechaBaja = !!pasajeroData.fechaBaja;
                const estadoDeBaja = estado === 'baja' || estado === 'cancelada';
                
                // Solo contar inscripciones activas
                if ((estado === 'aceptada' || estado === 'activa') && !tieneFechaBaja && !estadoDeBaja) {
                  ninosInscritos++;
                }
              });

              cuposDisponibles = Math.max(0, cuposTotales - ninosInscritos);
            } catch (error) {
              console.warn('Error al calcular cupos disponibles:', error);
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
            cupos: cuposTotales,
            cuposDisponibles,
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
    if (inscripcionesActuales.length === 0) return;

    // Si solo hay una inscripción, mostrar confirmación directa
    if (inscripcionesActuales.length === 1) {
      const inscripcion = inscripcionesActuales[0];
      const mensajeConfirmacion = `¿Estás seguro de que deseas darte de baja del furgón "${inscripcion.nombreFurgon}"?\n\nPatente: ${inscripcion.patenteFurgon}\nHijo: ${inscripcion.nombreHijo}\n\nEsta acción eliminará tu inscripción y no se puede deshacer.`;

      mostrarModal(
        'confirmacion',
        'Confirmar darse de baja',
        mensajeConfirmacion,
        async () => {
          setHijosSeleccionados(new Set([inscripcion.id]));
          await procesarBaja();
        }
      );
    } else {
      // Si hay múltiples inscripciones, mostrar modal de selección
      setHijosSeleccionados(new Set());
      setModalSeleccionVisible(true);
    }
  };

  const toggleSeleccionHijo = (inscripcionId: string) => {
    setHijosSeleccionados((prev) => {
      const nuevo = new Set(prev);
      if (nuevo.has(inscripcionId)) {
        nuevo.delete(inscripcionId);
      } else {
        nuevo.add(inscripcionId);
      }
      return nuevo;
    });
  };

  const seleccionarTodos = () => {
    setHijosSeleccionados(new Set(inscripcionesActuales.map((insc) => insc.id)));
  };

  const deseleccionarTodos = () => {
    setHijosSeleccionados(new Set());
  };

  const confirmarSeleccionBaja = () => {
    if (hijosSeleccionados.size === 0) {
      mostrarModal(
        'advertencia',
        'Advertencia',
        'Por favor, selecciona al menos un hijo para dar de baja.'
      );
      return;
    }

    const hijosSeleccionadosNombres = inscripcionesActuales
      .filter((insc) => hijosSeleccionados.has(insc.id))
      .map((insc) => `${insc.nombreHijo} (${insc.nombreFurgon})`)
      .join('\n');

    const mensajeConfirmacion = `¿Estás seguro de que deseas dar de baja a los siguientes hijos?\n\n${hijosSeleccionadosNombres}\n\nEsta acción eliminará las inscripciones y no se puede deshacer.`;

    setModalSeleccionVisible(false);
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
    if (hijosSeleccionados.size === 0) return;

    try {
      setDandoseDeBaja(true);
      
      const inscripcionesAEliminar = inscripcionesActuales.filter((insc) => 
        hijosSeleccionados.has(insc.id)
      );
      
      const rutApoderado = await AsyncStorage.getItem('rutUsuario');
      if (!rutApoderado) {
        mostrarModal('error', 'Error', 'No se pudo obtener el RUT del apoderado.');
        return;
      }

      const nombresHijosEliminados: string[] = [];
      const rutHijosProcesados = new Set<string>();
      
      // Obtener nombre del apoderado
      let nombreApoderado = 'Un apoderado';
      try {
        const usuariosRef = collection(db, 'usuarios');
        const usuarioQuery = query(usuariosRef, where('rut', '==', rutApoderado), limit(1));
        const usuarioSnap = await getDocs(usuarioQuery);
        if (!usuarioSnap.empty) {
          const usuarioData = usuarioSnap.docs[0].data();
          const nombres = usuarioData.nombres || '';
          const apellidos = usuarioData.apellidos || '';
          if (nombres || apellidos) {
            nombreApoderado = `${nombres} ${apellidos}`.trim();
          }
        }
      } catch (error) {
        console.warn('No se pudo obtener el nombre del apoderado:', error);
      }

      // Agrupar bajas por conductor/furgón para crear alertas
      const bajasPorConductor = new Map<string, { rutConductor: string; patenteFurgon: string; cantidad: number; nombreFurgon: string }>();

      // Procesar cada inscripción seleccionada
      for (const inscripcion of inscripcionesAEliminar) {
        try {
          console.log('Iniciando proceso de baja para:', inscripcion.nombreHijo);
          console.log('- ID inscripción:', inscripcion.id);
          console.log('- Patente furgón:', inscripcion.patenteFurgon);
          console.log('- Nombre hijo:', inscripcion.nombreHijo);
          console.log('- RUT hijo:', inscripcion.rutHijo);
          
          // Eliminar el registro de lista_pasajeros
          const inscripcionRef = doc(db, 'lista_pasajeros', inscripcion.id);
          
          // Verificar que el documento existe antes de eliminarlo
          const inscripcionDoc = await getDoc(inscripcionRef);
          if (!inscripcionDoc.exists()) {
            console.warn(`El documento de inscripción ${inscripcion.id} no existe, puede que ya haya sido eliminado`);
            continue;
          }
          
          const inscripcionData = inscripcionDoc.data();
          const rutConductor = inscripcionData.rutConductor || '';
          const patenteFurgon = inscripcionData.patenteFurgon || inscripcion.patenteFurgon;
          
          // Agrupar por conductor para las alertas
          if (rutConductor && patenteFurgon) {
            const clave = `${rutConductor}_${patenteFurgon}`;
            if (bajasPorConductor.has(clave)) {
              const baja = bajasPorConductor.get(clave)!;
              baja.cantidad++;
            } else {
              bajasPorConductor.set(clave, {
                rutConductor,
                patenteFurgon,
                cantidad: 1,
                nombreFurgon: inscripcion.nombreFurgon,
              });
            }
          }
          
          console.log('Eliminando documento de lista_pasajeros...');
          await deleteDoc(inscripcionRef);
          console.log('✓ Documento eliminado exitosamente de lista_pasajeros');

          // Buscar y eliminar registros adicionales relacionados
          try {
            const listaPasajerosRef = collection(db, 'lista_pasajeros');
            const todasLasInscripcionesQuery = query(
              listaPasajerosRef,
              where('rutHijo', '==', inscripcion.rutHijo),
              where('rutApoderado', '==', rutApoderado)
            );
            const todasLasInscripcionesSnap = await getDocs(todasLasInscripcionesQuery);
            
            if (!todasLasInscripcionesSnap.empty) {
              await Promise.all(
                todasLasInscripcionesSnap.docs.map(async (docSnap) => {
                  if (docSnap.id !== inscripcion.id) {
                    await deleteDoc(docSnap.ref);
                    console.log(`✓ Registro adicional eliminado: ${docSnap.id}`);
                  }
                })
              );
            }
          } catch (errorEliminacionAdicional) {
            console.error('Error al eliminar registros adicionales:', errorEliminacionAdicional);
          }

          // Actualizar postulaciones relacionadas (solo una vez por RUT de hijo)
          if (!rutHijosProcesados.has(inscripcion.rutHijo)) {
            rutHijosProcesados.add(inscripcion.rutHijo);
            
            try {
              const postulacionesRef = collection(db, 'Postulaciones');
              const todasLasPostulacionesQuery = query(
                postulacionesRef,
                where('rutHijo', '==', inscripcion.rutHijo),
                where('rutUsuario', '==', rutApoderado)
              );
              const todasLasPostulacionesSnap = await getDocs(todasLasPostulacionesQuery);
              
              if (!todasLasPostulacionesSnap.empty) {
                await Promise.all(
                  todasLasPostulacionesSnap.docs.map(async (postulacionDoc) => {
                    const data = postulacionDoc.data();
                    const estadoActual = (data.estado || '').toString().toLowerCase();
                    
                    if (estadoActual !== 'baja' && estadoActual !== 'cancelada') {
                      await updateDoc(postulacionDoc.ref, {
                        estado: 'baja',
                        fechaBaja: new Date().toISOString(),
                      });
                      console.log(`✓ Postulación ${postulacionDoc.id} actualizada a estado 'baja'`);
                    }
                  })
                );
              }
            } catch (errorPostulaciones) {
              console.error('Error al actualizar postulaciones:', errorPostulaciones);
            }
          }

          nombresHijosEliminados.push(`${inscripcion.nombreHijo} (${inscripcion.nombreFurgon})`);
        } catch (error) {
          console.error(`Error al procesar baja para ${inscripcion.nombreHijo}:`, error);
        }
      }

      // Crear alertas para los conductores afectados
      if (bajasPorConductor.size > 0) {
        try {
          const normalizarRut = (rut: string) => rut.replace(/[^0-9kK]/g, '').toUpperCase();
          const rutApoderadoNormalizado = normalizarRut(rutApoderado);
          
          for (const [clave, baja] of bajasPorConductor.entries()) {
            const rutConductorNormalizado = normalizarRut(baja.rutConductor);
            const cantidadTexto = baja.cantidad === 1 ? '1 hijo' : `${baja.cantidad} hijos`;
            
            const alertaData = {
              tipoAlerta: 'Baja',
              descripcion: `${nombreApoderado} se dio de baja con ${cantidadTexto} del furgón ${baja.nombreFurgon}`,
              rutDestinatario: rutConductorNormalizado,
              rutDestinatarioOriginal: baja.rutConductor,
              rutaDestino: '/conductor/pagina-principal-conductor',
              parametros: {
                patenteFurgon: baja.patenteFurgon,
                cantidadBajas: baja.cantidad,
                nombreApoderado: nombreApoderado,
              },
              creadoEn: serverTimestamp(),
              leida: false,
              patenteFurgon: baja.patenteFurgon,
            };
            
            await addDoc(collection(db, 'Alertas'), alertaData);
            console.log(`✓ Alerta de baja creada para conductor ${baja.rutConductor}: ${cantidadTexto}`);
          }
        } catch (error) {
          console.error('Error al crear alertas de baja:', error);
          // No bloquear el proceso si falla la creación de alertas
        }
      }

      // Actualizar el estado local
      setInscripcionesActuales((prev) => 
        prev.filter((insc) => !hijosSeleccionados.has(insc.id))
      );
      setHijosSeleccionados(new Set());

      const mensajeExito = nombresHijosEliminados.length > 0
        ? `Te has dado de baja exitosamente de:\n\n${nombresHijosEliminados.join('\n')}`
        : 'Proceso completado.';
      
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

  const renderItem = ({ item }: { item: Furgon }) => {
    const cuposDisponibles = item.cuposDisponibles ?? 0;
    const cuposTotales = item.cupos ?? 0;
    const tieneCupos = cuposTotales > 0;
    const sinCupos = tieneCupos && cuposDisponibles === 0;

    return (
      <Pressable 
        style={[styles.card, sinCupos && styles.cardSinCupos]} 
        onPress={() => handleInscribirFurgon(item)}
        disabled={sinCupos}
      >
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
          {tieneCupos && (
            <View style={styles.cuposContainer}>
              <Ionicons 
                name={sinCupos ? "close-circle" : "people-outline"} 
                size={16} 
                color={sinCupos ? "#d32f2f" : "#127067"} 
              />
              <Text style={[styles.cuposText, sinCupos && styles.cuposTextSinCupos]}>
                {sinCupos 
                  ? 'Sin cupos disponibles' 
                  : `${cuposDisponibles} de ${cuposTotales} cupos disponibles`}
              </Text>
            </View>
          )}
        </View>
      </Pressable>
    );
  };

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
      {!cargandoInscripcion && inscripcionesActuales.length > 0 && (
        <View style={styles.unsubscribeSection}>
          <View style={styles.unsubscribeCard}>
            <View style={styles.unsubscribeInfo}>
              <Ionicons name="bus-outline" size={24} color="#127067" />
              <View style={styles.unsubscribeTextContainer}>
                <Text style={styles.unsubscribeTitle}>Inscrito actualmente</Text>
                {inscripcionesActuales.map((inscripcion, index) => (
                  <View key={inscripcion.id} style={index > 0 ? { marginTop: 8 } : {}}>
                    <Text style={styles.unsubscribeSubtitle}>
                      {inscripcion.nombreFurgon} - {inscripcion.patenteFurgon}
                    </Text>
                    <Text style={styles.unsubscribeHijo}>Hijo: {inscripcion.nombreHijo}</Text>
                  </View>
                ))}
              </View>
            </View>
            <TouchableHighlight
              style={[styles.unsubscribeButton, dandoseDeBaja && styles.unsubscribeButtonDisabled]}
              underlayColor="#b71c1c"
              onPress={(e) => {
                e?.stopPropagation();
                console.log('Botón Darse de baja presionado');
                if (!dandoseDeBaja && inscripcionesActuales.length > 0) {
                  handleDarseDeBaja();
                }
              }}
              disabled={dandoseDeBaja || inscripcionesActuales.length === 0}
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

      {/* Modal de selección de hijos */}
      <Modal
        visible={modalSeleccionVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setModalSeleccionVisible(false)}
      >
        <Pressable 
          style={styles.modalOverlay}
          onPress={(e) => {
            e.stopPropagation();
            setModalSeleccionVisible(false);
          }}
        >
          <Pressable 
            style={styles.modalCard}
            onPress={(e) => {
              e.stopPropagation();
            }}
          >
            <Ionicons name="list" size={48} color="#127067" style={styles.modalIcon} />
            <Text style={styles.modalTitle}>Seleccionar hijos para dar de baja</Text>
            <Text style={styles.modalMessage}>
              Selecciona los hijos que deseas dar de baja:
            </Text>
            
            <ScrollView style={styles.seleccionList} showsVerticalScrollIndicator>
              {inscripcionesActuales.map((inscripcion) => {
                const estaSeleccionado = hijosSeleccionados.has(inscripcion.id);
                return (
                  <TouchableHighlight
                    key={inscripcion.id}
                    style={[
                      styles.seleccionItem,
                      estaSeleccionado && styles.seleccionItemSelected
                    ]}
                    underlayColor="#f0f0f0"
                    onPress={() => toggleSeleccionHijo(inscripcion.id)}
                  >
                    <View style={styles.seleccionItemContent}>
                      <View style={styles.seleccionItemInfo}>
                        <Text style={[
                          styles.seleccionItemNombre,
                          estaSeleccionado && styles.seleccionItemNombreSelected
                        ]}>
                          {inscripcion.nombreHijo}
                        </Text>
                        <Text style={styles.seleccionItemFurgon}>
                          {inscripcion.nombreFurgon} - {inscripcion.patenteFurgon}
                        </Text>
                      </View>
                      <Ionicons
                        name={estaSeleccionado ? "checkbox" : "square-outline"}
                        size={24}
                        color={estaSeleccionado ? "#127067" : "#999"}
                      />
                    </View>
                  </TouchableHighlight>
                );
              })}
            </ScrollView>

            <View style={styles.seleccionButtonsContainer}>
              <TouchableHighlight
                style={styles.seleccionButton}
                underlayColor="#e0e0e0"
                onPress={() => {
                  if (hijosSeleccionados.size === inscripcionesActuales.length) {
                    deseleccionarTodos();
                  } else {
                    seleccionarTodos();
                  }
                }}
              >
                <Text style={styles.seleccionButtonText}>
                  {hijosSeleccionados.size === inscripcionesActuales.length
                    ? 'Deseleccionar todos'
                    : 'Seleccionar todos'}
                </Text>
              </TouchableHighlight>
            </View>

            <View style={styles.modalButtonsContainer}>
              <TouchableHighlight
                style={styles.modalButtonCancel}
                underlayColor="#e0e0e0"
                onPress={(e) => {
                  e.stopPropagation();
                  setModalSeleccionVisible(false);
                  setHijosSeleccionados(new Set());
                }}
              >
                <Text style={styles.modalButtonCancelText}>Cancelar</Text>
              </TouchableHighlight>
              <TouchableHighlight
                style={styles.modalButtonConfirm}
                underlayColor="#0e5b52"
                onPress={(e) => {
                  e.stopPropagation();
                  confirmarSeleccionBaja();
                }}
              >
                <Text style={styles.modalButtonConfirmText}>Continuar</Text>
              </TouchableHighlight>
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
  cardSinCupos: {
    opacity: 0.6,
    borderColor: '#d32f2f',
  },
  cuposContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  cuposText: {
    fontSize: 13,
    color: '#127067',
    fontWeight: '500',
  },
  cuposTextSinCupos: {
    color: '#d32f2f',
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
  seleccionList: {
    maxHeight: 300,
    width: '100%',
    marginVertical: 16,
  },
  seleccionItem: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  seleccionItemSelected: {
    backgroundColor: '#e8f5e9',
    borderColor: '#127067',
  },
  seleccionItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  seleccionItemInfo: {
    flex: 1,
    marginRight: 12,
  },
  seleccionItemNombre: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  seleccionItemNombreSelected: {
    color: '#127067',
  },
  seleccionItemFurgon: {
    fontSize: 14,
    color: '#666',
  },
  seleccionButtonsContainer: {
    width: '100%',
    marginBottom: 16,
  },
  seleccionButton: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  seleccionButtonText: {
    color: '#127067',
    fontSize: 14,
    fontWeight: '500',
  },
});
