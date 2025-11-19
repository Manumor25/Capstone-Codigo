import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  TouchableHighlight,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';

interface ChatUrgencia {
  rutConductor: string;
  rutApoderado: string;
  rutHijo: string;
  nombreHijo?: string;
  creadoEn?: any;
}

export default function ChatUrgenciaScreen() {
  useSyncRutActivo();
  const params = useLocalSearchParams();
  const router = useRouter();

  const idChat = params.idPostulacion?.toString() || '';
  const rutHijoParam = params.rutHijo?.toString() || '';
  const rutConductorParam = params.rutConductor?.toString() || '';
  const rutPadreParam = params.rutPadre?.toString() || '';

  const [rutUsuario, setRutUsuario] = useState('');
  const [rolUsuario, setRolUsuario] = useState<'conductor' | 'apoderado' | ''>('');
  const [chat, setChat] = useState<ChatUrgencia | null>(null);
  const [nombreReceptor, setNombreReceptor] = useState('');
  const [rutReceptor, setRutReceptor] = useState('');
  const [mensajes, setMensajes] = useState<any[]>([]);
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(true);
  const [permitido, setPermitido] = useState(false);

  const nombreHijo = useMemo(() => chat?.nombreHijo || '', [chat?.nombreHijo]);

  useEffect(() => {
    const obtenerDocUnico = async (consulta: any) => {
      const snap = await getDocs(consulta);
      if (!snap.empty) {
        return snap.docs[0];
      }
      return null;
    };

    const inicializar = async () => {
      try {
        const rut = (await AsyncStorage.getItem('rutUsuario')) || '';
        const rolGuardado =
          (await AsyncStorage.getItem('userRole')) ||
          (await AsyncStorage.getItem('rolUsuario')) ||
          '';
        const rolNormalizado = rolGuardado.toLowerCase();

        if (!rut || (rolNormalizado !== 'conductor' && rolNormalizado !== 'apoderado')) {
          Alert.alert('Error', 'No se pudo identificar al usuario.');
          router.back();
          return;
        }

        setRutUsuario(rut);
        setRolUsuario(rolNormalizado as 'conductor' | 'apoderado');

        if (!idChat) {
          Alert.alert('Error', 'No se recibió la conversación de urgencia.');
          router.back();
          return;
        }

        const chatRef = doc(db, 'ChatsUrgencia', idChat);
        const chatSnapshot = await getDoc(chatRef);
        if (!chatSnapshot.exists()) {
          Alert.alert('Error', 'No se encontró la conversación de urgencia.');
          router.back();
          return;
        }

        const data = chatSnapshot.data() as ChatUrgencia;
        setChat(data);

        const participantes = [data.rutConductor, data.rutApoderado].filter(Boolean);
        const esParticipante = participantes.includes(rut);
        setPermitido(esParticipante);
        if (!esParticipante) {
          Alert.alert('Acceso denegado', 'No tienes permiso para ver este chat.');
          router.back();
          return;
        }

        const rutDestino =
          rolNormalizado === 'conductor' ? data.rutApoderado : data.rutConductor;
        setRutReceptor(rutDestino);

        if (rutDestino) {
          const usuariosRef = collection(db, 'usuarios');
          const usuarioQuery = query(usuariosRef, where('rut', '==', rutDestino));
          const usuarioSnap = await obtenerDocUnico(usuarioQuery);
          if (usuarioSnap) {
            const info = usuarioSnap.data() as any;
            setNombreReceptor(`${info.nombres || ''} ${info.apellidos || ''}`.trim());
          }
        }

        const mensajesRef = collection(db, 'MensajesChatUrgencia');
        const mensajesQuery = query(mensajesRef, where('idChatUrgencia', '==', idChat));
        const unsubscribe = onSnapshot(mensajesQuery, (snapshot) => {
          const lista = snapshot.docs
            .map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as any),
            }))
            .sort((a, b) => {
              const fechaA = a.fecha ? new Date(a.fecha).getTime() : 0;
              const fechaB = b.fecha ? new Date(b.fecha).getTime() : 0;
              return fechaA - fechaB;
            });
          setMensajes(lista);
        });

        return () => unsubscribe();
      } catch (error) {
        console.error('Error al cargar chat de urgencia:', error);
        Alert.alert('Error', 'No se pudo abrir el chat de urgencia.');
        router.back();
      } finally {
        setCargando(false);
      }
    };

    inicializar();
  }, [idChat, router]);

  const enviarMensaje = async () => {
    const texto = mensaje.trim();
    if (!permitido || !texto || !rutReceptor) return;

    try {
      await addDoc(collection(db, 'MensajesChatUrgencia'), {
        idChatUrgencia: idChat,
        texto,
        emisor: rutUsuario,
        receptor: rutReceptor,
        participantes: [rutUsuario, rutReceptor].sort(),
        fecha: new Date().toISOString(),
      });
      setMensaje('');
    } catch (error) {
      console.error('Error al enviar mensaje de urgencia:', error);
    }
  };

  const handleSalir = () => {
    if (rolUsuario === 'apoderado') {
      router.replace('/(tabs)/apoderado/pagina-principal-apoderado');
      return;
    }
    if (rolUsuario === 'conductor') {
      router.replace('/(tabs)/conductor/pagina-principal-conductor');
      return;
    }
    router.back();
  };

  if (cargando) {
    return (
      <View style={styles.feedbackContainer}>
        <ActivityIndicator size="large" color="#127067" />
        <Text style={styles.feedbackText}>Cargando chat de urgencia...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleSalir} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={26} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="warning-outline" size={28} color="#fff" />
          <Text style={styles.headerText}>
            {nombreReceptor || 'Chat de urgencia'}
          </Text>
        </View>
        <Ionicons name="chatbubbles-outline" size={28} color="#fff" />
      </View>

      <View style={styles.alertBanner}>
        <Ionicons name="alert-circle" size={22} color="#a94442" />
        <Text style={styles.alertText}>
          Problema urgente con: {nombreHijo || 'el estudiante'}
        </Text>
      </View>

      <FlatList
        data={mensajes}
        keyExtractor={(item, index) => item.id || index.toString()}
        renderItem={({ item }) => (
          <View
            style={[
              styles.mensajeItem,
              item.emisor === rutUsuario ? styles.mensajePropio : styles.mensajeAjeno,
            ]}
          >
            <Text style={styles.mensajeTexto}>{item.texto}</Text>
            <Text style={styles.mensajeMeta}>
              {item.emisor}{' '}
              {new Date(item.fecha).toLocaleTimeString('es-CL', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false, // Formato 24 horas
              })}
            </Text>
          </View>
        )}
        contentContainerStyle={styles.chatContent}
      />

      <View style={styles.inputArea}>
        <TextInput
          style={styles.input}
          value={mensaje}
          onChangeText={setMensaje}
          placeholder="Escribe un mensaje..."
          editable={permitido}
        />
        <TouchableHighlight
          style={styles.sendButton}
          onPress={enviarMensaje}
          underlayColor="#0c5c4e"
          disabled={!permitido}
        >
          <Ionicons name="send" size={22} color="#fff" />
        </TouchableHighlight>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7F8',
  },
  header: {
    backgroundColor: '#a94442',
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
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f9d6d5',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d19290',
    gap: 8,
  },
  alertText: {
    fontSize: 15,
    color: '#a94442',
    fontWeight: '600',
  },
  chatContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mensajeItem: {
    marginVertical: 6,
    padding: 10,
    borderRadius: 12,
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
    fontSize: 15,
    color: '#333',
  },
  mensajeMeta: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#ccc',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d5e6e4',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: '#127067',
    padding: 12,
    borderRadius: 24,
  },
  feedbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F7F8',
    paddingHorizontal: 24,
  },
  feedbackText: {
    marginTop: 12,
    color: '#666',
    fontSize: 16,
    textAlign: 'center',
  },
});
