import { useSyncRutActivo } from '@/hooks/use-sync-rut-activo';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { Link, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TouchableHighlight, View, ScrollView } from 'react-native';
import { db } from '@/firebaseConfig';
import { collection, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore';
import NotificacionesGlobales from '../../../components/NotificacionesGlobales';

export default function ProfileScreen() {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [borrandoCuenta, setBorrandoCuenta] = useState(false);
  const [rutUsuario, setRutUsuario] = useState<string>('');
  const [patentesAsignadas, setPatentesAsignadas] = useState<string[]>([]);
  const [tieneInscripcion, setTieneInscripcion] = useState<boolean>(false);
  useSyncRutActivo();

  const handleLogout = async () => {
    try {
      // Limpiar todos los datos de sesión
      await AsyncStorage.clear();
      // Redirigir al login
      router.replace('/login');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  const handleBorrarCuenta = () => {
    setModalVisible(true);
  };

  const confirmarBorrarCuenta = async () => {
    // Cerrar el modal inmediatamente
    setModalVisible(false);
    
    // Obtener el RUT antes de limpiar AsyncStorage
    const rutUsuario = await AsyncStorage.getItem('rutUsuario');
    const rutUsuarioTrim = rutUsuario ? rutUsuario.trim() : '';

    // Limpiar AsyncStorage y redirigir al inicio inmediatamente
    await AsyncStorage.clear();
    router.replace('/');

    // Ejecutar la eliminación en segundo plano (sin bloquear la navegación)
    if (rutUsuarioTrim) {
      try {
        // 1. Eliminar el usuario de la colección usuarios
        const usuariosRef = collection(db, 'usuarios');
        const usuariosQuery = query(usuariosRef, where('rut', '==', rutUsuarioTrim));
        const usuariosSnapshot = await getDocs(usuariosQuery);

        if (!usuariosSnapshot.empty) {
          await Promise.all(usuariosSnapshot.docs.map((docSnap) => deleteDoc(docSnap.ref)));
          console.log('✓ Usuario eliminado de la colección usuarios');
        }

        // 2. Eliminar todos los hijos del usuario
        const hijosRef = collection(db, 'Hijos');
        const hijosQuery = query(hijosRef, where('rutUsuario', '==', rutUsuarioTrim));
        const hijosSnapshot = await getDocs(hijosQuery);

        if (!hijosSnapshot.empty) {
          await Promise.all(hijosSnapshot.docs.map((docSnap) => deleteDoc(docSnap.ref)));
          console.log(`✓ ${hijosSnapshot.docs.length} hijo(s) eliminado(s)`);
        }

        // 3. Eliminar registros de lista_pasajeros donde el usuario es apoderado
        const listaPasajerosRef = collection(db, 'lista_pasajeros');
        const pasajerosQuery = query(listaPasajerosRef, where('rutApoderado', '==', rutUsuarioTrim));
        const pasajerosSnapshot = await getDocs(pasajerosQuery);

        if (!pasajerosSnapshot.empty) {
          await Promise.all(pasajerosSnapshot.docs.map((docSnap) => deleteDoc(docSnap.ref)));
          console.log(`✓ ${pasajerosSnapshot.docs.length} registro(s) de lista_pasajeros eliminado(s)`);
        }

        // 4. Eliminar postulaciones del usuario
        const postulacionesRef = collection(db, 'Postulaciones');
        const postulacionesQuery = query(postulacionesRef, where('rutUsuario', '==', rutUsuarioTrim));
        const postulacionesSnapshot = await getDocs(postulacionesQuery);

        if (!postulacionesSnapshot.empty) {
          await Promise.all(postulacionesSnapshot.docs.map((docSnap) => deleteDoc(docSnap.ref)));
          console.log(`✓ ${postulacionesSnapshot.docs.length} postulación(es) eliminada(s)`);
        }

        console.log('✅ Cuenta eliminada exitosamente');
      } catch (error) {
        console.error('Error al borrar la cuenta en segundo plano:', error);
      }
    }
  };

  const cancelarBorrarCuenta = () => {
    setModalVisible(false);
  };

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const name = await AsyncStorage.getItem('userName');
        if (name && name.trim() !== '') setUserName(name);
        else setUserName('Usuario');
        
        // Cargar RUT y patentes para las notificaciones
        const rut = await AsyncStorage.getItem('rutUsuario');
        if (rut) {
          setRutUsuario(rut);
          
          // Obtener patentes asignadas
          try {
            const listaPasajerosRef = collection(db, 'lista_pasajeros');
            const pasajerosQuery = query(listaPasajerosRef, where('rutApoderado', '==', rut.trim()));
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
        setUserName('Usuario');
      }
    };
    loadUserData();
  }, []);

  return (
    <View style={styles.container}>
      {/* Notificaciones Pop-up Globales */}
      <NotificacionesGlobales
        rutUsuario={rutUsuario}
        patentesAsignadas={patentesAsignadas}
        tieneInscripcion={tieneInscripcion}
      />
      
      {/* Botón de volver */}
      <Pressable
        style={styles.backButton}
        onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(tabs)/apoderado/pagina-principal-apoderado');
          }
        }}
      >
        <Ionicons name="arrow-back" size={28} color="#127067" />
      </Pressable>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Icono de usuario */}
        <View style={styles.profileImageContainer}>
          <Image
            source={require('@/assets/images/user_icon.png')}
            style={styles.profileImage}
            contentFit="cover"
          />
        </View>

        {/* Nombre dinámico */}
        <Text style={styles.userName}>{userName}</Text>

        {/* Botones */}
        <Link href="/apoderado/Editar_datos_apoderado" asChild>
          <TouchableHighlight style={styles.button} underlayColor="#0e5b52">
            <Text style={styles.buttonText}>Editar datos</Text>
          </TouchableHighlight>
        </Link>

        <Link href="/apoderado/Agregar-hijo" asChild>
          <TouchableHighlight style={styles.button} underlayColor="#0e5b52">
            <Text style={styles.buttonText}>Añadir hijo</Text>
          </TouchableHighlight>
        </Link>

        <Link href="/apoderado/lista-hijos" asChild>
          <TouchableHighlight style={styles.button} underlayColor="#0e5b52">
            <Text style={styles.buttonText}>Editar hijo</Text>
          </TouchableHighlight>
        </Link>

        <Link href="/apoderado/Agregar_tutor" asChild>
          <TouchableHighlight style={styles.button} underlayColor="#0e5b52">
            <Text style={styles.buttonText}>Añadir tutor</Text>
          </TouchableHighlight>
        </Link>

        <Link href="/apoderado/lista-tutores" asChild>
          <TouchableHighlight style={styles.button} underlayColor="#0e5b52">
            <Text style={styles.buttonText}>Editar tutor</Text>
          </TouchableHighlight>
        </Link>

        <TouchableHighlight 
          style={[styles.button, styles.logoutButton]} 
          underlayColor="#b33d3d"
          onPress={handleLogout}
        >
          <Text style={styles.buttonText}>Cerrar sesión</Text>
        </TouchableHighlight>

        <TouchableHighlight 
          style={[styles.button, styles.deleteButton]} 
          underlayColor="#8b1a1a"
          onPress={handleBorrarCuenta}
          disabled={borrandoCuenta}
        >
          <Text style={styles.buttonText}>
            {borrandoCuenta ? 'Eliminando...' : 'Borrar cuenta'}
          </Text>
        </TouchableHighlight>
      </ScrollView>

      {/* Modal de confirmación */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={cancelarBorrarCuenta}
      >
        <Pressable style={styles.modalOverlay} onPress={cancelarBorrarCuenta}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <Ionicons name="warning" size={64} color="#d32f2f" style={styles.modalIcon} />
            <Text style={styles.modalTitle}>¿Eliminar cuenta?</Text>
            <Text style={styles.modalMessage}>
              Esta acción eliminará permanentemente tu cuenta y todos tus datos:
              {'\n\n'}
              • Tu perfil de usuario
              {'\n'}
              • Todos tus hijos registrados
              {'\n'}
              • Todas tus inscripciones a furgones
              {'\n'}
              • Todas tus postulaciones
              {'\n\n'}
              Esta acción no se puede deshacer.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableHighlight
                style={[styles.modalButton, styles.modalButtonCancel]}
                underlayColor="#e0e0e0"
                onPress={cancelarBorrarCuenta}
              >
                <Text style={styles.modalButtonCancelText}>Cancelar</Text>
              </TouchableHighlight>
              <TouchableHighlight
                style={[styles.modalButton, styles.modalButtonConfirm]}
                underlayColor="#8b1a1a"
                onPress={confirmarBorrarCuenta}
              >
                <Text style={styles.modalButtonConfirmText}>Eliminar</Text>
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
    backgroundColor: '#ffffff',
    paddingTop: 50,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    alignItems: 'center',
  },
  logoutButton: {
    backgroundColor: '#d32f2f',
    marginTop: 20,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 10,
  },
  profileImageContainer: {
    backgroundColor: '#e6e6e6',
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    marginTop: 30,
  },
  profileImage: {
    width: 50,
    height: 50,
  },
  userName: {
    fontSize: 20,
    color: '#333333',
    marginBottom: 30,
    textTransform: 'capitalize',
  },
  button: {
    backgroundColor: '#127067',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
    marginVertical: 8,
    width: 180,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
  },
  deleteButton: {
    backgroundColor: '#d32f2f',
    marginTop: 10,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalIcon: {
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#d32f2f',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 15,
    color: '#333',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 6,
  },
  modalButtonCancel: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  modalButtonCancelText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonConfirm: {
    backgroundColor: '#d32f2f',
  },
  modalButtonConfirmText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
