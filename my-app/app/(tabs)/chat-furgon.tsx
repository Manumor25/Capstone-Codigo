import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { db } from '@/firebaseConfig';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  onSnapshot,
  Unsubscribe,
  getDoc,
  doc,
} from 'firebase/firestore';

interface ApoderadoChat {
  rutApoderado: string;
  nombreApoderado: string;
  rutHijo: string;
  nombreHijo: string;
  idPostulacion?: string;
  patenteFurgon: string;
  idFurgon?: string;
  ultimoMensaje?: string;
  ultimoMensajeFecha?: Date;
  ultimoMensajeEmisor?: string;
  cantidadNoLeidos?: number;
}

interface ConductorChat {
  rutConductor: string;
  nombreConductor: string;
  rutHijo: string;
  nombreHijo: string;
  idPostulacion?: string;
  patenteFurgon: string;
  idFurgon?: string;
  ultimoMensaje?: string;
  ultimoMensajeFecha?: Date;
  ultimoMensajeEmisor?: string;
  cantidadNoLeidos?: number;
}

export default function ChatFurgon() {
  useSyncRutActivo();
  const router = useRouter();
  const [apoderados, setApoderados] = useState<ApoderadoChat[]>([]);
  const [conductores, setConductores] = useState<ConductorChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [rutConductor, setRutConductor] = useState<string>('');
  const [rutApoderado, setRutApoderado] = useState<string>('');
  const [rolUsuario, setRolUsuario] = useState<'conductor' | 'apoderado' | ''>('');
  const unsubscribeRefs = useRef<Map<string, Unsubscribe>>(new Map());

  // Función para obtener la clave única del chat
  const obtenerClaveChat = (idPostulacion?: string, rutHijo?: string, rutApoderado?: string, rutConductor?: string): string => {
    if (idPostulacion) {
      return `chat_${idPostulacion}`;
    }
    if (rutHijo && rutApoderado && rutConductor) {
      return `chat_agregar_hijo_${rutHijo}_${rutApoderado}_${rutConductor}`;
    }
    return '';
  };

  // Función para obtener última fecha de lectura del chat
  const obtenerUltimaLectura = async (claveChat: string): Promise<Date | null> => {
    try {
      const fechaStr = await AsyncStorage.getItem(`ultima_lectura_${claveChat}`);
      if (fechaStr) {
        return new Date(fechaStr);
      }
    } catch (error) {
      console.error('Error al obtener última lectura:', error);
    }
    return null;
  };

  // Función para guardar última fecha de lectura del chat
  const guardarUltimaLectura = async (claveChat: string): Promise<void> => {
    try {
      const fechaActual = new Date().toISOString();
      await AsyncStorage.setItem(`ultima_lectura_${claveChat}`, fechaActual);
    } catch (error) {
      console.error('Error al guardar última lectura:', error);
    }
  };

  // Función para contar mensajes no leídos
  const contarMensajesNoLeidos = async (
    mensajes: any[],
    rutUsuario: string,
    claveChat: string
  ): Promise<number> => {
    try {
      const ultimaLectura = await obtenerUltimaLectura(claveChat);
      if (!ultimaLectura) {
        // Si no hay fecha de lectura, contar todos los mensajes que no son del usuario
        return mensajes.filter((msg) => {
          const emisor = msg.emisor || '';
          return emisor !== rutUsuario && emisor !== 'Sistema';
        }).length;
      }

      // Contar mensajes después de la última lectura que no son del usuario
      const noLeidos = mensajes.filter((msg) => {
        const emisor = msg.emisor || '';
        if (emisor === rutUsuario || emisor === 'Sistema') return false;
        
        if (!msg.fecha) return false;
        const fechaMensaje = new Date(msg.fecha);
        return fechaMensaje > ultimaLectura;
      });

      return noLeidos.length;
    } catch (error) {
      console.error('Error al contar mensajes no leídos:', error);
      return 0;
    }
  };

  const cargarChats = useCallback(async () => {
    try {
      const rut = await AsyncStorage.getItem('rutUsuario');
      const rol = (await AsyncStorage.getItem('userRole') || await AsyncStorage.getItem('rolUsuario') || '').toLowerCase();
      
      if (!rut) {
        Alert.alert('Error', 'No se encontró el RUT del usuario.');
        setLoading(false);
        return;
      }
      
      setRolUsuario(rol as 'conductor' | 'apoderado' | '');
      
      // Si es conductor, cargar lista de apoderados
      if (rol === 'conductor') {
        setRutConductor(rut);
        await cargarApoderados(rut);
      } 
      // Si es apoderado, cargar lista de conductores
      else if (rol === 'apoderado') {
        setRutApoderado(rut);
        await cargarConductores(rut);
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error al determinar rol:', error);
      setLoading(false);
    }
  }, []);

  const cargarApoderados = useCallback(async (rutConductor: string) => {
    try {
      // Obtener todos los apoderados desde lista_pasajeros
      const listaPasajerosRef = collection(db, 'lista_pasajeros');
      const q = query(
        listaPasajerosRef,
        where('rutConductor', '==', rutConductor),
      );
      const snapshot = await getDocs(q);

      const apoderadosMap = new Map<string, ApoderadoChat>();

      // Agrupar solo por apoderado (un chat por apoderado, no por hijo)
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const rutApoderado = data.rutApoderado || '';
        const nombreApoderado = data.nombreApoderado || 'Sin nombre';
        const rutHijo = data.rutHijo || '';
        const nombreHijo = data.nombreHijo || 'Sin nombre';
        const idPostulacion = data.idPostulacion || '';
        const patenteFurgon = data.patenteFurgon || '';
        const idFurgon = data.idFurgon || '';

        if (!rutApoderado) continue;

        // Crear una clave única solo por apoderado (un chat por apoderado)
        const claveChat = rutApoderado;

        if (!apoderadosMap.has(claveChat)) {
          // Si es el primer hijo de este apoderado, crear la entrada
          apoderadosMap.set(claveChat, {
            rutApoderado,
            nombreApoderado,
            rutHijo, // Guardar el primer hijo encontrado (se usará como referencia)
            nombreHijo, // Guardar el primer hijo encontrado
            idPostulacion, // Guardar la primera postulación encontrada
            patenteFurgon,
            idFurgon,
          });
        }
      }

      const apoderadosLista = Array.from(apoderadosMap.values());

      // Para cada apoderado, buscar TODOS los mensajes de TODOS sus hijos y combinarlos
      const apoderadosConMensajes = await Promise.all(
        apoderadosLista.map(async (apoderado) => {
          try {
            // Obtener todos los hijos de este apoderado con este conductor
            const todosLosHijos = snapshot.docs
              .filter(doc => {
                const data = doc.data();
                return data.rutApoderado === apoderado.rutApoderado;
              })
              .map(doc => doc.data());

            // Recopilar todos los mensajes de todos los hijos
            const todosLosMensajes: Array<{
              id: string;
              texto: string;
              fecha: string;
              emisor: string;
              claveChat: string;
            }> = [];

            let totalNoLeidos = 0;

            for (const hijoData of todosLosHijos) {
              const rutHijo = hijoData.rutHijo || '';
              let idPostulacion = hijoData.idPostulacion || '';

              // Si no hay idPostulacion, intentar obtenerla desde Postulaciones
              if (!idPostulacion) {
                try {
                  const postulacionesRef = collection(db, 'Postulaciones');
                  const postQuery = query(
                    postulacionesRef,
                    where('rutUsuario', '==', apoderado.rutApoderado),
                    where('rutHijo', '==', rutHijo),
                    where('rutConductor', '==', rutConductor),
                    limit(1),
                  );
                  const postSnap = await getDocs(postQuery);
                  if (!postSnap.empty) {
                    idPostulacion = postSnap.docs[0].id;
                  }
                } catch (error) {
                  console.error('Error al buscar postulación:', error);
                }
              }

              const claveChat = obtenerClaveChat(
                idPostulacion,
                rutHijo,
                apoderado.rutApoderado,
                rutConductor
              );

              // Buscar mensajes por idPostulacion si existe
              if (idPostulacion) {
                try {
                  const mensajesRef = collection(db, 'MensajesChat');
                  const mensajesQuery = query(
                    mensajesRef,
                    where('idPostulacion', '==', idPostulacion),
                  );
                  const mensajesSnap = await getDocs(mensajesQuery);
                  
                  if (!mensajesSnap.empty) {
                    const mensajesHijo = mensajesSnap.docs.map(doc => {
                      const data = doc.data() as any;
                      return {
                        id: doc.id,
                        texto: data.texto || '',
                        fecha: data.fecha || '',
                        emisor: data.emisor || '',
                        claveChat,
                      };
                    });
                    todosLosMensajes.push(...mensajesHijo);
                    
                    // Contar mensajes no leídos de este hijo
                    const noLeidos = await contarMensajesNoLeidos(mensajesHijo, rutConductor, claveChat);
                    totalNoLeidos += noLeidos;
                  }
                } catch (error) {
                  console.error('Error al cargar mensajes:', error);
                }
              } else {
                // Si no hay idPostulacion, buscar por chatId (para chats de AgregarHijo)
                try {
                  const chatId = `agregar_hijo_${rutHijo}_${apoderado.rutApoderado}_${rutConductor}`;
                  const mensajesRef = collection(db, 'MensajesChat');
                  const mensajesQuery = query(
                    mensajesRef,
                    where('chatId', '==', chatId),
                  );
                  const mensajesSnap = await getDocs(mensajesQuery);
                  
                  if (!mensajesSnap.empty) {
                    const mensajesHijo = mensajesSnap.docs.map(doc => {
                      const data = doc.data() as any;
                      return {
                        id: doc.id,
                        texto: data.texto || '',
                        fecha: data.fecha || '',
                        emisor: data.emisor || '',
                        claveChat,
                      };
                    });
                    todosLosMensajes.push(...mensajesHijo);
                    
                    // Contar mensajes no leídos de este hijo
                    const noLeidos = await contarMensajesNoLeidos(mensajesHijo, rutConductor, claveChat);
                    totalNoLeidos += noLeidos;
                  }
                } catch (error) {
                  console.error('Error al cargar mensajes por chatId:', error);
                }
              }
            }

            // Ordenar todos los mensajes por fecha (más reciente primero)
            todosLosMensajes.sort((a, b) => {
              const fechaA = a.fecha ? new Date(a.fecha).getTime() : 0;
              const fechaB = b.fecha ? new Date(b.fecha).getTime() : 0;
              return fechaB - fechaA;
            });

            // Obtener el último mensaje de todos los hijos
            if (todosLosMensajes.length > 0) {
              const ultimoMensaje = todosLosMensajes[0];
              apoderado.ultimoMensaje = ultimoMensaje.texto || '';
              apoderado.ultimoMensajeFecha = ultimoMensaje.fecha 
                ? new Date(ultimoMensaje.fecha) 
                : undefined;
              apoderado.ultimoMensajeEmisor = ultimoMensaje.emisor || '';
            }

            apoderado.cantidadNoLeidos = totalNoLeidos;

            // Configurar listener en tiempo real para el primer chat (se actualizará con todos)
            if (todosLosHijos.length > 0) {
              const primerHijo = todosLosHijos[0];
              let primerIdPostulacion = primerHijo.idPostulacion || '';
              if (!primerIdPostulacion) {
                try {
                  const postulacionesRef = collection(db, 'Postulaciones');
                  const postQuery = query(
                    postulacionesRef,
                    where('rutUsuario', '==', apoderado.rutApoderado),
                    where('rutHijo', '==', primerHijo.rutHijo),
                    where('rutConductor', '==', rutConductor),
                    limit(1),
                  );
                  const postSnap = await getDocs(postQuery);
                  if (!postSnap.empty) {
                    primerIdPostulacion = postSnap.docs[0].id;
                  }
                } catch (error) {
                  console.error('Error al buscar postulación:', error);
                }
              }
              const claveChat = obtenerClaveChat(
                primerIdPostulacion,
                primerHijo.rutHijo,
                apoderado.rutApoderado,
                rutConductor
              );
              if (claveChat) {
                configurarListenerChat(apoderado, rutConductor, claveChat, 'apoderado');
              }
            }
          } catch (error) {
            console.error('Error al cargar mensajes para apoderado:', error);
            apoderado.cantidadNoLeidos = 0;
          }
          return apoderado;
        }),
      );

      // Ordenar por fecha del último mensaje (más reciente primero)
      // Los que no tienen mensajes van al final
      apoderadosConMensajes.sort((a, b) => {
        const fechaA = a.ultimoMensajeFecha?.getTime() || 0;
        const fechaB = b.ultimoMensajeFecha?.getTime() || 0;
        if (fechaA === 0 && fechaB === 0) return 0;
        if (fechaA === 0) return 1;
        if (fechaB === 0) return -1;
        return fechaB - fechaA;
      });

      setApoderados(apoderadosConMensajes);
      setLoading(false);
    } catch (error) {
      console.error('Error al cargar apoderados:', error);
      Alert.alert('Error', 'No se pudieron cargar los apoderados.');
      setLoading(false);
    }
  }, []);

  const cargarConductores = useCallback(async (rutApoderado: string) => {
    try {
      // Obtener todos los conductores desde lista_pasajeros
      const listaPasajerosRef = collection(db, 'lista_pasajeros');
      const q = query(
        listaPasajerosRef,
        where('rutApoderado', '==', rutApoderado),
      );
      const snapshot = await getDocs(q);

      const conductoresMap = new Map<string, ConductorChat>();

      // Obtener nombre del apoderado una vez
      let nombreApoderadoFinal = '';
      try {
        const usuariosRef = collection(db, 'usuarios');
        const usuariosQuery = query(usuariosRef, where('rut', '==', rutApoderado), limit(1));
        const usuariosSnap = await getDocs(usuariosQuery);
        if (!usuariosSnap.empty) {
          const usuarioData = usuariosSnap.docs[0].data();
          nombreApoderadoFinal = `${usuarioData.nombres || ''} ${usuarioData.apellidos || ''}`.trim();
        }
      } catch (error) {
        console.error('Error al obtener nombre del apoderado:', error);
      }

      // Agrupar solo por conductor (un chat por conductor, no por hijo)
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const rutConductor = data.rutConductor || '';
        const rutHijo = data.rutHijo || '';
        const nombreHijo = data.nombreHijo || 'Sin nombre';
        const idPostulacion = data.idPostulacion || '';
        const patenteFurgon = data.patenteFurgon || '';
        const idFurgon = data.idFurgon || '';

        if (!rutConductor) continue;

        // Buscar nombre del conductor desde usuarios
        let nombreConductorFinal = 'Conductor';
        try {
          const usuariosRef = collection(db, 'usuarios');
          const usuariosQuery = query(usuariosRef, where('rut', '==', rutConductor), limit(1));
          const usuariosSnap = await getDocs(usuariosQuery);
          if (!usuariosSnap.empty) {
            const usuarioData = usuariosSnap.docs[0].data();
            nombreConductorFinal = `${usuarioData.nombres || ''} ${usuarioData.apellidos || ''}`.trim() || 'Conductor';
          }
        } catch (error) {
          console.error('Error al obtener nombre del conductor:', error);
        }

        // Crear una clave única solo por conductor (un chat por conductor)
        const claveChat = rutConductor;

        if (!conductoresMap.has(claveChat)) {
          // Si es el primer hijo de este conductor, crear la entrada
          conductoresMap.set(claveChat, {
            rutConductor,
            nombreConductor: nombreConductorFinal,
            rutHijo, // Guardar el primer hijo encontrado (se usará como referencia)
            nombreHijo, // Guardar el primer hijo encontrado
            idPostulacion, // Guardar la primera postulación encontrada
            patenteFurgon,
            idFurgon,
          });
        }
      }

      const conductoresLista = Array.from(conductoresMap.values());

      // Para cada conductor, buscar TODOS los mensajes de TODOS sus hijos y combinarlos
      const conductoresConMensajes = await Promise.all(
        conductoresLista.map(async (conductor) => {
          try {
            // Obtener todos los hijos de este apoderado con este conductor
            const todosLosHijos = snapshot.docs
              .filter(doc => {
                const data = doc.data();
                return data.rutConductor === conductor.rutConductor;
              })
              .map(doc => doc.data());

            // Recopilar todos los mensajes de todos los hijos
            const todosLosMensajes: Array<{
              id: string;
              texto: string;
              fecha: string;
              emisor: string;
              claveChat: string;
            }> = [];

            let totalNoLeidos = 0;

            for (const hijoData of todosLosHijos) {
              const rutHijo = hijoData.rutHijo || '';
              let idPostulacion = hijoData.idPostulacion || '';

              // Si no hay idPostulacion, intentar obtenerla desde Postulaciones
              if (!idPostulacion) {
                try {
                  const postulacionesRef = collection(db, 'Postulaciones');
                  const postQuery = query(
                    postulacionesRef,
                    where('rutUsuario', '==', rutApoderado),
                    where('rutHijo', '==', rutHijo),
                    where('rutConductor', '==', conductor.rutConductor),
                    limit(1),
                  );
                  const postSnap = await getDocs(postQuery);
                  if (!postSnap.empty) {
                    idPostulacion = postSnap.docs[0].id;
                  }
                } catch (error) {
                  console.error('Error al buscar postulación:', error);
                }
              }

              const claveChat = obtenerClaveChat(
                idPostulacion,
                rutHijo,
                rutApoderado,
                conductor.rutConductor
              );

              // Buscar mensajes por idPostulacion si existe
              if (idPostulacion) {
                try {
                  const mensajesRef = collection(db, 'MensajesChat');
                  const mensajesQuery = query(
                    mensajesRef,
                    where('idPostulacion', '==', idPostulacion),
                  );
                  const mensajesSnap = await getDocs(mensajesQuery);
                  
                  if (!mensajesSnap.empty) {
                    const mensajesHijo = mensajesSnap.docs.map(doc => {
                      const data = doc.data() as any;
                      return {
                        id: doc.id,
                        texto: data.texto || '',
                        fecha: data.fecha || '',
                        emisor: data.emisor || '',
                        claveChat,
                      };
                    });
                    todosLosMensajes.push(...mensajesHijo);
                    
                    // Contar mensajes no leídos de este hijo
                    const noLeidos = await contarMensajesNoLeidos(mensajesHijo, rutApoderado, claveChat);
                    totalNoLeidos += noLeidos;
                  }
                } catch (error) {
                  console.error('Error al cargar mensajes:', error);
                }
              } else {
                // Si no hay idPostulacion, buscar por chatId (para chats de AgregarHijo)
                try {
                  const chatId = `agregar_hijo_${rutHijo}_${rutApoderado}_${conductor.rutConductor}`;
                  const mensajesRef = collection(db, 'MensajesChat');
                  const mensajesQuery = query(
                    mensajesRef,
                    where('chatId', '==', chatId),
                  );
                  const mensajesSnap = await getDocs(mensajesQuery);
                  
                  if (!mensajesSnap.empty) {
                    const mensajesHijo = mensajesSnap.docs.map(doc => {
                      const data = doc.data() as any;
                      return {
                        id: doc.id,
                        texto: data.texto || '',
                        fecha: data.fecha || '',
                        emisor: data.emisor || '',
                        claveChat,
                      };
                    });
                    todosLosMensajes.push(...mensajesHijo);
                    
                    // Contar mensajes no leídos de este hijo
                    const noLeidos = await contarMensajesNoLeidos(mensajesHijo, rutApoderado, claveChat);
                    totalNoLeidos += noLeidos;
                  }
                } catch (error) {
                  console.error('Error al cargar mensajes por chatId:', error);
                }
              }
            }

            // Ordenar todos los mensajes por fecha (más reciente primero)
            todosLosMensajes.sort((a, b) => {
              const fechaA = a.fecha ? new Date(a.fecha).getTime() : 0;
              const fechaB = b.fecha ? new Date(b.fecha).getTime() : 0;
              return fechaB - fechaA;
            });

            // Obtener el último mensaje de todos los hijos
            if (todosLosMensajes.length > 0) {
              const ultimoMensaje = todosLosMensajes[0];
              conductor.ultimoMensaje = ultimoMensaje.texto || '';
              conductor.ultimoMensajeFecha = ultimoMensaje.fecha 
                ? new Date(ultimoMensaje.fecha) 
                : undefined;
              conductor.ultimoMensajeEmisor = ultimoMensaje.emisor || '';
            }

            conductor.cantidadNoLeidos = totalNoLeidos;

            // Configurar listener en tiempo real para el primer chat (se actualizará con todos)
            if (todosLosHijos.length > 0) {
              const primerHijo = todosLosHijos[0];
              let primerIdPostulacion = primerHijo.idPostulacion || '';
              if (!primerIdPostulacion) {
                try {
                  const postulacionesRef = collection(db, 'Postulaciones');
                  const postQuery = query(
                    postulacionesRef,
                    where('rutUsuario', '==', rutApoderado),
                    where('rutHijo', '==', primerHijo.rutHijo),
                    where('rutConductor', '==', conductor.rutConductor),
                    limit(1),
                  );
                  const postSnap = await getDocs(postQuery);
                  if (!postSnap.empty) {
                    primerIdPostulacion = postSnap.docs[0].id;
                  }
                } catch (error) {
                  console.error('Error al buscar postulación:', error);
                }
              }
              const claveChat = obtenerClaveChat(
                primerIdPostulacion,
                primerHijo.rutHijo,
                rutApoderado,
                conductor.rutConductor
              );
              if (claveChat) {
                configurarListenerChat(conductor, rutApoderado, claveChat, 'conductor');
              }
            }
          } catch (error) {
            console.error('Error al cargar mensajes para conductor:', error);
            conductor.cantidadNoLeidos = 0;
          }
          return conductor;
        }),
      );

      // Ordenar por fecha del último mensaje (más reciente primero)
      // Los que no tienen mensajes van al final
      conductoresConMensajes.sort((a, b) => {
        const fechaA = a.ultimoMensajeFecha?.getTime() || 0;
        const fechaB = b.ultimoMensajeFecha?.getTime() || 0;
        if (fechaA === 0 && fechaB === 0) return 0;
        if (fechaA === 0) return 1;
        if (fechaB === 0) return -1;
        return fechaB - fechaA;
      });

      setConductores(conductoresConMensajes);
      setLoading(false);
    } catch (error) {
      console.error('Error al cargar conductores:', error);
      Alert.alert('Error', 'No se pudieron cargar los conductores.');
      setLoading(false);
    }
  }, []);

  // Función para configurar listener en tiempo real para un chat
  const configurarListenerChat = (
    chatItem: ApoderadoChat | ConductorChat,
    rutUsuario: string,
    claveChat: string,
    tipo: 'apoderado' | 'conductor'
  ) => {
    // Limpiar listener anterior si existe
    const unsubscribeAnterior = unsubscribeRefs.current.get(claveChat);
    if (unsubscribeAnterior) {
      unsubscribeAnterior();
    }

    // Guardar identificadores del chat para el listener
    const idPostulacionListener = chatItem.idPostulacion;
    const rutHijoListener = chatItem.rutHijo;
    // rutUsuario es el RUT del usuario actual (quien ve la lista)
    // Para apoderados: rutUsuario es el conductor, rutApoderadoListener es el apoderado del chat
    // Para conductores: rutUsuario es el apoderado, rutConductorListener es el conductor del chat
    const rutApoderadoListener = tipo === 'apoderado' ? (chatItem as ApoderadoChat).rutApoderado : rutUsuario;
    const rutConductorListener = tipo === 'conductor' ? (chatItem as ConductorChat).rutConductor : rutUsuario;

    // Configurar nuevo listener
    try {
      const mensajesRef = collection(db, 'MensajesChat');
      let q;
      
      if (idPostulacionListener) {
        q = query(mensajesRef, where('idPostulacion', '==', idPostulacionListener));
      } else if (tipo === 'apoderado') {
        const chatId = `agregar_hijo_${rutHijoListener}_${rutApoderadoListener}_${rutConductorListener}`;
        q = query(mensajesRef, where('chatId', '==', chatId));
      } else {
        const chatId = `agregar_hijo_${rutHijoListener}_${rutApoderadoListener}_${rutConductorListener}`;
        q = query(mensajesRef, where('chatId', '==', chatId));
      }

      const unsubscribe = onSnapshot(q, async (snapshot) => {
        const todosLosMensajes = snapshot.docs.map(doc => {
          const data = doc.data() as any;
          return {
            id: doc.id,
            texto: data.texto || '',
            fecha: data.fecha || '',
            emisor: data.emisor || '',
          };
        });

        // Ordenar por fecha
        todosLosMensajes.sort((a, b) => {
          const fechaA = a.fecha ? new Date(a.fecha).getTime() : 0;
          const fechaB = b.fecha ? new Date(b.fecha).getTime() : 0;
          return fechaB - fechaA;
        });

        // Contar mensajes no leídos
        const noLeidos = await contarMensajesNoLeidos(todosLosMensajes, rutUsuario, claveChat);

        // Obtener último mensaje
        let ultimoMensaje = '';
        let ultimoMensajeFecha: Date | undefined;
        let ultimoMensajeEmisor = '';
        if (todosLosMensajes.length > 0) {
          ultimoMensaje = todosLosMensajes[0].texto || '';
          ultimoMensajeFecha = todosLosMensajes[0].fecha 
            ? new Date(todosLosMensajes[0].fecha) 
            : undefined;
          ultimoMensajeEmisor = todosLosMensajes[0].emisor || '';
        }

        // Actualizar estado
        if (tipo === 'apoderado') {
          setApoderados(prev => {
            const nuevo = [...prev];
            const index = nuevo.findIndex(a => {
              if (idPostulacionListener) {
                return a.idPostulacion === idPostulacionListener;
              }
              return a.rutApoderado === rutApoderadoListener && a.rutHijo === rutHijoListener;
            });
            if (index !== -1) {
              nuevo[index] = { 
                ...nuevo[index], 
                ultimoMensaje,
                ultimoMensajeFecha,
                ultimoMensajeEmisor,
                cantidadNoLeidos: noLeidos
              };
            }
            return nuevo;
          });
        } else {
          setConductores(prev => {
            const nuevo = [...prev];
            const index = nuevo.findIndex(c => {
              if (idPostulacionListener) {
                return c.idPostulacion === idPostulacionListener;
              }
              return c.rutConductor === rutConductorListener && c.rutHijo === rutHijoListener;
            });
            if (index !== -1) {
              nuevo[index] = { 
                ...nuevo[index], 
                ultimoMensaje,
                ultimoMensajeFecha,
                ultimoMensajeEmisor,
                cantidadNoLeidos: noLeidos
              };
            }
            return nuevo;
          });
        }
      }, (error) => {
        console.error('Error en listener de mensajes:', error);
      });

      unsubscribeRefs.current.set(claveChat, unsubscribe);
    } catch (error) {
      console.error('Error al configurar listener:', error);
    }
  };

  useEffect(() => {
    let unsubscribe: Unsubscribe | null = null;

    const init = async () => {
      await cargarChats();

      // Configurar listener después de cargar datos iniciales
      const rut = await AsyncStorage.getItem('rutUsuario');
      const rol = (await AsyncStorage.getItem('userRole') || await AsyncStorage.getItem('rolUsuario') || '').toLowerCase();
      if (!rut) return;

      try {
        const listaPasajerosRef = collection(db, 'lista_pasajeros');
        let q;
        
        if (rol === 'conductor') {
          q = query(listaPasajerosRef, where('rutConductor', '==', rut));
        } else if (rol === 'apoderado') {
          q = query(listaPasajerosRef, where('rutApoderado', '==', rut));
        } else {
          return;
        }
        
        unsubscribe = onSnapshot(q, () => {
          // Recargar cuando hay cambios en lista_pasajeros
          cargarChats();
        }, (error) => {
          console.error('Error en listener de lista_pasajeros:', error);
        });
      } catch (error) {
        console.error('Error al configurar listener:', error);
      }
    };

    init();

    return () => {
      // Limpiar todos los listeners de mensajes
      unsubscribeRefs.current.forEach((unsub) => {
        unsub();
      });
      unsubscribeRefs.current.clear();
      
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const formatearFecha = (fecha?: Date): string => {
    if (!fecha) return '';
    
    const ahora = new Date();
    const diffMs = ahora.getTime() - fecha.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHoras = Math.floor(diffMs / 3600000);
    const diffDias = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins}m`;
    if (diffHoras < 24) return `Hace ${diffHoras}h`;
    if (diffDias === 1) return 'Ayer';
    if (diffDias < 7) return `Hace ${diffDias}d`;
    
    return fecha.toLocaleDateString('es-CL', {
      day: '2-digit',
      month: '2-digit',
    });
  };

  const handleAbrirChatApoderado = async (apoderado: ApoderadoChat) => {
    // Marcar como leído antes de abrir
    const claveChat = obtenerClaveChat(
      apoderado.idPostulacion,
      apoderado.rutHijo,
      apoderado.rutApoderado,
      rutConductor
    );
    if (claveChat) {
      await guardarUltimaLectura(claveChat);
      // Actualizar contador localmente
      apoderado.cantidadNoLeidos = 0;
      setApoderados(prev => prev.map(a => 
        a.rutApoderado === apoderado.rutApoderado
          ? { ...a, cantidadNoLeidos: 0 }
          : a
      ));
    }

    if (apoderado.idPostulacion) {
      router.push({
        pathname: '/chat-validacion',
        params: {
          idPostulacion: apoderado.idPostulacion,
        },
      });
    } else {
      // Si no hay idPostulacion, intentar buscarla primero
      try {
        const postulacionesRef = collection(db, 'Postulaciones');
        const postQuery = query(
          postulacionesRef,
          where('rutUsuario', '==', apoderado.rutApoderado),
          where('rutHijo', '==', apoderado.rutHijo),
          where('rutConductor', '==', rutConductor),
          limit(1),
        );
        const postSnap = await getDocs(postQuery);
        
        if (!postSnap.empty) {
          const idPostulacion = postSnap.docs[0].id;
          router.push({
            pathname: '/chat-validacion',
            params: {
              idPostulacion,
            },
          });
        } else {
          // Si no hay postulación, abrir chat directo usando chatId
          router.push({
            pathname: '/chat-validacion',
            params: {
              accion: 'agregar_hijo',
              rutPadre: apoderado.rutApoderado,
              rutConductor: rutConductor,
              rutHijo: apoderado.rutHijo,
              patenteFurgon: apoderado.patenteFurgon,
              idFurgon: apoderado.idFurgon || '',
              nombreHijo: apoderado.nombreHijo,
              nombreApoderado: apoderado.nombreApoderado,
            },
          });
        }
      } catch (error) {
        console.error('Error al buscar postulación:', error);
        // En caso de error, intentar abrir chat directo
        router.push({
          pathname: '/chat-validacion',
          params: {
            accion: 'agregar_hijo',
            rutPadre: apoderado.rutApoderado,
            rutConductor: rutConductor,
            rutHijo: apoderado.rutHijo,
            patenteFurgon: apoderado.patenteFurgon,
            idFurgon: apoderado.idFurgon || '',
            nombreHijo: apoderado.nombreHijo,
            nombreApoderado: apoderado.nombreApoderado,
          },
        });
      }
    }
  };

  const handleAbrirChatConductor = async (conductor: ConductorChat) => {
    // Marcar como leído antes de abrir
    const claveChat = obtenerClaveChat(
      conductor.idPostulacion,
      conductor.rutHijo,
      rutApoderado,
      conductor.rutConductor
    );
    if (claveChat) {
      await guardarUltimaLectura(claveChat);
      // Actualizar contador localmente
      conductor.cantidadNoLeidos = 0;
      setConductores(prev => prev.map(c => 
        c.rutConductor === conductor.rutConductor
          ? { ...c, cantidadNoLeidos: 0 }
          : c
      ));
    }

    if (conductor.idPostulacion) {
      router.push({
        pathname: '/chat-validacion',
        params: {
          idPostulacion: conductor.idPostulacion,
        },
      });
    } else {
      // Si no hay idPostulacion, intentar buscarla primero
      try {
        const postulacionesRef = collection(db, 'Postulaciones');
        const postQuery = query(
          postulacionesRef,
          where('rutUsuario', '==', rutApoderado),
          where('rutHijo', '==', conductor.rutHijo),
          where('rutConductor', '==', conductor.rutConductor),
          limit(1),
        );
        const postSnap = await getDocs(postQuery);
        
        if (!postSnap.empty) {
          const idPostulacion = postSnap.docs[0].id;
          router.push({
            pathname: '/chat-validacion',
            params: {
              idPostulacion,
            },
          });
        } else {
          // Si no hay postulación, abrir chat directo usando chatId
          // Obtener nombre del apoderado
          let nombreApoderadoParam = '';
          try {
            const usuariosRef = collection(db, 'usuarios');
            const usuariosQuery = query(usuariosRef, where('rut', '==', rutApoderado), limit(1));
            const usuariosSnap = await getDocs(usuariosQuery);
            if (!usuariosSnap.empty) {
              const usuarioData = usuariosSnap.docs[0].data();
              nombreApoderadoParam = `${usuarioData.nombres || ''} ${usuarioData.apellidos || ''}`.trim();
            }
          } catch (error) {
            console.error('Error al obtener nombre del apoderado:', error);
          }

          router.push({
            pathname: '/chat-validacion',
            params: {
              accion: 'agregar_hijo',
              rutPadre: rutApoderado,
              rutConductor: conductor.rutConductor,
              rutHijo: conductor.rutHijo,
              patenteFurgon: conductor.patenteFurgon,
              idFurgon: conductor.idFurgon || '',
              nombreHijo: conductor.nombreHijo,
              nombreApoderado: nombreApoderadoParam,
            },
          });
        }
      } catch (error) {
        console.error('Error al buscar postulación:', error);
        // En caso de error, intentar abrir chat directo
        // Obtener nombre del apoderado
        let nombreApoderadoParam = '';
        try {
          const usuariosRef = collection(db, 'usuarios');
          const usuariosQuery = query(usuariosRef, where('rut', '==', rutApoderado), limit(1));
          const usuariosSnap = await getDocs(usuariosQuery);
          if (!usuariosSnap.empty) {
            const usuarioData = usuariosSnap.docs[0].data();
            nombreApoderadoParam = `${usuarioData.nombres || ''} ${usuarioData.apellidos || ''}`.trim();
          }
        } catch (error2) {
          console.error('Error al obtener nombre del apoderado:', error2);
        }

        router.push({
          pathname: '/chat-validacion',
          params: {
            accion: 'agregar_hijo',
            rutPadre: rutApoderado,
            rutConductor: conductor.rutConductor,
            rutHijo: conductor.rutHijo,
            patenteFurgon: conductor.patenteFurgon,
            idFurgon: conductor.idFurgon || '',
            nombreHijo: conductor.nombreHijo,
            nombreApoderado: nombreApoderadoParam,
          },
        });
      }
    }
  };

  const renderApoderado = ({ item }: { item: ApoderadoChat }) => {
    const esMiMensaje = item.ultimoMensajeEmisor === rutConductor;
    const noLeidos = item.cantidadNoLeidos || 0;
    const mostrarBadge = noLeidos > 0;
    const textoBadge = noLeidos > 100 ? '100+' : noLeidos.toString();
    
    return (
      <Pressable
        style={styles.chatItem}
        onPress={() => handleAbrirChatApoderado(item)}
        android_ripple={{ color: '#E0E0E0' }}
      >
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Ionicons name="person" size={24} color="#127067" />
          </View>
        </View>
        <View style={styles.chatContent}>
          <View style={styles.chatHeader}>
            <Text style={styles.apoderadoNombre} numberOfLines={1}>
              {item.nombreApoderado}
            </Text>
            <View style={styles.headerRight}>
              {item.ultimoMensajeFecha && (
                <Text style={styles.timestamp}>
                  {formatearFecha(item.ultimoMensajeFecha)}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.chatBody}>
            <View style={styles.chatBodyLeft}>
              {item.ultimoMensaje && (
                <Text style={styles.ultimoMensaje} numberOfLines={1}>
                  {esMiMensaje && 'Tú: '}
                  {item.ultimoMensaje}
                </Text>
              )}
            </View>
            {mostrarBadge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{textoBadge}</Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#999" />
      </Pressable>
    );
  };

  const renderConductor = ({ item }: { item: ConductorChat }) => {
    const esMiMensaje = item.ultimoMensajeEmisor === rutApoderado;
    const noLeidos = item.cantidadNoLeidos || 0;
    const mostrarBadge = noLeidos > 0;
    const textoBadge = noLeidos > 100 ? '100+' : noLeidos.toString();
    
    return (
      <Pressable
        style={styles.chatItem}
        onPress={() => handleAbrirChatConductor(item)}
        android_ripple={{ color: '#E0E0E0' }}
      >
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Ionicons name="car" size={24} color="#127067" />
          </View>
        </View>
        <View style={styles.chatContent}>
          <View style={styles.chatHeader}>
            <Text style={styles.apoderadoNombre} numberOfLines={1}>
              {item.nombreConductor}
            </Text>
            <View style={styles.headerRight}>
              {item.ultimoMensajeFecha && (
                <Text style={styles.timestamp}>
                  {formatearFecha(item.ultimoMensajeFecha)}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.chatBody}>
            <View style={styles.chatBodyLeft}>
              {item.ultimoMensaje && (
                <Text style={styles.ultimoMensaje} numberOfLines={1}>
                  {esMiMensaje && 'Tú: '}
                  {item.ultimoMensaje}
                </Text>
              )}
            </View>
            {mostrarBadge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{textoBadge}</Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#999" />
      </Pressable>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#127067" />
        <Text style={styles.loadingText}>Cargando chats...</Text>
      </View>
    );
  }

  const chatsVacios = (rolUsuario === 'conductor' && apoderados.length === 0) || 
                      (rolUsuario === 'apoderado' && conductores.length === 0);

  if (chatsVacios) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={24} color="#127067" />
          </Pressable>
          <Text style={styles.headerTitle}>
            {rolUsuario === 'conductor' ? 'Chat Apoderados' : 'Chat Conductor'}
          </Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={64} color="#999" />
          <Text style={styles.emptyText}>No hay chats disponibles</Text>
          <Text style={styles.emptySubtext}>
            {rolUsuario === 'conductor' 
              ? 'Los chats aparecerán cuando tengas apoderados asignados'
              : 'Los chats aparecerán cuando tengas hijos inscritos en un furgón'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color="#127067" />
        </Pressable>
        <Text style={styles.headerTitle}>
          {rolUsuario === 'conductor' ? 'Chat Apoderados' : 'Chat Conductor'}
        </Text>
        <View style={styles.headerRight} />
      </View>
      {rolUsuario === 'conductor' ? (
        <FlatList
          data={apoderados}
          renderItem={renderApoderado}
          keyExtractor={(item) => item.rutApoderado}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <FlatList
          data={conductores}
          renderItem={renderConductor}
          keyExtractor={(item) => item.rutConductor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingTop: 50,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#127067',
  },
  headerRight: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  listContent: {
    paddingVertical: 8,
  },
  chatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  avatarContainer: {
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chatContent: {
    flex: 1,
    marginRight: 8,
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  apoderadoNombre: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
    marginLeft: 8,
  },
  hijoNombre: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  ultimoMensaje: {
    fontSize: 14,
    color: '#999',
  },
  chatBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chatBodyLeft: {
    flex: 1,
    marginRight: 8,
  },
  badge: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
