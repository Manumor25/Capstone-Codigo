import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableHighlight,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
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
  const redireccionProgramada = useRef(false);

  const idPostulacion = params.idPostulacion as string;
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

      const postRef = doc(db, 'Postulaciones', idPostulacion);
      const postSnap = await getDoc(postRef);
      let unsubscribe: (() => void) | undefined;
      if (postSnap.exists()) {
        const data = postSnap.data() as any;
        setPostulacion(data);

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

        // Suscripcion a mensajes solo si esta autorizado
        const mensajesRef = collection(db, 'MensajesChat');
        const q = query(mensajesRef, where('idPostulacion', '==', idPostulacion));
        unsubscribe = onSnapshot(q, (snapshot) => {
          const lista = snapshot.docs
            .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
            .sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));
          setMensajes(lista);
          
          // Detectar si hay un mensaje del sistema indicando que la postulación fue aprobada
          // y el usuario es apoderado, entonces redirigir a la página principal
          // Solo redirigir una vez para evitar múltiples redirecciones
          if (!redireccionProgramada.current && rol === 'apoderado') {
            const mensajeAprobacion = lista.find((msg) => {
              if (msg.emisor !== 'Sistema' || !msg.texto) return false;
              
              const textoLower = msg.texto.toLowerCase();
              // Buscar varias variaciones del mensaje de aprobación
              return (
                textoLower.includes('aprobada') || 
                textoLower.includes('aprobado') ||
                textoLower.includes('ha sido aprob') ||
                (textoLower.includes('postulaci') && textoLower.includes('aprob')) ||
                (textoLower.includes('postulaci??n') && textoLower.includes('aprob')) // Para manejar problemas de codificación
              );
            });
            
            if (mensajeAprobacion) {
              redireccionProgramada.current = true;
              console.log('✅ Postulación aprobada detectada, redirigiendo a página principal en 2.5 segundos...');
              // Esperar 2.5 segundos para que el usuario vea el mensaje antes de redirigir
              setTimeout(() => {
                router.replace('/(tabs)/apoderado/pagina-principal-apoderado');
              }, 2500);
            }
          }
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

  const handleSalirChat = () => {
    if (rolUsuario === 'apoderado') {
      router.replace('/(tabs)/apoderado/pagina-principal-apoderado');
      return;
    }
    if (rolUsuario === 'conductor') {
      router.replace('/(tabs)/conductor/perfil-conductor');
      return;
    }
    router.back();
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
      const nuevoMensaje = {
        idPostulacion,
        texto: textoLimpio,
        emisor: rutUsuario, // guarda el RUT del usuario
        receptor: rutReceptor,
        participantes: [rutUsuario, rutReceptor].sort(),
        fecha: new Date().toISOString(),
      };
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
      const participantesChat = [rutUsuario, rutReceptor].filter(Boolean).sort();
      await addDoc(collection(db, 'ValidacionesPostulacion'), {
        idPostulacion,
        estado: 'rechazada',
        fecha: new Date().toISOString(),
      });

      await addDoc(collection(db, 'MensajesChat'), {
        idPostulacion,
        texto: 'La postulación ha sido rechazada.',
        emisor: 'Sistema',
        receptor: rutReceptor || rutUsuario,
        participantes: participantesChat,
        fecha: new Date().toISOString(),
      });

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
      if (!postulacion) {
        Alert.alert('Error', 'No se encontraron los datos de la postulación.');
        return;
      }

      const fechaISO = new Date().toISOString();
      const participantesChat = [rutUsuario, rutReceptor].filter(Boolean).sort();
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

      const listaPasajerosRef = collection(db, 'lista_pasajeros');
      const listaExistenteQuery = query(listaPasajerosRef, where('idPostulacion', '==', idPostulacion));
      const listaExistenteSnap = await getDocs(listaExistenteQuery);
      const payloadListaPasajeros = {
        idPostulacion,
        idFurgon,
        rutConductor: rutUsuario,
        rutApoderado,
        nombreApoderado,
        rutHijo,
        nombreHijo,
        patenteFurgon,
        colegio: postulacion.colegio || '',
        nombreFurgon: postulacion.nombreFurgon || '',
        fechaAceptacion: fechaISO,
        estado: 'aceptada',
      };

      if (listaExistenteSnap.empty) {
        await addDoc(listaPasajerosRef, payloadListaPasajeros);
      } else {
        await updateDoc(listaExistenteSnap.docs[0].ref, payloadListaPasajeros);
      }

      const postulacionFurgonQuery = query(
        collection(db, 'postulacion_furgon'),
        where('postulacionDocId', '==', idPostulacion),
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
        idPostulacion,
        estado: 'aceptada',
        fecha: fechaISO,
      });

      await addDoc(collection(db, 'MensajesChat'), {
        idPostulacion,
        texto: 'La postulación ha sido aprobada.',
        emisor: 'Sistema',
        receptor: rutReceptor || rutUsuario,
        participantes: participantesChat,
        fecha: fechaISO,
      });

      await updateDoc(doc(db, 'Postulaciones', idPostulacion), {
        estado: 'aceptada',
        rutConductor: rutUsuario,
        patenteFurgon,
        fechaAceptacion: fechaISO,
      });

      Alert.alert('Postulación aprobada');
      router.back();
    } catch (error) {
      console.error('Error al aceptar:', error);
    }
  };

  const participantesConversacion = [rutUsuario, rutReceptor].filter(Boolean);
  const mensajesFiltrados = mensajes.filter((item) => {
    const emisor = item.emisor as string | undefined;
    const receptor = item.receptor as string | undefined;
    const participantesMensaje: string[] = Array.isArray(item.participantes)
      ? item.participantes
      : [emisor, receptor].filter(Boolean) as string[];

    if (!rutUsuario) {
      return false;
    }

    if (!rutReceptor) {
      return emisor === rutUsuario || receptor === rutUsuario;
    }

    const esConversacionDirecta =
      (emisor === rutUsuario && receptor === rutReceptor) ||
      (emisor === rutReceptor && receptor === rutUsuario);

    if (esConversacionDirecta) {
      return true;
    }

    if (emisor === 'Sistema') {
      return participantesConversacion.every((p) => participantesMensaje.includes(p));
    }

    return false;
  });

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
        <Ionicons name="chatbubble-ellipses-outline" size={28} color="#fff" />
      </View>

      {cargandoAuth && (
        <View style={{ padding: 10 }}>
          <Text style={{ color: '#127067' }}>Cargando chat...</Text>
        </View>
      )}

      {hijo && (
        <View style={{ padding: 10, backgroundColor: '#fff' }}>
          {esChatUrgencia ? (
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#a94442' }}>
              Problema urgente con: {hijo.nombres} {hijo.apellidos}
            </Text>
          ) : (
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#127067' }}>
              Postulación de: {hijo.nombres} {hijo.apellidos}
            </Text>
          )}
        </View>
      )}

      <FlatList
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
            <Text style={styles.mensajeMeta}>
              {item.emisor} • {new Date(item.fecha).toLocaleTimeString('es-CL', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
        )}
        style={styles.chatArea}
      />

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

      {rolUsuario === 'conductor' && !esChatUrgencia && (
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
  mensajeMeta: {
    fontSize: 10,
    color: '#888',
    marginTop: 4,
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
});

