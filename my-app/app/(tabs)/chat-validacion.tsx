import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  TextInput,
  TouchableHighlight,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import {
  collection,
  addDoc,
  getDoc,
  doc,
  query,
  where,
  updateDoc,
  onSnapshot,
  getDocs,
  writeBatch,
  deleteDoc,
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function ChatValidacion() {
  const params = useLocalSearchParams();
  const router = useRouter();
  useSyncRutActivo();
  const [rutUsuario, setRutUsuario] = useState('');
  const [rolUsuario, setRolUsuario] = useState('');
  const [nombreReceptor, setNombreReceptor] = useState('');
  const [rutReceptor, setRutReceptor] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [mensajes, setMensajes] = useState<any[]>([]);
  const [postulacion, setPostulacion] = useState<any | null>(null);
  const [hijo, setHijo] = useState<any | null>(null);
  const [datosApoderado, setDatosApoderado] = useState<any | null>(null);
  const [autorizado, setAutorizado] = useState(false);
  const [cargandoAuth, setCargandoAuth] = useState(true);
  const [mostrarBotonesValidacion, setMostrarBotonesValidacion] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const redireccionProgramada = useRef(false);
  const chatVisibleRef = useRef(false);
  const mensajesPendientesMarcarRef = useRef<Set<string>>(new Set());
  const flatListRef = useRef<FlatList>(null);
  const [mensajesEliminados, setMensajesEliminados] = useState<Set<string>>(new Set());
  const redireccionApoderadoRef = useRef(false);

  const idPostulacion = params.idPostulacion as string;
  const esAgregarHijo = params.accion === 'agregar_hijo' || params.tipoAlerta === 'AgregarHijo';
  const esChatUrgencia = postulacion?.tipo === 'urgencia';

  useEffect(() => {
    const cargarDatos = async () => {
      const rut = await AsyncStorage.getItem('rutUsuario');
      // Normaliza el rol desde AsyncStorage (login guarda 'userRole')
      const rolGuardado = (await AsyncStorage.getItem('userRole')) || (await AsyncStorage.getItem('rolUsuario')) || '';
      const rol = rolGuardado.toLowerCase(); // 'conductor' | 'apoderado'
      if (!rut || !rol) return;

      setRutUsuario(rut);
      setRolUsuario(rol);
      
      // Cargar mensajes eliminados por el usuario (específico por usuario)
      try {
        let chatKey = '';
        if (idPostulacion) {
          chatKey = `chat_eliminados_${idPostulacion}_${rut}`;
        } else if (esAgregarHijo && params.rutHijo) {
          const chatId = `agregar_hijo_${params.rutHijo}_${params.rutPadre}_${params.rutConductor || rut}`;
          chatKey = `chat_eliminados_${chatId}_${rut}`;
        }
        
        if (chatKey) {
          const eliminadosGuardados = await AsyncStorage.getItem(chatKey);
          if (eliminadosGuardados) {
            const idsEliminados = JSON.parse(eliminadosGuardados);
            setMensajesEliminados(new Set(idsEliminados));
          }
        }
      } catch (error) {
        console.error('Error al cargar mensajes eliminados:', error);
      }

      let unsubscribe: (() => void) | undefined;

      // Si es una alerta de AgregarHijo, cargar datos desde los parámetros
      if (esAgregarHijo && params.rutHijo) {
        const rutHijo = params.rutHijo as string;
        const rutPadre = params.rutPadre as string;
        const rutConductorParam = params.rutConductor as string || rut;
        const patenteFurgon = params.patenteFurgon as string;
        const idFurgon = params.idFurgon as string;
        const nombreHijo = params.nombreHijo as string || '';
        const nombreApoderado = params.nombreApoderado as string || '';

        // Cargar datos del hijo
        try {
          const hijoRef = doc(db, 'Hijos', rutHijo);
          const hijoSnap = await getDoc(hijoRef);
          if (hijoSnap.exists()) {
            setHijo({ id: hijoSnap.id, ...hijoSnap.data() });
          }
        } catch (error) {
          console.error('Error al cargar datos del hijo:', error);
        }

        // Cargar datos del apoderado
        try {
          const apoderadoRef = query(collection(db, 'usuarios'), where('rut', '==', rutPadre));
          const apoderadoSnap = await getDocs(apoderadoRef);
          if (!apoderadoSnap.empty) {
            const apoderadoData = apoderadoSnap.docs[0].data();
            setDatosApoderado(apoderadoData);
            const nombre = nombreApoderado || `${apoderadoData.nombres || ''} ${apoderadoData.apellidos || ''}`.trim();
            setNombreReceptor(nombre);
          }
        } catch (error) {
          console.error('Error al cargar datos del apoderado:', error);
        }

        setRutReceptor(rutPadre);
        setAutorizado(true);
        setCargandoAuth(false);
        // No mostrar botones de validación para chats de AgregarHijo desde lista_pasajeros (ya aceptados)
        setMostrarBotonesValidacion(false);

        // Crear un identificador único para el chat de AgregarHijo
        const chatId = `agregar_hijo_${rutHijo}_${rutPadre}_${rutConductorParam}`;
        const claveChat = `chat_agregar_hijo_${rutHijo}_${rutPadre}_${rutConductorParam}`;
        
        // Marcar como leído al abrir el chat
        try {
          const fechaActual = new Date().toISOString();
          await AsyncStorage.setItem(`ultima_lectura_${claveChat}`, fechaActual);
        } catch (error) {
          console.error('Error al marcar como leído:', error);
        }
        
        // Suscripción a mensajes usando el chatId
        const mensajesRef = collection(db, 'MensajesChat');
        const q = query(mensajesRef, where('chatId', '==', chatId));
        unsubscribe = onSnapshot(q, async (snapshot) => {
          const lista = snapshot.docs
            .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
            .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
          console.log('Mensajes cargados (AgregarHijo):', lista.length, 'mensajes');
          console.log('Rut usuario:', rut, 'Rut receptor:', rutPadre);
          lista.forEach((msg: any) => {
            console.log('Mensaje:', {
              id: msg.id,
              emisor: msg.emisor,
              receptor: msg.receptor,
              texto: msg.texto?.substring(0, 30),
              participantes: msg.participantes
            });
          });
          setMensajes(lista);
          
          // Marcar mensajes como entregados cuando el receptor los recibe
          const batch = writeBatch(db);
          let hayActualizaciones = false;
          
          lista.forEach((msg: any) => {
            // Si el mensaje es para el usuario actual (receptor) y aún no está marcado como entregado
            if (msg.receptor === rut && msg.emisor !== rut && msg.emisor !== 'Sistema') {
              // Marcar como entregado si aún no lo está
              if (!msg.entregado) {
                const msgRef = doc(db, 'MensajesChat', msg.id);
                batch.update(msgRef, { entregado: true, fechaEntregado: new Date().toISOString() });
                hayActualizaciones = true;
              }
              
              // Guardar mensajes pendientes de marcar como leídos (solo si el chat está visible)
              if (!msg.leido) {
                mensajesPendientesMarcarRef.current.add(msg.id);
              }
            }
          });
          
          if (hayActualizaciones) {
            try {
              await batch.commit();
            } catch (error) {
              console.error('Error al actualizar estados de entrega:', error);
            }
          }
          
          // Marcar como leído solo si el chat está visible
          if (chatVisibleRef.current && mensajesPendientesMarcarRef.current.size > 0) {
            const batchLeidos = writeBatch(db);
            let hayLeidos = false;
            
            mensajesPendientesMarcarRef.current.forEach((msgId) => {
              const msg = lista.find((m: any) => m.id === msgId);
              if (msg && msg.receptor === rut && msg.emisor !== rut && msg.emisor !== 'Sistema' && !msg.leido) {
                const msgRef = doc(db, 'MensajesChat', msgId);
                batchLeidos.update(msgRef, { leido: true, fechaLeido: new Date().toISOString() });
                hayLeidos = true;
              }
            });
            
            if (hayLeidos) {
              try {
                await batchLeidos.commit();
                mensajesPendientesMarcarRef.current.clear();
              } catch (error) {
                console.error('Error al actualizar estados de lectura:', error);
              }
            }
          }
        });

        return () => {
          if (unsubscribe) unsubscribe();
        };
      }

      // Si es una postulación normal, cargar desde Postulaciones
      if (!idPostulacion) {
        setCargandoAuth(false);
        return;
      }

      const postRef = doc(db, 'Postulaciones', idPostulacion);
      const postSnap = await getDoc(postRef);
      if (postSnap.exists()) {
        const data = postSnap.data() as any;
        setPostulacion(data);
        
        // Verificar si se deben mostrar los botones de validación
        // Solo mostrar si:
        // 1. El usuario es conductor
        // 2. La postulación está en estado 'pendiente'
        // 3. No es un chat de urgencia
        if (rol === 'conductor' && data.estado === 'pendiente' && data.tipo !== 'urgencia') {
          setMostrarBotonesValidacion(true);
        } else {
          setMostrarBotonesValidacion(false);
        }

        // Datos del hijo
        if (data.idHijo) {
          const hijoRef = doc(db, 'Hijos', data.idHijo);
          const hijoSnap = await getDoc(hijoRef);
          if (hijoSnap.exists()) {
            setHijo(hijoSnap.data());
          }
        }

        // Resolver rut del conductor (si no está en Postulaciones)
        let rutConductorDestino = data.rutConductor as string | undefined;
        if (!rutConductorDestino) {
          const estQ = query(collection(db, 'estado_postulacion'), where('idPostulacion', '==', idPostulacion));
          const estSnap = await getDocs(estQ);
          if (!estSnap.empty) {
            rutConductorDestino = estSnap.docs[0].data().rutConductor;
          }
        }
        if (!rutConductorDestino && data.idFurgon) {
          const fRef = doc(db, 'Furgones', data.idFurgon);
          const fSnap = await getDoc(fRef);
          if (fSnap.exists()) {
            rutConductorDestino = (fSnap.data() as any).rutUsuario;
          }
        }

        // Determinar receptor por rol
        let rutDestinoChat = '';
        if (rol === 'conductor') {
          rutDestinoChat = data.rutUsuario || '';
          const apoderadoRef = query(collection(db, 'usuarios'), where('rut', '==', data.rutUsuario));
          const apoderadoSnap = await getDocs(apoderadoRef);
          if (!apoderadoSnap.empty) {
            const apoderadoData = apoderadoSnap.docs[0].data();
            setNombreReceptor(`${apoderadoData.nombres} ${apoderadoData.apellidos}`);
            setDatosApoderado(apoderadoData);
          }
        } else if (rutConductorDestino) {
          rutDestinoChat = rutConductorDestino;
          const conductorRef = query(collection(db, 'usuarios'), where('rut', '==', rutConductorDestino));
          const conductorSnap = await getDocs(conductorRef);
          if (!conductorSnap.empty) {
            const conductorData = conductorSnap.docs[0].data();
            setNombreReceptor(`${conductorData.nombres} ${conductorData.apellidos}`);
          }
        }
        if (rutDestinoChat) {
          setRutReceptor(rutDestinoChat);
        }

        // Verificar autorizacion por RUT
        const participantes = [data.rutUsuario, rutConductorDestino].filter(Boolean) as string[];
        const esParte = participantes.includes(rut);
        setAutorizado(esParte);
        setCargandoAuth(false);

        if (!esParte) {
          Alert.alert('Acceso denegado', 'No tienes permiso para ver este chat.', [
            { text: 'OK', onPress: () => router.back() },
          ]);
          return;
        }

        // Marcar como leído al abrir el chat
        const claveChat = `chat_${idPostulacion}`;
        try {
          const fechaActual = new Date().toISOString();
          await AsyncStorage.setItem(`ultima_lectura_${claveChat}`, fechaActual);
        } catch (error) {
          console.error('Error al marcar como leído:', error);
        }

        // Suscripcion a mensajes solo si esta autorizado
        const mensajesRef = collection(db, 'MensajesChat');
        const q = query(mensajesRef, where('idPostulacion', '==', idPostulacion));
        unsubscribe = onSnapshot(q, async (snapshot) => {
          const lista = snapshot.docs
            .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
            .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
          console.log('Mensajes cargados (Postulación):', lista.length, 'mensajes');
          console.log('Rut usuario:', rut, 'Rut receptor:', rutReceptor);
          lista.forEach((msg: any) => {
            console.log('Mensaje:', {
              id: msg.id,
              emisor: msg.emisor,
              receptor: msg.receptor,
              texto: msg.texto?.substring(0, 30),
              participantes: msg.participantes
            });
          });
          
          // Verificar si hay un mensaje del sistema indicando que la postulación fue aprobada
          // y redirigir al apoderado si es necesario
          const mensajeAprobacion = lista.find((msg: any) => 
            msg.emisor === 'Sistema' && 
            msg.receptor === rut &&
            (msg.texto?.toLowerCase().includes('aprobada') || msg.texto?.toLowerCase().includes('aprobado'))
          );
          
          if (mensajeAprobacion && !redireccionApoderadoRef.current) {
            // Verificar que el usuario es apoderado
            const rolGuardado = (await AsyncStorage.getItem('userRole')) || (await AsyncStorage.getItem('rolUsuario')) || '';
            const rolActual = rolGuardado.toLowerCase();
            
            console.log('🔍 Mensaje de aprobación encontrado:', { 
              mensaje: mensajeAprobacion.texto, 
              rol: rolActual,
              redireccionProgramada: redireccionApoderadoRef.current,
              receptor: mensajeAprobacion.receptor,
              rutUsuario: rut
            });
            
            // Verificar que es apoderado (ya está en minúscula por el toLowerCase())
            if (rolActual === 'apoderado') {
              console.log('✓ Mensaje de aprobación detectado, redirigiendo apoderado inmediatamente...');
              redireccionApoderadoRef.current = true;
              
              // También verificar el estado de la postulación directamente
              try {
                const postRef = doc(db, 'Postulaciones', idPostulacion);
                const postSnap = await getDoc(postRef);
                if (postSnap.exists()) {
                  const postData = postSnap.data() as any;
                  const estado = (postData.estado || '').toString().toLowerCase();
                  console.log('📋 Estado de postulación verificado:', estado);
                  
                  if (estado === 'aceptada') {
                    console.log('✅ Confirmado: Postulación está aceptada, redirigiendo...');
                    // Redirigir inmediatamente
                    router.replace('/(tabs)/apoderado/pagina-principal-apoderado');
                    return; // Salir temprano para evitar procesar más
                  }
                }
              } catch (error) {
                console.error('Error al verificar estado de postulación:', error);
              }
              
              // Si no se pudo verificar el estado, redirigir de todas formas por el mensaje
              setTimeout(() => {
                router.replace('/(tabs)/apoderado/pagina-principal-apoderado');
              }, 100);
              return; // Salir temprano para evitar procesar más
            } else {
              console.log('⚠ Rol no es apoderado:', rolActual);
            }
          }
          
          setMensajes(lista);
          
          // Marcar mensajes como entregados cuando el receptor los recibe
          const batch = writeBatch(db);
          let hayActualizaciones = false;
          
          lista.forEach((msg: any) => {
            // Si el mensaje es para el usuario actual (receptor) y aún no está marcado como entregado
            if (msg.receptor === rut && msg.emisor !== rut && msg.emisor !== 'Sistema') {
              // Marcar como entregado si aún no lo está
              if (!msg.entregado) {
                const msgRef = doc(db, 'MensajesChat', msg.id);
                batch.update(msgRef, { entregado: true, fechaEntregado: new Date().toISOString() });
                hayActualizaciones = true;
              }
              
              // Guardar mensajes pendientes de marcar como leídos (solo si el chat está visible)
              if (!msg.leido) {
                mensajesPendientesMarcarRef.current.add(msg.id);
              }
            }
          });
          
          if (hayActualizaciones) {
            try {
              await batch.commit();
            } catch (error) {
              console.error('Error al actualizar estados de entrega:', error);
            }
          }
          
          // Marcar como leído solo si el chat está visible
          if (chatVisibleRef.current && mensajesPendientesMarcarRef.current.size > 0) {
            const batchLeidos = writeBatch(db);
            let hayLeidos = false;
            
            mensajesPendientesMarcarRef.current.forEach((msgId) => {
              const msg = lista.find((m: any) => m.id === msgId);
              if (msg && msg.receptor === rut && msg.emisor !== rut && msg.emisor !== 'Sistema' && !msg.leido) {
                const msgRef = doc(db, 'MensajesChat', msgId);
                batchLeidos.update(msgRef, { leido: true, fechaLeido: new Date().toISOString() });
                hayLeidos = true;
              }
            });
            
            if (hayLeidos) {
              try {
                await batchLeidos.commit();
                mensajesPendientesMarcarRef.current.clear();
              } catch (error) {
                console.error('Error al actualizar estados de lectura:', error);
              }
            }
          }
          
          // Verificar el estado actual de la postulación para actualizar los botones
          try {
            const postSnap = await getDoc(postRef);
            if (postSnap.exists()) {
              const postData = postSnap.data() as any;
              // Ocultar botones si la postulación ya no está pendiente
              if (postData.estado !== 'pendiente' || postData.tipo === 'urgencia') {
                setMostrarBotonesValidacion(false);
              } else if (rol === 'conductor') {
                setMostrarBotonesValidacion(true);
              }
            }
          } catch (error) {
            console.error('Error al verificar estado de postulación:', error);
          }
          
          // Nota: Se removió la redirección automática cuando se detecta aprobación
          // para permitir que el apoderado pueda seguir chateando normalmente
        });
      } else {
        setCargandoAuth(false);
      }

      return () => {
        if (unsubscribe) unsubscribe();
      };
    };

    cargarDatos();
  }, []);

  // Listener para detectar cuando la postulación es aceptada y redirigir al apoderado
  useEffect(() => {
    if (!idPostulacion) {
      return;
    }

    let unsubscribePostulacion: (() => void) | undefined;

    const configurarListenerPostulacion = async () => {
      try {
        // Esperar a que se carguen los datos del usuario
        const rutGuardado = await AsyncStorage.getItem('rutUsuario');
        const rolGuardado = (await AsyncStorage.getItem('userRole')) || (await AsyncStorage.getItem('rolUsuario')) || '';
        const rol = rolGuardado.toLowerCase();

        console.log('🔍 Configurando listener de postulación:', { idPostulacion, rutGuardado, rol });

        if (!rutGuardado) {
          console.log('⚠ No se encontró RUT del usuario');
          return;
        }

        // Verificar que es apoderado (ya está en minúscula por el toLowerCase())
        if (rol !== 'apoderado') {
          console.log('⚠ Usuario no es apoderado, no se configurará el listener. Rol:', rol);
          return;
        }

        const postRef = doc(db, 'Postulaciones', idPostulacion);
        
        // Verificar estado inicial
        const postSnapInicial = await getDoc(postRef);
        if (postSnapInicial.exists()) {
          const postDataInicial = postSnapInicial.data() as any;
          const estadoInicial = (postDataInicial.estado || '').toString().toLowerCase();
          const rutPostulacionInicial = (postDataInicial.rutUsuario || '').toString().trim();
          
          const normalizarRut = (rut: string) => rut.replace(/[^0-9kK]/g, '').toUpperCase();
          const rutGuardadoNormalizado = normalizarRut(rutGuardado);
          const rutPostulacionNormalizado = normalizarRut(rutPostulacionInicial);
          
          console.log('📋 Estado inicial de postulación:', { 
            estado: estadoInicial, 
            rutPostulacion: rutPostulacionInicial,
            rutGuardado,
            coincide: rutGuardadoNormalizado === rutPostulacionNormalizado
          });
          
          // Si ya está aceptada, redirigir inmediatamente
          if (estadoInicial === 'aceptada' && rutGuardadoNormalizado === rutPostulacionNormalizado && !redireccionApoderadoRef.current) {
            redireccionApoderadoRef.current = true;
            console.log('✓ Postulación ya está aceptada al cargar, redirigiendo apoderado...');
            // Usar setTimeout con 0 para asegurar que se ejecute después del render
            setTimeout(() => {
              router.replace('/(tabs)/apoderado/pagina-principal-apoderado');
            }, 100);
            return;
          }
        }
        
        unsubscribePostulacion = onSnapshot(postRef, async (snapshot) => {
          if (!snapshot.exists()) {
            console.log('⚠ Postulación no existe');
            return;
          }

          const postData = snapshot.data() as any;
          const estado = (postData.estado || '').toString().toLowerCase();
          const rutPostulacion = (postData.rutUsuario || '').toString().trim();
          
          console.log('📡 Cambio detectado en postulación:', { estado, rutPostulacion });
          
          // Si la postulación fue aceptada y el usuario es el apoderado, redirigir
          if (estado === 'aceptada' && !redireccionApoderadoRef.current) {
            // Verificar que el apoderado es el dueño de la postulación
            const rutActual = await AsyncStorage.getItem('rutUsuario');
            if (!rutActual) {
              console.log('⚠ No se encontró RUT actual');
              return;
            }
            
            // Normalizar RUTs para comparación
            const normalizarRut = (rut: string) => rut.replace(/[^0-9kK]/g, '').toUpperCase();
            const rutActualNormalizado = normalizarRut(rutActual);
            const rutPostulacionNormalizado = normalizarRut(rutPostulacion);
            
            console.log('🔍 Comparando RUTs:', { 
              rutActual: rutActualNormalizado, 
              rutPostulacion: rutPostulacionNormalizado,
              coinciden: rutActualNormalizado === rutPostulacionNormalizado
            });
            
            if (rutActualNormalizado === rutPostulacionNormalizado) {
              redireccionApoderadoRef.current = true;
              console.log('✓ Postulación aceptada detectada en listener, redirigiendo apoderado...');
              // Usar setTimeout con 0 para asegurar que se ejecute después del render
              setTimeout(() => {
                router.replace('/(tabs)/apoderado/pagina-principal-apoderado');
              }, 100);
            } else {
              console.log('⚠ RUTs no coinciden, no se redirigirá');
            }
          }
        }, (error) => {
          console.error('❌ Error en listener de postulación:', error);
        });
      } catch (error) {
        console.error('❌ Error al configurar listener de postulación:', error);
      }
    };

    configurarListenerPostulacion();

    return () => {
      if (unsubscribePostulacion) {
        unsubscribePostulacion();
      }
      // Resetear el flag cuando se desmonta el componente
      redireccionApoderadoRef.current = false;
    };
  }, [idPostulacion, router]);

  // Verificar estado de postulación cuando la pantalla está enfocada y periódicamente
  useFocusEffect(
    useCallback(() => {
      const verificarEstadoPostulacion = async () => {
        if (!idPostulacion || redireccionApoderadoRef.current) {
          return;
        }

        try {
          const rutGuardado = await AsyncStorage.getItem('rutUsuario');
          const rolGuardado = (await AsyncStorage.getItem('userRole')) || (await AsyncStorage.getItem('rolUsuario')) || '';
          const rol = rolGuardado.toLowerCase();

          console.log('🔍 useFocusEffect - Verificando estado:', { idPostulacion, rutGuardado, rol });

          // Solo verificar si es apoderado (puede estar en minúscula o con mayúscula inicial)
          if (rol !== 'apoderado') {
            console.log('⚠ useFocusEffect - No es apoderado, saliendo');
            return;
          }

          const postRef = doc(db, 'Postulaciones', idPostulacion);
          const postSnap = await getDoc(postRef);
          
          if (postSnap.exists()) {
            const postData = postSnap.data() as any;
            const estado = (postData.estado || '').toString().toLowerCase();
            const rutPostulacion = (postData.rutUsuario || '').toString().trim();
            
            const normalizarRut = (rut: string) => rut.replace(/[^0-9kK]/g, '').toUpperCase();
            const rutGuardadoNormalizado = normalizarRut(rutGuardado || '');
            const rutPostulacionNormalizado = normalizarRut(rutPostulacion);
            
            console.log('📋 useFocusEffect - Estado de postulación:', { 
              estado, 
              rutGuardado: rutGuardadoNormalizado,
              rutPostulacion: rutPostulacionNormalizado,
              coinciden: rutGuardadoNormalizado === rutPostulacionNormalizado
            });
            
            if (estado === 'aceptada' && rutGuardadoNormalizado === rutPostulacionNormalizado) {
              console.log('✅ useFocusEffect - Postulación aceptada detectada, redirigiendo...');
              redireccionApoderadoRef.current = true;
              router.replace('/(tabs)/apoderado/pagina-principal-apoderado');
            }
          } else {
            console.log('⚠ useFocusEffect - Postulación no existe');
          }
        } catch (error) {
          console.error('❌ Error al verificar estado en useFocusEffect:', error);
        }
      };

      // Marcar que el chat está visible
      chatVisibleRef.current = true;
      
      verificarEstadoPostulacion();
      
      // Verificar periódicamente cada 2 segundos mientras la pantalla está enfocada
      const intervalId = setInterval(() => {
        if (!redireccionApoderadoRef.current) {
          verificarEstadoPostulacion();
        }
      }, 2000);

      // Esperar un momento para asegurar que el usuario está viendo el chat
      const timeoutId = setTimeout(async () => {
        if (!chatVisibleRef.current || mensajes.length === 0) return;
        
        const rut = await AsyncStorage.getItem('rutUsuario');
        if (!rut) return;
        
        // Marcar todos los mensajes no leídos como leídos
        const batch = writeBatch(db);
        let hayActualizaciones = false;
        
        mensajes.forEach((msg: any) => {
          if (msg.receptor === rut && msg.emisor !== rut && msg.emisor !== 'Sistema' && !msg.leido) {
            const msgRef = doc(db, 'MensajesChat', msg.id);
            batch.update(msgRef, { leido: true, fechaLeido: new Date().toISOString() });
            hayActualizaciones = true;
            mensajesPendientesMarcarRef.current.delete(msg.id);
          }
        });
        
        if (hayActualizaciones) {
          try {
            await batch.commit();
          } catch (error) {
            console.error('Error al marcar mensajes como leídos:', error);
          }
        }
      }, 1000); // Esperar 1 segundo después de que el chat esté visible
      
      return () => {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
        chatVisibleRef.current = false;
      };
    }, [mensajes])
  );

  const handleSalirChat = () => {
    router.back();
  };

  const handleLimpiarChat = () => {
    console.log('handleLimpiarChat ejecutado');
    setMenuVisible(false);
    setTimeout(() => {
      limpiarChat();
    }, 200);
  };

  const limpiarChat = () => {
    console.log('limpiarChat llamado');
    Alert.alert(
      'Limpiar chat',
      '¿Estás seguro de que deseas ocultar todos los mensajes de este chat? Los mensajes no se eliminarán de la base de datos, solo se ocultarán en tu vista. El otro usuario seguirá viendo todos los mensajes. Los nuevos mensajes que lleguen se mostrarán normalmente.',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Limpiar',
          style: 'destructive',
          onPress: async () => {
            console.log('Confirmación de limpiar chat recibida');
            try {
              const rut = await AsyncStorage.getItem('rutUsuario');
              console.log('RUT obtenido:', rut);
              if (!rut) {
                Alert.alert('Error', 'No se pudo obtener el RUT del usuario.');
                return;
              }

              // Obtener la clave única del chat (específica por usuario)
              let chatKey = '';
              if (idPostulacion) {
                chatKey = `chat_eliminados_${idPostulacion}_${rut}`;
              } else if (esAgregarHijo && params.rutHijo) {
                const chatId = `agregar_hijo_${params.rutHijo}_${params.rutPadre}_${params.rutConductor || rut}`;
                chatKey = `chat_eliminados_${chatId}_${rut}`;
              } else {
                Alert.alert('Error', 'No se pudo identificar el chat.');
                return;
              }

              // Obtener todos los IDs de los mensajes actuales (todos los mensajes del chat)
              const idsMensajesActuales = mensajes.map((msg) => msg.id);
              
              if (idsMensajesActuales.length === 0) {
                Alert.alert('Info', 'No hay mensajes para ocultar.');
                return;
              }

              // Guardar los IDs de los mensajes en AsyncStorage para ocultarlos (solo para este usuario)
              await AsyncStorage.setItem(chatKey, JSON.stringify(idsMensajesActuales));
              
              // Actualizar el estado local para ocultar los mensajes inmediatamente
              setMensajesEliminados(new Set(idsMensajesActuales));
              
              console.log(`Se ocultaron ${idsMensajesActuales.length} mensaje(s) del chat para el usuario ${rut}`);
              Alert.alert('Chat limpiado', `Se ocultaron ${idsMensajesActuales.length} mensaje(s). El chat ahora está vacío. Los mensajes siguen en la base de datos pero solo están ocultos para ti.`);
            } catch (error) {
              console.error('Error al limpiar chat:', error);
              Alert.alert('Error', 'No se pudo limpiar el chat.');
            }
          },
        },
      ]
    );
  };

  const enviarMensaje = async () => {
    const textoLimpio = mensaje.trim();
    if (!textoLimpio) return;
    if (!rutReceptor) {
      Alert.alert('Destinatario no disponible', 'No se pudo identificar al receptor del mensaje.');
      return;
    }
    if (!autorizado) {
      Alert.alert('Acceso denegado', 'No puedes enviar mensajes en este chat.');
      return;
    }

    try {
      const participantesChat = [rutUsuario, rutReceptor].filter(Boolean).sort();
      let nuevoMensaje: any = {
        texto: textoLimpio,
        emisor: rutUsuario, // guarda el RUT del usuario
        receptor: rutReceptor,
        participantes: participantesChat,
        fecha: new Date().toISOString(),
        entregado: false, // Estado inicial: enviado
        leido: false, // Estado inicial: no leído
      };

      if (esAgregarHijo && params.rutHijo) {
        // Para alertas de AgregarHijo, usar chatId
        const rutHijo = params.rutHijo as string;
        const rutConductorParam = params.rutConductor as string || rutUsuario;
        const rutPadre = params.rutPadre as string;
        nuevoMensaje.chatId = `agregar_hijo_${rutHijo}_${rutPadre}_${rutConductorParam}`;
      } else if (idPostulacion) {
        // Para postulaciones normales, usar idPostulacion
        nuevoMensaje.idPostulacion = idPostulacion;
      }

      await addDoc(collection(db, 'MensajesChat'), nuevoMensaje);
      setMensaje('');
    } catch (error) {
      console.error('Error al enviar mensaje:', error);
    }
  };

  const rechazarPostulacion = async () => {
    if (esChatUrgencia) {
      Alert.alert('Acción no disponible', 'Este chat de urgencia no admite rechazar.');
      return;
    }
    try {
      const fechaISO = new Date().toISOString();
      const participantesChat = [rutUsuario, rutReceptor].filter(Boolean).sort();
      
      // Si es una alerta de AgregarHijo
      if (esAgregarHijo && params.rutHijo) {
        const rutApoderado = params.rutPadre as string;
        const rutHijo = params.rutHijo as string;
        const chatId = `agregar_hijo_${rutHijo}_${rutApoderado}_${rutUsuario}`;
        
        // Mensaje para el apoderado
        await addDoc(collection(db, 'MensajesChat'), {
          chatId,
          texto: 'La solicitud para agregar al hijo ha sido rechazada.',
          emisor: 'Sistema',
          receptor: rutApoderado,
          participantes: participantesChat,
          fecha: fechaISO,
          entregado: true,
          leido: false,
        });
        
        // Mensaje para el conductor (para que también lo vea)
        await addDoc(collection(db, 'MensajesChat'), {
          chatId,
          texto: 'La solicitud para agregar al hijo ha sido rechazada.',
          emisor: 'Sistema',
          receptor: rutUsuario,
          participantes: participantesChat,
          fecha: fechaISO,
          entregado: true,
          leido: false,
        });
        
        Alert.alert('Solicitud rechazada', 'La solicitud ha sido rechazada.');
        router.back();
        return;
      }
      
      // Si es una postulación normal
      await addDoc(collection(db, 'ValidacionesPostulacion'), {
        idPostulacion,
        estado: 'rechazada',
        fecha: fechaISO,
      });

      const receptorFinal = rutReceptor || rutUsuario;
      
      // Mensaje para el receptor
      await addDoc(collection(db, 'MensajesChat'), {
        idPostulacion,
        texto: 'La postulación ha sido rechazada.',
        emisor: 'Sistema',
        receptor: receptorFinal,
        participantes: participantesChat,
        fecha: fechaISO,
        entregado: true,
        leido: false,
      });
      
      // Mensaje para el conductor (si no es el receptor)
      if (rutUsuario !== receptorFinal) {
        await addDoc(collection(db, 'MensajesChat'), {
          idPostulacion,
          texto: 'La postulación ha sido rechazada.',
          emisor: 'Sistema',
          receptor: rutUsuario,
          participantes: participantesChat,
          fecha: fechaISO,
          entregado: true,
          leido: false,
        });
      }

      await updateDoc(doc(db, 'Postulaciones', idPostulacion), {
        estado: 'rechazada',
      });

      Alert.alert('Postulación rechazada');
      router.back();
    } catch (error) {
      console.error('Error al rechazar:', error);
    }
  };

  const obtenerPatenteFurgon = async (): Promise<string> => {
    if (postulacion?.patenteFurgon) {
      return String(postulacion.patenteFurgon);
    }

    if (postulacion?.idFurgon) {
      try {
        const furgonRef = doc(db, 'Furgones', postulacion.idFurgon);
        const furgonSnap = await getDoc(furgonRef);
        if (furgonSnap.exists()) {
          const datosFurgon = furgonSnap.data() as any;
          if (datosFurgon?.patente) {
            return String(datosFurgon.patente);
          }
        }
      } catch (error) {
        console.error('Error al obtener la patente desde Furgones:', error);
      }
    }

    try {
      const postulacionFurgonQuery = query(
        collection(db, 'postulacion_furgon'),
        where('postulacionDocId', '==', idPostulacion),
      );
      const postulacionFurgonSnap = await getDocs(postulacionFurgonQuery);
      if (!postulacionFurgonSnap.empty) {
        const data = postulacionFurgonSnap.docs[0].data() as any;
        if (data?.patenteFurgon) {
          return String(data.patenteFurgon);
        }
      }
    } catch (error) {
      console.error('Error al obtener la patente desde postulacion_furgon:', error);
    }

    return '';
  };


  const aceptarPostulacion = async () => {
    if (esChatUrgencia) {
      Alert.alert('Acción no disponible', 'Este chat de urgencia no admite aceptar solicitudes.');
      return;
    }
    try {
      const fechaISO = new Date().toISOString();
      const participantesChat = [rutUsuario, rutReceptor].filter(Boolean).sort();
      
      // Si es una alerta de AgregarHijo, obtener datos desde los parámetros
      if (esAgregarHijo && params.rutHijo) {
        const rutApoderadoAgregar = params.rutPadre as string;
        const rutHijoAgregar = params.rutHijo as string;
        const idHijoAgregar = rutHijoAgregar;
        const idFurgonAgregar = params.idFurgon as string || '';
        const patenteFurgonAgregar = params.patenteFurgon as string;
        let nombreHijoAgregar = params.nombreHijo as string || '';
        let nombreApoderadoAgregar = params.nombreApoderado as string || '';

        // Cargar datos del hijo si no están disponibles
        if (!hijo && rutHijoAgregar) {
          try {
            const hijoRef = doc(db, 'Hijos', rutHijoAgregar);
            const hijoSnap = await getDoc(hijoRef);
            if (hijoSnap.exists()) {
              const hijoData = hijoSnap.data();
              setHijo({ id: hijoSnap.id, ...hijoData });
              if (!nombreHijoAgregar) {
                nombreHijoAgregar = `${hijoData.nombres || ''} ${hijoData.apellidos || ''}`.trim();
              }
            }
          } catch (error) {
            console.error('Error al cargar datos del hijo:', error);
          }
        } else if (hijo && !nombreHijoAgregar) {
          nombreHijoAgregar = `${hijo.nombres || ''} ${hijo.apellidos || ''}`.trim();
        }

        // Cargar datos del apoderado si no están disponibles
        if (!datosApoderado && rutApoderadoAgregar) {
          try {
            const apoderadoRef = query(collection(db, 'usuarios'), where('rut', '==', rutApoderadoAgregar));
            const apoderadoSnap = await getDocs(apoderadoRef);
            if (!apoderadoSnap.empty) {
              const apoderadoData = apoderadoSnap.docs[0].data();
              setDatosApoderado(apoderadoData);
              if (!nombreApoderadoAgregar) {
                nombreApoderadoAgregar = `${apoderadoData.nombres || ''} ${apoderadoData.apellidos || ''}`.trim();
              }
            }
          } catch (error) {
            console.error('Error al cargar datos del apoderado:', error);
          }
        } else if (datosApoderado && !nombreApoderadoAgregar) {
          nombreApoderadoAgregar = `${datosApoderado.nombres || ''} ${datosApoderado.apellidos || ''}`.trim();
        }

        if (!rutApoderadoAgregar || !rutHijoAgregar || !patenteFurgonAgregar) {
          Alert.alert('Error', 'Faltan datos necesarios para completar la aceptación.');
          return;
        }

        // Agregar el hijo a lista_pasajeros
        const listaPasajerosRef = collection(db, 'lista_pasajeros');
        const payloadListaPasajeros = {
          rutConductor: rutUsuario,
          rutApoderado: rutApoderadoAgregar,
          nombreApoderado: nombreApoderadoAgregar,
          rutHijo: rutHijoAgregar,
          nombreHijo: nombreHijoAgregar,
          patenteFurgon: patenteFurgonAgregar,
          idFurgon: idFurgonAgregar,
          colegio: hijo?.colegio || '',
          nombreFurgon: params.nombreFurgon as string || '',
          fechaAceptacion: fechaISO,
          estado: 'aceptada',
          origen: 'agregar_hijo',
        };

        await addDoc(listaPasajerosRef, payloadListaPasajeros);

        // Enviar mensaje de confirmación (uno para cada participante)
        const chatId = `agregar_hijo_${rutHijoAgregar}_${rutApoderadoAgregar}_${rutUsuario}`;
        
        // Mensaje para el apoderado
        await addDoc(collection(db, 'MensajesChat'), {
          chatId,
          texto: 'El hijo ha sido agregado exitosamente al furgón.',
          emisor: 'Sistema',
          receptor: rutApoderadoAgregar,
          participantes: participantesChat,
          fecha: fechaISO,
          entregado: true,
          leido: false,
        });
        
        // Mensaje para el conductor (para que también lo vea)
        await addDoc(collection(db, 'MensajesChat'), {
          chatId,
          texto: 'El hijo ha sido agregado exitosamente al furgón.',
          emisor: 'Sistema',
          receptor: rutUsuario,
          participantes: participantesChat,
          fecha: fechaISO,
          entregado: true,
          leido: false,
        });

        Alert.alert('Hijo agregado', 'El hijo ha sido agregado exitosamente al furgón.');
        router.back();
        return;
      }

      // Si es una postulación normal
      if (!postulacion) {
        Alert.alert('Error', 'No se encontraron los datos de la postulación.');
        return;
      }

      const patenteFurgon = await obtenerPatenteFurgon();

      const rutApoderado = postulacion.rutUsuario || '';
      const rutHijo = postulacion.rutHijo || '';
      const idHijo = postulacion.idHijo || '';
      const idFurgon = postulacion.idFurgon || '';

      let infoApoderado = datosApoderado;
      if (!infoApoderado && rutApoderado) {
        const apoderadoRef = query(collection(db, 'usuarios'), where('rut', '==', rutApoderado));
        const apoderadoSnap = await getDocs(apoderadoRef);
        if (!apoderadoSnap.empty) {
          infoApoderado = apoderadoSnap.docs[0].data();
          setDatosApoderado(infoApoderado);
        }
      }
      const nombreApoderado = infoApoderado
        ? `${infoApoderado.nombres || ''} ${infoApoderado.apellidos || ''}`.trim()
        : '';

      let infoHijo = hijo;
      if (!infoHijo && idHijo) {
        const hijoRef = doc(db, 'Hijos', idHijo);
        const hijoSnap = await getDoc(hijoRef);
        if (hijoSnap.exists()) {
          infoHijo = { id: hijoSnap.id, ...hijoSnap.data() };
          setHijo(infoHijo);
        }
      }
      const nombreHijo = infoHijo
        ? `${infoHijo.nombres || ''} ${infoHijo.apellidos || ''}`.trim()
        : '';

      if (!rutApoderado || !rutHijo) {
        Alert.alert('Error', 'Faltan datos del apoderado o del hijo para completar la aceptación.');
        return;
      }

      // Buscar todas las postulaciones pendientes del mismo apoderado para el mismo furgón
      const postulacionesRef = collection(db, 'Postulaciones');
      
      // Intentar buscar por patenteFurgon primero
      let postulacionesRelacionadasSnap;
      try {
        const queryPorPatente = query(
          postulacionesRef,
          where('rutUsuario', '==', rutApoderado),
          where('patenteFurgon', '==', patenteFurgon),
          where('estado', '==', 'pendiente')
        );
        postulacionesRelacionadasSnap = await getDocs(queryPorPatente);
        console.log('Postulaciones encontradas por patente:', postulacionesRelacionadasSnap.docs.length);
      } catch (error) {
        console.warn('Error al buscar por patente, intentando por idFurgon:', error);
        // Si falla, buscar por idFurgon
        if (idFurgon) {
          try {
            const queryPorFurgon = query(
              postulacionesRef,
              where('rutUsuario', '==', rutApoderado),
              where('idFurgon', '==', idFurgon),
              where('estado', '==', 'pendiente')
            );
            postulacionesRelacionadasSnap = await getDocs(queryPorFurgon);
            console.log('Postulaciones encontradas por idFurgon:', postulacionesRelacionadasSnap.docs.length);
          } catch (error2) {
            console.warn('Error al buscar por idFurgon, buscando todas las pendientes del apoderado:', error2);
            // Como último recurso, buscar todas las pendientes del apoderado y filtrar
            const queryTodas = query(
              postulacionesRef,
              where('rutUsuario', '==', rutApoderado),
              where('estado', '==', 'pendiente')
            );
            const todasSnap = await getDocs(queryTodas);
            // Filtrar manualmente por patenteFurgon o idFurgon
            const filtradas = todasSnap.docs.filter(doc => {
              const data = doc.data();
              return (data.patenteFurgon === patenteFurgon) || (data.idFurgon === idFurgon);
            });
            // Crear un objeto similar a un QuerySnapshot
            postulacionesRelacionadasSnap = {
              docs: filtradas,
              empty: filtradas.length === 0,
              size: filtradas.length
            } as any;
            console.log('Postulaciones encontradas después de filtrar:', filtradas.length);
          }
        } else {
          // Si no hay idFurgon, buscar todas las pendientes del apoderado
          const queryTodas = query(
            postulacionesRef,
            where('rutUsuario', '==', rutApoderado),
            where('estado', '==', 'pendiente')
          );
          const todasSnap = await getDocs(queryTodas);
          // Filtrar manualmente por patenteFurgon
          const filtradas = todasSnap.docs.filter(doc => {
            const data = doc.data();
            return data.patenteFurgon === patenteFurgon;
          });
          postulacionesRelacionadasSnap = {
            docs: filtradas,
            empty: filtradas.length === 0,
            size: filtradas.length
          } as any;
          console.log('Postulaciones encontradas después de filtrar (sin idFurgon):', filtradas.length);
        }
      }
      
      // Si no se encontraron postulaciones relacionadas, usar solo la postulación actual
      if (postulacionesRelacionadasSnap.empty || postulacionesRelacionadasSnap.docs.length === 0) {
        console.log('No se encontraron postulaciones relacionadas, procesando solo la postulación actual');
        // Crear un array con solo la postulación actual
        const postulacionActualDoc = await getDoc(doc(db, 'Postulaciones', idPostulacion));
        if (postulacionActualDoc.exists()) {
          postulacionesRelacionadasSnap = {
            docs: [postulacionActualDoc],
            empty: false,
            size: 1
          } as any;
        } else {
          postulacionesRelacionadasSnap = {
            docs: [],
            empty: true,
            size: 0
          } as any;
        }
      }
      
      const listaPasajerosRef = collection(db, 'lista_pasajeros');
      const hijosAgregados: string[] = [];
      
      console.log(`Procesando ${postulacionesRelacionadasSnap.docs.length} postulación(es) relacionada(s)`);
      
      // Procesar todas las postulaciones relacionadas
      for (const postulacionDoc of postulacionesRelacionadasSnap.docs) {
        const postulacionData = postulacionDoc.data();
        const postulacionId = postulacionDoc.id;
        const rutHijoPostulacion = postulacionData.rutHijo || '';
        const idHijoPostulacion = postulacionData.idHijo || '';
        
        if (!rutHijoPostulacion) continue;
        
        // Obtener datos del hijo
        let nombreHijoPostulacion = '';
        let colegioPostulacion = postulacionData.colegio || '';
        if (idHijoPostulacion) {
          try {
            const hijoRef = doc(db, 'Hijos', idHijoPostulacion);
            const hijoSnap = await getDoc(hijoRef);
            if (hijoSnap.exists()) {
              const hijoData = hijoSnap.data();
              nombreHijoPostulacion = `${hijoData.nombres || ''} ${hijoData.apellidos || ''}`.trim();
              if (!colegioPostulacion) {
                colegioPostulacion = hijoData.colegio || '';
              }
            }
          } catch (error) {
            console.error('Error al cargar datos del hijo:', error);
          }
        }
        
        // Verificar si ya existe en lista_pasajeros
        const listaExistenteQuery = query(
          listaPasajerosRef,
          where('idPostulacion', '==', postulacionId)
        );
        const listaExistenteSnap = await getDocs(listaExistenteQuery);
        
        const payloadListaPasajeros = {
          idPostulacion: postulacionId,
          idFurgon: postulacionData.idFurgon || idFurgon,
          rutConductor: rutUsuario,
          rutApoderado,
          nombreApoderado,
          rutHijo: rutHijoPostulacion,
          nombreHijo: nombreHijoPostulacion || 'Sin nombre',
          patenteFurgon,
          colegio: colegioPostulacion || postulacionData.colegio || '',
          nombreFurgon: postulacionData.nombreFurgon || postulacion.nombreFurgon || '',
          fechaAceptacion: fechaISO,
          estado: 'aceptada',
        };

        if (listaExistenteSnap.empty) {
          await addDoc(listaPasajerosRef, payloadListaPasajeros);
          hijosAgregados.push(nombreHijoPostulacion || rutHijoPostulacion);
          console.log(`✓ Hijo agregado a lista_pasajeros: ${nombreHijoPostulacion || rutHijoPostulacion}`);
        } else {
          await updateDoc(listaExistenteSnap.docs[0].ref, payloadListaPasajeros);
          hijosAgregados.push(nombreHijoPostulacion || rutHijoPostulacion);
          console.log(`✓ Hijo actualizado en lista_pasajeros: ${nombreHijoPostulacion || rutHijoPostulacion}`);
        }
        
        // Actualizar el estado de la postulación
        await updateDoc(doc(db, 'Postulaciones', postulacionId), {
          estado: 'aceptada',
          rutConductor: rutUsuario,
          patenteFurgon,
          fechaAceptacion: fechaISO,
        });
        console.log(`✓ Postulación ${postulacionId} marcada como aceptada`);
      }
      
      console.log(`Total de hijos agregados: ${hijosAgregados.length}`);

      // Eliminar/marcar como revisadas las alertas relacionadas con las postulaciones aceptadas
      try {
        const alertasRef = collection(db, 'Alertas');
        // Buscar alertas por rutDestinatario normalizado y original
        const normalizarRut = (rut: string) => rut.replace(/[^0-9kK]/g, '').toUpperCase();
        const rutUsuarioNormalizado = normalizarRut(rutUsuario);
        
        // Buscar alertas que coincidan con el conductor (normalizado o original)
        const alertasQuery1 = query(
          alertasRef,
          where('tipoAlerta', '==', 'Postulacion')
        );
        const todasLasAlertas = await getDocs(alertasQuery1);
        
        const batchAlertas = writeBatch(db);
        let alertasActualizadas = 0;
        
        todasLasAlertas.docs.forEach((alertaDoc) => {
          const alertaData = alertaDoc.data();
          const rutDestinatario = alertaData.rutDestinatario || '';
          const rutDestinatarioOriginal = alertaData.rutDestinatarioOriginal || '';
          const rutDestinatarioNormalizado = normalizarRut(rutDestinatario);
          
          // Verificar si la alerta es para este conductor (comparar normalizado y original)
          const esParaEsteConductor = 
            rutDestinatario === rutUsuario ||
            rutDestinatarioOriginal === rutUsuario ||
            rutDestinatarioNormalizado === rutUsuarioNormalizado;
          
          if (!esParaEsteConductor) return;
          
          const parametros = alertaData.parametros || {};
          const idPostulacionAlerta = parametros.idPostulacion;
          
          // Verificar si esta alerta corresponde a alguna de las postulaciones aceptadas
          const esPostulacionAceptada = postulacionesRelacionadasSnap.docs.some(
            (postDoc: any) => postDoc.id === idPostulacionAlerta
          );
          
          if (esPostulacionAceptada) {
            // Marcar la alerta como revisada
            batchAlertas.update(alertaDoc.ref, {
              revisado: true,
              fechaRevision: fechaISO,
            });
            alertasActualizadas++;
          }
        });
        
        if (alertasActualizadas > 0) {
          await batchAlertas.commit();
          console.log(`✓ ${alertasActualizadas} alerta(s) marcada(s) como revisada(s) y eliminada(s) del conductor`);
        }
      } catch (error) {
        console.error('Error al actualizar alertas:', error);
      }

      // Procesar postulacion_furgon y ValidacionesPostulacion para todas las postulaciones relacionadas
      for (const postulacionDoc of postulacionesRelacionadasSnap.docs) {
        const postulacionId = postulacionDoc.id;
        
        const postulacionFurgonQuery = query(
          collection(db, 'postulacion_furgon'),
          where('postulacionDocId', '==', postulacionId),
        );
        const postulacionFurgonSnap = await getDocs(postulacionFurgonQuery);
        if (!postulacionFurgonSnap.empty) {
          await updateDoc(postulacionFurgonSnap.docs[0].ref, {
            estado: 'aceptada',
            fecha: fechaISO,
            rutConductor: rutUsuario,
          });
        }

        await addDoc(collection(db, 'ValidacionesPostulacion'), {
          idPostulacion: postulacionId,
          estado: 'aceptada',
          fecha: fechaISO,
        });
      }

      const receptorFinal = rutReceptor || rutUsuario;
      const mensajeTexto = 'La postulación ha sido aprobada.';
      
      // Mensaje solo para el receptor (apoderado) - usar el idPostulacion original para mantener el chat
      await addDoc(collection(db, 'MensajesChat'), {
        idPostulacion,
        texto: mensajeTexto,
        emisor: 'Sistema',
        receptor: receptorFinal,
        participantes: participantesChat,
        fecha: fechaISO,
        entregado: true,
        leido: false,
      });
      
      // Mensaje para el conductor (si no es el receptor) - solo si es diferente
      if (rutUsuario !== receptorFinal) {
        await addDoc(collection(db, 'MensajesChat'), {
          idPostulacion,
          texto: mensajeTexto,
          emisor: 'Sistema',
          receptor: rutUsuario,
          participantes: participantesChat,
          fecha: fechaISO,
          entregado: true,
          leido: false,
        });
      }

      const mensajeAlerta = hijosAgregados.length > 1
        ? `Se han aprobado ${hijosAgregados.length} postulaciones y agregado ${hijosAgregados.length} hijo(s) al furgón.`
        : 'Postulación aprobada';
      
      Alert.alert('Postulación aprobada', mensajeAlerta);
      
      // Si el usuario actual es el apoderado (receptor), redirigir a la página principal
      const rutUsuarioActual = await AsyncStorage.getItem('rutUsuario');
      if (rutUsuarioActual === receptorFinal) {
        router.replace('/(tabs)/apoderado/pagina-principal-apoderado');
      } else {
        router.back();
      }
    } catch (error) {
      console.error('Error al aceptar:', error);
    }
  };

  const participantesConversacion = [rutUsuario, rutReceptor].filter(Boolean);
  const mensajesFiltrados = useMemo(() => {
    return mensajes.filter((item) => {
      // Excluir mensajes eliminados por el usuario
      if (mensajesEliminados.has(item.id)) {
        return false;
      }
      
      const emisor = item.emisor as string | undefined;
      const receptor = item.receptor as string | undefined;
      const participantesMensaje: string[] = Array.isArray(item.participantes)
        ? item.participantes
        : [emisor, receptor].filter(Boolean) as string[];

      if (!rutUsuario) {
        return false;
      }

      // Mensajes del sistema: deben ser para el usuario actual
      if (emisor === 'Sistema') {
        return receptor === rutUsuario;
      }

      // Si no hay rutReceptor (chat de AgregarHijo), mostrar todos los mensajes
      // donde el usuario es emisor o receptor
      if (!rutReceptor) {
        return emisor === rutUsuario || receptor === rutUsuario;
      }

      // Si hay rutReceptor (chat normal), verificar conversación directa
      const esConversacionDirecta =
        (emisor === rutUsuario && receptor === rutReceptor) ||
        (emisor === rutReceptor && receptor === rutUsuario);

      return esConversacionDirecta;
    });
  }, [mensajes, mensajesEliminados, rutUsuario, rutReceptor]);

  // Hacer scroll al final cuando se cargan los mensajes
  useEffect(() => {
    if (mensajesFiltrados.length > 0) {
      // Pequeño delay para asegurar que el FlatList esté renderizado
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 100);
    }
  }, [mensajesFiltrados.length]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleSalirChat} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="person-circle-outline" size={28} color="#fff" />
          <Text style={styles.headerText}>{nombreReceptor}</Text>
        </View>
        <TouchableOpacity 
          style={styles.menuButton} 
          onPress={() => setMenuVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={28} color="#fff" />
        </TouchableOpacity>
        
        {/* Menú desplegable */}
        <Modal
          visible={menuVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setMenuVisible(false)}
        >
          <Pressable 
            style={styles.menuOverlay} 
            onPress={() => setMenuVisible(false)}
          >
            <Pressable 
              style={styles.menuContainer}
              onPress={(e) => e.stopPropagation()}
            >
              <TouchableOpacity
                style={styles.menuItem}
                onPress={(e) => {
                  e.stopPropagation();
                  handleLimpiarChat();
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={20} color="#333" />
                <Text style={styles.menuItemText}>Limpiar chat</Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>
      </View>

      {cargandoAuth && (
        <View style={{ padding: 10 }}>
          <Text style={{ color: '#127067' }}>Cargando chat...</Text>
        </View>
      )}

      {hijo && esChatUrgencia && (
        <View style={{ padding: 10, backgroundColor: '#fff' }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#a94442' }}>
            Problema urgente con: {hijo.nombres} {hijo.apellidos}
          </Text>
        </View>
      )}

      {mensajesFiltrados.length === 0 && mensajes.length > 0 ? (
        <View style={styles.emptyChatContainer}>
          <Ionicons name="chatbubbles-outline" size={64} color="#ccc" />
          <Text style={styles.emptyChatText}>No hay mensajes visibles</Text>
          <Text style={styles.emptyChatSubtext}>Los mensajes están ocultos. Los nuevos mensajes aparecerán aquí.</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={mensajesFiltrados}
          keyExtractor={(item, index) =>
            typeof item.id === 'string' ? item.id : index.toString()
          }
          renderItem={({ item }) => (
          <View
            style={[
              styles.mensajeItem,
              item.emisor === rutUsuario ? styles.mensajePropio : styles.mensajeAjeno,
            ]}
          >
            <Text style={styles.mensajeTexto}>{item.texto}</Text>
            <View style={styles.mensajeMetaContainer}>
              <Text style={styles.mensajeMeta}>
                {item.emisor === 'Sistema' ? 'Sistema' : ''} {item.emisor === 'Sistema' ? '• ' : ''}{new Date(item.fecha).toLocaleTimeString('es-CL', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              {/* Indicadores de lectura tipo WhatsApp - solo para mensajes propios */}
              {item.emisor === rutUsuario && item.emisor !== 'Sistema' && (
                <View style={styles.checkContainer}>
                  {item.leido ? (
                    <Ionicons name="checkmark-done" size={16} color="#4FC3F7" />
                  ) : item.entregado ? (
                    <Ionicons name="checkmark-done" size={16} color="#999" />
                  ) : (
                    <Ionicons name="checkmark" size={16} color="#999" />
                  )}
                </View>
              )}
            </View>
          </View>
        )}
        style={styles.chatArea}
        onContentSizeChange={() => {
          // Hacer scroll al final cuando el contenido cambia
          flatListRef.current?.scrollToEnd({ animated: false });
        }}
        onLayout={() => {
          // Hacer scroll al final cuando el layout se carga
          flatListRef.current?.scrollToEnd({ animated: false });
        }}
      />
      )}

      <View style={styles.inputArea}>
        <TextInput
          style={styles.input}
          value={mensaje}
          onChangeText={setMensaje}
          placeholder="Escribe un mensaje..."
          editable={autorizado}
        />
        <TouchableHighlight style={styles.sendButton} onPress={enviarMensaje} underlayColor="#0c5c4e" disabled={!autorizado}>
          <Ionicons name="send" size={24} color="#fff" />
        </TouchableHighlight>
      </View>

      {mostrarBotonesValidacion && (
        <View style={styles.botonesValidacion}>
          <TouchableHighlight style={styles.aceptarButton} onPress={aceptarPostulacion} underlayColor="#0c5c4e">
            <Text style={styles.accionText}>Aceptar</Text>
          </TouchableHighlight>
          <TouchableHighlight style={styles.rechazarButton} onPress={rechazarPostulacion} underlayColor="#a94442">
            <Text style={styles.accionText}>Rechazar</Text>
          </TouchableHighlight>
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7F8',
  },
  header: {
    backgroundColor: '#127067',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  backButton: {
    padding: 4,
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  headerText: {
    fontSize: 18,
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  chatArea: {
    flex: 1,
    padding: 10,
  },
  mensajeItem: {
    marginVertical: 6,
    padding: 10,
    borderRadius: 10,
    maxWidth: '80%',
  },
  mensajePropio: {
    backgroundColor: '#d1f5e1',
    alignSelf: 'flex-end',
  },
  mensajeAjeno: {
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  mensajeTexto: {
    fontSize: 14,
    color: '#333',
  },
  mensajeMetaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  mensajeMeta: {
    fontSize: 10,
    color: '#888',
  },
  checkContainer: {
    marginLeft: 4,
  },
  menuButton: {
    padding: 4,
  },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: 16,
  },
  menuContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
    minWidth: 150,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 4,
  },
  menuItemText: {
    fontSize: 16,
    color: '#333',
    marginLeft: 12,
  },
  inputArea: {
    flexDirection: 'row',
    padding: 10,
    borderTopWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#127067',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: '#127067',
    borderRadius: 20,
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  botonesValidacion: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderColor: '#ccc',
  },
  aceptarButton: {
    backgroundColor: '#27ae60',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  rechazarButton: {
    backgroundColor: '#c0392b',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
  },
  accionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  emptyChatContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyChatText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    textAlign: 'center',
  },
  emptyChatSubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },
});

